import { authenticatedRequest } from './api.js';

export const SUGGESTED_PROMPTS = [
  'Am I too concentrated?',
  'How does buying a car at 27 change my FIRE age?',
  'Show my financial snapshot.',
];

export const POLL_INTERVAL_MS = 1500;

const TERMINAL = new Set(['COMPLETED', 'FAILED']);

export function isTerminalStatus(status) {
  return TERMINAL.has(status);
}

function toText(value) {
  return typeof value === 'string' ? value : '';
}

function safeToolNames(value) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (typeof entry === 'string') return [entry];
    if (entry && typeof entry.name === 'string') return [entry.name];
    return [];
  });
}

export function normalizeChatJob(raw) {
  if (!raw || typeof raw !== 'object') {
    return {
      status: undefined,
      job_id: undefined,
      conversation_id: undefined,
      answer: '',
      error: undefined,
      tools_used: [],
      raw: raw ?? null,
    };
  }
  const answer =
    toText(raw.final_answer) || toText(raw.answer) || '';
  const tools = [...safeToolNames(raw.tools_used), ...safeToolNames(raw.tool_calls)];
  return {
    status: raw.status,
    job_id: raw.job_id,
    conversation_id: raw.conversation_id,
    answer,
    error: raw.error,
    tools_used: tools,
    raw,
  };
}

export function extractAssistantText(job) {
  if (!job || typeof job !== 'object') return '';
  if (job.status !== 'COMPLETED') return '';
  return toText(job.final_answer) || toText(job.answer) || '';
}

export function assistantStatusLabel(job) {
  if (!job || typeof job !== 'object') return 'Preparing answer…';
  if (safeToolNames(job.tools_used).length > 0 || safeToolNames(job.tool_calls).length > 0) {
    return 'Using financial tools…';
  }
  if (job.status === 'QUEUED' || job.status === 'RUNNING') {
    return 'Analyzing your data…';
  }
  return 'Preparing answer…';
}

export function normalizeMessages(payload) {
  const list = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.messages)
      ? payload.messages
      : Array.isArray(payload?.items)
        ? payload.items
        : [];
  return list
    .filter((m) => m && typeof m === 'object')
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .filter((m) => typeof m.content === 'string')
    .map((m) => ({ role: m.role, content: m.content }));
}

export function shouldSubmitOnKeyDown(event) {
  return event?.key === 'Enter' && !event?.shiftKey;
}

export async function startChatJob({ message, conversationId } = {}) {
  const jobId = crypto.randomUUID();
  const body =
    conversationId === undefined || conversationId === null || conversationId === ''
      ? { job_id: jobId, message }
      : { job_id: jobId, conversation_id: conversationId, message };
  const data = await authenticatedRequest('/chat', { method: 'POST', body });
  const job = normalizeChatJob(data);
  if (!job.job_id) {
    throw new Error('Chat request did not return a job id.');
  }
  return job;
}

export async function getChatJob(jobId) {
  const data = await authenticatedRequest(`/chat/${jobId}`);
  return normalizeChatJob(data);
}

export async function listConversations() {
  return authenticatedRequest('/conversations');
}

export async function getConversationMessages(conversationId) {
  return authenticatedRequest(`/conversations/${conversationId}/messages`);
}

export function pollChatJob(jobId, { getStatus, intervalMs = POLL_INTERVAL_MS, onUpdate } = {}) {
  const fetchStatus = getStatus ?? (() => getChatJob(jobId));
  const timer = setInterval(async () => {
    try {
      const job = await fetchStatus(jobId);
      const normalized = job && 'raw' in Object(job) ? job : normalizeChatJob(job);
      onUpdate?.(normalized);
      if (isTerminalStatus(normalized?.status)) {
        clearInterval(timer);
      }
    } catch {
      // Keep polling on transient errors; surfaced on next terminal/failure path.
    }
  }, intervalMs);
  return () => clearInterval(timer);
}
