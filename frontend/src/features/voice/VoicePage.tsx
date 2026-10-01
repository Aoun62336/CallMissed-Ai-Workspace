import { useCallback, useEffect, useRef, useState } from 'react';
import { Room, RoomEvent, Track } from 'livekit-client';
import { api, errorText } from '../../lib/api';
import { MicIcon, StopIcon, VolumeIcon } from '../../lib/icons';

type Session = { id: string; ws_url: string; token: string; max_duration_seconds: number; lease: string };
type VoiceStatus = 'disconnected' | 'permission' | 'creating' | 'connecting' | 'connected' | 'muted' | 'ended' | 'error';

const labels: Record<VoiceStatus, string> = {
  disconnected: 'Disconnected', permission: 'Requesting microphone', creating: 'Creating session', connecting: 'Connecting',
  connected: 'Connected', muted: 'Microphone muted', ended: 'Ended', error: 'Connection error',
};

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
  const remainder = (seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${remainder}`;
}

export function VoicePage() {
  const [status, setStatus] = useState<VoiceStatus>('disconnected');
  const [error, setError] = useState('');
  const [seconds, setSeconds] = useState(0);
  const [maxSeconds, setMaxSeconds] = useState(180);
  const [busy, setBusy] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [pendingTermination, setPendingTermination] = useState(false);
  const roomRef = useRef<Room | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const pendingSessionRef = useRef<Session | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioContainer = useRef<HTMLDivElement>(null);
  const endingRef = useRef(false);
  const unmountedRef = useRef(false);

  const stopLocalMedia = useCallback(async () => {
    const room = roomRef.current;
    roomRef.current = null;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (room) {
      try {
        room.localParticipant.audioTrackPublications.forEach(publication => publication.track?.stop());
        await room.disconnect(true);
      } catch { /* Local tracks are stopped above; provider cleanup runs separately. */ }
    }
    audioContainer.current?.replaceChildren();
  }, []);

  const terminateProvider = useCallback(async (session: Session, keepalive = false) => {
    if (keepalive) {
      await fetch(`/api/voice/sessions/${session.id}`, {
        method: 'DELETE', headers: { 'X-Voice-Lease': session.lease }, credentials: 'same-origin', keepalive: true,
      });
      return;
    }
    await api<{ ended: boolean }>(`/api/voice/sessions/${session.id}`, {
      method: 'DELETE', headers: { 'X-Voice-Lease': session.lease },
    });
  }, []);

  const endCall = useCallback(async (showEnded = true) => {
    if (endingRef.current) return;
    endingRef.current = true;
    const session = sessionRef.current;
    sessionRef.current = null;
    await stopLocalMedia();
    setSeconds(0); setAudioBlocked(false);
    if (session) {
      try {
        await terminateProvider(session);
        pendingSessionRef.current = null;
        if (!unmountedRef.current) {
          setPendingTermination(false);
          if (showEnded) setStatus('ended');
        }
      } catch (reason) {
        pendingSessionRef.current = session;
        if (!unmountedRef.current) {
          setPendingTermination(true);
          setStatus('error');
          setError(`Your microphone was released, but provider session termination could not be confirmed. ${errorText(reason)}`);
        }
      }
    } else if (!unmountedRef.current && showEnded) {
      setStatus('ended');
    }
    endingRef.current = false;
  }, [stopLocalMedia, terminateProvider]);

  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      const session = sessionRef.current ?? pendingSessionRef.current;
      sessionRef.current = null;
      pendingSessionRef.current = null;
      const room = roomRef.current;
      roomRef.current = null;
      if (timerRef.current) clearInterval(timerRef.current);
      room?.localParticipant.audioTrackPublications.forEach(publication => publication.track?.stop());
      void room?.disconnect(true);
      if (session) void terminateProvider(session, true).catch(() => {});
    };
  }, [terminateProvider]);

  async function startCall() {
    if (busy || roomRef.current || sessionRef.current) return;
    if (pendingSessionRef.current) {
      setError('Confirm termination of the previous provider session before starting another call.');
      setPendingTermination(true);
      return;
    }
    setBusy(true); setError(''); setSeconds(0); setAudioBlocked(false); setPendingTermination(false);
    try {
      setStatus('permission');
      const permissionStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      permissionStream.getTracks().forEach(track => track.stop());

      setStatus('creating');
      const session = await api<Session>('/api/voice/sessions', { method: 'POST' });
      sessionRef.current = session; setMaxSeconds(session.max_duration_seconds);

      const room = new Room();
      roomRef.current = room;
      room.on(RoomEvent.TrackSubscribed, track => {
        if (track.kind === Track.Kind.Audio) audioContainer.current?.appendChild(track.attach());
      });
      room.on(RoomEvent.Disconnected, () => {
        if (roomRef.current === room && !endingRef.current) void endCall(false);
      });

      setStatus('connecting');
      await room.connect(session.ws_url, session.token);
      await room.localParticipant.setMicrophoneEnabled(true);
      try { await room.startAudio(); } catch { setAudioBlocked(true); }
      if (roomRef.current !== room) return;

      setStatus('connected');
      const started = Date.now();
      timerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - started) / 1000);
        setSeconds(elapsed);
        if (elapsed >= session.max_duration_seconds) void endCall();
      }, 500);
    } catch (reason) {
      const session = sessionRef.current;
      sessionRef.current = null;
      await stopLocalMedia();
      if (session) {
        try { await terminateProvider(session); }
        catch { pendingSessionRef.current = session; setPendingTermination(true); }
      }
      setStatus('error');
      if (reason instanceof DOMException && (reason.name === 'NotAllowedError' || reason.name === 'SecurityError')) {
        setError('Microphone permission was denied. Allow microphone access in your browser, then try again.');
      } else {
        setError(errorText(reason));
      }
    } finally {
      setBusy(false);
    }
  }

  async function retryTermination() {
    const session = pendingSessionRef.current;
    if (!session || busy) return;
    setBusy(true); setError('');
    try {
      await terminateProvider(session);
      pendingSessionRef.current = null;
      setPendingTermination(false);
      setStatus('ended');
    } catch (reason) {
      setStatus('error');
      setError(`Provider session termination still could not be confirmed. ${errorText(reason)}`);
    } finally {
      setBusy(false);
    }
  }

  async function toggleMute() {
    const room = roomRef.current;
    if (!room || (status !== 'connected' && status !== 'muted')) return;
    setBusy(true); setError('');
    try {
      const makeEnabled = status === 'muted';
      await room.localParticipant.setMicrophoneEnabled(makeEnabled);
      setStatus(makeEnabled ? 'connected' : 'muted');
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setBusy(false);
    }
  }

  async function enableSound() {
    const room = roomRef.current;
    if (!room) return;
    try { await room.startAudio(); setAudioBlocked(false); } catch { setError('Audio playback is still blocked by the browser. Check site sound permissions.'); }
  }

  const active = status === 'connected' || status === 'muted';
  const starting = ['permission', 'creating', 'connecting'].includes(status);

  return <>
    <div className="page-title"><div><h1>Voice</h1><p className="sub">Speak with the AI assistant using your browser microphone.</p></div></div>
    <section className="panel voice" aria-label="Voice conversation">
      <div className="status-row">
        <span className={`status status-${status}`}><span className="dot"/>{labels[status]}</span>
        <span className="timer">{formatTime(seconds)} / {formatTime(maxSeconds)}</span>
      </div>
      {error && <div className="inline-error voice-error" role="alert">{error}</div>}
      <div className="voice-center">
        <div className={`mic ${active ? 'mic-active' : ''}`}><MicIcon/></div>
        <h2>{active ? (status === 'muted' ? 'Microphone is muted' : 'Conversation in progress') : starting ? 'Starting your conversation…' : pendingTermination ? 'Microphone released' : status === 'ended' ? 'Conversation ended' : status === 'error' ? 'Could not continue the call' : 'Ready when you are'}</h2>
        <p>{active ? 'Speak naturally. You can mute your microphone or end the session at any time.' : pendingTermination ? 'Local audio is stopped. Retry the provider termination before starting another session.' : 'Start a short voice conversation with the AI assistant.'}</p>
      </div>
      <div className="voice-actions">
        {!active && !starting && !pendingTermination && <button className="btn primary voice-primary" disabled={busy} onClick={() => void startCall()}><MicIcon/>Start conversation</button>}
        {starting && <button className="btn primary voice-primary" disabled><span className="spinner"/>{labels[status]}…</button>}
        {active && <button className="btn" disabled={busy} onClick={() => void toggleMute()}><MicIcon/>{status === 'muted' ? 'Unmute microphone' : 'Mute microphone'}</button>}
        {audioBlocked && active && <button className="btn" onClick={() => void enableSound()}><VolumeIcon/>Enable sound</button>}
        {active && <button className="btn danger" disabled={busy} onClick={() => void endCall()}><StopIcon/>End conversation</button>}
        {pendingTermination && <button className="btn danger" disabled={busy} onClick={() => void retryTermination()}><StopIcon/>{busy ? 'Retrying…' : 'Retry session termination'}</button>}
      </div>
      <div ref={audioContainer} className="audio-container"/>
      <div className="voice-note">
        <p><strong>Microphone permission required</strong><br/>Your browser asks for microphone access when you start. Audio is sent to CallMissed for processing.</p>
        <p>Calls are limited to 3 minutes. Ending the call releases local microphone tracks and asks the provider to terminate the session.</p>
      </div>
    </section>
  </>;
}
