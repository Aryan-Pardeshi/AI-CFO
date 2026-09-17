# Module briefs — all feat/* branches

> Consolidated from .agents/modules/agent-integrations.md, .agents/modules/backend-core.md, .agents/modules/calculators-seed.md, .agents/modules/dashboard-ui.md, .agents/modules/node-crud.md, .agents/modules/statements-onboarding.md without content changes (only ../ link prefixes updated to ./ and agent-rules.md / integrations.md targets updated to agent-guide.md). Each section below is the former file verbatim.


---

_Formerly .agents/modules/agent-integrations.md._

# Module: agent-integrations

**Branch/worktree:** `feat/agent-integrations` · **Owner:** infra/deploy lead

## Owned paths
```text
backend-python/integrations/upstox.py
backend-python/integrations/mfapi.py
backend-python/integrations/s3.py
backend-python/integrations/secrets.py
backend-python/integrations/firecrawl.py
backend-python/agent/            (built AFTER integrations land — agent.py, prompt.py, tools/)
scripts/refresh_instruments.py
```

## Sequencing (this module has an internal dependency order)
1. Upstox adapter (quote, history, fundamentals) + instrument search index → S3.
2. mfapi.in adapter for MF NAV.
3. **Day-1 verification** (do first, before writing feature code — see
   [architecture.md](./architecture.md#day-1-verification-checklist)): Bedrock global model
   call, Upstox from Lambda, corporate-action adjustment check on RELIANCE, AppSync Events
   console check.
4. Firecrawl adapter + [web-content-safety](./agent-guide.md#web-content-safety) pipeline
   (cleaning, spotlighting, keyword tripwire) + the 6 hostile-page test fixtures.
5. Strands agent: tool registry from [agent-guide.md](./agent-guide.md#tool-registry),
   system prompt, hooks (tool-call cap, AppSync publish, logging).

## Do not edit outside owned paths
`finance/*.py` is `feat/backend-core`'s — call into it, don't duplicate it. UI is
`feat/dashboard-ui`'s.

## Levels
- **Level 1**: Upstox + mfapi adapters working against real APIs (not mocks), instrument
  search index built once and queryable, `/securities/*` routes live.
- **Level 2**: agent tools wired for Tier A domains, `/chat` async flow working end-to-end
  with AppSync streaming (or polling fallback if AppSync isn't ready).
- **Level 3**: Firecrawl web tools + full injection-defense pipeline + hostile-page tests;
  Tier B/C tools added as their backing modules land from other branches.

## Gate
Fri night: agent answers "Am I too concentrated?" and "How does buying a car at 27 change my
FIRE age?" correctly via real tool calls, streamed to the frontend.


---

_Formerly .agents/modules/backend-core.md._

# Module: backend-core

**Branch/worktree:** `feat/backend-core` · **Owner:** infra/deploy lead

## Owned paths
```text
infra/                          (SAM template, samconfig.toml — first draft, others read-only after)
backend-python/handlers/auth.py (get_authenticated_user_id helper + tests)
backend-python/finance/portfolio.py
backend-python/finance/returns.py
backend-python/finance/risk.py
backend-python/finance/fire.py
backend-python/finance/networth.py
backend-python/tests/  (for the above)
```

## Do not edit outside owned paths
Need a change to `contracts/openapi.yaml` or a shared enum? Open a small PR against that file
specifically — don't bundle it with feature work.

## Contract dependencies
Reads: [api-contract.md](./api-contract.md) enums + `users`/`holdings`/`goals`/`loans` shapes
(written by `feat/node-crud` — read-only from here). Writes: `fire-scenarios`, `snapshots`.

## Levels

- **Level 1**: `finance/*.py` pure functions + full unit test suite from
  [finance-rules.md](./finance-rules.md) (concentration edge cases, ddof=1 volatility, CAGR,
  drawdown, portfolio covariance, **FIRE regression fixture — age 17 → FIRE age 31**).
  `GET /portfolio/analysis`, `POST /fire/calculate`, `POST /fire/goal-impact`,
  `GET /net-worth`, `GET /net-worth/projection` wired to these, returning real data against
  DEMO/MANUAL holdings (Upstox integration lands separately in `feat/agent-integrations`, so
  Level 1 here can mock the price source).
- **Level 2**: n/a — no UI owned by this module (UI is `feat/dashboard-ui`).
- **Level 3**: perf pass once real Upstox prices flow in from `feat/agent-integrations`;
  reconcile any timing-convention drift against the locked fixture.

## Gate
Thu night: `/portfolio/analysis` and `/fire/calculate` deployed and returning correct numbers
against seeded/demo holdings, with the full test suite green.


---

_Formerly .agents/modules/calculators-seed.md._

# Module: calculators-seed

**Branch/worktree:** `feat/calculators-seed` · **Owner:** calculators/seed lead

## Owned paths
```text
backend-python/finance/tax.py
backend-python/finance/insurance.py
backend-python/finance/creditcard.py
backend-python/finance/shortterm.py     (needs feat/agent-integrations' Upstox history —
                                          coordinate, or build against a mock history array
                                          first and swap later)
frontend/src/pages/calculators/        (EMI, tax, insurance, card, short-term pages)
seed/                                   (demo portfolio, fundamentals seed, glossary, test
                                          statement files — coordinate content with
                                          feat/statements-onboarding for the test fixtures)
docs/help/                              (app-support docs the get_app_help tool reads)
```

## Do not edit outside owned paths
Build on `feat/dashboard-ui`'s design system.

## Specs for each calculator (full detail, cite sources if asked why a number is what it is)

**Tax** (FY 2026-27, Income-tax Act 2025 in force from 1 Apr 2026):
- New regime: 0-4L nil, 4-8L 5%, 8-12L 10%, 12-16L 15%, 16-20L 20%, 20-24L 25%, >24L 30%.
  Standard deduction ₹75k, rebate up to ₹60k (net-zero tax ≤₹12L taxable).
- Old regime: 0-2.5L nil, 2.5-5L 5%, 5-10L 20%, >10L 30%. Standard deduction ₹50k, rebate
  ₹12.5k ≤₹5L. 4% cess both regimes.
- Scope: resident individual, under 60, taxable income ≤ ₹50L. Outside that range → warning,
  not a guess (surcharge bands, senior slabs, >₹12L marginal relief zone are out of scope).
- Capital gains: listed equity/equity-MF LTCG (>12mo) 12.5% above ₹1.25L/yr exemption; STCG
  20%; debt MFs (bought after Apr 2023) at slab rate; no indexation post 23 Jul 2024. Needs
  `holdings.first_buy_date` (coordinate with `feat/node-crud`, it's their table).
- `compare_tax_regimes` = both results side by side. Label everything "estimate, FY 2026-27,
  not tax advice."

**Insurance** (educational estimate, no insurer names, no premiums, no product recs — IRDAI
regulates actual insurance intermediation, we don't do that):
- Term cover: show **both** a rule-of-thumb band (10-15× annual income) and a needs-based
  estimate = income-replacement PV (expenses × annuity factor to age 60, 6% growth/7%
  discount) + outstanding loans + PV of EDUCATION/WEDDING goals − investments (FIRE-corpus
  definition, excl. cash). Gap = needs-based − existing cover. Only shown if
  `dependents_count > 0` OR loans exist.
- Health cover: metro ₹10L individual / ₹20-25L family floater; tier-2 ₹10-15L; tier-3
  ₹5-10L (city_tier field from onboarding). Medical inflation 12-14%/yr — show 10-yr erosion
  of current cover. Ask about **personal** cover separately from employer cover (employer
  cover ends with the job) — gap calc uses personal only.

**Credit card**: `calculate_credit_card_payoff(outstanding, monthly_interest_pct,
monthly_payment)` → months to clear + total interest, illustrating the minimum-due trap.
**No product/issuer comparisons ever** — that needs a real dataset we don't have.

**Short-term investing**: `analyze_short_term_fit(instrument_key, horizon_months)` — using
real price history (from `feat/agent-integrations`), compute over every past N-month rolling
window: worst/median/best return, % of windows with a loss, max drawdown. Add a tax-rate note
(equity <12mo = 20% STCG; debt MF = slab). **No buy/sell signal, ever.**

**EMI/prepayment**: reuses [finance-rules.md](./finance-rules.md#loans--emi) — build the UI
on top of `feat/backend-core`'s or your own pure functions if that branch isn't merged yet
(small, safe to duplicate temporarily and de-dup at merge time).

**Glossary/app-help**: curated JSON, not model-generated — this is what
`explain_financial_term` and `get_app_help` read from, per
[agent-guide.md](./agent-guide.md#tool-registry).

## Seed data responsibilities
- `seed/demo-portfolio.json` — the onboarding "load demo portfolio" dataset. Mixed
  stocks/ETF/MF/FD, at least one holding >25% (to show the concentration flag in the demo).
- `seed/fundamentals.json` — 15-20 demo securities, backup for when live Upstox fundamentals
  aren't tested yet. Record `source` + `as_of` on every entry.
- Test statement files for `feat/statements-onboarding` (coordinate on content/format).

## Levels
- **Level 1**: all 4 calculator engines (tax/insurance/card/short-term) as pure functions +
  endpoints + tests, seed data files exist.
- **Level 2**: calculator pages in the UI, wired to real endpoints.
- **Level 3**: agent tool registration once each engine is stable (tools live in
  `feat/agent-integrations`, coordinate).

## Gate
Sat night: at least tax + insurance calculators are Level 2; short-term/card can slip to
Level 1-only if time is short (per the levels philosophy — Level 1 always ships, Level 3 is
what gets cut, not the whole feature).


---

_Formerly .agents/modules/dashboard-ui.md._

# Module: dashboard-ui

**Branch/worktree:** `feat/dashboard-ui` · **Owner:** frontend/design lead

## Owned paths
```text
frontend/src/pages/<area>/             (Overview, Investments, Security detail, FIRE, Net worth, Chat)
frontend/components/ui/              (design system — this is the shared base other UI
                                       modules build on top of; land it first, hour 0-3)
frontend/lib/api/                    (typed API client generated from contracts/openapi.yaml)
```

## Do not edit outside owned paths
Onboarding/statement-review UI is `feat/statements-onboarding`'s. Goals/loans forms are
`feat/node-crud`'s. Calculator pages are `feat/calculators-seed`'s. **They build on your
design-system components** — land those first so they're not blocked.

## Contract-first hour 0-3 (your part)
Stub every route + nav item with a placeholder screen before splitting into deeper work — see
[architecture.md](./architecture.md#contract-first-hour-0-3). Set up the MSW mock API fed by
`contracts/openapi.yaml` examples so nobody's UI work blocks on a real backend being up.

## Levels
- **Level 1**: design tokens, layout shell, nav, all pages stubbed and routable, mock API
  wired.
- **Level 2**: Overview, Investments, Security detail wired to real endpoints (from
  `feat/backend-core` / `feat/agent-integrations`). Concentration flag visibly rendered.
- **Level 3**: FIRE page (goal-impact interaction — the "add a car, see FIRE age shift" demo
  moment), Net worth chart (actual vs projected vs scenario lines), Chat UI (streamed tool
  chips, source citations, safe-markdown rendering — no images/raw HTML, see
  [agent-guide.md](./agent-guide.md#web-content-safety) for *why*). Responsive/mobile pass.
  This is also the **Best UI** submission surface — most design effort belongs here.

## Gate
Fri night: Investments page shows a real >25% concentration flag; a security detail page
loads for a real search result; FIRE page renders the baseline curve.


---

_Formerly .agents/modules/node-crud.md._

# Module: node-crud

**Branch/worktree:** `feat/node-crud` · **Owner:** TBD (to be assigned before hour 0)

## Owned paths
```text
backend-node/                        (CrudFunction: /me, /holdings*, /goals*, /loans*)
frontend/src/pages/goals/           (forms UI)
frontend/src/pages/loans/           (forms UI)
frontend/src/pages/settings/        (assumptions editor — inflation, returns, risk-free rate)
```

## Do not edit outside owned paths
Build on `feat/dashboard-ui`'s design-system components (`frontend/components/ui/`) — don't
fork your own. Reads [api-contract.md](./api-contract.md) for `users`/`holdings`/`goals`/
`loans` schema — you **write** these tables, everyone else only reads them.

## Levels
- **Level 1**: full CRUD on all 4 tables, `getAuthenticatedUserId(event)` helper + test
  proving it rejects a client-supplied `user_id` and never falls back to a dev user when
  deployed. Onboarding's data-saving steps (`PUT /me/profile`, `POST /holdings`, etc.) work
  end-to-end from Postman/curl.
- **Level 2**: Goals and Loans pages — add/edit/delete forms, validation matching
  [api-contract.md](./api-contract.md) enums.
- **Level 3**: Settings → Assumptions page (inflation/returns/risk-free rate/step-up,
  editable, defaults from [finance-rules.md](./finance-rules.md)).

## Gate
Thu night: a real signed-in user can PUT their profile and POST a holding, and `GET /me`
returns it correctly scoped to that user only.


---

_Formerly .agents/modules/statements-onboarding.md._

# Module: statements-onboarding

**Branch/worktree:** `feat/statements-onboarding` · **Owner:** statements/onboarding lead

## Owned paths
```text
backend-python/statements/           (extract, validate, categorize, commit)
frontend/src/pages/onboarding/      (8-step flow — see below)
frontend/src/pages/statements/      (upload + review UI)
frontend/src/pages/cashflow/        (cash flow summary page)
```

## Do not edit outside owned paths
Build on `feat/dashboard-ui`'s design system. Writes `transactions`, `statement-jobs` tables
(Python-owned per [api-contract.md](./api-contract.md)).

## Statement pipeline (full spec)
```text
1. POST /statements {job_id, input_type: pdf|images|csv|xlsx|text} → presigned PUT URLs
2. Client subscribes AppSync /jobs/{sub}/{job_id}, then POST /statements/{job_id}/process
3. EXTRACT: csv/xlsx parsed by code (Nova only maps unknown headers); pdf/images/text →
   Nova with forced tool `record_statement_rows` (toolChoice), chunked ~3 pages/screenshots
4. VALIDATE (pure Python, tested): parse dates, amount>0, running-balance reconciliation
   (±₹1 tolerance), dedupe overlapping screenshot uploads by content hash, mask account
   digits except last 4
5. CATEGORIZE: keyword rules first (SWIGGY/ZOMATO→FOOD_DELIVERY, NETFLIX→SUBSCRIPTIONS,
   SALARY→INCOME, EMI/NACH→EMI...), Nova for the rest (category forced to enum)
6. status → REVIEW_REQUIRED. User reviews/edits every row in the UI — mismatches highlighted.
   **Nothing is saved to `transactions` before this confirm step, no exceptions.**
7. POST /statements/{job_id}/commit → transactions table → deterministic cash-flow metrics
```
Job status enum, DTOs, routes: [api-contract.md](./api-contract.md). Nova document/image
limits, toolChoice behavior: [agent-guide.md](./agent-guide.md#bedrock--nova-2-lite).

## Onboarding flow (8 steps, revised order — locked)
0. Sign up/in (Cognito) → resume at `users.onboarding_step` if incomplete.
1. Lightweight consent (educational tool, not SEBI advice, Bedrock may process outside India,
   uploaded statements are AI-read and reviewed before saving).
2. About you: name, date_of_birth.
3. Monthly money: income (optional), expenses **excluding EMIs**, monthly investment.
   Optional: upload a bank statement here to auto-fill these from parsed data (uses the
   pipeline above, still requires review before committing).
4. What you have: add holdings now / enter totals only / **load demo portfolio** (visible to
   everyone, clearly labeled `DEMO`) + emergency fund target months (default 6).
5. Loans (skippable).
6. Risk & strategy: 4-question quiz + horizon years + strategy_goal. Each question scores
   1-3 points, sum 4-12 maps to a suggested `risk_profile` (**overridable** by the user):
   - 4-6 → CONSERVATIVE, 7-9 → MODERATE, 10-12 → AGGRESSIVE.

   | Question | 1 pt | 2 pts | 3 pts |
   |---|---|---|---|
   | When will you need most of this money? | < 3 yrs | 3-7 yrs | > 7 yrs |
   | Portfolio drops 20% in a month. You... | sell | hold | buy more |
   | Income stability | unstable | stable | stable + 6-month buffer |
   | Investing experience | none | mutual funds | stocks, several years |

   Store both `risk_score` and `risk_answers` (the raw answers) — not just the final label —
   so the scoring rule can be shown transparently in the UI ("why we suggested this").
7. Goals (skippable): chips with amount-today + target-age, default inflation per
   [finance-rules.md](./finance-rules.md#goals) (10% for EDUCATION, 6% others, editable).
8. Finish → Overview reveal.

### Validation bounds (frontend AND backend — never trust the client alone)

| Field | Bounds |
|---|---|
| `monthly_income_paise` / `monthly_expenses_paise` / `monthly_investment_paise` | 0 ≤ x ≤ ₹10,00,00,000 (10 crore) |
| `date_of_birth` | resulting age 18-80 |
| Goal `target_age` | current age + 1 ≤ x ≤ 91 (matches FIRE's modeled lifespan) |
| Loan `tenure_months` | 1-480 |
| Loan `annual_rate` | 0-36% (flag anything above as unusually high, still accept it) |

### Saving progress

Each step saves through `PUT /me/profile` (updates `onboarding_step` too) except holdings/
loans/goals which use their own POST routes (`feat/node-crud`'s tables — you write *through*
their API, you don't touch their DynamoDB tables directly). The final step sets
`onboarded = true`. On sign-in, `GET /me` returning 404 or `onboarded: false` routes back
into onboarding at the saved `onboarding_step`, not step 0.

New fields on `users` this flow needs: `consent_accepted_at`, `onboarding_step`, `risk_score`,
`risk_answers`, `cash_balance_paise`, `dependents_count?`, `existing_term_cover_paise?`,
`existing_health_cover_paise?`, `employment_type?`, `city_tier?` — coordinate with
`feat/node-crud` since they write the `users` table (you consume it, don't add columns
without telling them).

## Levels
- **Level 1**: CSV + pasted-text extraction path only (skip PDF/image parsing initially),
  validation + categorization + commit working, cash-flow summary endpoint correct on the
  known demo CSV fixture.
- **Level 2**: Onboarding UI all 8 steps, statement review UI (editable table, reconciliation
  badge).
- **Level 3**: PDF + screenshot extraction, onboarding statement auto-fill,
  `get_expense_saving_opportunities` / `simulate_savings_redirect` tools' backing logic.

## Gate
Sat 2pm: if CSV/text path isn't solid by here, PDF/image extraction gets cut for the demo —
fall back to the net-worth segment in the video (per hackathon.md cut discipline via levels,
not full removal — Level 1 still ships, Level 3 waits).

## Test fixtures needed
One PDF, 3 overlapping screenshots (dedupe test), one CSV, one pasted-text sample — all with
hand-checked totals. Own these in `seed/` alongside the calculators/seed module's demo data.

