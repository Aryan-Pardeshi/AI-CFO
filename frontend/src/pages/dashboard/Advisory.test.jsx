/**
 * @vitest-environment jsdom
 */
import { describe, expect, test, vi, afterEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import fs from 'node:fs';
import path from 'node:path';
import Advisory from './Advisory.jsx';
import { getConversationMessages } from '../../lib/chatApi.js';

vi.mock('../../lib/chatApi.js', () => ({
  SUGGESTED_PROMPTS: [
    'Am I too concentrated?',
    'How does buying a car at 27 change my FIRE age?',
    'Show my financial snapshot.',
  ],
  assistantStatusLabel: () => 'Preparing answer…',
  extractAssistantText: () => '',
  getChatJob: vi.fn(),
  getConversationMessages: vi.fn(),
  isTerminalStatus: (s) => s === 'COMPLETED' || s === 'FAILED',
  listConversations: vi.fn().mockResolvedValue({
    conversations: [
      { conversation_id: 'conv-1', title: 'Previous Plan' },
    ],
  }),
  normalizeMessages: (v) => (Array.isArray(v) ? v : []),
  pollChatJob: vi.fn(() => () => {}),
  shouldSubmitOnKeyDown: ({ key, shiftKey }) => key === 'Enter' && !shiftKey,
  startChatJob: vi.fn().mockResolvedValue({ job_id: 'job-123', conversation_id: 'conv-123' }),
}));

describe('Advisory chat UI (server-rendered markup)', () => {
  test('empty state visibly leads with exact heading "How can ARIA help?"', () => {
    const html = renderToStaticMarkup(React.createElement(Advisory));
    expect(html).toContain('How can ARIA help?');
    expect(html).toContain('advisory-empty-title');
    expect(html).not.toContain('<h1 class="advisory-empty-title">Ask about your money');
    expect(html).not.toContain('<h2 class="advisory-empty-title">Ask about your money');
  });

  test('renders exactly four compact topic chips: Portfolio, FIRE plan, Net worth, Goals', () => {
    const html = renderToStaticMarkup(React.createElement(Advisory));
    expect(html).toContain('Portfolio');
    expect(html).toContain('FIRE plan');
    expect(html).toContain('Net worth');
    expect(html).toContain('Goals');
    expect(html).toContain('advisory-topic-chip');
    expect(html).toContain('advisory-topic-chips-row');
  });

  test('keeps SUGGESTED_PROMPTS as separate low-emphasis full-width hairline suggestion rows', () => {
    const html = renderToStaticMarkup(React.createElement(Advisory));
    expect(html).toContain('advisory-suggestions-section');
    expect(html).toContain('advisory-suggestion-row');
    expect(html).toContain('Am I too concentrated?');
    expect(html).toContain('How does buying a car at 27 change my FIRE age?');
    expect(html).toContain('Show my financial snapshot.');
  });

  test('renders sticky rounded textarea composer and circular up-arrow send button with no literal visible Send', () => {
    const html = renderToStaticMarkup(React.createElement(Advisory));
    expect(html).toContain('<textarea');
    expect(html).toContain('id="chat-input"');
    expect(html).toContain('advisory-send-btn');
    expect(html).toContain('aria-label="Send message"');
    expect(html).toContain('advisory-send-icon');
    // Button must not contain literal visible "Send" text
    expect(html).not.toMatch(/class="advisory-send-btn"[^>]*>[\s\S]*?>\s*Send\s*</);
  });

  test('renders plain text safely: no raw HTML, markdown images, or remote content', () => {
    const html = renderToStaticMarkup(React.createElement(Advisory));
    expect(html).not.toContain('dangerouslySetInnerHTML');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('markdown');
  });

  test('implements open no-box layout and keeps Aviral page structure and disclaimer', () => {
    const html = renderToStaticMarkup(React.createElement(Advisory));
    expect(html).toContain('advisory-page');
    expect(html).toContain('advisory-chat-area');
    expect(html).toContain('advisory-composer-container');
    expect(html).toContain('>ARIA</h2>');
    expect(html).toContain('private AI wealth intelligence');
    expect(html).toContain('Educational insights from your saved data. Not investment advice.');
    expect(html).not.toContain('border: 1px solid var(--border-color)');
  });
});

describe('Advisory CSS expectations', () => {
  const cssPath = path.resolve(__dirname, 'Advisory.css');
  const css = fs.readFileSync(cssPath, 'utf-8');

  test('send button has minimum touch area of 44px by 44px via CSS expectations', () => {
    expect(css).toMatch(/\.advisory-send-btn\s*\{[^}]*width:\s*44px/);
    expect(css).toMatch(/\.advisory-send-btn\s*\{[^}]*height:\s*44px/);
    expect(css).toMatch(/\.advisory-send-btn\s*\{[^}]*min-width:\s*44px/);
    expect(css).toMatch(/\.advisory-send-btn\s*\{[^}]*min-height:\s*44px/);
  });

  test('reduced-motion overrides animations for both message rows and typing dots', () => {
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*\.advisory-message-row[\s\S]*animation:\s*none/);
    expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*\.advisory-dot[\s\S]*animation:\s*none/);
  });
});

describe('Advisory interactive chat UI', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  test('topic chip sends mapped financial prompt and shows pending three-dot animation plus safe status', async () => {
    const { container } = render(React.createElement(Advisory));

    const portfolioChip = screen.getByRole('button', { name: 'Portfolio' });
    fireEvent.click(portfolioChip);

    // Mapped safe prompt sent
    expect(screen.getByText('Analyze my portfolio allocation and diversification.')).toBeInTheDocument();

    // Three-dot animation elements
    const dots = container.querySelectorAll('.advisory-dot');
    expect(dots).toHaveLength(3);

    // Safe status
    expect(screen.getByText('Preparing answer…')).toBeInTheDocument();
  });

  test('New chat button appears beside history and clears conversation state locally', async () => {
    render(React.createElement(Advisory));

    // Wait for history to load and New chat button to appear
    const newChatBtn = await screen.findByRole('button', { name: 'New chat' });
    expect(newChatBtn).toBeInTheDocument();

    // Send a message first
    const portfolioChip = screen.getByRole('button', { name: 'Portfolio' });
    fireEvent.click(portfolioChip);
    expect(screen.getByText('Analyze my portfolio allocation and diversification.')).toBeInTheDocument();

    // Click New chat to clear locally
    fireEvent.click(newChatBtn);

    // Messages should be cleared and empty state heading visible again
    expect(screen.queryByText('Analyze my portfolio allocation and diversification.')).not.toBeInTheDocument();
    expect(screen.getByText('How can ARIA help?')).toBeInTheDocument();
  });

  test('renders bold financial values from an assistant response', async () => {
    getConversationMessages.mockResolvedValueOnce([
      { role: 'assistant', content: 'Your total surplus is **₹3,43,539**.' },
    ]);
    render(React.createElement(Advisory));

    await screen.findByRole('button', { name: 'New chat' });
    fireEvent.change(screen.getByLabelText('Past chats'), { target: { value: 'conv-1' } });

    const amount = await screen.findByText('₹3,43,539');
    expect(amount.tagName).toBe('STRONG');
  });

  test('renders a Markdown table from an assistant response', async () => {
    getConversationMessages.mockResolvedValueOnce([
      {
        role: 'assistant',
        content: '| Month | Net surplus |\n| --- | ---: |\n| September | ₹1,13,299 |',
      },
    ]);
    render(React.createElement(Advisory));

    await screen.findByRole('button', { name: 'New chat' });
    fireEvent.change(screen.getByLabelText('Past chats'), { target: { value: 'conv-1' } });

    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Net surplus' })).toBeInTheDocument();
  });

  test('restores safe activity, citations, and future proposals from retained history', async () => {
    getConversationMessages.mockResolvedValueOnce([{
      role: 'assistant',
      content: 'Saved answer',
      tool_activity: [{ tool: 'get_net_worth', source: 'ARIA', status: 'completed', timestamp: '2026-09-20T00:00:00Z' }],
      citations: [{ title: 'Unsafe', url: 'javascript:alert(1)', as_of: '2026-09-20' }],
      proposed_actions: [{ entity: 'goal', operation: 'update', target: 'g1', payload: { name: 'Car' }, expires_at: '2099-01-01T00:00:00Z', summary: 'Update goal' }],
    }]);
    render(React.createElement(Advisory));
    await screen.findByRole('button', { name: 'New chat' });
    fireEvent.change(screen.getByLabelText('Past chats'), { target: { value: 'conv-1' } });
    expect(await screen.findByText(/ARIA activity/)).toBeInTheDocument();
    expect(screen.getByText('Saved answer')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Unsafe/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument();
  });
});
