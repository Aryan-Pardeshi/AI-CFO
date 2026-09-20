import { authenticatedRequest } from './api.js';

const ALLOWED = {
  profile: new Set(['name', 'risk_profile', 'investment_horizon_years', 'strategy_goal']),
  dashboard_financials: new Set(['financials', 'preferences', 'monthly_income_paise', 'monthly_expenses_paise', 'monthly_investment_paise', 'declared_net_worth_paise', 'cash_balance_paise']),
  holding: new Set(['quantity', 'avg_buy_price_paise', 'manual_current_value_paise']),
  goal: new Set(['name', 'target_amount_paise', 'target_date', 'priority']),
  loan: new Set(['outstanding_principal_paise', 'interest_rate', 'monthly_payment_paise']),
  fire_scenario: new Set(['name', 'inputs']),
  transaction_category: new Set(['category', 'version']),
};
const OPERATIONS = {
  profile: new Set(['update']),
  dashboard_financials: new Set(['update']),
  holding: new Set(['create', 'update', 'delete']),
  goal: new Set(['create', 'update', 'delete']),
  loan: new Set(['create', 'update', 'delete']),
  fire_scenario: new Set(['create']),
  transaction_category: new Set(['update']),
};

function futureExpiry(value) {
  if (typeof value !== 'string' || !value || value.length > 40) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp > Date.now();
}

export function sanitizeProposal(proposal) {
  if (!proposal || typeof proposal !== 'object' || !ALLOWED[proposal.entity] || !OPERATIONS[proposal.entity]?.has(proposal.operation)) return null;
  const payload = proposal.payload && typeof proposal.payload === 'object' && !Array.isArray(proposal.payload)
    ? Object.fromEntries(Object.entries(proposal.payload).filter(([key]) => ALLOWED[proposal.entity].has(key)))
    : {};
  return {
    entity: proposal.entity,
    operation: proposal.operation,
    target: typeof proposal.target === 'string' ? proposal.target : undefined,
    payload,
    summary: typeof proposal.summary === 'string' && proposal.summary
      ? proposal.summary
      : `${proposal.operation} ${proposal.entity.replaceAll('_', ' ')}`,
    version: Number.isInteger(proposal.version) ? proposal.version : undefined,
    expires_at: futureExpiry(proposal.expires_at) ? proposal.expires_at : undefined,
    current: proposal.current && typeof proposal.current === 'object' && !Array.isArray(proposal.current)
      ? Object.fromEntries(Object.entries(proposal.current).filter(([key]) => ALLOWED[proposal.entity].has(key))) : undefined,
  };
}

export function isSafeAction(proposal) {
  const safe = sanitizeProposal(proposal);
  return Boolean(safe?.summary && safe.expires_at && (safe.operation === 'create' || safe.target));
}

export async function actionRequest(proposal, request = authenticatedRequest) {
  const safe = sanitizeProposal(proposal);
  if (!isSafeAction(safe)) throw new Error('This action needs a fresh validated proposal.');
  if (safe.entity === 'transaction_category' && safe.operation === 'update') {
    return request(`/transactions/${encodeURIComponent(safe.target)}/category`, { method: 'PATCH', body: safe.payload });
  }
  if (safe.entity === 'fire_scenario' && safe.operation === 'create') {
    return request('/fire/scenarios', { method: 'POST', body: safe.payload });
  }
  const routes = {
    profile: '/me/profile',
    dashboard_financials: '/dashboard/financials',
    holding: '/holdings',
    goal: '/goals',
    loan: '/loans',
  };
  if (routes[safe.entity]) {
    const collection = routes[safe.entity];
    const singleton = safe.entity === 'profile' || safe.entity === 'dashboard_financials';
    const path = singleton ? collection : safe.operation === 'create' ? collection
      : `${collection}/${encodeURIComponent(safe.target)}`;
    const method = safe.operation === 'create' ? 'POST' : safe.operation === 'delete' ? 'DELETE' : 'PUT';
    const body = safe.operation === 'delete' ? undefined
      : safe.entity === 'dashboard_financials' ? { financials: safe.payload.financials ?? safe.payload } : safe.payload;
    return request(path, { method, ...(body === undefined ? {} : { body }) });
  }
  throw new Error('This action is not available yet.');
}
