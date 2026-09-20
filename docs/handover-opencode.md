# AI-CFO current handover

Updated **20 September 2026** after the current `main` release was verified locally, in AWS, and on the public
Amplify site. This file is the current status source for any coding agent. Older notes from the 19 September
handover have been removed rather than left as conflicting instructions.

## 0. Release snapshot

- Repository: `C:\Users\admin\Desktop\Aryan\PROJECTS\Personal_AI_CFO`
- GitHub: `Aryan-Pardeshi/AI-CFO`
- Release commit: `2ce4fa1dbf787f5afab21fb13ef4e4bd41e701a4` (`merge: integrate ARIA v2 and security explorer`)
- Branch: `main`; `origin/main` points to the same release.
- AWS account: `096194660743`; region: `ap-south-1`; CLI profile: `default`.
- Backend stack: `aicfo-dev`, status `UPDATE_COMPLETE`.
- Backend API: `https://jf74379uak.execute-api.ap-south-1.amazonaws.com`
- Cognito pool: `ap-south-1_5oinzZre7`; app client: `7003dh9lo6s5sigp5f6hkh6bj2`.
- Amplify app: `aicfo-demo-frontend`; app id `d19guqu2l1q2px`.
- Public frontend: `https://main.d19guqu2l1q2px.amplifyapp.com`
- Local frontend: `http://localhost:5174`

The backend deploy completed with no resource replacement. The final changesets modified only Lambda/API/CORS/
Cognito-client configuration and the S3 CORS configuration; Cognito pool, DynamoDB tables, the data bucket, and
AppSync identity were preserved.

The frontend is an Amplify Hosting manual artifact deployment. The deployed Amplify app has:

- Vite production output from `frontend/dist`.
- Hosted `VITE_*` configuration pointing to the deployed API and Cognito.
- SPA rewrite that sends client routes to `/index.html` while preserving `.js`, `.css`, images, fonts, and maps.
- CORS and Cognito callback allowlists containing the Amplify URL and both local ports.

The Amplify app is **not connected to GitHub auto-build** because no GitHub OAuth token is configured. This does not
affect the current public deployment; future releases must be uploaded manually or connected through Amplify once a
GitHub OAuth connection is available.

## 1. Checklist: completed

### Product and onboarding

- Landing page, registration, confirmation, Cognito login, and protected routes.
- Try the Demo login path using the gitignored `frontend/.env.local` values. Never copy demo credentials into code,
  docs, commits, or chat.
- Eight-step onboarding with risk/strategy survey, including investment horizon, loss reaction, income stability,
  investing experience, and risk profile.
- Bank statement CSV upload → parse → validate → editable review → explicit commit.
- Bank CSV autofill uses the newest calendar month, excludes EMI/TRANSFER rows from investment totals, maps
  INVESTMENTS to monthly investment, and takes the latest balance by date and source-row order.
- Broker holdings CSV upload is local and deterministic. It requires symbol, quantity, and average price; rows are
  editable and no holding is created until the user presses Continue. Imported holdings are marked `IMPORTED`.
- Broker funds ledgers/tradebooks are rejected because they cannot reliably reconstruct current positions.
- Supported sample: `docs/examples/sample-broker-holdings-september-2026.csv`.
- PDF, image, and XLSX statement extraction is intentionally outside the submission scope.

### Dashboard and finance

- Overview dashboard with canonical profile, income, expense, cash, loan, holding, and transaction data.
- FIRE page at `/fire`, dashboard FIRE card/button, baseline forecast, current runway, goal-impact scenario, and
  scenario creation with explicit validation.
- Net-worth view and projection.
- Investments/Balance Sheet view with holdings, allocation, P&L, history, and concentration warning.
- Security explorer and security detail pages for search, overview, history/risk, news, and portfolio-fit context.
- News page with market tiles, provider/source metadata, dated headlines, and hedged personalized ideas.
- Goals, loans, milestones, monthly tracker, and transaction-category review flows.
- Demo user seeded with profile, seven holdings, two goals, four loans, and 58 transactions over six months.

### ARIA

- Page and product language is **ARIA**, not “ARIA Advisory”.
- Async `POST /chat` job creation with polling through `GET /chat/{job_id}`.
- Durable conversation history in DynamoDB; each new Lambda invocation receives the recent saved turns plus the
  current user message.
- Fresh-topic routing: cashflow uses cashflow tools, FIRE uses FIRE tools, portfolio uses portfolio tools, and
  net-worth uses net-worth tools instead of blindly reusing an old answer.
- Safe Markdown rendering for bold values, headings, lists, tables, and citations. Raw HTML remains disabled.
- User-visible ARIA activity trace with tool name/status/source/time and citations; hidden chain-of-thought is never
  exposed.
- Proposed edit cards with field-level review and Confirm/Cancel. The model can prepare a validated proposal but
  never writes directly and never receives a trusted user id.
- Conversation retention verified with the demo cashflow answer (₹3,43,539 surplus) and a follow-up FIRE question.
- Kilo model chain is active in this order:
  1. `deepseek/deepseek-v4-flash-0731:free`
  2. `nvidia/nemotron-3-super-120b-a12b:free`
  3. `kilo-auto/free`
- Fallback is restricted to upstream provider failures. Data/tool failures are shown as limitations and never turned
  into invented financial values.
- Firecrawl adapter and hostile-content safety tests exist. Firecrawl is exposed to the agent only when its secret is
  available, with bounded searches/reads, URL validation, dated citations, and prompt-injection quarantine.

## 2. Checklist: not complete or intentionally deferred

- Direct calculator HTTP routes/UI: tax, capital gains, insurance, credit-card payoff, EMI, prepayment impact, and
  short-term fit are represented in the contract and agent tool layer, but the direct Python HTTP routes are not in
  the live route set for this release.
- Mutual-fund NAV adapter and agent tools exist through `mfapi.in`; the dashboard still cannot show a live MF NAV in
  every holdings view, so unavailable values must remain unavailable rather than fabricated.
- A full live Firecrawl call and final hostile-page smoke run were not part of the public deployment check; unit and
  contract safety coverage exists.
- AppSync Events publishing is configured; browser subscribe/streaming is not the required path. Polling is the
  working ARIA UI fallback.
- PDF/image/XLSX statement extraction is deferred.
- AI-generated news digest on top of deterministic personalized ideas is deferred.
- GitHub-connected Amplify auto-build is optional follow-up work.
- Known rough edges: Yahoo requests are uncached; ETF news can be generic; existing Aviral-owned frontend lint
  warnings are non-blocking. Do not broaden scope during submission work.

## 3. Architecture and safety rules

```text
Browser
  ↓
AWS Amplify Hosting (React + Vite SPA)
  ↓ Cognito JWT
API Gateway HTTP API
  ├─ Node CrudFunction → DynamoDB CRUD/profile/dashboard/market feed
  └─ Python FinanceFunction → deterministic finance, FIRE, statements, security routes, chat dispatch
       ↓ async invoke
     Python AgentFunction → DynamoDB chat jobs/conversations → Kilo gateway / Firecrawl / external adapters
```

- DynamoDB money fields are integer paise. Convert to rupees only at API/UI boundaries.
- Rates are decimal fractions (`0.07`, not `7`).
- User identity comes only from the verified Cognito JWT `sub`; never trust a client `user_id`.
- Pure financial math lives in tested Python finance modules. The model explains tool results; it does not calculate
  financial numbers from prose.
- Market values must include source/as-of information or remain unavailable.
- Advice is educational and hedged. No guaranteed returns, no autonomous trading, no unconditional buy/sell advice,
  and no claim of SEBI registration.
- No secrets in Git, frontend source, `.env` files, logs, prompts, or chat. Secrets Manager holds `aicfo/kilo`,
  `aicfo/upstox`, `aicfo/firecrawl`, and related provider secrets.
- Never silently delete, overwrite, or save a proposed ARIA action. Confirmed writes go through authenticated CRUD
  routes with server-side ownership and stale-record validation.

## 4. Deployed AWS facts

- Stack: `aicfo-dev` in `ap-south-1`.
- API Gateway HTTP API: `https://jf74379uak.execute-api.ap-south-1.amazonaws.com`.
- Cognito hosted domain: `aicfo-dev-096194660743.auth.ap-south-1.amazoncognito.com`.
- Data bucket: `aicfo-dev-data-096194660743` (private; used for statement uploads/presigned URLs).
- AppSync Events API id: `5ysz74ejczhfvd5jgnvn3mb3mu`.
- AppSync HTTP host: `fkhfh7dywfff7kwqslflz5ygzq.appsync-api.ap-south-1.amazonaws.com`.
- AppSync realtime host: `fkhfh7dywfff7kwqslflz5ygzq.appsync-realtime-api.ap-south-1.amazonaws.com`.
- Lambda functions: `CrudFunction` (Node 22), `FinanceFunction` (Python 3.13), `AgentFunction` (Python 3.13).
- Bedrock is not the live provider because this AWS account/plan blocks the required inference path. Kilo Gateway is
  the configured provider; do not change provider routing without a verified replacement and tests.

## 5. Live API surface

### Node CrudFunction

Authenticated routes include:

- `GET /me`, `PUT /me/profile`
- `GET|POST /holdings`, `PUT|DELETE /holdings/{holding_id}`
- `GET|POST /goals`, `PUT|DELETE /goals/{goal_id}`
- `GET|POST /loans`, `PUT|DELETE /loans/{loan_id}`
- `GET /dashboard/profile`, `PUT /dashboard/financials`
- `GET /portfolio/prices`, `/portfolio/news`, `/portfolio/historical`, `/portfolio/suggestions`

The MVC split is deliberate: router → controller → service → model/validator/provider. Preserve it.

### Python FinanceFunction

Currently live:

- `GET /portfolio/analysis`
- `GET /securities/search`, `/securities/detail`, `/securities/history`, `/securities/fit`
- `POST /fire/calculate`, `POST /fire/goal-impact`, `POST /fire/scenarios`
- `GET /net-worth`, `GET /net-worth/projection`
- `POST /chat`
- `POST /statements`, `POST /statements/{id}/process`, `GET /statements/{id}`,
  `POST /statements/{id}/commit`
- `GET /cashflow/summary`
- `PATCH /transactions/{id}/category`

The template also contains routes for calculators, EMI, prepayment, and short-term fit, but those return the standard
not-implemented response until they are added to the live route set and verified.

### Python AgentFunction

- `GET /chat/{job_id}` — user-scoped job status, answer, activity, citations, and proposed actions.
- `GET /conversations` — user-scoped conversation list.
- `GET /conversations/{conversation_id}/messages` — user-scoped persisted messages.
- Async Lambda invocation runs the ARIA job; it is not an HTTP route and must never trust a client identity.

## 6. Repository map

```text
AGENTS.md / CLAUDE.md / GEMINI.md       repo rules and reading order
.agents/                                locked product, finance, API, architecture, and agent rules
contracts/openapi.yaml                  API contract source of truth
infra/template.yaml + infra/samconfig.toml  SAM stack aicfo-dev/ap-south-1
backend-node/                           authenticated CRUD and market-feed Lambda
backend-python/finance/                 deterministic portfolio/FIRE/net-worth math
backend-python/statements/              CSV parser, validator, categorizer, review/commit flow
backend-python/agent/                   Kilo runner, tool registry, safety, persistence, proposals
backend-python/integrations/            Upstox, mfapi.in, Firecrawl adapters
frontend/src/App.jsx                    landing/auth/onboarding/dashboard routes
frontend/src/pages/onboarding/          onboarding and CSV review flow
frontend/src/pages/dashboard/            overview/FIRE/ARIA/news/investments/security pages
frontend/src/lib/                       authenticated APIs, chat, FIRE, dashboard and action helpers
seed/                                   demo portfolio, fundamentals, statement fixtures
docs/                                   submission and handover material
```

Frontend routes:

`/`, `/register`, `/confirm`, `/login`, `/onboarding`, `/onboarding/method`, `/onboarding/manual`,
`/onboarding/csv`, `/overview`, `/fire`, `/ai-advisory`, `/monthly-tracker`, `/milestones`, `/balance-sheet`,
`/news`, `/investments`, `/securities/:instrumentKey`, and `/dashboard` (redirects to `/overview`).

## 7. Verification record

Verified against the release source:

| Area | Command/check | Result |
|---|---|---|
| Node backend | `cd backend-node && npm test` | 269 passed, 0 failed |
| Python backend | `cd backend-python && py -3.13 -m pytest -q` | 338 passed |
| Frontend | `cd frontend && npm test` | 277 passed |
| Frontend build | `cd frontend && npm run build` | passed |
| SAM template | `cd infra && sam validate --lint` | valid |
| SAM build | `cd infra && sam build --cached` | passed |
| Backend deployment | CloudFormation `aicfo-dev` | `UPDATE_COMPLETE` |
| Amplify deployment | app `d19guqu2l1q2px`, manual job 3 | `SUCCEED` |
| Public root | Amplify URL | HTTP 200 |
| Public SPA routes | `/login`, `/overview`, `/fire`, `/ai-advisory` | HTTP 200 after rewrite fix |
| API CORS | Amplify origin preflight | HTTP 204 with matching allow-origin |

Before claiming any future change is complete:

1. Read the diff and tests, not only an agent summary.
2. Run the relevant unit suite and the full release gates when shared/backend/infra files change.
3. Exercise real deployed data for API work and look at the rendered browser result for UI work.
4. Check paise/rate units, Cognito-sub ownership, citations/as-of values, hedged wording, and secret leaks.
5. For `infra/template.yaml` changes, create a non-executed changeset and stop if any protected resource has
   `Replacement=True` or `RequiresRecreation`.

## 8. Deployment runbook

### Backend: only `aicfo-dev`

From `infra/`:

```bash
sam validate --lint
sam build --cached
sam deploy --no-execute-changeset --no-confirm-changeset
aws cloudformation describe-change-set --change-set-name <arn> --stack-name aicfo-dev --region ap-south-1
aws cloudformation execute-change-set --change-set-name <arn> --stack-name aicfo-dev --region ap-south-1
aws cloudformation wait stack-update-complete --stack-name aicfo-dev --region ap-south-1
```

Inspect the changeset before executing. Do not replace Cognito, DynamoDB, S3, API Gateway, or AppSync resources.
Keep `FrontendOrigins` and `FrontendCallbackUrls` in the deployment parameters when changing frontend hosting.

### Frontend: current manual Amplify path

Build with the hosted API/Cognito variables, zip the contents of `frontend/dist` at the archive root, then use
Amplify `create-deployment` → presigned `zipUploadUrl` PUT → `start-deployment` → `get-job`. Do not commit the zip.
Keep the custom SPA rewrite in Amplify and verify that both client routes and static `/assets/*.js`/`.css` files return
their correct content type. The public app is not a GitHub-connected Amplify build yet.

## 9. Prioritized remaining work

For the submission, prioritize the video/demo and reliability over new features:

1. Record the working Amplify flow: landing/login/demo → overview → FIRE → security detail/fit → ARIA with a
   retained follow-up → CSV review if time permits.
2. Keep the direct calculator routes, PDF/image/XLSX extraction, and AI news digest out of the critical path.
3. If additional time remains, wire MF NAVs into dashboard holdings, run a live Firecrawl citation smoke test, and
   verify an authenticated AppSync subscribe path.
4. Only after submission, connect Amplify to GitHub, add calculator pages/routes, cache Yahoo requests, and address
   non-blocking frontend lint warnings.

Do not delete old branches/worktrees/stashes during the submission window. Do not force-push or rewrite published
history. Push only a verified change when Aryan explicitly says “push it”.

## 10. Quick answers

- **Where is the website?** `https://main.d19guqu2l1q2px.amplifyapp.com`
- **Where is local development?** `http://localhost:5174`
- **Why can a direct route load?** Amplify has a regex SPA rewrite that excludes static assets.
- **Why does ARIA use Kilo?** Bedrock inference is blocked for this account/plan; Kilo is the tested live route.
- **Why might a mutual fund be unavailable?** A live NAV/source is required; the app must not invent one.
- **Where is demo login?** Use **Try the Demo** on `/login`; credentials stay only in gitignored local configuration.
- **Does ARIA trade or silently save?** No. It reads/analyses and prepares reviewable proposals; confirmed writes use
  authenticated server routes.
