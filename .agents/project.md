# Product — Personal AI CFO

## Identity

**Personal AI CFO** — a personal finance intelligence platform for Indian users. UI language
can also say "AI CFO", "Financial Copilot", "Your Personal CFO". **Never** market this as a
SEBI-registered investment adviser or as guaranteed-return advice. It is an educational tool.

## One-line pitch

A personal AI CFO for Indian users combining portfolio intelligence, net worth, cash-flow
analysis, financial goals, FIRE planning, and an AI agent that uses the same real financial
tools as the app — it never invents numbers.

## Problem

Financial life is fragmented across brokerage apps, MF apps, bank statements, loans, FDs,
goals, spreadsheets, FIRE calculators, and generic chatbots that don't know the user's real
financial state. This product answers, with real numbers behind every answer:

- What do I own? How concentrated is my portfolio? What's driving my risk?
- Does a stock/ETF/MF fit my stated strategy?
- What's my net worth, and how is it projected to grow?
- Where am I overspending? How much can I invest?
- How does a car/wedding/loan change my FIRE age?
- What should I pay attention to this month?

## Core engineering philosophy — numbers first, AI second

```text
financial data → deterministic Python calculations → structured JSON results
              → Strands agent / Bedrock → plain-English personalized explanation
```

Never ask the LLM to improvise financial math from prose. Every number the agent states must
come from a tool call in that conversation. See [agent-guide.md](agent-guide.md).

## Scope philosophy

Full vision, strict dependency order, **built in levels** — not "cut half the features."
Every feature area gets a **Level 1** (deterministic engine + tests + one endpoint, no UI
polish) before anyone moves to Level 2/3 of anything. This guarantees a working baseline of
every planned feature exists even if time runs out, rather than a few fully-polished features
and several completely missing ones.

- **Level 1**: pure calculation module + unit tests + API endpoint. No UI, or bare-bones UI.
- **Level 2**: proper UI page, connected to the real endpoint, loading/error states.
- **Level 3**: polish — animations, edge cases, mobile, agent tool wired in.

Chatbot is built **last** relative to each domain's own Level 1 — i.e. FIRE Level 1 (engine +
endpoint) ships before the FIRE agent tool, but the chatbot as a whole doesn't wait for every
domain's Level 3. See [architecture.md](architecture.md#implementation-order) for the actual
day-by-day plan and gate structure.

Crypto: optional, only if a teammate has slack time. Never blocks core work.

## Feature areas and their tools/pages

Full detail lives in the linked files. Summary:

| Area | Level 1 lives in | Tool(s) | Page(s) |
|---|---|---|---|
| Auth/onboarding | `feat/backend-core`, `feat/node-crud` | — | onboarding flow |
| Portfolio/holdings | `feat/backend-core` (`finance/portfolio.py`) | `get_portfolio_analysis`, `analyze_portfolio_fit` | Investments |
| Security detail | `feat/agent-integrations` (Upstox) | `search_securities`, `get_security_overview`, `get_security_risk_metrics` | Security detail |
| FIRE | `feat/backend-core` (`finance/fire.py`) | `calculate_fire`, `simulate_goal_impact` | FIRE |
| Net worth | `feat/backend-core` (`finance/networth.py`) | `get_net_worth`, `project_net_worth` | Net worth |
| Goals | `feat/node-crud` | `get_goals` | Goals |
| Loans/EMI | `feat/node-crud` (data), `feat/calculators-seed` (calc) | `calculate_emi`, `calculate_prepayment_impact` | Loans, calculators |
| Cash flow / statements | `feat/statements-onboarding` | `get_cashflow_summary`, `find_recurring_expenses`, `get_expense_saving_opportunities`, `simulate_savings_redirect` | Statement upload/review, Cash flow |
| Tax | `feat/calculators-seed` | `estimate_income_tax`, `compare_tax_regimes`, `estimate_capital_gains_tax` | Calculators |
| Insurance | `feat/calculators-seed` | `estimate_insurance_needs` | Calculators |
| Short-term investing | `feat/calculators-seed` (needs Upstox history) | `analyze_short_term_fit` | Security detail add-on |
| Credit cards | `feat/calculators-seed` | `calculate_credit_card_payoff` | Calculators |
| Education/app help | `feat/calculators-seed` | `explain_financial_term`, `get_app_help` | Chat only |
| Chat agent | `feat/agent-integrations` | all of the above | Chat |

Full tool contracts, boundaries and the system prompt outline: [agent-guide.md](agent-guide.md).

## Do-not-change list (locked; ask the infra/deploy lead before changing any of these)

- Product stays an AI CFO / personal finance intelligence product for Indian retail users.
- AWS Ship It deployment direction. DynamoDB is the database. S3 for files. Bedrock is the LLM
  platform, Nova 2 Lite (global cross-region profile) unless proven unavailable.
- Strands Agents SDK, running in plain Lambda — **not** AgentCore Runtime. No Bedrock
  Guardrails in the MVP (web-content classifier is a Sunday stretch only, see
  [agent-guide.md](agent-guide.md#stretch-guardrails)). No EventBridge daily refresh in MVP.
- API Gateway **HTTP API** (not REST), Cognito JWT authorizer, user identity always from the
  verified `sub` claim — never from a client-supplied `user_id`.
- Vite + React SPA frontend, Amplify Hosting.
- Upstox is the market-data source; mfapi.in for MF NAV; instrument search uses a local index,
  never one API call per keystroke.
- Fundamentals/market data must be verified or seeded with `source` + `as_of` — never
  hallucinated by the model.
- Holding concentration flag: **strictly > 25%** for individual stocks (warning). Funds/ETFs
  above 25% get an `info` note only, never `warning` — see [finance-rules.md](finance-rules.md).
- Money stored as integer paise everywhere; converted to rupees only at the tool/UI boundary.
- No classic RDS/VPC/NAT by default. No autonomous trading, ever. No root AWS credentials for
  development.
- Chatbot has read + what-if tools only in the MVP. Write tools (save goal, save scenario) are
  a future-scope stretch, never default-on.

## Definition of done

Not "every planned card exists" — the submission is done when the core journey works
reliably end to end. Minimum credible target:

- Real Cognito signup/login, deployed Amplify frontend, API Gateway HTTP API with JWT auth,
  Lambda backend, DynamoDB, S3.
- Upstox live-or-dated market data (with `source`/`as_of` shown).
- Portfolio values + allocation + the strict >25% concentration flag working correctly.
- Volatility/drawdown/CAGR on the security detail page.
- Deterministic FIRE engine with the goal-impact scenario ("add a car, watch FIRE age move").
- Net worth view + projection.
- At least the CSV/text path of the statement pipeline working end to end (PDF/images can
  slip — see [modules.md](modules.md#module-statements-onboarding)).
- Strands + Bedrock AI CFO calling real tools, streamed via AppSync (polling fallback OK).
- No fabricated financial numbers anywhere — every error/limitation case in
  [architecture.md](architecture.md#error-handling-contract) handled, not papered over.
- Public repo with setup instructions, an honest writeup, a polished ≤3-minute demo video.

A strong stretch completion adds: loans/EMI, insurance helper, tax calculator, short-term fit
tool, credit-card payoff, richer cash-flow analysis, PDF/image statement extraction, live
AppSync streaming (vs. polling only).

## Known open questions (do not silently decide — ask the infra/deploy lead)

1. Kickoff/deadline exact hours (check schedule page once published).
2. Whether Build It + Ship It cross-eligibility applies to us (asked on Discord).
3. Who owns `feat/node-crud`.
4. Exact Bedrock Nova 2 Lite behavior/latency once tested live in `ap-south-1`.
5. Whether AppSync Events is confirmed working in `ap-south-1` (needs day-1 console check).
