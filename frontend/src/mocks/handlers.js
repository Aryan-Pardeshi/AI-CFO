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

const MOCK_SECURITIES = [
  {
    instrument_key: 'NSE_EQ|INE002A01018',
    symbol: 'RELIANCE',
    name: 'Reliance Industries Limited',
    asset_type: 'STOCK',
    exchange: 'NSE',
    isin: 'INE002A01018',
    sector: 'Energy',
    price_paise: 295050,
    day_change_paise: 3550,
    day_change_pct: 1.22,
  },
  {
    instrument_key: 'NSE_EQ|INE040A01034',
    symbol: 'HDFCBANK',
    name: 'HDFC Bank Limited',
    asset_type: 'STOCK',
    exchange: 'NSE',
    isin: 'INE040A01034',
    sector: 'Financial Services',
    price_paise: 165000,
    day_change_paise: -1250,
    day_change_pct: -0.75,
  },
  {
    instrument_key: 'NSE_EQ|INF732E01037',
    symbol: 'NIFTYBEES',
    name: 'Nippon India Nifty 50 BeES ETF',
    asset_type: 'ETF',
    exchange: 'NSE',
    isin: 'INF732E01037',
    sector: 'Broad Market',
    price_paise: 25800,
    day_change_paise: 120,
    day_change_pct: 0.47,
  },
  {
    instrument_key: 'NSE_EQ|INE009A01021',
    symbol: 'INFY',
    name: 'Infosys Limited',
    asset_type: 'STOCK',
    exchange: 'NSE',
    isin: 'INE009A01021',
    sector: 'Information Technology',
    price_paise: 162000,
    day_change_paise: 2100,
    day_change_pct: 1.31,
  },
  {
    instrument_key: 'NSE_EQ|INE467B01029',
    symbol: 'TCS',
    name: 'Tata Consultancy Services Limited',
    asset_type: 'STOCK',
    exchange: 'NSE',
    isin: 'INE467B01029',
    sector: 'Information Technology',
    price_paise: 420000,
    day_change_paise: 1500,
    day_change_pct: 0.36,
  },
  {
    instrument_key: 'NSE_EQ|INF204KB14I2',
    symbol: 'GOLDBEES',
    name: 'Nippon India ETF Gold BeES',
    asset_type: 'ETF',
    exchange: 'NSE',
    isin: 'INF204KB14I2',
    sector: 'Commodities',
    price_paise: 6250,
    day_change_paise: -30,
    day_change_pct: -0.48,
  },
];

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

  http.get(`${base()}/securities/search`, ({ request }) => {
    const url = new URL(request.url);
    const q = (url.searchParams.get('q') || '').toUpperCase();
    const filtered = q
      ? MOCK_SECURITIES.filter((s) => s.symbol.includes(q) || s.name.toUpperCase().includes(q))
      : MOCK_SECURITIES;
    return HttpResponse.json({ query: q, results: filtered });
  }),

  http.get(`${base()}/securities/detail`, ({ request }) => {
    const url = new URL(request.url);
    const instrumentKey = url.searchParams.get('instrument_key') || url.searchParams.get('key') || 'NSE_EQ|INE002A01018';
    const found = MOCK_SECURITIES.find(
      (s) => s.instrument_key === instrumentKey || s.symbol === instrumentKey || s.isin === instrumentKey,
    );
    const security = found || {
      instrument_key: instrumentKey,
      symbol: instrumentKey.includes('HDFC') ? 'HDFCBANK' : instrumentKey.includes('NIFTY') ? 'NIFTYBEES' : 'RELIANCE',
      name: instrumentKey.includes('HDFC')
        ? 'HDFC Bank Limited'
        : instrumentKey.includes('NIFTY')
        ? 'Nippon India Nifty 50 BeES ETF'
        : 'Reliance Industries Limited',
      asset_type: instrumentKey.includes('NIFTY') ? 'ETF' : 'STOCK',
      exchange: 'NSE',
      isin: instrumentKey.includes('HDFC') ? 'INE040A01034' : instrumentKey.includes('NIFTY') ? 'INF732E01037' : 'INE002A01018',
      sector: instrumentKey.includes('HDFC') ? 'Financial Services' : instrumentKey.includes('NIFTY') ? 'Broad Market' : 'Energy',
    };

    const isReliance = security.symbol === 'RELIANCE';
    const isHdfc = security.symbol === 'HDFCBANK';
    const pricePaise = security.price_paise || (isHdfc ? 165000 : 295050);
    const changePaise = security.day_change_paise != null ? security.day_change_paise : (isHdfc ? -1250 : 3550);
    const changePct = security.day_change_pct != null ? security.day_change_pct : (isHdfc ? -0.75 : 1.22);

    return HttpResponse.json({
      security: {
        instrument_key: security.instrument_key,
        symbol: security.symbol,
        name: security.name,
        asset_type: security.asset_type,
        exchange: security.exchange,
        isin: security.isin,
        sector: security.sector,
      },
      quote: {
        last_price_paise: pricePaise,
        change_paise: changePaise,
        change_pct: changePct,
        day_change_paise: changePaise,
        day_change_pct: changePct,
        open_paise: pricePaise - changePaise,
        high_paise: pricePaise + 1500,
        low_paise: pricePaise - 2000,
        prev_close_paise: pricePaise - changePaise,
        volume: isReliance ? 5432100 : isHdfc ? 8923400 : 1200000,
        as_of: new Date().toISOString(),
      },
      holding: isReliance
        ? {
            holding_id: 'h-rel-01',
            symbol: 'RELIANCE',
            quantity: 15,
            avg_buy_price_paise: 250000,
            invested_value_paise: 3750000,
            current_value_paise: 4425750,
            unrealized_pnl_paise: 675750,
            unrealized_pnl_pct: 18.02,
          }
        : null,
      performance: {
        day_low_paise: pricePaise - 2000,
        day_high_paise: pricePaise + 1500,
        week_52_low_paise: null,
        week_52_high_paise: null,
        open_paise: pricePaise - changePaise,
        prev_close_paise: pricePaise - changePaise,
        volume: isReliance ? 5432100 : isHdfc ? 8923400 : 1200000,
      },
      fundamentals: {
        pe_ratio: isHdfc ? 19.8 : isReliance ? 28.5 : 22.0,
        pb_ratio: isHdfc ? 2.8 : isReliance ? 2.3 : 3.1,
        dividend_yield_pct: isHdfc ? 1.18 : isReliance ? 0.35 : 0.8,
        market_cap_paise: isHdfc ? 125000000000000 : isReliance ? 199500000000000 : 50000000000000,
        aum_paise: null,
        expense_ratio_pct: null,
        nav_paise: null,
        tracking_error_pct: null,
      },
      insights: [
        {
          title: 'Day Performance',
          description: `${security.symbol} is trading ${Math.abs(changePct)}% ${changePct >= 0 ? 'above' : 'below'} yesterday’s close.`,
        },
        {
          title: 'Trading Activity',
          description: `Recorded trading volume of ${(isReliance ? 5432100 : isHdfc ? 8923400 : 1200000).toLocaleString('en-IN')} shares.`,
        },
      ],
      source: 'LOCAL_QA',
      as_of: new Date().toISOString(),
    });
  }),

  http.get(`${base()}/securities/history`, ({ request }) => {
    const url = new URL(request.url);
    const instrumentKey = url.searchParams.get('instrument_key') || url.searchParams.get('key') || 'NSE_EQ|INE002A01018';
    const period = (url.searchParams.get('period') || '1m').toLowerCase();
    const found = MOCK_SECURITIES.find(
      (s) => s.instrument_key === instrumentKey || s.symbol === instrumentKey || s.isin === instrumentKey,
    );
    const basePrice = found ? found.price_paise : 280000;
    const now = Date.now();
    const days = period === '1d' ? 1 : period === '3d' ? 3 : period === '1w' ? 7 : period === '1m' ? 30 : period === '1y' ? 365 : 180;
    const candles = [];
    let price = basePrice;
    for (let i = days; i >= 0; i--) {
      const d = new Date(now - i * 86400000);
      const dateStr = d.toISOString().split('T')[0];
      price += Math.round((Math.sin(i * 0.5) + 0.3) * 500);
      candles.push({
        date: dateStr,
        timestamp: dateStr,
        open_paise: price - 300,
        high_paise: price + 800,
        low_paise: price - 600,
        close_paise: price,
        volume: 1200000 + (i % 5) * 100000,
      });
    }
    return HttpResponse.json({
      instrument_key: instrumentKey,
      period,
      candles,
      source: 'LOCAL_QA',
    });
  }),

  http.get(`${base()}/securities/fit`, ({ request }) => {
    const url = new URL(request.url);
    const instrumentKey = url.searchParams.get('instrument_key') || url.searchParams.get('key') || 'NSE_EQ|INE002A01018';
    const amt = parseInt(url.searchParams.get('add_amount_paise') || '2500000', 10);
    const isHdfc = instrumentKey.includes('HDFC') || instrumentKey.includes('INE040A01034');
    return HttpResponse.json({
      assessment: 'POTENTIAL_FIT',
      summary: isHdfc
        ? 'Aligns with your portfolio diversification in Financial Services.'
        : 'Aligns with your aggressive equity profile and investment horizon.',
      inputs: {
        add_amount_paise: amt,
        portfolio_value_before_paise: 100000000,
        portfolio_value_after_paise: 100000000 + amt,
      },
      allocation: {
        current_weight_bps: isHdfc ? 0 : 450,
        projected_weight_bps: Math.round(((isHdfc ? amt : 4500000 + amt) / (100000000 + amt)) * 10000),
      },
      factors: [
        { key: 'risk_profile', status: 'ALIGNS', title: 'Risk Alignment', detail: 'Matches moderate/aggressive equity allocation' },
        { key: 'horizon', status: 'ALIGNS', title: 'Horizon Check', detail: 'Goal horizon of 7 years is appropriate for equity' },
        { key: 'sector', status: 'INFO', title: 'Sector Exposure', detail: isHdfc ? 'Financial Services exposure reaches 15.2%' : 'Energy exposure reaches 12.4%' },
        { key: 'concentration', status: 'ALIGNS', title: 'Single-Stock Concentration', detail: 'Projected weight is within 25.0% ceiling' },
      ],
    });
  }),
];
