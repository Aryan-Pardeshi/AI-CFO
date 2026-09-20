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

const SAFE_ACTIVITY_STATUSES = new Set(['started', 'completed', 'failed']);
const SAFE_ACTIONS = {
  profile: new Set(['name', 'risk_profile', 'investment_horizon_years', 'strategy_goal']),
  dashboard_financials: new Set(['financials', 'preferences', 'monthly_income_paise', 'monthly_expenses_paise', 'monthly_investment_paise', 'declared_net_worth_paise', 'cash_balance_paise']),
  holding: new Set(['quantity', 'avg_buy_price_paise', 'manual_current_value_paise']),
  goal: new Set(['name', 'target_amount_paise', 'target_date', 'priority']),
  loan: new Set(['outstanding_principal_paise', 'interest_rate', 'monthly_payment_paise']),
  fire_scenario: new Set(['name', 'inputs']),
  transaction_category: new Set(['category', 'version']),
};
const SAFE_OPERATIONS = {
  profile: new Set(['update']),
  dashboard_financials: new Set(['update']),
  holding: new Set(['create', 'update', 'delete']),
  goal: new Set(['create', 'update', 'delete']),
  loan: new Set(['create', 'update', 'delete']),
  fire_scenario: new Set(['create']),
  transaction_category: new Set(['update']),
};

function safeString(value, max = 120) {
  return typeof value === 'string' && value.length > 0 && value.length <= max ? value : '';
}

function safeActivity(value) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const name = safeString(item.tool || item.name, 80);
    const source = safeString(item.source || 'ARIA', 80);
    const status = safeString(item.status, 20).toLowerCase();
    const timestamp = safeString(item.timestamp, 40);
    if (!name || !source || !SAFE_ACTIVITY_STATUSES.has(status)) return [];
    return [{ name, source, status, ...(timestamp ? { timestamp } : {}) }];
  }).slice(0, 30);
}

function safeCitations(value) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const title = safeString(item.title || item.source, 160);
    const url = safeString(item.url, 500);
    const asOf = safeString(item.as_of, 40);
    if (!title || !asOf) return [];
    return [{ title, ...(url && /^https:\/\//i.test(url) ? { url } : {}), as_of: asOf }];
  }).slice(0, 20);
}

function safeProposals(value) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object' || !SAFE_ACTIONS[item.entity]) return [];
    const entity = item.entity;
    const operation = item.operation;
    if (!SAFE_OPERATIONS[entity]?.has(operation)) return [];
    const payload = item.payload && typeof item.payload === 'object' && !Array.isArray(item.payload)
      ? Object.fromEntries(Object.entries(item.payload).filter(([key]) => SAFE_ACTIONS[entity].has(key)))
      : {};
    const summary = safeString(item.summary, 300) || `${operation} ${entity.replaceAll('_', ' ')}`;
    if (operation !== 'create' && !safeString(item.target, 120)) return [];
    const expiresAt = safeString(item.expires_at, 40);
    if (!expiresAt || !Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt) <= Date.now()) return [];
    const current = item.current && typeof item.current === 'object' && !Array.isArray(item.current)
      ? Object.fromEntries(Object.entries(item.current).filter(([key]) => SAFE_ACTIONS[entity].has(key))) : undefined;
    return [{ entity, operation, ...(safeString(item.target, 120) ? { target: item.target } : {}), payload, summary,
      expires_at: expiresAt,
      ...(current && Object.keys(current).length ? { current } : {}),
      ...(Number.isInteger(item.version) ? { version: item.version } : {}) }];
  }).slice(0, 10);
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
      tool_activity: [],
      citations: [],
      proposed_actions: [],
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
    tool_activity: safeActivity(raw.tool_activity),
    citations: safeCitations(raw.citations),
    proposed_actions: safeProposals(raw.proposed_actions),
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
    .map((m) => {
      if (m.role !== 'assistant') return { role: m.role, content: m.content };
      const safe = normalizeChatJob({ ...m, status: 'COMPLETED', final_answer: m.content });
      return {
        role: m.role,
        content: m.content,
        ...(safe.tool_activity.length ? { tool_activity: safe.tool_activity } : {}),
        ...(safe.citations.length ? { citations: safe.citations } : {}),
        ...(safe.proposed_actions.length ? { proposed_actions: safe.proposed_actions } : {}),
      };
    });
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
