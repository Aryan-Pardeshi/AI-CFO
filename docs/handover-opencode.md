# AI-CFO handover for opencode

Written 2026-09-19 (Saturday of the hackathon) by Claude Code at the end of its session, so Aryan can keep
building with opencode while his Claude weekly limit recovers. Everything Claude knows that is not obvious
from the code is in here. Read it top to bottom once, then use the section headings as a reference.

Reader: you are opencode (or any coding agent) working directly with Aryan. Aryan reviews what you do.
There is no second Claude reviewing your output any more, so section 12 (verification) is now your job.

---

## 1. TL;DR

- Repo: `C:\Users\admin\Desktop\Aryan\PROJECTS\Personal_AI_CFO` (Windows 11, Git Bash and PowerShell both available).
  GitHub: `Aryan-Pardeshi/AI-CFO`. Branch `main`, at commit `014b57c`, **pushed** (origin/main == main).
- 2026-09-19 we merged Aviral's v2 dashboard, News, Balance Sheet (holdings) and Milestones pages into main and
  built a real, authenticated AWS backend for them. Node 269/269, Python 91 (+34 unreviewed draft tests),
  frontend 80/80, `sam validate --lint` clean. Backend is deployed to the `aicfo-dev` stack.
- Our guided 8-step onboarding is the entry flow and keeps its two "Auto-fill from statement" buttons (steps 3
  and 4). Those buttons are still honest stubs; the backend they need is live. Wiring them is the top next job.
- Not built yet: the AI chat agent, Upstox adapter (assigned to Ram+Sivsri), the four calculators' HTTP routes,
  onboarding interest chips, frontend hosting, mutual-fund pricing.
- Hackathon runs Thu 17 to Sun 20 Sept 2026. Submission deadline was unpublished when the docs were written.
  Rule from `.agents/hackathon.md`: submit at least 3 hours before the deadline, aim for a rough submission
  Saturday night. Check `docs/submission.md` and `.agents/hackathon.md` before doing anything submission related.

---

## 2. People and ownership

| Person | Role | Notes |
| --- | --- | --- |
| Aryan Pardeshi | Owner, deploys everything | Python, DynamoDB, portfolio maths, FIRE, agent layer. Only he deploys (`sam deploy`), because teammates have PowerUser and cannot create IAM roles. |
| Aviral (`mishraaviral7002 <aviralmishra7002@gmail.com>`) | Frontend | Owns `frontend/` and `feat/dashboard-ui`. Does not use Claude Code. He wrote the v2 dashboard pages. He was genuinely hurt once when his multi-file structure was collapsed into one big file (see section 3). |
| Sivsri | Statements/onboarding, and now Upstox with Ram | Owns `feat/statements-onboarding` on paper, but Aryan and Claude built the statements Level 1 in `backend-python/statements/`. |
| Ram | Calculators/seed, and now Upstox with Sivsri | Capability uncertain. Both he and Sivsri are fully occupied with Upstox live graphs, so calculators and statements fell to Aryan. |

Teammates are mostly unavailable this weekend. Assume Aryan plus his AI tools carry the build.

Aryan's communication style: short, casual, fast. He says "push it" when he wants a push and "pls ..." for tasks.
He does not want long explanations; give a plain summary of what changed and what you verified.

---

## 3. Standing rules (do not break these)

These came from `AGENTS.md`, `CLAUDE.md`, `.claude/CLAUDE.md` and from Aryan directly. Some are repeated in
those files; the ones marked (Aryan) are things he told Claude in chat and are not written anywhere else.

Product and code rules
1. **Money is integer paise** in DynamoDB and canonical API fields. Rates are decimal fractions (0.07, not 7).
   Field names are `snake_case`. DynamoDB returns `Decimal`; convert at the boundary (`plain_numbers` in Python,
   the Node models do the equivalent).
2. **Identity comes only from the verified Cognito `sub`** (JWT claim in the API Gateway authorizer context).
   Never read a user id from the body, query string, path or email.
3. **Numbers first, AI second.** No model improvises financial maths. Pure tested Python in `backend-python/finance/`.
   Finance code is test-first (TDD): read `.agents/finance-rules.md` for every locked formula and the FIRE
   regression fixture (age 17, fire_age 31, corpus 567,067,826 paise, conservative age 35, wdr 4.78%).
4. **Never commit secrets** (no `.env`, no keys, no AWS creds). Secrets Manager only. `frontend/.env.local` is
   gitignored and must stay that way.
5. **Contract first**: `contracts/openapi.yaml` is the machine source of truth, `.agents/api-contract.md` is the
   prose version. Shared files (`openapi.yaml`, `infra/template.yaml`, `AGENTS.md`) change in small, separate
   commits. If you change a route or response shape, update both contract files in the same change.
6. **Do not silently redesign a locked decision** in `.agents/`. If one has to change, say why and ask Aryan.
7. Recommendations and news personalisation must be **hedged and educational**, never buy/sell advice, never
   promise returns. This is also the safe wording rule in `.agents/agent-guide.md`.

Team and git rules
8. **Preserve teammates' file structure.** When you rework code Aviral (or anyone) wrote, keep their folder
   layout, file-per-concern split and naming. Never merge a multi-file layout into one big file. Change what
   the code does, not how it is organised. Look at their original commit (`git show <hash>`), not just the tip.
9. **Frontend is Aviral's.** Do not scaffold, redesign or restyle his pages. Allowed exceptions Aryan granted:
   our 8-step onboarding (`frontend/src/pages/Onboarding.jsx` and `frontend/src/pages/onboarding/`) is ours, and
   the auth/data plumbing on his dashboard pages. For anything else in `frontend/`, ask Aryan first.
10. **Credit Aviral** when a change builds on or restores his code: use a `Co-authored-by: mishraaviral7002
    <aviralmishra7002@gmail.com>` trailer. That is a human credit and is fine.
11. **No AI attribution lines** in commit messages or PR descriptions (no "Generated with...", no "Co-Authored-By: Claude/AI").
12. **Git history must sit inside the event window (17 to 20 Sept 2026).** Do not backdate, and do not import
    pre-event history. (`.agents/hackathon.md` explains why; breaking it can disqualify the team.)
13. **Push only work that is verified and only when Aryan says so** ("push it"). (Aryan) His standing bar when
    he is away: push only what you are 100 percent sure is perfect and that you exercised for real. Never
    force-push, never rewrite pushed history, never touch teammates' branches (`aviral-onboarding-process`,
    `origin/aviral-onboarding-v2`).
14. **Deploy only to `aicfo-dev`, never create a new stack**, and always inspect the changeset for
    `Replacement` / `RequiresRecreation` before executing it (runbook in section 9).
15. **Never type real credentials or secrets anywhere** (login forms, `.env`, chat). The "Try the Demo" button
    on `/login` signs the demo user in using values from `frontend/.env.local`; use the button, do not copy
    the values out.

---

## 4. Environment and tooling

- OS Windows 11. Shell: Git Bash (POSIX) or PowerShell 7. Paths with spaces need quotes.
- Node v24.19.0 locally (Lambda runtime is `nodejs22.x`, engines `>=22`). Python: default `python` is 3.14.7 but
  the Lambda runtime is `python3.13`, so use **`py -3.13 -m pytest`**. SAM CLI 1.166.2. opencode 1.18.31.
- AWS CLI profile `default`, region `ap-south-1`, account `096194660743`. (There is no profile called `aicfo`.)
- Dev frontend server: `main-frontend` in `.claude/launch.json` runs Vite on port **5174** with `--strictPort`.
  Manual form: `npm --prefix frontend run dev -- --port 5174 --strictPort`. Only `http://localhost:5173` and
  `http://localhost:5174` are allowed origins/OAuth callbacks (stack parameters `FrontendOrigins` and
  `FrontendCallbackUrls`). Any other port or host breaks CORS and Google/Hosted UI login until the stack
  parameters are changed and redeployed.
- Git Bash traps that cost time today:
  - Apostrophes inside heredocs (`<<'EOF'` is fine, but an apostrophe in a `bash -c` string breaks it). For anything
    non-trivial write a script to a file and run it.
  - `git -c user.name=$NAME` word-splits an unquoted variable; quote it.
  - A recursive `grep -rn` that includes `node_modules` will hang; scope it to `src/` or `tests/`.
- Text encoding: write files with `newline="\n"` from Python scripts to avoid CRLF noise in diffs.

---

## 5. Deployed AWS facts (`aicfo-dev`, ap-south-1)

Also in `.claude/CLAUDE.md` (checked in).

- API base: `https://jf74379uak.execute-api.ap-south-1.amazonaws.com` (HTTP API, Cognito JWT authorizer).
- Cognito user pool `ap-south-1_5oinzZre7`, app client `7003dh9lo6s5sigp5f6hkh6bj2`.
  Hosted UI domain `aicfo-dev-096194660743.auth.ap-south-1.amazoncognito.com`. Google sign-in works.
- Data bucket `aicfo-dev-data-096194660743` (S3, CORS allows PUT/HEAD from the frontend origins, used for statement
  uploads via presigned PUT).
- AppSync Events: API `5ysz74ejczhfvd5jgnvn3mb3mu`, realtime host
  `fkhfh7dywfff7kwqslflz5ygzq.appsync-realtime-api.ap-south-1.amazonaws.com`. IAM publish verified. A real
  Cognito-signed-in **subscribe** test has never been done, only evaluate-code isolation checks.
- DynamoDB tables (all in the template): Users, Holdings, Goals, Loans, FireScenarios, Transactions,
  StatementJobs, Snapshots, Insights, Conversations, ChatJobs.
- Secrets Manager: `aicfo/upstox`, `aicfo/firecrawl`, `aicfo/kilo`, `aicfo/google`. Aryan pastes real values in the
  console. `aicfo/upstox` and possibly others may still hold `REPLACE_ME`. Do not go looking for the values.
- Bedrock is blocked (the account is on the AWS Free plan, which blocks Bedrock inference). Aryan chose to skip the
  upgrade. **The chat model is Kilo AI Gateway** (OpenAI-compatible), model
  `nvidia/nemotron-3-ultra-550b-a55b:free` pinned via `KILO_MODEL_ID`, base URL `KILO_BASE_URL`. See
  `.agents/agent-guide.md#kilo-ai-gateway`. The Bedrock IAM policy is still in the template for an easy swap back.
- Three Lambdas:
  - `CrudFunction`: Node 22, `index.handler`, timeout 20s (raised from 10s for Yahoo fan-out).
  - `FinanceFunction`: Python 3.13, `handlers.finance.handler`, timeout 15s.
  - `AgentFunction`: Python 3.13, `handlers.agent.handler`, timeout 300s. Every route still returns 501.
- Budget alerts `aicfo-monthly-cost` at $10/$25/$50 to aryan.pardeshi@somaiya.edu. AWS credit balance about $140 on the free plan.

---

## 6. Repository map

```
AGENTS.md / CLAUDE.md / GEMINI.md   entry points; read AGENTS.md's reading order first
.agents/                            locked decisions: hackathon, project, architecture, api-contract,
                                    finance-rules, agent-guide, modules (per-module briefs)
contracts/openapi.yaml              API source of truth
infra/template.yaml, samconfig.toml SAM stack (stack_name aicfo-dev, ap-south-1)
backend-node/                       CrudFunction, MVC layout (Aviral's structure, keep it)
  src/router.js                       regex route table -> controllers
  src/routes/                         profile, holding, goal, loan, dashboard, portfolio route tables
  src/controllers/  models/  services/  validators/  providers/  utils/
  tests/                              node:test + aws-sdk-client-mock; fixtures in tests/fixtures
backend-python/                     FinanceFunction + AgentFunction
  finance/                            pure maths: portfolio, returns, risk, fire, networth (verified)
                                      tax, insurance, creditcard, shortterm (UNTRACKED drafts, see section 11)
  statements/                         parser, validator, categorizer, dto, summaries, errors
  handlers/finance.py, agent.py, auth.py
  agent/ integrations/                empty packages (only __init__.py). Agent and adapters not built.
  tests/                              pytest; tests/finance and tests/statements
frontend/                           Vite + React 19 + aws-amplify, vitest, oxlint
  src/App.jsx                         routes (below)
  src/pages/                          Login, Register, ConfirmSignUp, Onboarding (our 8 step), OnboardingMethod,
                                      ManualEntry, CSVUpload (Aviral's, unlinked), Dashboard, dashboard/*
  src/pages/dashboard/                Overview, BalanceSheet, News, Milestones, Advisory (stub)
  src/lib/                            dashboardApi, statementsApi, authState, cashflow, valuation, goalMapper,
                                      money, onboarding, risk (each with a .test.js)
  src/context/                        AuthContext (Cognito ProtectedRoute), ThemeContext
  src/data/demoPortfolio.json         mirror of seed/demo-portfolio.json (keep identical)
seed/                               demo-portfolio.json, fundamentals.json, test-statement.csv, README.md
docs/                               submission.md, help/, superpowers/plans + specs (see caveat below)
```

Frontend routes (`frontend/src/App.jsx`): public `/` (redirects to `/register`), `/register`, `/confirm`, `/login`;
protected `/onboarding` (our 8-step), `/onboarding/method`, `/onboarding/manual`, `/onboarding/csv` (Aviral's, unlinked
from the flow); dashboard shell `/overview`, `/ai-advisory`, `/milestones`, `/balance-sheet`, `/news`; `/dashboard`
redirects to `/overview`.

Caveat on `docs/superpowers/plans/2026-09-18-aviral-v2-integration.md`: it was the original plan and is partly
stale. It says "do not change Aviral's rendered JSX" and names `dashboardMapper.js`; the shipped code is
`dashboardSnapshot.js`, and Aryan later allowed the small changes listed in section 8. Trust the code and this
handover over the plan.

---

## 7. Backend: what exists

### 7.1 Node CrudFunction routes (all live, all authenticated, all in `infra/template.yaml`)

`GET /me`, `PUT /me/profile`; `GET|POST /holdings`, `PUT|DELETE /holdings/{holding_id}`; `GET|POST /goals`,
`PUT|DELETE /goals/{goal_id}`; `GET|POST /loans`, `PUT|DELETE /loans/{loan_id}`;
`GET /dashboard/profile`, `PUT /dashboard/financials`; `GET /portfolio/prices`, `/portfolio/news`,
`/portfolio/historical`, `/portfolio/suggestions`.

Layout: `router.js` matches method + path regex, calls a controller with `{event, userId, body, params}`.
Controllers are thin; services hold logic; models touch DynamoDB; validators check bodies (paise ints, rate
fractions, enums). Keep this split.

### 7.2 Dashboard compatibility (`services/dashboardService.js`, `dashboardSnapshot.js`, `dashboardModel.js`)

Aviral's pages expect a `financials` object and a profile. Our canonical data is paise across the Users/Holdings/Loans tables.
- `PUT /dashboard/financials` stores his snapshot (idempotent) and also syncs canonical fields.
- `GET /dashboard/profile` returns `{ user, financials }`. If the user has **no snapshot** (everyone who used our
  guided onboarding), `snapshotFromCanonical` derives one from canonical data. Mapping:
  - `incomes.total` from the profile income.
  - `monthlyExpenses["Living expenses"]` from the profile expenses.
  - `liquidAssets.bankBalance` from `cash_balance_paise`; `liquidAssets.fixedDeposits` from FD principals.
  - `liabilities.homeLoanEmi | carLoanEmi | personalLoanEmi | educationLoanEmi | creditCardDebt | otherLoanEmi`
    = each loan's monthly EMI from the locked reducing-balance formula in `services/emi.js`
    (`monthlyEmiPaise`). Do not reimplement the formula, and do not "fix" it: it is a locked decision.
  - `portfolio` from non-FD holdings. Nothing is invented; a value with no source is omitted.
- `services/marketSymbols.js` `resolveMarketSymbol`: snapshot rows keep their typed ticker; bare NSE stock/ETF
  symbols get `.NS`; crypto gets `-INR`; funds, FD and cash resolve to `null` (not priceable on Yahoo).
  `portfolioModel` attaches `marketSymbol` to each row.
- Interests/preferences live at `snapshot.preferences.{industries, instruments}`, written only by Aviral's
  `ManualEntry` page today. Our 8-step onboarding does not collect them (open task, section 11).

### 7.3 Market data (`providers/yahooProvider.js`, `googleNewsProvider.js`, `newsProvider.js`, `services/portfolioService.js`)

Yahoo Finance is unofficial. What actually works from Lambda and what does not:
- **Works, no crumb needed:** `query1.finance.yahoo.com/v8/finance/chart/<SYMBOL>` for quotes and history,
  including index symbols (`^NSEI`, `^BSESN`, `^GSPC`, `^IXIC`), gold futures `GC=F`, FX `INR=X`, `USDINR=X`.
- **Empty for Indian tickers:** `v1/finance/search` news. So news is Yahoo first, then a **Google News RSS**
  fallback (`news.google.com/rss/search?...&hl=en-IN&gl=IN&ceid=IN:en`) for any ticker Yahoo returns nothing for.
  Query is `"<company name>" stock` (name from the Yahoo quote) else `<BASE> share price`.
- `safeTicker` only accepts `/^[A-Z0-9][A-Z0-9._^=-]{0,19}$/` plus the four allowlisted `^` indexes
  (`BENCHMARK_SYMBOLS`). Adding another index symbol means adding it to that set with a test. Silent drops were the
  bug that hid both benchmark lines before.
- `TATAMOTORS.NS` is delisted on Yahoo; the candidate list uses `TMPV.NS`.
- Price semantics: every security price is **rupees**. A non-INR quote is converted with the live `<CUR>INR=X` rate
  (response carries `originalPrice` and `originalCurrency`) and is dropped when no rate is available. Index levels
  (`^...`), futures (`...=F`) and FX (`...=X`) stay in native units (they are levels, not rupee prices).
- Historical ranges: `1W` (5d), `1M`, `3M`, `6M`, `1Y`, and `ALL` (`range=max&interval=1mo`). Portfolio history weights use
  `row.marketSymbol`; both NIFTY 50 and S&P 500 benchmark lines are returned.
- **News rules** (`googleNewsProvider.js`): hand-rolled RSS parser, no dependencies. It drops non-https links,
  items older than 45 days or dated in the future, and price-page titles (regex list `QUOTE_PAGE_TITLES`, e.g.
  "share price today", "live NSE/BSE"). At most 6 items per query, `summary` is empty and `thumbnail` null,
  `id` is a 16-char sha1 of the link. It throws `GoogleNewsUpstreamError` only if every query fails.
  **XML entity decoding was wrong once**: the decoder must decode entities in a single pass, CDATA is taken
  literally, and `&amp;` must not double-decode. Tests in `google-news-entities.test.js` and the real RSS fixture
  `tests/fixtures/google-news-rss.xml` cover it. Do not "simplify" it.
- `getNews` response `source` names the providers that actually contributed ("Yahoo Finance", "Google News", or
  "Yahoo Finance, Google News"). The internal `provider` tag on each item is stripped before responding.
- `newsProvider.js` is the composite; `portfolioService.setYahooProvider(yahoo, google)` injects fakes for tests.

### 7.4 Personalised ideas (`services/portfolioService.js` `getSuggestions`, `services/rationale.js`)

`CANDIDATES` is a hand-picked list of 16 (INFY.NS, TATAELXSI.NS, MON100.NS, ADANIGREEN.NS, HDFCBANK.NS,
SUNPHARMA.NS, HINDUNILVR.NS, DLF.NS, TMPV.NS, HAL.NS, NIFTYBEES.NS, JUNIORBEES.NS, GILT5YBEES.NS, GOLDBEES.NS,
EMBASSY.NS, BTC-INR), each with `industry`, `instrument`, display labels, `risks`, `riskClass`
(STEADIER | MIXED | VOLATILE), `assetGroup`, `blurb`, `counterbalance`.
- Scoring uses saved interests (industry 4 points, instrument 3), the user's `risk_profile`, and what they already hold.
- `buildRationale` writes up to three hedged sentences: risk balance first ("might balance an aggressive risk
  profile", "on the steadier side, which might suit a moderate profile"), then interests, then diversification.
  It never uses buy/sell/return words. When no risk profile is set it does not claim a risk fit (`riskProfile` is
  null). Tests: `tests/rationale.test.js`.
- Aryan's original ask: "you have a high risk profile so this mutual fund is large cap, that makes your thing a
  bit lower risk". Keep that flavour. A later "Level 3" idea is an AI-written digest on top; not built.

### 7.4b Statements pipeline (Python, `backend-python/statements/` + `handlers/finance.py`)

`POST /statements` (create job, presigned S3 PUT url), `POST /statements/{id}/process`, `GET /statements/{id}`,
`POST /statements/{id}/commit`, `GET /cashflow/summary`. CSV only (Level 1). Design points to preserve:
- Transaction ids are content addressed: sha256 of the transaction fields plus an occurrence counter,
  `t_` + 16 hex, so overlapping statements dedupe and committing twice is idempotent.
- Job creation uses `ConditionExpression="attribute_not_exists(job_id)"` so a job cannot be overwritten.
- Typed errors: `StatementValidationError`, `StatementNotFoundError`, `StatementConflictError`,
  `StatementUpstreamError`, each mapped to a 400/404/409/502 envelope in the handler. S3 `NoSuchKey` maps to 400.
- Categorizer uses whole-word regexes (so "car" does not match "card").
- Test doubles in `tests/statements/*` and `tests/test_statements_handler.py` fake `ConditionalCheckFailed`,
  `NoSuchKey`, and read the query key from `KeyConditionExpression._values[1]`. If you touch table access, expect to
  adjust those doubles, and make sure the tests still assert real behaviour.
- Statements Level 1 shipped; Sat 2pm gate rule from `.claude/CLAUDE.md`: PDF/image extraction only if solid, otherwise
  CSV/text ships.

### 7.5 Python FinanceFunction routes

Live (`LIVE_ROUTES` in `handlers/finance.py`): `GET /portfolio/analysis`, `POST /fire/calculate`,
`POST /fire/goal-impact`, `GET /net-worth`, `GET /net-worth/projection`, and the five statements/cashflow routes.
**Still 501** (stubs exist in the template): `/chat`, `/securities/*`, `/fire/scenarios` GET/POST, `/loans/emi`,
`/loans/prepayment-impact`, `/calculators/*`, and the AgentFunction routes (`/chat/{job_id}`, `/conversations`,
`/conversations/{id}/messages`). To make a route live: add it to `LIVE_ROUTES` (or a regex like the statements
one), add the dispatch branch in `handler`, keep unknown routes returning `not_implemented_response`.

The level-1 price shim in the finance handler: `manual_current_value_paise` then FD formula then cost basis with
a warning, else excluded with a warning. Yahoo prices are not used by the Python side yet.

---

## 8. Frontend: what exists and what was changed in Aviral's pages

- Auth: `context/AuthContext.jsx` restores the Cognito session (aws-amplify), `ProtectedRoute` redirects. API calls in
  `lib/dashboardApi.js` and `lib/statementsApi.js` attach `Authorization: Bearer <access token>`.
- Login page has email/password, Google, and **Try the Demo** (uses `VITE_DEMO_EMAIL` / `VITE_DEMO_PASSWORD`, defaults
  to `demo@aicfo.app` and a placeholder, so the real values must be in `frontend/.env.local`). The demo user is
  left populated (onboarding done, snapshot and portfolio present), so the button lands straight on `/overview`.
- Overview: outflows come from canonical data (demo: living costs 40,000 + EMI 39,052 = 79,052 per month).
- Balance Sheet: live Yahoo prices, P&L, allocation, history chart with NIFTY 50 and S&P 500 lines. Mutual funds show
  "Unavailable" because Yahoo has no fund NAV.
- News: six live market tiles (NIFTY, SENSEX, S&P 500, NASDAQ, gold, USD/INR), a flash wire from real headlines, the
  news feed, and the "might suit you" ideas.
- Milestones: goals via `/goals`, `lib/goalMapper.js` maps his shape to canonical (`current_saved_paise`, `target_date`).
- Advisory (`/ai-advisory`): Aviral's stub. It should eventually call `/chat`.

Changes made to Aviral's pages were limited to: (1) auth/data plumbing, (2) removing fabricated data (fake headlines,
fake cash-flow history, buy price shown as live price), (3) hedging guarantee language ("ensures maximum compound
growth" and similar), (4) sign-aware colours (a negative percentage move is red, not green). His copy and defaults
are otherwise original. **Keep it that way**; if you must change his UI, say what and why to Aryan.

Frontend commands (from `frontend/`): `npm test` (vitest, 80 tests), `npm run lint` (oxlint, warnings only, no errors),
`npm run build`. `npm install` may modify `package-lock.json`; commit lockfile changes only if you meant to.

---

## 9. Git state, deploy runbook

### 9.1 Git

- `main` = `014b57c` "feat: merge Aviral's v2 dashboard, news and holdings pages with an authenticated AWS backend",
  parents `b2a4e75` and `4c3223e` (Aviral's `origin/aviral-onboarding-v2`). Pushed. Aviral just needs
  `git pull origin main`.
- Git identity is Aryan Pardeshi; commits are authored as him.
- **Untracked, do not accidentally commit**: `backend-python/finance/{tax,insurance,creditcard,shortterm}.py` and
  `backend-python/tests/finance/test_{tax,insurance,creditcard,shortterm}.py` (see section 11). Use explicit `git add
  <paths>`, never `git add -A`.
- Leftover branches and worktrees (safe to delete only when Aryan says so):
  - Branches: `feat/aviral-v2-merge` and `backup/aviral-v2-merge-detail` (both `833bbf3`, the detailed per-step history of
    the merge), `backup/pre-squash-2026-09-19` (`707aa89`, the 16-commit history before Aryan's squash), plus
    `fix/onboarding-manual-value`, `fix/onboarding-step2-fields`, `fix/onboarding-step3-resume`, `refactor/node-mvc`,
    `refactor/onboarding-pages`, `aviral-onboarding-process`.
  - Worktrees: `../aicfo-wt-manualval`, `../aicfo-wt-nodemvc`, `../aicfo-wt-pages`, `../aicfo-wt-step2`,
    `../aicfo-wt-step3`, `../Personal_AI_CFO-onboarding` (this is also the `onboarding-frontend-mock` dev server dir),
    and scratch clones under `.worktrees/` (`aviral-v2-backend`, `aviral-v2-integration`, `aviral-v2-ui`,
    `dashboard-truth`, `statements-level1`, plus Codex prompt files). `.worktrees/` is gitignored.
  - `stash@{0}`: "rewind-reverted working tree (manual-value + demo-source fix rolled back), kept just in case".
  - Refs `refs/codex/*` from a Codex run.
- Rule for using worktrees for agent work: `git worktree add ../aicfo-wt-<topic> -b feat/<topic> main`, work there,
  verify there, then bring it into main with a normal merge or cherry-pick after Aryan agrees.
- To make a merge commit whose tree you have already verified elsewhere, `git merge -s ours --no-commit <other>`
  followed by `git read-tree -u --reset <verified-tree>` then commit. That is how `014b57c` was produced.

### 9.2 Deploy runbook (Aryan approved deploys to `aicfo-dev`; nothing else)

From `infra/`:
1. `sam validate --lint`
2. `sam build`
3. `sam deploy --no-execute-changeset` (uses `samconfig.toml`: stack `aicfo-dev`, region `ap-south-1`,
   `CAPABILITY_IAM`, parameter overrides for `GoogleClientId`, `FrontendCallbackUrls`, `FrontendOrigins`)
4. Inspect the change set: `aws cloudformation describe-change-set --change-set-name <id> --stack-name aicfo-dev`.
   **Every resource must be `Modify` with `Replacement: False` (or `Conditional` with an explanation you understand).**
   If anything shows `Replacement: True` or `RequiresRecreation` (especially the Cognito pool, DynamoDB tables,
   the bucket, or the HttpApi), stop and ask Aryan.
5. `aws cloudformation execute-change-set --change-set-name <id> --stack-name aicfo-dev`
6. `aws cloudformation wait stack-update-complete --stack-name aicfo-dev`
7. Smoke test with a real Cognito access token (from the app: `fetchAuthSession()` in the browser console), for
   example `GET /dashboard/profile`, `GET /portfolio/news`, `GET /portfolio/prices?tickers=RELIANCE.NS` (`tickers` is comma separated, at most 20, each must pass `safeTicker`).
The last three deploys all ended `UPDATE_COMPLETE` with no replacement. Deploys need Aryan's AWS profile; if the CLI is
not authenticated, stop and ask.

---

## 10. Test gates (run before saying anything is done)

Counts on `main` today (all just re-run and green):

| Suite | Command | Result |
| --- | --- | --- |
| Node backend | `cd backend-node && npm test` | 269 pass, 0 fail |
| Python (tracked) | `cd backend-python && py -3.13 -m pytest -q --ignore=tests/finance/test_tax.py --ignore=tests/finance/test_insurance.py --ignore=tests/finance/test_creditcard.py --ignore=tests/finance/test_shortterm.py` | 91 pass |
| Python drafts | `py -3.13 -m pytest -q tests/finance/test_tax.py tests/finance/test_insurance.py tests/finance/test_creditcard.py tests/finance/test_shortterm.py` | 34 pass (unreviewed) |
| Frontend | `cd frontend && npm test` | 80 pass in 9 files |
| Frontend lint / build | `npm run lint` / `npm run build` | lint warnings only, build ok |
| Infra | `cd infra && sam validate --lint` | valid |

Friday-night gate from the timeline (still the yardstick): login works, portfolio shows a real >25 percent concentration flag,
security detail page loads, FIRE age shifts when a goal is added. The demo seed is built so the flag fires (RELIANCE
is about 31 percent of the portfolio). Saturday 8pm gate: if agent streaming is not solid, fall back to polling and
trim to Tier A tools.

Demo seed (`seed/demo-portfolio.json`, identical to `frontend/src/data/demoPortfolio.json`, keep the two in sync):
RELIANCE 200 shares at 115000 paise, HDFCBANK 40 at 70000, NIFTYBEES 400 at 24500, PPFCF 1000 units at 8000, plus a
FD of 3,00,000 rupees at 7 percent. Cost bases were made realistic against live prices (an earlier seed showed -93 percent).

---

## 11. Open work, in the order I would do it

1. **Wire the "Auto-fill from statement" buttons** on onboarding steps 3 and 4 (income/expenses and holdings) to the
   live statements API. `frontend/src/lib/statementsApi.js` and `frontend/src/pages/CSVUpload.jsx` already do the
   upload, process, review and commit flow against the real backend; reuse them rather than rewriting. This is our
   own onboarding, so it is within scope. `seed/test-statement.csv` is a test file. Verify end to end in a browser.
2. **Review and commit the four calculator drafts** (tax, insurance, credit card payoff, short-term fit). They exist as
   untracked files with 34 passing tests, but nobody has checked them against the specs in `.agents/modules.md`
   (`# Module: calculators-seed`) and `.agents/finance-rules.md` (FY 2026-27 slabs, cess, rebates, LTCG 12.5 percent above
   1.25 lakh, and so on). Do it test-first: read the spec, check each locked number, add missing cases, then add the
   routes `/calculators/tax`, `/calculators/capital-gains`, `/calculators/insurance`, `/calculators/credit-card-payoff`,
   `/securities/short-term-fit`, `/loans/emi`, `/loans/prepayment-impact` to `handlers/finance.py`, update openapi.
   The calculator UI pages (`frontend/src/pages/calculators/`) are Ram's/Aviral's territory: ask Aryan.
3. **Chat agent** (`feat/agent-integrations`): Strands agent on Kilo, tool registry from `.agents/agent-guide.md`, the async
   `/chat` then `/chat/{job_id}` flow, AppSync Events streaming with a polling fallback. `backend-python/agent/` and
   `integrations/` are empty. mfapi, firecrawl, s3, secrets adapters are ours; the **Upstox adapter is Ram+Sivsri's**, so
   ask before writing `integrations/upstox.py`. Web content safety pipeline and the six hostile-page fixtures are
   specified in `.agents/agent-guide.md`. Aviral was offered a chat request/response contract for his Advisory page and
   never replied; agree the shape with him (or write it into `contracts/openapi.yaml`) before building.
4. **Onboarding step-6 interest chips**: two optional chip rows (sectors, and what they like to hold) in our 8-step flow,
   saved to `snapshot.preferences.{industries, instruments}` so News suggestions personalise from day one. Uses our own
   frontend; the label strings must match what `selectedPreferences` and `INDUSTRY_ALIASES` / `INSTRUMENT_ALIASES` in
   `portfolioService.js` expect (see Aviral's `ManualEntry.jsx` for the exact labels). Aryan agreed to the idea but
   has not confirmed the change to our frontend.
5. **Frontend hosting** (Amplify or similar): not deployed, it only runs on localhost:5174 today. Before hosting you must add
   the hosted URL to `FrontendOrigins` and `FrontendCallbackUrls` (samconfig overrides and Cognito client callbacks),
   and set `VITE_*` env vars in the host. That is a stack update, so use the runbook. Ask Aryan first.
6. **Mutual fund prices** via mfapi.in so PPFCF and other funds stop showing "Unavailable". The `resolveMarketSymbol` returns
   null for funds; a separate NAV path is needed. This is an agent-integrations item (`integrations/mfapi.py`).
7. **AI news digest** ("Level 3" of the personalisation plan): an LLM summary on top of the deterministic ideas. Only after
   the agent exists. Numbers must still come from the tested code.
8. **Small known bugs / rough edges**:
   - Updating an FD holding can rename it (minor rename-on-update bug in the holdings update path).
   - Yahoo prices are fetched per request with no cache; if latency or rate limits bite, add a short in-memory cache in
     `yahooProvider.js` with tests. (Lambda timeout is 20s.)
   - ETF news through Google (for example NIFTYBEES) is generic market news.
   - Aviral's `Advisory` page is a stub with no real ARIA behaviour.
   - Lint has warnings on Aviral's files. Not errors; leave them unless asked.
9. **Housekeeping** (ask before deleting anything): stale branches, worktrees and `stash@{0}` from section 9.1. `frontend/.env.local`
   stays put.
10. **Decision waiting on Aryan**: whether the demo account should be reset so "Try the Demo" starts at onboarding instead of on the dashboard.

---

## 12. How to verify (your job now)

The biggest lesson of the last two days: **never trust a delegated agent's summary, including your own.** Two real cases:
- An opencode agent (nemotron) shipped an XML entity decoder that was a chain of no-ops and a test whose input was
  already decoded, so it passed vacuously. It reported 203/203 green. Reading the test against the real RSS fixture
  exposed the bug immediately.
- A Codex-built chart wired two benchmark lines to symbols the provider silently rejected, so the lines simply never rendered.

Checklist for every change:
1. Read the diff, not the summary. `git diff`, `git status`, and read the tests that were added.
2. **Mutation check the tests**: break the implementation on purpose (or run the test against the old code) and confirm the test
   fails for the intended reason. A test that cannot fail is worthless.
3. Run real data through it. For market code, hit Yahoo and Google for real. For API code, call the deployed route with a real
   Cognito token. For UI, drive the page in a browser and look at the numbers, not just "no console errors".
4. Check invariants: paise integers, rate fractions, `sub`-only identity, hedged wording, no secrets in the diff.
5. Run all gates from section 10 and compare counts against the table.
6. If it touches `infra/template.yaml`, run the full deploy runbook up to changeset inspection and look for `Replacement`.

Browser testing notes (Claude used the in-app browser pane): when the pane is hidden it reports a 0x0 viewport and screenshots
time out. Select the tab, set a viewport size, and drive/inspect the DOM. Get an access token from the page with
`fetchAuthSession()` from `aws-amplify/auth` (in Vite dev: `/node_modules/.vite/deps/aws-amplify_auth.js`).

---

## 13. Working with opencode from here

The delegation setup Claude used (you can reuse it if you spawn sub-runs):
- Free model: `opencode/muse-spark-1.3-contributor-free`. Other free ones seen: `opencode/mimo-v2.5-free`,
  `opencode/nemotron-3-ultra-free` (the one that produced the vacuous test, so review harder),
  `opencode/nemotron-3.5-lightning-free`, `opencode/ling-3.0-flash-fin-free`, `opencode/muse-spark-1.2-contributor-free`,
  `kilocode/kilo-auto/free`. Paid `opencode/*` models fail with "No payment method". Omitting `-m` fails
  ("union-alpha not supported").
- Invocation, **from inside the worktree**, message first, `-f` last (`-f` is greedy and swallows later positionals):

  ```bash
  opencode run "Read the attached BRIEF.md and implement it now. Do not ask questions." --auto --dir <worktree> -m opencode/muse-spark-1.3-contributor-free -f BRIEF.md
  ```
- Brief file contents that worked: goal in two lines, exact owned files, exact files not to touch, contracts to honour (paise,
  `sub`, snake_case), the tests to write first, the commands that must pass, and "IMPLEMENT NOW, do not ask questions".
  Keep it short and exact. Tell it to work test-first.
- Fallback if opencode hits limits: `codex exec -m gpt-5.6-luna --approve-for-me -C <workdir> "<brief>"` (codex-cli 0.154.0). Codex was
  rate-limited until 04:08 on 2026-09-19. Sandbox may block network installs.
- Aryan's rule of thumb: complex, token-heavy coding goes to a free model with a brief and its own worktree; small contained edits
  (a bound, a doc line, a one-file fix) are done directly.

---

## 14. Locked decisions worth re-reading before you touch the area

- `.agents/finance-rules.md`: FIRE, tax slabs, EMI, portfolio concentration threshold (25 percent), required test cases.
- `.agents/api-contract.md`: enums, DynamoDB schema, every route. Dashboard, portfolio and statements sections were expanded
  today and match the code.
- `.agents/architecture.md`: stack, IAM, git workflow, day-1 verification checklist (Bedrock/Upstox/RELIANCE corporate-action/AppSync checks).
- `.agents/project.md`: scope and do-not-change list.
- `.agents/agent-guide.md`: Upstox, mfapi, Firecrawl, Kilo, AppSync facts and limits, the tool registry, web content safety rules.
- `.agents/modules.md`: per-module owned paths, levels and gates.

Pre-event checklist items still open in `.claude/CLAUDE.md`: Bedrock playground call, Upstox Analytics Token in a password
manager, redacted bank statement CSV from Sivsri, 15-20 demo securities list from Ram, teammate MFA devices (console only),
WeMakeDevs registrations for all four members.

---

## 15. Quick facts for common questions

- "Why does the demo show RELIANCE at about 31 percent?" It is deliberate so the >25 percent flag fires.
- "Why does News fall back to Google?" Yahoo's search API returns no news for Indian tickers.
- "Why are mutual funds Unavailable?" Yahoo has no fund NAV; needs mfapi.
- "Where do I find the demo login?" Press Try the Demo on `/login`. The credentials are in gitignored `frontend/.env.local`; do not copy them into files or chat.
- "Why is the stack template timeout 20s?" Crud fans out to Yahoo/Google for prices, news and history.
- "Why not Bedrock?" Free plan blocks it; Kilo Gateway replaces it, Bedrock policy stays for a swap back.
- "Which port?" 5174 for main; 5173 is the older onboarding worktree's mock server.
