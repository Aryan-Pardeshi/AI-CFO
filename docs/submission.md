# Submission — demo script + writeup

> Consolidated from docs/demo-script.md and docs/writeup.md without content changes. Both original sections follow verbatim.


---

_Formerly docs/demo-script.md._

# Demo video script — 3 minutes max

Judges only see this video + the writeup. No live demo. Every claim in here must be visibly
on screen, not just narrated. See `.agents/hackathon.md` for the judging criteria this serves.

## 0:00–0:15 — problem
"Your investments, bank spending, goals and retirement planning live in separate places. This
is an AI CFO that turns them into one financial picture — with real numbers, not guesses."

## 0:15–0:30 — real login + dashboard
Brief Cognito sign-up/sign-in on screen (proves real auth, not a hardcoded demo user), then
the Overview: net worth, portfolio value, FIRE progress, a key warning.

## 0:30–1:05 — investment intelligence
Portfolio showing a real >25% concentration flag. Search a security (e.g. HDFC Bank), open
its detail page: current price, chart, volatility/drawdown, portfolio concentration impact,
strategy-fit explanation.

## 1:05–1:35 — FIRE scenario
Baseline FIRE age on screen. Add a car/wedding goal. FIRE age and curve update instantly —
this is the single most demo-able moment in the product.

## 1:35–1:55 — cash-flow intelligence
Statement upload + review, category breakdown, one AI insight. **Fallback if this isn't
stable by Saturday**: swap in the net-worth projection segment instead — never risk a live
failure on stage/recording.

## 1:55–2:30 — AI CFO
Ask 1-2 questions live that prove real tool use, streamed:
- "Am I too concentrated?"
- "How does buying a car at 27 change my FIRE age?"
Show the tool-call chips / "data as of" metadata — this is what makes the agent look real
instead of magic (and reinforces the "AWS used, visibly, in the video" judging requirement).

## 2:30–3:00 — AWS architecture / impact
One clean diagram: Amplify + Cognito + API Gateway + Lambda + DynamoDB + S3 + Bedrock +
AppSync. Say what each service does in one phrase each. Don't spend 30 seconds listing logos
with no explanation — the judging criteria explicitly reward the architecture/cost story, not
a slide of icons.

## Recording notes
- Record with a stable seeded/demo account as backup in case live data has an issue during
  the recording.
- Retake while there's time — don't record this for the first time an hour before the
  deadline.
- Every AWS service claimed in the writeup must appear on screen here — narration-only claims
  don't count per the rules.

---

_Formerly docs/writeup.md._

# Writeup (draft — fill in as the weekend progresses, finalize Sunday)

Required by the submission rules: problem, implementation, AWS use, what was learned, AI
tools used. Also becomes the basis for the AWS Builder Center blog (top-5-blogs prize).

## Problem

<!-- Fill from .agents/project.md "Problem" section, personalized with what actually shipped -->

## What we built

<!-- List features that actually reached at least Level 2 by submission time. Be honest —
     "one feature that runs beats five that almost do" is a judging criterion. -->

## AWS services used (must match what's visibly on screen in the demo video)

- Amazon Bedrock (Nova 2 Lite, global cross-region inference) — the AI CFO's reasoning layer
- AWS Lambda — Node CRUD + Python finance/agent compute
- Amazon API Gateway (HTTP API) — public API, Cognito JWT authorized
- Amazon Cognito — real user auth
- Amazon DynamoDB — application state
- Amazon S3 — statement uploads, market data cache, seed data
- AWS AppSync (Events) — realtime chat/job streaming
- AWS Amplify Hosting — frontend deployment
- AWS SAM — infrastructure as code
- (Update this list to match what actually got deployed — don't claim something that got cut.)

## What we learned

<!-- Per-person, one or two honest lines each. This counts toward the score. -->

## AI coding tools used (must disclose)

<!-- Claude Code / Codex / Gemini CLI — list what each person actually used. -->

## Architecture

See `.agents/architecture.md` for the full stack rationale; link/embed the final diagram here.

## Limitations / what we'd build next

<!-- Honest list — Tier D chatbot domains cut, crypto skipped, etc. -->

