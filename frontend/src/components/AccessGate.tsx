import { FormEvent, ReactNode, useEffect, useState } from 'react';
import { api, errorText } from '../lib/api';

type AccessStatus = { required: boolean; authenticated: boolean };

type Props = { children: ReactNode };

export function AccessGate({ children }: Props) {
  const [status, setStatus] = useState<AccessStatus | null>(null);
  const [passcode, setPasscode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    api<AccessStatus>('/api/access/status')
      .then((value) => { if (active) setStatus(value); })
      .catch((reason) => { if (active) setError(errorText(reason)); });
    return () => { active = false; };
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!passcode || busy) return;
    setBusy(true); setError('');
    try {
      await api<{ authenticated: boolean }>('/api/access/login', {
        method: 'POST',
        body: JSON.stringify({ passcode }),
      });
      setStatus({ required: true, authenticated: true });
      setPasscode('');
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setBusy(false);
    }
  }

  if (status?.authenticated) return <>{children}</>;
  if (status && !status.required) return <>{children}</>;

  return <main className="access-screen">
    <section className="panel access-card" aria-labelledby="access-title">
      <div className="mark access-mark">AI</div>
      <h1 id="access-title">Reviewer access</h1>
      <p className="sub">Enter the private review passcode to use the AI assessment.</p>
      {error && <div className="inline-error" role="alert">{error}</div>}
      {status === null && !error ? <p className="status-text">Checking access…</p> : <form onSubmit={submit}>
        <label className="field-label" htmlFor="review-passcode">Passcode</label>
        <input id="review-passcode" type="password" autoComplete="current-password" value={passcode} onChange={e => setPasscode(e.target.value)} />
        <button className="btn primary full" disabled={busy || !passcode}>{busy ? 'Checking…' : 'Continue'}</button>
      </form>}
      <p className="privacy">This gate protects the assessment API from unintended public use.</p>
    </section>
  </main>;
}
