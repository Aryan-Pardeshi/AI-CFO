import { http, HttpResponse } from 'msw';

function base() {
  return (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
}

function err(status, code, message, details) {
  return HttpResponse.json({ error: { code, message, details } }, { status });
}

const store = {
  profile: null,
  holdings: [],
  loans: [],
  goals: [],
  seq: 1,
};

export function __resetMockStore() {
  store.profile = null;
  store.holdings = [];
  store.loans = [];
  store.goals = [];
  store.seq = 1;
}

function nextId(prefix) {
  const id = `${prefix}-${store.seq}`;
  store.seq += 1;
  return id;
}

const QUANTITY_TYPES = ['STOCK', 'ETF', 'MUTUAL_FUND', 'CRYPTO'];

function validateHolding(body) {
  const details = {};
  if (!body?.asset_type) details.asset_type = 'asset_type is required';
  if (!body?.name || String(body.name).trim() === '') details.name = 'name is required';
  if (QUANTITY_TYPES.includes(body?.asset_type) && (body?.quantity === undefined || body?.quantity === null || body.quantity === '')) {
    details.quantity = 'quantity is required for STOCK/ETF/MUTUAL_FUND/CRYPTO';
  }
  if (body?.asset_type === 'FD' && (body?.fd_principal_paise === undefined || body?.fd_principal_paise === null)) {
    details.fd_principal_paise = 'fd_principal_paise is required for FD';
  }
  return details;
}

function validateGoal(body) {
  const details = {};
  if (!body?.name || String(body.name).trim() === '') details.name = 'name is required';
  if (!body?.goal_type) details.goal_type = 'goal_type is required';
  if (body?.amount_today_paise === undefined || body?.amount_today_paise === null) {
    details.amount_today_paise = 'amount_today_paise is required';
  }
  if (body?.target_age === undefined || body?.target_age === null) {
    details.target_age = 'target_age is required';
  }
  return details;
}

function validateLoan(body) {
  const details = {};
  if (!body?.name || String(body.name).trim() === '') details.name = 'name is required';
  if (!body?.loan_type) details.loan_type = 'loan_type is required';
  if (body?.outstanding_paise === undefined || body?.outstanding_paise === null) {
    details.outstanding_paise = 'outstanding_paise is required';
  }
  if (body?.annual_rate === undefined || body?.annual_rate === null) {
    details.annual_rate = 'annual_rate is required';
  } else {
    const rate = Number(body.annual_rate);
    if (!Number.isFinite(rate) || rate < 0 || rate > 0.36) {
      details.annual_rate = 'annual_rate must be between 0 and 0.36';
    }
  }
  if (body?.tenure_months === undefined || body?.tenure_months === null) {
    details.tenure_months = 'tenure_months is required';
  }
  return details;
}

export const handlers = [
  http.get(`${base()}/me`, () => {
    if (!store.profile) {
      return err(404, 'NOT_FOUND', 'Profile not found');
    }
    return HttpResponse.json(store.profile);
  }),

  http.put(`${base()}/me/profile`, async ({ request }) => {
    const body = await request.json();
    store.profile = { ...(store.profile || {}), ...body };
    return HttpResponse.json(store.profile);
  }),

  http.get(`${base()}/holdings`, () => HttpResponse.json(store.holdings)),
  http.post(`${base()}/holdings`, async ({ request }) => {
    const body = await request.json();
    const details = validateHolding(body);
    if (Object.keys(details).length > 0) {
      return err(400, 'VALIDATION_ERROR', 'Invalid holding', details);
    }
    const created = { holding_id: nextId('holding'), ...body };
    store.holdings.push(created);
    return HttpResponse.json(created, { status: 201 });
  }),
  http.put(`${base()}/holdings/:id`, async ({ params, request }) => {
    const found = store.holdings.find((h) => h.holding_id === params.id);
    if (!found) return err(404, 'NOT_FOUND', 'Holding not found');
    const body = await request.json();
    Object.assign(found, body);
    return HttpResponse.json(found);
  }),
  http.delete(`${base()}/holdings/:id`, ({ params }) => {
    const idx = store.holdings.findIndex((h) => h.holding_id === params.id);
    if (idx === -1) return err(404, 'NOT_FOUND', 'Holding not found');
    store.holdings.splice(idx, 1);
    return new HttpResponse(null, { status: 204 });
  }),

  http.get(`${base()}/loans`, () => HttpResponse.json(store.loans)),
  http.post(`${base()}/loans`, async ({ request }) => {
    const body = await request.json();
    const details = validateLoan(body);
    if (Object.keys(details).length > 0) {
      return err(400, 'VALIDATION_ERROR', 'Invalid loan', details);
    }
    const created = { loan_id: nextId('loan'), ...body };
    store.loans.push(created);
    return HttpResponse.json(created, { status: 201 });
  }),
  http.put(`${base()}/loans/:id`, async ({ params, request }) => {
    const found = store.loans.find((l) => l.loan_id === params.id);
    if (!found) return err(404, 'NOT_FOUND', 'Loan not found');
    const body = await request.json();
    Object.assign(found, body);
    return HttpResponse.json(found);
  }),
  http.delete(`${base()}/loans/:id`, ({ params }) => {
    const idx = store.loans.findIndex((l) => l.loan_id === params.id);
    if (idx === -1) return err(404, 'NOT_FOUND', 'Loan not found');
    store.loans.splice(idx, 1);
    return new HttpResponse(null, { status: 204 });
  }),

  http.get(`${base()}/goals`, () => HttpResponse.json(store.goals)),
  http.post(`${base()}/goals`, async ({ request }) => {
    const body = await request.json();
    const details = validateGoal(body);
    if (Object.keys(details).length > 0) {
      return err(400, 'VALIDATION_ERROR', 'Invalid goal', details);
    }
    const created = { goal_id: nextId('goal'), ...body };
    store.goals.push(created);
    return HttpResponse.json(created, { status: 201 });
  }),
  http.put(`${base()}/goals/:id`, async ({ params, request }) => {
    const found = store.goals.find((g) => g.goal_id === params.id);
    if (!found) return err(404, 'NOT_FOUND', 'Goal not found');
    const body = await request.json();
    Object.assign(found, body);
    return HttpResponse.json(found);
  }),
  http.delete(`${base()}/goals/:id`, ({ params }) => {
    const idx = store.goals.findIndex((g) => g.goal_id === params.id);
    if (idx === -1) return err(404, 'NOT_FOUND', 'Goal not found');
    store.goals.splice(idx, 1);
    return new HttpResponse(null, { status: 204 });
  }),

  http.post(`${base()}/statements`, () =>
    err(501, 'NOT_IMPLEMENTED', "Statement import isn't available yet"),
  ),
];
