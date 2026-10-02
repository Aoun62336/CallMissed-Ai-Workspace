import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { api, errorText } from '../../lib/api';
import { CopyIcon, DownloadIcon, PlusIcon, SendIcon } from '../../lib/icons';

type Message = { role: 'user' | 'assistant'; content: string; ts?: number };
type ChatResponse = { answer: string; elapsed_ms: number };

const EXAMPLES = [
  'Explain how Large Language Models work in simple terms.',
  'What are the key differences between REST and GraphQL APIs?',
  'Give me three best practices for production-ready Docker containers.',
];


function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** Convert **bold** and `code` spans within a single line of text into React elements. */
function renderInline(text: string) {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/).map((part, i) => {
    if (/^\*\*[^*]+\*\*$/.test(part)) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (/^`[^`]+`$/.test(part)) return <code key={i} className="inline-code">{part.slice(1, -1)}</code>;
    return part;
  });
}

/**
 * Render an AI response string as structured JSX.
 * Handles: paragraph breaks (\n\n), bullet lists (- / *), numbered lists,
 * bold (**text**), and inline code (`code`).
 */
function renderContent(text: string) {
  return text.split(/\n\n+/).map((block, bi) => {
    const lines = block.split('\n');

    // Unordered list — every non-empty line starts with "- " or "* "
    if (lines.some(l => /^[-*]\s/.test(l)) && lines.every(l => !l.trim() || /^[-*]\s/.test(l))) {
      return (
        <ul key={bi} className="msg-list">
          {lines.filter(l => l.trim()).map((l, i) => (
            <li key={i}>{renderInline(l.replace(/^[-*]\s/, ''))}</li>
          ))}
        </ul>
      );
    }

    // Ordered list — every non-empty line starts with "1. " / "2. " etc.
    if (lines.some(l => /^\d+[.)]\s/.test(l)) && lines.every(l => !l.trim() || /^\d+[.)]\s/.test(l))) {
      return (
        <ol key={bi} className="msg-list">
          {lines.filter(l => l.trim()).map((l, i) => (
            <li key={i}>{renderInline(l.replace(/^\d+[.)]\s+/, ''))}</li>
          ))}
        </ol>
      );
    }

    // Regular paragraph — single newlines become <br/> within the paragraph.
    return (
      <p key={bi} className="msg-para">
        {lines.map((line, li) => (
          <span key={li}>
            {renderInline(line)}
            {li < lines.length - 1 && <br />}
          </span>
        ))}
      </p>
    );
  });
}

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
    for (let i = messages.length - 1; i >= 0; i -= 1)
      if (messages[i].role === 'assistant') return i;
    return -1;
  }, [messages]);

  // Auto-scroll to the latest message after each update.
  useEffect(() => {
    conversationEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, busy]);

  /** Grow the textarea to fit its content (max 200 px). */
  function autoResize(el: HTMLTextAreaElement) {
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }

  function resetHeight() {
    if (textarea.current) textarea.current.style.height = '';
  }

  async function send() {
    const content = draft.trim();
    if (!content || busy) return;
    setBusy(true); setError(''); setCopiedIndex(null);
    // Only send role + content to the API — strip the ts timestamp field.
    const recent = messages.slice(-10).map(m => ({ role: m.role, content: m.content }));
    const requestMessages = [...recent, { role: 'user' as const, content }];
    try {
      const result = await api<ChatResponse>('/api/chat', {
        method: 'POST',
        body: JSON.stringify({ messages: requestMessages }),
      });
      const now = Date.now();
      setMessages(previous => [
        ...previous,
        { role: 'user', content, ts: now },
        { role: 'assistant', content: result.answer, ts: now },
      ]);
      setDraft(''); resetHeight();
      setLastElapsed(result.elapsed_ms);
      requestAnimationFrame(() => textarea.current?.focus());
    } catch (reason) {
      // Deliberately keep the draft so the user can edit/retry it.
      setError(errorText(reason));
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent) { event.preventDefault(); void send(); }

  function keyboard(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(); }
  }

  async function copyAnswer(index: number, content: string) {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedIndex(index);
      window.setTimeout(() => setCopiedIndex(c => c === index ? null : c), 1500);
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
    link.href = url; link.download = 'chat-history.txt'; link.click();
    URL.revokeObjectURL(url);
  }

  function newChat() {
    setMessages([]); setDraft(''); setError(''); setLastElapsed(null); setCopiedIndex(null);
    resetHeight();
    requestAnimationFrame(() => textarea.current?.focus());
  }

  return <>
    <div className="page-title">
      <div>
        <h1>Chat</h1>
        <p className="sub">Ask questions and continue the conversation with temporary browser history.</p>
      </div>
      <div className="page-actions">
        {!empty && (
          <button className="btn" onClick={downloadChat} title="Export conversation">
            <DownloadIcon />Export
          </button>
        )}
        <button className="btn" onClick={newChat} disabled={empty && !draft}>
          <PlusIcon />New chat
        </button>
      </div>
    </div>

    <section className="panel chat" aria-label="AI chat">
      <div className="chat-top">
        <span>
          {empty
            ? 'Start a new conversation'
            : `${messages.length} message${messages.length === 1 ? '' : 's'} · up to ${contextCount} recent messages reused as context`}
        </span>
        <span className="model-badge">sarvam-105b-conversations</span>
      </div>

      <div className={`conversation ${empty ? 'conversation-empty' : ''}`} aria-live="polite">
        {empty ? (
          <div className="empty-state">
            <div className="empty-icon">AI</div>
            <h2>What would you like to ask?</h2>
            <p className="sub">Choose an example or write your own question below.</p>
            <div className="example-grid">
              {EXAMPLES.map(example => (
                <button key={example} className="example"
                  onClick={() => { setDraft(example); textarea.current?.focus(); }}>
                  {example}
                </button>
              ))}
            </div>
          </div>
        ) : messages.map((message, index) =>
          message.role === 'user' ? (
            <div className="message user" key={`${index}-u`}>
              <p>{message.content}</p>
              {message.ts && <span className="msg-time">{formatTime(message.ts)}</span>}
            </div>
          ) : (
            <div className="message assistant" key={`${index}-a`}>
              <div className="byline">
                <span className="assistant-dot">AI</span>AI assistant
              </div>
              <div className="assistant-body">{renderContent(message.content)}</div>
              <div className="msg-actions">
                <button className="btn compact"
                  onClick={() => void copyAnswer(index, message.content)}>
                  <CopyIcon />{copiedIndex === index ? 'Copied' : 'Copy response'}
                </button>
                {index === latestAssistant && lastElapsed !== null && (
                  <span className="measured">Response time: {(lastElapsed / 1000).toFixed(2)} s</span>
                )}
              </div>
              {message.ts && <span className="msg-time">{formatTime(message.ts)}</span>}
            </div>
          )
        )}
        {busy && (
          <div className="message assistant pending-message">
            <div className="byline"><span className="assistant-dot">AI</span>AI assistant</div>
            <div className="typing" aria-label="Generating response">
              <span /><span /><span />
            </div>
          </div>
        )}
        {/* Sentinel — scrolled into view after each reply. */}
        <div ref={conversationEnd} />
      </div>

      {error && <div className="inline-error chat-error" role="alert">{error}</div>}

      <form className="composer" onSubmit={submit}>
        <label className="field-label" htmlFor="message">Your message</label>
        <textarea
          ref={textarea}
          id="message"
          value={draft}
          maxLength={2000}
          onChange={event => { setDraft(event.target.value); autoResize(event.target); }}
          onKeyDown={keyboard}
          placeholder="Ask a question…"
          aria-describedby="composer-help"
          disabled={busy}
        />
        <div className="composer-footer">
          <span className={`hint${remaining < 100 ? ' hint-warn' : ''}`} id="composer-help">
            Enter to send · Shift+Enter for a new line · {remaining.toLocaleString()} characters left
          </span>
          <button className="btn primary" type="submit" disabled={!canSend}>
            <SendIcon />{busy ? 'Sending…' : 'Send message'}
          </button>
        </div>
      </form>
    </section>

    <p className="privacy">
      Messages are sent to CallMissed to generate responses. This app keeps conversation history
      only in the current browser session.
    </p>
  </>;
}
