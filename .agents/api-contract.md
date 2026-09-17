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
  `UPSTREAM_UNAVAILABLE` (502), `INSUFFICIENT_DATA` (422), `INTERNAL` (500).
- **Market data responses** always carry `source` and `as_of`.
- **CORS**: allow the Amplify domain + `http://localhost:3000`.

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

## DynamoDB tables (prefix `aicfo-`, all On-Demand)

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
GET  /cashflow/summary
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

**`POST /chat`**
```json
// req  {"job_id": "uuid", "conversation_id": "optional", "message": "Am I too concentrated?"}
// res  202 {"job_id": "uuid", "conversation_id": "uuid"}
```
