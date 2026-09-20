# API contract — conventions, enums, tables, routes

The machine-readable source of truth is `contracts/openapi.yaml`. This file is the
human-readable explanation of the conventions behind it. If they disagree, fix
`openapi.yaml` and update this file in the same PR — never let them drift.

## Global conventions

- **Money**: integer **paise** in every DB field / backend field ending `_paise`. ₹845.50 =
  `84550`. Converted to rupees (`_inr` fields) only at: (a) the frontend display layer, and
  (b) the agent tool boundary (see [agent-guide.md](agent-guide.md#units)).
- **Rates**: decimal fraction (`0.06` = 6%). Fields ending `_pct` are 0–100.
- **Dates**: `YYYY-MM-DD`. Timestamps: ISO 8601 UTC.
- **Casing**: `snake_case` everywhere in JSON.
- **Identity**: always `event.requestContext.authorizer.jwt.claims.sub`. A `user_id` sent in
  a body or query string is **ignored** — never trust client-supplied identity. One helper
  per runtime:
  - Python: `get_authenticated_user_id(event) -> str`
  - Node: `getAuthenticatedUserId(event): string`
  Both must have a unit test against a real event payload shape. Under `sam local` only, a
  `AWS_SAM_LOCAL=true` env check may fall back to a dev user — must be off in any deployed
  environment, and a test proves it stays off.
- **Auth header**: `Authorization: Bearer <Cognito access token>`.
- **Success response**: plain DTO, no wrapper envelope.
- **Error response**:
  ```json
  {"error": {"code": "VALIDATION_ERROR", "message": "...", "details": {}}}
  ```
  Codes: `VALIDATION_ERROR` (400), `UNAUTHORIZED` (401), `NOT_FOUND` (404),
  `UPSTREAM_UNAVAILABLE` (502), `INSUFFICIENT_DATA` (422), `INTERNAL` (500), `NOT_IMPLEMENTED` (501, route not built yet).
- **Market data responses** always carry `source` and `as_of`.
- **CORS**: allow the Amplify domain + `http://localhost:5173` (Vite dev), via the
  `FrontendOrigins` template parameter.

## Enums

```text
asset_type:       STOCK | ETF | MUTUAL_FUND | FD | CASH | CRYPTO | OTHER
holding_source:    UPSTOX | MANUAL | DEMO | IMPORTED
risk_profile:      CONSERVATIVE | MODERATE | AGGRESSIVE
strategy_goal:     WEALTH_GROWTH | INCOME | CAPITAL_PRESERVATION | FIRE
goal_type:         CAR | WEDDING | HOUSE_DOWN_PAYMENT | EDUCATION | TRAVEL | OTHER
loan_type:         HOME | CAR | PERSONAL | EDUCATION | CREDIT_CARD | OTHER
rate_type:         FLOATING | FIXED
direction:         CREDIT | DEBIT
txn_category:      INCOME | RENT | GROCERIES | FOOD_DELIVERY | DINING | TRANSPORT | SHOPPING |
                    UTILITIES | SUBSCRIPTIONS | EMI | INVESTMENTS | TRANSFER | HEALTH |
                    EDUCATION | ENTERTAINMENT | OTHER
statement_status:  PENDING_UPLOAD | UPLOADED | EXTRACTING | VALIDATING | REVIEW_REQUIRED |
                    COMMITTED | FAILED
chat_job_status:   QUEUED | RUNNING | COMPLETED | FAILED
flag_severity:     info | warning | critical
category_source:   rule | ai | user
fd_type:           CUMULATIVE | PAYOUT
```

## DynamoDB tables (all On-Demand)

Physical table names are `${StackName}-<table>` (e.g. `aicfo-dev-users`). Code never hardcodes
them — read from env vars set in `infra/template.yaml` (`USERS_TABLE`, `HOLDINGS_TABLE`, …).
Composite key attribute names: `transactions` SK = `txn_sk`, `insights` SK = `insight_sk`,
`conversations` PK = `user_conv`, SK = `msg_sk`.

| Table | PK / SK | Writer | Notes |
|---|---|---|---|
| `users` | `user_id` / — | Node | `user_id` = Cognito `sub`. See fields below. |
| `holdings` | `user_id` / `holding_id` | Node | `first_buy_date` optional (capital-gains tool). |
| `goals` | `user_id` / `goal_id` | Node | |
| `loans` | `user_id` / `loan_id` | Node | `prepayment_charge_pct` defaults 0 for FLOATING loans sanctioned ≥ 2026-01-01 (RBI rule). |
| `fire-scenarios` | `user_id` / `scenario_id` | Python | Snapshot of inputs + result. |
| `transactions` | `user_id` / `txn_date#txn_id` | Python | |
| `statement-jobs` | `user_id` / `job_id` | Python | |
| `snapshots` | `user_id` / `snapshot_date` | Python | One row/day, written on first view. |
| `insights` | `user_id` / `created_at#insight_id` | Python | |
| `conversations` | `user_id#conversation_id` / `created_at#msg_id` | Python | `role`, `content`, `tools_used`. |
| `chat-jobs` | `user_id` / `job_id` | Python | `status`, `conversation_id`, `tool_calls`, `error`, `ttl`. |

Every per-user read is a `Query` on the partition key. **Never `Scan`.**

### `users` fields
```text
name, date_of_birth, base_currency="INR",
monthly_income_paise?, monthly_expenses_paise (excl. EMIs), monthly_investment_paise,
declared_net_worth_paise? (fallback when no holdings exist),
cash_balance_paise, emergency_fund_target_months (default 6),
risk_profile, risk_score, risk_answers, investment_horizon_years, strategy_goal,
dependents_count?, existing_term_cover_paise?, existing_health_cover_paise?,
employment_type?, city_tier?,
consent_accepted_at, onboarding_step, onboarded (bool),
created_at, updated_at
```

### `holdings` fields
```text
asset_type, source, instrument_key?, symbol?, isin?, name,
quantity?, avg_buy_price_paise?, first_buy_date?,
manual_current_value_paise?, sector?, sip_monthly_paise?,
fd_type?, fd_principal_paise?, fd_annual_rate?, fd_start_date?, fd_maturity_date?,
created_at, updated_at
```
CASH is **not** a holding — it's `users.cash_balance_paise`.

## Routes

### Node Lambda (CRUD) — `/me`, `/holdings*`, `/goals*`, `/loans*`
```text
GET    /me
PUT    /me/profile
GET    /holdings          POST /holdings
PUT    /holdings/{id}     DELETE /holdings/{id}
GET    /goals             POST /goals
PUT    /goals/{id}        DELETE /goals/{id}
GET    /loans             POST /loans
PUT    /loans/{id}        DELETE /loans/{id}
```

CRUD behavior (implemented in `backend-node/`):
- `GET /me` → 404 until the first `PUT /me/profile`. `PUT /me/profile` is a partial update that
  creates the row if missing. `PUT` on holdings/goals/loans is partial too.
- Lists return a bare JSON array. `POST` → 201 with the created item (server-generated id),
  `DELETE` → 204. Unknown or other users' ids → 404.
- Client-sent `user_id` / `holding_id` / `goal_id` / `loan_id` are ignored; unknown fields → 400.
- Required on `POST`: holdings `asset_type`, `name` (+ `fd_principal_paise` for FD, `quantity`
  for STOCK/ETF/MUTUAL_FUND/CRYPTO; `source` defaults to MANUAL); goals `name`, `goal_type`,
  `amount_today_paise`, `target_age`; loans `name`, `loan_type`, `outstanding_paise`,
  `annual_rate`, `tenure_months`.
- If both `risk_answers` and `risk_score` are sent, `risk_score` must equal their sum.

#### Credit-card loan metadata (`CREDIT_CARD` only)

`loans` rows may additionally carry three **optional** fields, and only when the loan's
**effective type is `CREDIT_CARD`**:

| Field | Type | Bounds |
|---|---|---|
| `issuer` | string | trimmed, non-blank, ≤ 120 chars |
| `credit_limit_paise` | integer paise | 0 ≤ x ≤ ₹10,00,00,000 (`10000000000` paise) |
| `payment_due_day` | integer | 1–31 (day-of-month) |

Rules (all enforced server-side, never trusting the client):

- **Effective type** on `POST` is the request's `loan_type`. On `PUT` (a partial update) it is the
  request's `loan_type` when present, otherwise the **stored** loan's `loan_type`. A partial update
  that sets any card field on a non-card loan is a `VALIDATION_ERROR` — it never silently persists.
- **Switching a card to another loan type clears all three fields**, in the same update, even when
  the client didn't mention them. Stale card metadata must never survive on a non-card loan.
- Sending `null` for a card field **clears** it; omitting it leaves it unchanged (partial-update
  semantics, same as every other loan field).
- **Backward compatible**: existing loans with no card metadata stay valid and are returned
  unchanged — these fields are never back-filled or defaulted.
- Ownership is the ordinary `user_id`-partitioned `Query`/`UpdateItem` path keyed on the verified
  Cognito `sub`. An unknown `loan_id`, or another user's, is a `404` — including on an update that
  only touches card fields.

#### `monthly_emi_paise` (read-only, `GET /loans` list items)

Each item in the `GET /loans` array additionally carries `monthly_emi_paise`: the loan's monthly
EMI in **integer paise**, computed server-side by the single tested implementation of the locked
reducing-balance formula (`backend-node/src/services/emi.js`, per
[finance-rules.md](finance-rules.md#loans--emi)) — the same helper `/dashboard/profile` already uses.

- It is `null` when the stored loan has no usable `principal_paise`/`outstanding_paise`,
  `annual_rate`, or `tenure_months`. Never a guess, never 0-as-unknown.
- It is **read-only**: it is not stored, and sending it on `POST`/`PUT` is rejected as an unknown
  field like any other. This exists so no UI has to re-implement EMI in the browser.

### Node Lambda (dashboard and market compatibility routes) — `/dashboard/*`, `/portfolio/*`
```text
GET  /dashboard/profile
PUT  /dashboard/financials
GET  /portfolio/prices[?tickers=TICKER1,TICKER2]
GET  /portfolio/news[?tickers=TICKER1,TICKER2]
GET  /portfolio/historical[?tickers=TICKER1,TICKER2&range=1Y]
GET  /portfolio/suggestions
```

These routes are on the existing Cognito-authorized `CrudFunction`. Identity always comes from
the verified JWT `sub`; none accepts email or `user_id`, and `/portfolio/suggestions` accepts no
preference or identity query inputs. `tickers` is an optional comma-separated list of 1–20
sanitized Yahoo symbols (`[A-Za-z0-9][A-Za-z0-9._^=-]{0,19}`, plus the four allowlisted index
symbols `^NSEI`, `^BSESN`, `^GSPC`, `^IXIC`) when present. Prices may request
that safe bounded list for the fixed Yahoo host. News is restricted to the authenticated user's
holdings plus deterministic candidates matching saved investment interests. History intersects
requested symbols with authenticated holdings and reserves two of its 20 slots for NIFTY 50 and
S&P 500 benchmark lines. `range` is one of `1W`, `1M`, `3M`, `6M`, `1Y`, or `ALL` and defaults to
`1Y`.

`GET /dashboard/profile` always returns `200`, including default financials when the profile or
financial snapshot is missing. `PUT /dashboard/financials` accepts `{ "financials":
DashboardFinancials }`.

A user who finished the guided onboarding has no saved dashboard snapshot, so the same shape is
derived from canonical data (nothing is invented; a value with no source is left out):
`incomes.total` and `monthlyExpenses["Living expenses"]` from the profile, `liquidAssets.bankBalance`
from `cash_balance_paise` and `liquidAssets.fixedDeposits` from FD principals, `liabilities.<key>`
(`homeLoanEmi`, `carLoanEmi`, `personalLoanEmi`, `educationLoanEmi`, `creditCardDebt`,
`otherLoanEmi`) as each loan's monthly EMI from the locked reducing-balance formula, and
`portfolio` from non-FD holdings. A bare NSE symbol from onboarding (`RELIANCE`) is listed as
`RELIANCE.NS` so Yahoo can price it; mutual funds keep their symbol and are not priced (no Yahoo
NAV), which the UI shows as unavailable.

The dashboard compatibility boundary uses camelCase because it is consumed directly by the
approved UI. Its exact response shape is:
```json
{
  "user": {
    "hasOnboarded": true,
    "financials": {
      "onboardingMethod": "manual_advanced",
      "incomes": {"salary": "85000.00", "other": "0.00"},
      "liquidAssets": {"cash": "120000.50", "bank": "50000.00"},
      "portfolio": [{"type": "STOCK", "ticker": "RELIANCE", "buyPrice": "2500.00", "quantity": "10"}],
      "preferences": {"industries": ["BANKING"], "instruments": ["ETF"]},
      "liabilities": {"loans": "400000.00"},
      "monthlyExpenses": {"total": "50000.00", "housing": "25000.00"}
    }
  }
}
```
`incomes`, `liquidAssets`, `liabilities`, and `monthlyExpenses` are objects whose numeric leaf
values are rupee decimal strings. `portfolio.quantity` and `portfolio.buyPrice` are also UI
strings. Conversion to canonical integer paise (and quantity validation) happens at the
boundary; storage and financial math remain canonical backend types. Optional manual-entry money
leaves may be `""`; the canonical conversion treats blank as absent/zero.

The CSV extraction variant accepted by `PUT /dashboard/financials` is:
```json
{
  "financials": {
    "onboardingMethod": "csv_extraction",
    "extractedData": {
      "fileName": "statement.csv",
      "totalTransactions": 42,
      "currentBalance": "120000.50",
      "monthlyRevenue": "85000.00",
      "monthlyExpenses": "50000.00"
    }
  }
}
```

Market compatibility DTOs are:
```json
{"prices": {"RELIANCE.NS": 2980.25, "AAPL": 18000}, "quotes": {"RELIANCE.NS": {"price": 2980.25, "changePercent": 0.42, "currency": "INR"}, "AAPL": {"price": 18000, "changePercent": 1.5, "currency": "INR", "originalPrice": 200, "originalCurrency": "USD"}}, "source": "Yahoo Finance", "as_of": "2026-09-18T09:31:00Z"}
{"news": [{"id": "n1", "ticker": "RELIANCE", "title": "...", "publisher": "...", "link": "https://example.com", "publishedAt": "2026-09-18T09:31:00Z", "summary": "...", "thumbnail": "https://example.com/image.png"}], "source": "Yahoo Finance, Google News", "as_of": "2026-09-18T09:31:00Z"}
{"range": "1Y", "data": [{"date": "2026-09-18", "RELIANCE": 0}], "availableLines": ["RELIANCE"], "source": "Yahoo Finance", "as_of": "2026-09-18T09:31:00Z"}
{"suggestions": [{"ticker": "NIFTYBEES.NS", "name": "Nifty 50 ETF", "industry": "Broad Market Index", "instrument": "Index ETF", "price": 266.53, "change": "+0.17%", "rationale": "It is on the steadier side, which might suit a moderate risk profile. You don't hold any funds yet, so this might add a different kind of exposure."}], "activePreferences": {"industries": ["Technology & Software"], "instruments": ["Index & Mutual Funds"]}}
```
The historical `data` values are normalized percentage returns. Prices, news, and history are
never fabricated. Yahoo failures may produce partial results; if no usable upstream result is
available, return the existing `UPSTREAM_UNAVAILABLE` error code. Suggestions are deterministic
educational fit ideas, never buy/sell advice.

Price semantics: security quotes are always rupees. A non-INR quote is converted with the live
`<CUR>INR=X` rate (`originalPrice` / `originalCurrency` keep the source value) and is left out when
no rate is available. Index levels (`^…`), futures (`…=F`) and FX pairs (`…=X`) keep Yahoo's native
units. News is Yahoo first; a ticker with no Yahoo items falls back to Google News RSS (real
headlines with their publisher), items older than 45 days and price/quote landing pages are
dropped, and the response `source` names the providers that actually contributed. Suggestion
`industry` and `instrument` are display labels, and `rationale` is hedged fit text built from the
user's risk profile, saved interests and current holdings (it never claims a risk fit when no risk
profile is set).

### Python Lambda — finance
```text
GET  /portfolio/analysis
GET  /securities/search?q=...
GET  /securities/detail?instrument_key=...
GET  /securities/history?instrument_key=...&period=1y|3y|5y
GET  /securities/fit?instrument_key=...&add_amount_paise=...
GET  /securities/short-term-fit?instrument_key=...&horizon_months=...
POST /fire/calculate           POST /fire/goal-impact
GET  /fire/scenarios           POST /fire/scenarios
GET  /net-worth                GET /net-worth/projection
POST /loans/emi                POST /loans/prepayment-impact
POST /calculators/tax          POST /calculators/capital-gains
POST /calculators/insurance    POST /calculators/credit-card-payoff
POST /statements               POST /statements/{job_id}/process
GET  /statements/{job_id}      POST /statements/{job_id}/commit
GET  /cashflow/summary         → months[] + totals, each with a per-category breakdown
POST /fire/scenarios           → 201 after browser-confirmed, authenticated create
PATCH /transactions/{txn_id}/category → 200 after browser-confirmed category update; requires version and a DynamoDB conditional update on the authenticated owner key (stale writes return 409)
```
Instrument keys contain `|` (e.g. `NSE_EQ|INE040A01034`) — always in the **query string**,
never a path parameter.

### Python Lambda — chat/agent (async, see architecture.md)
```text
POST /chat                     → 202 {job_id, conversation_id}
GET  /chat/{job_id}            → job status + final answer once COMPLETED
GET  /conversations
GET  /conversations/{conversation_id}/messages
```

## Key DTO shapes (examples — full schema in `contracts/openapi.yaml`)

**`GET /portfolio/analysis`**
```json
{
  "as_of": "2026-09-18T09:31:00Z", "price_source": "UPSTOX",
  "total_value_paise": 245000000, "total_cost_paise": 210000000,
  "unrealized_pnl_paise": 35000000, "unrealized_pnl_pct": 16.67,
  "holdings": [{"holding_id": "h1", "symbol": "RELIANCE", "asset_type": "STOCK",
    "quantity": 25, "price_paise": 298000, "value_paise": 74500000,
    "weight_pct": 30.41, "pnl_paise": 9000000, "price_as_of": "..."}],
  "allocation_by_asset_type": [{"key": "STOCK", "value_paise": 0, "weight_pct": 0}],
  "allocation_by_sector": [{"key": "ENERGY", "value_paise": 0, "weight_pct": 0}],
  "risk": {"annualized_volatility_pct": 18.2, "volatility_basis": "daily_sqrt252",
           "max_drawdown_pct": -22.4, "cagr_pct": 14.1, "lookback": "3y"},
  "flags": [{"code": "HOLDING_CONCENTRATION", "symbol": "RELIANCE",
             "weight_pct": 30.41, "threshold_pct": 25.0, "severity": "warning"}],
  "warnings": []
}
```

**`POST /fire/calculate`** — see [finance-rules.md](finance-rules.md#fire-contract) for the
full request/response shape and the locked regression fixture.

Request (`FireCalculateRequest`, all fields optional — full schema in
`contracts/openapi.yaml`): `current_age` (overrides age from
`date_of_birth`), `monthly_expenses_paise`, `monthly_investment_paise`,
`current_corpus_paise` (overrides holdings-derived corpus), assumption
overrides `inflation` / `step_up` / `return_before_40` / `return_40_to_60` /
`return_after_60` / `post_fire_return` / `lifespan_age`. Omitted profile
fields fall back to the stored `users` row; omitted assumptions fall back to
defaults (0.06 / 0.06 / 0.12 / 0.10 / 0.08 / null / 91). Response is
`FireResult`. Errors: 400 (`current_age` and `date_of_birth` both missing, or
expenses/investment missing in both profile and body), 404 (no user profile).

**`POST /fire/goal-impact`**
```json
// req  {"candidate_goal": {"goal_type": "CAR", "amount_today_paise": 50000000, "target_age": 35},
//        plus the same optional FireCalculateRequest overrides}
// res  {"baseline_fire_age": 31, "with_goal_fire_age": 33, "delta_years": 2,
//        "baseline_required_corpus_paise": 567067826,
//        "with_goal_required_corpus_paise": 612000000}
```
`delta_years` is never negative for a positive-amount goal.

**`GET /net-worth`** (`NetWorth`)
```json
{
  "as_of": "2026-09-18T09:31:00Z",
  "total_assets_paise": 51000000, "total_liabilities_paise": 0,
  "net_worth_paise": 51000000, "source": "holdings",
  "cash_balance_paise": 1000000, "emergency_fund_coverage_months": 3.0,
  "warnings": []
}
```
`source` is `holdings` once any holdings exist (wins over
`declared_net_worth_paise`), else `declared`. Emergency coverage =
`cash / (monthly expenses + active loan EMIs)`; null when there is no monthly
outflow.

**`GET /net-worth/projection?years=30`** (`NetWorthProjection`)
```json
{
  "as_of": "2026-09-18T09:31:00Z", "fire_age": 31,
  "assumptions": {"inflation": 0.06, "step_up": 0.06, "return_before_40": 0.12,
    "return_40_to_60": 0.10, "return_after_60": 0.08, "post_fire_return": null,
    "lifespan_age": 91},
  "curve": [{"age": 30, "corpus_paise": 10000000}],
  "warnings": []
}
```
Same age-stage assumptions as FIRE (single source in `finance/fire.py`);
pre-`fire_age` years accumulate, later years draw down (expenses + goals +
EMIs out). `years` 1–80, default 30.

**`GET /cashflow/summary`** (`CashflowSummary`)
```json
{
  "months": [{"month": "2026-08", "income_paise": 8500000, "expense_paise": 5000000,
    "net_paise": 3500000,
    "categories": [{"category": "RENT", "income_paise": 0, "expense_paise": 2500000, "net_paise": -2500000}]}],
  "totals": {"income_paise": 8500000, "expense_paise": 5000000, "net_paise": 3500000,
    "categories": [{"category": "RENT", "income_paise": 0, "expense_paise": 2500000, "net_paise": -2500000}]},
  "current_balance_paise": 12000050
}
```
Built **only** from committed `transactions` rows by the pure, tested
`statements/summaries.py::summarize_transactions` — the same function the statement-commit summary
uses, so the two can never disagree. `categories[].category` is the stored `txn_category` value or
`null` for committed rows that carry none; the API never invents a label, and the UI decides how to
show `null`. Buckets sort by `expense_paise` descending, then `category` ascending with `null`
last. A user with no committed transactions gets `months: []`, zero totals, `categories: []` and
`current_balance_paise: null` — not fabricated activity.

**`POST /chat`**
```json
// req  {"job_id": "uuid", "conversation_id": "optional", "message": "Am I too concentrated?"}
// res  202 {"job_id": "uuid", "conversation_id": "uuid"}
```
