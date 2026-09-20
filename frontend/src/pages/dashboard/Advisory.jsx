import React, { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import './Advisory.css';
import {
  SUGGESTED_PROMPTS,
  assistantStatusLabel,
  extractAssistantText,
  getChatJob,
  getConversationMessages,
  isTerminalStatus,
  listConversations,
  normalizeMessages,
  pollChatJob,
  shouldSubmitOnKeyDown,
  startChatJob,
} from '../../lib/chatApi.js';

const SAFE_START_ERROR = 'Could not start that chat. Please try again.';
const SAFE_JOB_ERROR = 'Something went wrong preparing that answer. Please try again.';

const TOPIC_CHIPS = [
  { label: 'Portfolio', prompt: 'Analyze my portfolio allocation and diversification.' },
  { label: 'FIRE plan', prompt: 'How does my current savings rate impact my FIRE plan?' },
  { label: 'Net worth', prompt: 'Show my financial snapshot and net worth breakdown.' },
  { label: 'Goals', prompt: 'What financial milestones and goals should I prioritize?' },
];

function useSafeLocation() {
  try {
    return useLocation();
  } catch {
    return null;
  }
}

const Advisory = () => {
  const location = useSafeLocation();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState(null);
  const [conversationId, setConversationId] = useState(undefined);
  const [conversations, setConversations] = useState([]);
  const [lastPrompt, setLastPrompt] = useState('');
  const pollStop = useRef(null);
  const msgSeq = useRef(0);
  const textareaRef = useRef(null);
  const messagesEndRef = useRef(null);
  const initialPromptHandled = useRef(false);

  useEffect(() => {
    if (location?.state?.initialPrompt && !initialPromptHandled.current) {
      initialPromptHandled.current = true;
      setInput(location.state.initialPrompt);
    }
  }, [location?.state]);

  useEffect(() => {
    let cancelled = false;
    listConversations()
      .then((data) => {
        if (cancelled) return;
        const list = Array.isArray(data?.conversations) ? data.conversations : [];
        if (list.length > 0) setConversations(list);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => () => pollStop.current?.(), []);

  useEffect(() => {
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    if (typeof messagesEndRef.current?.scrollIntoView === 'function') {
      messagesEndRef.current.scrollIntoView({
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
      });
    }
  }, [messages, status]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const scrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = `${Math.min(scrollHeight, 160)}px`;
    }
  }, [input]);

  const handleNewChat = () => {
    pollStop.current?.();
    pollStop.current = null;
    setMessages([]);
    setError(null);
    setLastPrompt('');
    setConversationId(undefined);
    setInput('');
    setStatus('');
    setBusy(false);
  };

  const send = async (rawText) => {
    const text = (rawText ?? '').trim();
    if (!text || busy) return;
    pollStop.current?.();
    pollStop.current = null;
    setError(null);
    setBusy(true);
    setLastPrompt(text);
    const userMsg = { id: `u-${++msgSeq.current}`, role: 'user', content: text };
    const pendingId = `a-${msgSeq.current}`;
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    setStatus('Preparing answer…');
    setMessages((prev) => [...prev, { id: pendingId, role: 'assistant', content: '', pending: true }]);

    let job;
    try {
      job = await startChatJob({ message: text, conversationId });
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== pendingId));
      setBusy(false);
      setStatus('');
      setError({ message: SAFE_START_ERROR });
      return;
    }
    if (job.conversation_id) setConversationId(job.conversation_id);

    pollStop.current = pollChatJob(job.job_id, {
      getStatus: () => getChatJob(job.job_id),
      intervalMs: 1500,
      onUpdate: (update) => {
        if (isTerminalStatus(update.status)) {
          pollStop.current?.();
          pollStop.current = null;
          setBusy(false);
          setStatus('');
          if (update.status === 'COMPLETED') {
            const answer = extractAssistantText(update);
            setMessages((prev) =>
              prev.map((m) => (m.id === pendingId ? { ...m, content: answer, pending: false } : m)),
            );
          } else {
            setMessages((prev) => prev.filter((m) => m.id !== pendingId));
            setError({ message: SAFE_JOB_ERROR });
          }
        } else {
          setStatus(assistantStatusLabel(update));
        }
      },
    });
  };

  const loadConversation = async (id) => {
    if (!id) return;
    setConversationId(id);
    setError(null);
    try {
      const data = await getConversationMessages(id);
      setMessages(
        normalizeMessages(data).map((m) => ({ ...m, id: `h-${++msgSeq.current}` })),
      );
    } catch {
      setError({ message: 'Could not load that conversation. Please try again.' });
    }
  };

  const showHistory = conversations.length > 0;

  return (
    <div className="advisory-page">
      {/* Header - Open, unboxed */}
      <header className="advisory-header">
        <div className="advisory-header-content">
          <h2 className="advisory-title">ARIA Advisory</h2>
          <p className="advisory-subtitle">Your private AI wealth intelligence.</p>
        </div>
        {showHistory && (
          <div className="advisory-history-controls">
            <label htmlFor="chat-history" className="advisory-history-label">Past chats</label>
            <select
              id="chat-history"
              value={conversationId ?? ''}
              onChange={(e) => {
                if (e.target.value === '') {
                  handleNewChat();
                } else {
                  loadConversation(e.target.value);
                }
              }}
              className="advisory-history-select"
            >
              <option value="">Select chat</option>
              {conversations.map((c) => (
                <option key={c.conversation_id ?? c.id} value={c.conversation_id ?? c.id}>
                  {c.title ?? c.conversation_id ?? c.id}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="advisory-new-chat-btn"
              onClick={handleNewChat}
            >
              New chat
            </button>
          </div>
        )}
      </header>

      {/* Chat Area */}
      <div className="advisory-chat-area" aria-label="Chat messages" role="log">
        {messages.length === 0 && (
          <div className="advisory-empty-state">
            <h2 className="advisory-empty-title">How can ARIA help?</h2>
            <div className="advisory-topic-chips-row">
              {TOPIC_CHIPS.map((chip) => (
                <button
                  key={chip.label}
                  type="button"
                  className="advisory-topic-chip"
                  onClick={() => send(chip.prompt)}
                  disabled={busy}
                >
                  {chip.label}
                </button>
              ))}
            </div>
            <div className="advisory-suggestions-section">
              <div className="advisory-suggestions-list">
                {SUGGESTED_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    className="advisory-suggestion-row"
                    onClick={() => send(prompt)}
                    disabled={busy}
                  >
                    <span>{prompt}</span>
                    <svg
                      className="advisory-suggestion-arrow"
                      viewBox="0 0 24 24"
                      width="16"
                      height="16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {messages.map((msg) =>
          msg.role === 'user' ? (
            <div key={msg.id} className="advisory-message-row user">
              <div className="advisory-bubble user">
                {msg.content}
              </div>
            </div>
          ) : (
            <div key={msg.id} className="advisory-message-row assistant">
              <div className="advisory-assistant-meta">
                <span className="advisory-avatar-dot" aria-hidden="true" />
                <span>ARIA</span>
              </div>
              <div className="advisory-bubble assistant">
                {msg.pending ? (
                  <div className="advisory-pending-content" role="status" aria-live="polite">
                    <span className="advisory-dots" aria-hidden="true">
                      <span className="advisory-dot" />
                      <span className="advisory-dot" />
                      <span className="advisory-dot" />
                    </span>
                    <span className="advisory-status-text">
                      {status || 'Preparing answer…'}
                    </span>
                  </div>
                ) : (
                  msg.content
                )}
              </div>
            </div>
          ),
        )}

        {error && (
          <div className="advisory-message-row error">
            <div className="advisory-bubble error">
              {error.message}
            </div>
            <button
              type="button"
              className="advisory-retry-btn"
              onClick={() => send(lastPrompt)}
              disabled={busy || !lastPrompt}
            >
              Retry
            </button>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Sticky rounded textarea composer */}
      <div className="advisory-composer-container">
        <div className="advisory-composer">
          <label htmlFor="chat-input" className="sr-only">Ask ARIA about your finances</label>
          <textarea
            ref={textareaRef}
            id="chat-input"
            className="advisory-textarea"
            placeholder="Ask ARIA about your finances..."
            value={input}
            disabled={busy}
            rows={1}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (shouldSubmitOnKeyDown(e)) {
                e.preventDefault();
                send(input);
              }
            }}
          />
          <button
            type="button"
            className="advisory-send-btn"
            aria-label="Send message"
            title="Send message"
            onClick={() => send(input)}
            disabled={busy || !input.trim()}
          >
            <svg
              className="advisory-send-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="12" y1="19" x2="12" y2="5" />
              <polyline points="5 12 12 5 19 12" />
            </svg>
          </button>
        </div>
        <p className="advisory-disclaimer">
          Educational insights from your saved data. Not investment advice.
        </p>
      </div>
    </div>
  );
};

export default Advisory;
