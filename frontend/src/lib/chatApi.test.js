import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  SUGGESTED_PROMPTS,
  assistantStatusLabel,
  extractAssistantText,
  getChatJob,
  getConversationMessages,
  isTerminalStatus,
  listConversations,
  normalizeChatJob,
  normalizeMessages,
  pollChatJob,
  shouldSubmitOnKeyDown,
  startChatJob,
} from './chatApi.js';
import { authenticatedRequest } from './api.js';

vi.mock('./api.js', () => ({
  authenticatedRequest: vi.fn(),
}));

describe('chatApi request shape', () => {
  beforeEach(() => {
    authenticatedRequest.mockReset();
    vi.stubGlobal('crypto', { randomUUID: () => 'uuid-1234' });
  });

  test('POST /chat sends client UUID + message without invented identity', async () => {
    authenticatedRequest.mockResolvedValue({ job_id: 'uuid-1234', conversation_id: 'conv-1' });

    await startChatJob({ message: 'Am I too concentrated?' });

    expect(authenticatedRequest).toHaveBeenCalledWith('/chat', {
      method: 'POST',
      body: { job_id: 'uuid-1234', message: 'Am I too concentrated?' },
    });
  });

  test('POST /chat includes conversation_id only when provided', async () => {
    authenticatedRequest.mockResolvedValue({ job_id: 'uuid-1234', conversation_id: 'conv-9' });

    await startChatJob({ message: 'Hi', conversationId: 'conv-9' });

    expect(authenticatedRequest).toHaveBeenCalledWith('/chat', {
      method: 'POST',
      body: { job_id: 'uuid-1234', conversation_id: 'conv-9', message: 'Hi' },
    });
  });

  test('polling GET /chat/{job_id} preserves unknown additive fields', async () => {
    authenticatedRequest.mockResolvedValue({
      job_id: 'j1',
      status: 'RUNNING',
      future_field: 'keep-me',
    });

    const job = await getChatJob('j1');

    expect(authenticatedRequest).toHaveBeenCalledWith('/chat/j1');
    expect(job.status).toBe('RUNNING');
    expect(job.raw.future_field).toBe('keep-me');
  });

  test('conversation list/message paths are exact', async () => {
    authenticatedRequest.mockResolvedValue({ conversations: [] });
    await listConversations();
    expect(authenticatedRequest).toHaveBeenCalledWith('/conversations');

    authenticatedRequest.mockResolvedValue({ messages: [] });
    await getConversationMessages('conv-1');
    expect(authenticatedRequest).toHaveBeenCalledWith('/conversations/conv-1/messages');
  });
});

describe('chat polling lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  test('polling stops on COMPLETED and clears interval', async () => {
    const getStatus = vi
      .fn()
      .mockResolvedValueOnce({ status: 'RUNNING', job_id: 'j1' })
      .mockResolvedValueOnce({ status: 'COMPLETED', job_id: 'j1', final_answer: 'Done' });
    const onUpdate = vi.fn();

    const stop = pollChatJob('j1', { getStatus, intervalMs: 1500, onUpdate });
    await vi.advanceTimersByTimeAsync(1500);
    await vi.advanceTimersByTimeAsync(1500);

    expect(onUpdate).toHaveBeenCalledTimes(2);
    expect(onUpdate.mock.calls[1][0].status).toBe('COMPLETED');
    // After completion, further ticks must not call again (interval cleared)
    await vi.advanceTimersByTimeAsync(6000);
    expect(getStatus).toHaveBeenCalledTimes(2);
    stop();
    vi.useRealTimers();
  });

  test('polling stops on FAILED and clears interval', async () => {
    const getStatus = vi.fn().mockResolvedValue({ status: 'FAILED', job_id: 'j1', error: 'x' });
    const onUpdate = vi.fn();

    pollChatJob('j1', { getStatus, intervalMs: 2000, onUpdate });
    await vi.advanceTimersByTimeAsync(2000);

    expect(onUpdate).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(8000);
    expect(getStatus).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  test('returned stop function cancels pending polls', async () => {
    const getStatus = vi.fn().mockResolvedValue({ status: 'RUNNING', job_id: 'j1' });
    const stop = pollChatJob('j1', { getStatus, intervalMs: 1500, onUpdate: () => {} });
    stop();
    await vi.advanceTimersByTimeAsync(6000);
    expect(getStatus).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});

describe('tool alias tolerance + missing job_id guard', () => {
  beforeEach(() => {
    authenticatedRequest.mockReset();
    vi.stubGlobal('crypto', { randomUUID: () => 'uuid-1234' });
  });

  test('normalizeChatJob merges tool_calls and tools_used into a string list', () => {
    const job = normalizeChatJob({
      job_id: 'j1',
      status: 'RUNNING',
      tools_used: ['get_portfolio_analysis'],
      tool_calls: [{ name: 'calculate_fire' }, 'get_goals'],
    });
    expect(job.tools_used).toEqual(['get_portfolio_analysis', 'calculate_fire', 'get_goals']);
  });

  test('normalizeChatJob drops non-string tool content (no raw payload)', () => {
    const job = normalizeChatJob({
      job_id: 'j1',
      status: 'RUNNING',
      tool_calls: [{ args: { secret: 1 } }, 42, null, { name: 7 }, 'ok-tool'],
    });
    expect(job.tools_used).toEqual(['ok-tool']);
  });

  test('status label recognizes the tool_calls alias too', () => {
    expect(assistantStatusLabel({ status: 'RUNNING', tool_calls: ['x'] })).toBe(
      'Using financial tools…',
    );
    expect(assistantStatusLabel({ status: 'RUNNING', tools_used: ['x'] })).toBe(
      'Using financial tools…',
    );
  });

  test('startChatJob rejects instead of polling a missing job_id', async () => {
    authenticatedRequest.mockResolvedValue({ conversation_id: 'conv-1' });
    await expect(startChatJob({ message: 'hi' })).rejects.toThrow();
  });

  test('startChatJob rejects on empty job_id', async () => {
    authenticatedRequest.mockResolvedValue({ job_id: '', conversation_id: 'c' });
    await expect(startChatJob({ message: 'hi' })).rejects.toThrow();
  });
});

describe('chat result helpers', () => {
  test('extracts answer only from completed API data', () => {
    expect(extractAssistantText({ status: 'RUNNING', answer: 'half' })).toBe('');
    expect(extractAssistantText({ status: 'COMPLETED', final_answer: 'Real answer' })).toBe(
      'Real answer',
    );
    expect(extractAssistantText({ status: 'COMPLETED', answer: 'Legacy field' })).toBe(
      'Legacy field',
    );
    expect(extractAssistantText({ status: 'FAILED', final_answer: 'x' })).toBe('');
    expect(extractAssistantText(null)).toBe('');
  });

  test('terminal states are COMPLETED and FAILED only', () => {
    expect(isTerminalStatus('COMPLETED')).toBe(true);
    expect(isTerminalStatus('FAILED')).toBe(true);
    expect(isTerminalStatus('RUNNING')).toBe(false);
    expect(isTerminalStatus('QUEUED')).toBe(false);
    expect(isTerminalStatus(undefined)).toBe(false);
  });
});

describe('safe status + suggestions + send key', () => {
  test('neutral fallback when server returns no safe metadata', () => {
    expect(assistantStatusLabel({})).toBe('Preparing answer…');
    expect(assistantStatusLabel(null)).toBe('Preparing answer…');
  });

  test('concise visible status only from safe server metadata', () => {
    expect(assistantStatusLabel({ status: 'RUNNING' })).toBe('Analyzing your data…');
    expect(assistantStatusLabel({ status: 'QUEUED' })).toBe('Analyzing your data…');
    expect(assistantStatusLabel({ status: 'RUNNING', tools_used: ['get_portfolio_analysis'] })).toBe(
      'Using financial tools…',
    );
  });

  test('suggested prompts are the three safe educational starters', () => {
    expect(SUGGESTED_PROMPTS).toEqual([
      'Am I too concentrated?',
      'How does buying a car at 27 change my FIRE age?',
      'Show my financial snapshot.',
    ]);
  });

  test('Enter (no shift) sends, shift+Enter does not', () => {
    expect(shouldSubmitOnKeyDown({ key: 'Enter', shiftKey: false })).toBe(true);
    expect(shouldSubmitOnKeyDown({ key: 'Enter', shiftKey: true })).toBe(false);
    expect(shouldSubmitOnKeyDown({ key: 'a', shiftKey: false })).toBe(false);
  });

  test('message normalization keeps only safe role/content strings', () => {
    const out = normalizeMessages({
      messages: [
        { role: 'user', content: 'hi', injected: 1 },
        { role: 'assistant', content: 'hello' },
        { role: 'weird', content: 42 },
      ],
    });
    expect(out).toEqual([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
    ]);
  });

  test('normalizeChatJob keeps known fields and never invents an answer', () => {
    expect(normalizeChatJob(null)).toEqual({
      status: undefined,
      job_id: undefined,
      conversation_id: undefined,
      answer: '',
      error: undefined,
      tools_used: [],
      tool_activity: [],
      citations: [],
      proposed_actions: [],
      raw: null,
    });
    const job = normalizeChatJob({ job_id: 'j', status: 'RUNNING', note: 'future' });
    expect(job.answer).toBe('');
    expect(job.raw.note).toBe('future');
  });
});
import { describe, expect, test } from 'vitest';
import { normalizeChatJob } from './chatApi.js';

describe('chat metadata normalization', () => {
  test('keeps safe activity, citations, and proposed actions only', () => {
    const job = normalizeChatJob({
      status: 'RUNNING',
      tool_activity: [{ tool: 'get_fire', status: 'started' }, { tool: '<script>' }],
      citations: [{ title: 'Official source', url: 'https://example.com/source', as_of: '2026-09-20' }, { title: 'bad', url: 'javascript:alert(1)' }],
      proposed_actions: [{ entity: 'fire_scenario', operation: 'create', target: 'scenario-1', payload: { target_age: 50 }, summary: 'Save FIRE scenario', expires_at: '2026-09-20T11:00:00Z' }],
    });
    expect(job.tool_activity).toHaveLength(1);
    expect(job.citations).toEqual([{ title: 'Official source', url: 'https://example.com/source', as_of: '2026-09-20' }]);
    expect(job.proposed_actions[0].entity).toBe('fire_scenario');
  });
});
