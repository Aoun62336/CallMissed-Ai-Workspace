import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { api, errorText } from '../../lib/api';
import { CopyIcon, DownloadIcon, PlusIcon, SendIcon } from '../../lib/icons';

type Message = { role: 'user' | 'assistant'; content: string };
type ChatResponse = { answer: string; elapsed_ms: number };

const EXAMPLES = [
  'Explain how Large Language Models work in simple terms.',
  'What are the key differences between REST and GraphQL APIs?',
  'Give me three best practices for production-ready Docker containers.',
];

export function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [lastElapsed, setLastElapsed] = useState<number | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const conversationEnd = useRef<HTMLDivElement>(null);
  const remaining = 2000 - draft.length;
  const contextCount = Math.min(messages.length, 10);
  const canSend = draft.trim().length > 0 && !busy;

  const empty = messages.length === 0;
  const latestAssistant = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) if (messages[i].role === 'assistant') return i;
    return -1;
  }, [messages]);

  // Auto-scroll to the latest message whenever messages or busy state changes.
  useEffect(() => {
    conversationEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, busy]);

  async function send() {
    const content = draft.trim();
    if (!content || busy) return;
    setBusy(true); setError(''); setCopiedIndex(null);
    const recent = messages.slice(-10);
    const requestMessages: Message[] = [...recent, { role: 'user', content }];
    try {
      const result = await api<ChatResponse>('/api/chat', {
        method: 'POST',
        body: JSON.stringify({ messages: requestMessages }),
      });
      setMessages(previous => [...previous, { role: 'user', content }, { role: 'assistant', content: result.answer }]);
      setDraft('');
      setLastElapsed(result.elapsed_ms);
      requestAnimationFrame(() => textarea.current?.focus());
    } catch (reason) {
      // Deliberately keep the draft so the user can edit/retry it.
      setError(errorText(reason));
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void send();
  }

  function keyboard(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void send();
    }
  }

  async function copyAnswer(index: number, content: string) {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedIndex(index);
      window.setTimeout(() => setCopiedIndex(current => current === index ? null : current), 1500);
    } catch {
      setError('Could not copy the response. Select the text and copy it manually.');
    }
  }

  function downloadChat() {
    const lines = messages
      .map(m => `${m.role === 'user' ? 'You' : 'AI Assistant'}: ${m.content}`)
      .join('\n\n');
    const blob = new Blob([lines], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'chat-history.txt';
    link.click();
    URL.revokeObjectURL(url);
  }

  function newChat() {
    setMessages([]); setDraft(''); setError(''); setLastElapsed(null); setCopiedIndex(null);
    requestAnimationFrame(() => textarea.current?.focus());
  }

  return <>
    <div className="page-title">
      <div><h1>Chat</h1><p className="sub">Ask questions and continue the conversation with temporary browser history.</p></div>
      <div className="page-actions">
        {!empty && <button className="btn" onClick={downloadChat} title="Export conversation"><DownloadIcon/>Export</button>}
        <button className="btn" onClick={newChat} disabled={empty && !draft}><PlusIcon/>New chat</button>
      </div>
    </div>

    <section className="panel chat" aria-label="AI chat">
      <div className="chat-top">
        <span>{empty ? 'Start a new conversation' : `${messages.length} message${messages.length === 1 ? '' : 's'} · up to ${contextCount} recent messages reused as context`}</span>
        <span className="model-badge">sarvam-105b-conversations</span>
      </div>
      <div className={`conversation ${empty ? 'conversation-empty' : ''}`} aria-live="polite">
        {empty ? <div className="empty-state">
          <div className="empty-icon">AI</div>
          <h2>What would you like to ask?</h2>
          <p className="sub">Choose an example or write your own question below.</p>
          <div className="example-grid">
            {EXAMPLES.map(example => <button key={example} className="example" onClick={() => { setDraft(example); textarea.current?.focus(); }}>{example}</button>)}
          </div>
        </div> : messages.map((message, index) => message.role === 'user' ? <div className="message user" key={`${index}-${message.content.slice(0, 8)}`}><p>{message.content}</p></div> : <div className="message assistant" key={`${index}-${message.content.slice(0, 8)}`}>
          <div className="byline"><span className="assistant-dot">AI</span>AI assistant</div>
          <p className="assistant-text">{message.content}</p>
          <button className="btn compact" onClick={() => void copyAnswer(index, message.content)}><CopyIcon/>{copiedIndex === index ? 'Copied' : 'Copy response'}</button>
          {index === latestAssistant && lastElapsed !== null && <span className="measured">Response time: {(lastElapsed / 1000).toFixed(2)} s</span>}
        </div>)}
        {busy && <div className="message assistant pending-message"><div className="byline"><span className="assistant-dot">AI</span>AI assistant</div><div className="typing" aria-label="Generating response"><span/><span/><span/></div></div>}
        {/* Sentinel element — scrolled into view after each reply. */}
        <div ref={conversationEnd} />
      </div>
      {error && <div className="inline-error chat-error" role="alert">{error}</div>}
      <form className="composer" onSubmit={submit}>
        <label className="field-label" htmlFor="message">Your message</label>
        <textarea ref={textarea} id="message" value={draft} maxLength={2000} onChange={event => setDraft(event.target.value)} onKeyDown={keyboard} placeholder="Ask a question…" aria-describedby="composer-help" disabled={busy}/>
        <div className="composer-footer">
          <span className={`hint${remaining < 100 ? ' hint-warn' : ''}`} id="composer-help">Enter to send · Shift+Enter for a new line · {remaining.toLocaleString()} characters left</span>
          <button className="btn primary" type="submit" disabled={!canSend}><SendIcon/>{busy ? 'Sending…' : 'Send message'}</button>
        </div>
      </form>
    </section>
    <p className="privacy">Messages are sent to CallMissed to generate responses. This app keeps conversation history only in the current browser session.</p>
  </>;
}
