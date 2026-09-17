# Architecture

## Stack (locked)

| Component | Decision |
|---|---|
| AI model | Amazon Bedrock, **Nova 2 Lite**, model id `global.amazon.nova-2-lite-v1:0` (global cross-region inference — Nova 2 Lite has NO in-region or geo-routed presence in `ap-south-1`, only global) |
| Agent framework | Strands Agents SDK (Python), official Lambda layer (`ap-south-1` supported) |
| Agent runtime | Plain AWS Lambda — **not** AgentCore Runtime |
| Region | `ap-south-1` (Mumbai) |
| Compute | AWS Lambda, arm64, Python 3.13 (finance/agent), Node 22.x (CRUD) |
| Database | DynamoDB, On-Demand, multi-table (not single-table design) |
| Files | S3, private, SSE-S3 |
| Frontend | Vite + React + React Router (SPA), AWS Amplify Hosting. Auth via `aws-amplify` (Cognito email/password + Google through Cognito). Changed from Next.js on 17 Sept: the frontend owner's onboarding was already built on Vite. |
| Public API | API Gateway **HTTP API** (not REST) |
| Auth | Amazon Cognito, real signup/login, JWT authorizer on the HTTP API |
| Realtime | AWS AppSync Events (Cognito auth for subscribe, IAM for publish) — for chat + statement job progress |
| Secrets | Secrets Manager: `aicfo/upstox`, `aicfo/firecrawl` |
| IaC | AWS SAM, one template, one stack `aicfo-dev` |
| Web search tool | Firecrawl (`/v2/search`, `/v2/scrape`) |
| MF NAV | mfapi.in (free, no auth, AMFI-sourced) |
| Market data | Upstox (Analytics Token — read-only, 1yr validity) |

**Explicitly cut, do not reintroduce without asking the infra/deploy lead:** AgentCore Runtime/Memory, Bedrock
Guardrails (MVP), EventBridge daily refresh, classic RDS/Aurora, EC2, VPC/NAT, App Runner,
Step Functions.

## Why these cuts

- **AgentCore** — purpose-built for agent hosting but adds moving parts we don't need for a
  4-day build. Strands runs directly in Lambda: `Strands Agent → Python Lambda → Bedrock +
  deterministic tools`.
- **Guardrails** — financial boundaries come from system prompt + tool design + deterministic
  calculations + response rules, not a managed classifier. See
  [agent-guide.md](agent-guide.md).
- **EventBridge** — instrument universe is seeded/refreshed manually for the hackathon demo.
  Refresh logic stays callable as a script so scheduling can be bolted on later.

## Cognito config

- User Pool: sign in with **email**, email verification required, standard password policy
  (min 8 chars, upper/lower/number — no need to exceed this for a hackathon demo).
- User Pool Client: **no client secret** (public SPA client), SRP auth flow (what Amplify's
  JS Authenticator uses by default).
- No MFA on end-user accounts (MFA is for the *team's own* AWS IAM users, per the IAM section
  below — don't conflate the two).
- JWT authorizer on the HTTP API validates issuer (`https://cognito-idp.ap-south-1.amazonaws.com/{PoolId}`)
  and audience (`[ClientId]`) — both come from the User Pool's own outputs, wire them as SAM
  `Outputs` → Amplify env vars, don't hand-copy them between consoles.

## Bedrock: why `global.` and the IAM policy it needs

Nova 2 Lite is **not hosted in `ap-south-1`** and has no geo-routed profile there either — only
the **global** cross-region inference profile reaches it from Mumbai. This means:

- Prompts may be processed outside India. Don't claim data-residency-in-India for AI calls.
- IAM needs a **3-part policy** on every role that calls Bedrock (agent Lambda):
  1. `bedrock:InvokeModel` on `arn:aws:bedrock:ap-south-1:<account>:inference-profile/global.amazon.nova-2-lite-v1:0`
  2. same action on `arn:aws:bedrock:ap-south-1::foundation-model/amazon.nova-2-lite-v1:0`
     with condition `bedrock:InferenceProfileArn` = the profile ARN above
  3. same action on the **region-less** `arn:aws:bedrock:::foundation-model/amazon.nova-2-lite-v1:0`
     with condition `aws:RequestedRegion = unspecified`

  Missing part 3 is the most common cause of a silent AccessDenied. See the SAM template's
  `AgentFunction` IAM policy for the exact JSON.
- Global routing is ~10% cheaper than geo cross-region, so this isn't just a compatibility
  workaround — it's also the cheaper option.

## Stack layout (SAM template `infra/template.yaml`)

```text
Cognito UserPool + UserPoolClient (no secret, SRP auth)
HttpApi  (default authorizer = Cognito JWT)
  ├── CrudFunction        node22.x, 512MB, 10s   — /me, /holdings*, /goals*, /loans*
  ├── FinanceFunction     python3.13, 1024MB, 15s — /portfolio/*, /securities/*, /fire/*,
  │                                                  /net-worth*, /loans/emi, /statements/*,
  │                                                  /cashflow/*, calculators, POST /chat
  │                                                  (dispatch only: save job, async-invoke
  │                                                  AgentFunction, return 202)
  └── AgentFunction       python3.13, Strands layer, 1024MB, 300s (async) — invoked async
                                                       by FinanceFunction for chat jobs;
                                                       HTTP: GET /chat/{job_id},
                                                       GET /conversations*
EventsApi (AppSync)  — namespace "jobs", channel /jobs/{sub}/{job_id}
  onSubscribe: reject unless segments[1] == identity.sub
DynamoDB (PAY_PER_REQUEST): users, holdings, goals, loans, fire-scenarios, transactions,
  statement-jobs, snapshots, insights, conversations, chat-jobs
S3 DataBucket (private): statements/, market-cache/, seed/
```

Table ownership (see [api-contract.md](api-contract.md) for full schema):

| Writer | Tables |
|---|---|
| Node (CrudFunction) | users, holdings, goals, loans |
| Python (Finance/Agent) | fire-scenarios, transactions, statement-jobs, snapshots, insights, conversations, chat-jobs |

Everyone else reads across the boundary via DynamoDB `GetItem`/`Query` directly (same account,
same region) — never scans. No cross-Lambda HTTP calls except FinanceFunction →
`lambda:InvokeFunction` (async) → AgentFunction for the `/chat` job dispatch.

## API Gateway 30-second limit and the chat flow

HTTP API has a hard 30s integration timeout that cannot be raised (only REST API can). Nova
tool loops + Firecrawl calls can exceed that, so `/chat` (and statement processing) is async:

```text
1. Client generates job_id, subscribes to AppSync channel /jobs/{sub}/{job_id}
2. POST /chat {job_id, message} → FinanceFunction saves job (status QUEUED),
   invokes AgentFunction async (InvocationType=Event, retries=0), returns 202
3. AgentFunction (timeout 300s): loads history, runs Strands agent.stream_async(),
   publishes tool_start/tool_end/text_delta/done events to AppSync, persists to
   conversations + chat-jobs
4. Client renders streamed events; falls back to polling GET /chat/{job_id} if the
   socket drops
```

Async Lambda retries **must be set to 0** — the default of 2 would double-answer and
double-bill Bedrock on a transient failure.

Tool-call cap per question: **30** (concurrent execution is the Strands default — all tools
requested in one turn run in parallel). A `BeforeToolCallEvent` hook sets `cancel_tool` once
the cap is hit.

## Cost control

- Budget alerts before any resource creation: **$10 / $25 / $50** (adjust to actual credit
  balance once the $100/team code lands — check Billing → Credits, never assume an amount).
- Biggest variable cost is Bedrock invocations. Cache Upstox daily candles in S3
  (`market-cache/{instrument_key}/day/{as_of}.json`) — also respects Upstox's rate limit
  (50/sec, 500/min, 2000/30min).
- CloudWatch log retention: 7 days.
- No NAT Gateway, no always-on EC2, no RDS, no unused provisioned resources.

## IAM

- Root: MFA on, no access keys, never used for dev work.
- Infra/deploy lead: IAM user with `AdministratorAccess` (no need to also attach the
  Amplify-specific admin policy — redundant).
- Everyone else: `PowerUserAccess` + MFA. They **cannot** create IAM roles (`iam:PassRole`
  blocked) — the infra/deploy lead runs all `sam deploy`s. Everyone else tests with unit
  tests / `sam local` / the frontend mock API (MSW) against `contracts/openapi.yaml` examples.

## Implementation order

Levels, not phases-that-get-cut. Every feature area ships its **Level 1** (engine + tests +
endpoint) before anyone does
**Level 2** (UI) or **Level 3** (polish/agent-wiring) on *anything*. This is deliberate: it
guarantees a working baseline exists everywhere, rather than a few complete features and
several entirely missing ones if time runs out.

Rough day shape (kickoff hours/deadline not yet published — this is aspirational until
confirmed on the schedule page):

- **Thu**: contract-first hour 0-3 (stub every route, every page — see below), then everyone's
  Level 1 for their owned modules.
- **Fri**: Level 2 across the board — real UI wired to real endpoints.
- **Sat**: Level 3 + agent wiring + statement pipeline + streaming. Rough submission goes in
  Saturday night as insurance.
- **Sun**: polish, error states, video, writeup, blog, submit ≥3h before deadline.

## Contract-first hour 0-3

Do this before splitting into worktrees:

1. `contracts/openapi.yaml` — every route, DTO, enum, with examples. Single source of truth.
2. Infra/deploy lead: every route stubbed in `template.yaml` + Lambda routers returning `501`.
3. Frontend/design lead: every page route + nav stubbed with placeholder screens.
4. Frontend gets a mock API (MSW) fed by the OpenAPI examples so UI work never blocks on
   backend being real.

After that, each branch/worktree only touches files it owns (see
[api-contract.md](api-contract.md) for the module→path map). Shared files (`template.yaml`,
`contracts/openapi.yaml`, shared enums) only change through the infra/deploy lead's own small
PRs.

## Git workflow

```text
main
├── feat/backend-core          (infra/deploy lead)     — auth helper, SAM infra,
│                                                          portfolio/returns/risk, FIRE
│                                                          engine, net worth engine + tests
├── feat/agent-integrations    (infra/deploy lead)     — Upstox/mfapi/S3/secrets adapters,
│                                                          then Strands agent + tools
├── feat/dashboard-ui          (frontend/design lead)  — design system + all pages
│                                                          (Overview, Investments, Security
│                                                          detail, FIRE, Net worth, Chat)
├── feat/node-crud             (node/CRUD lead)        — CRUD Lambda + goals/loans forms UI
├── feat/statements-onboarding (statements/onboarding
│                                lead)                 — statement pipeline + onboarding +
│                                                          review UI
└── feat/calculators-seed      (calculators/seed lead) — EMI/tax/insurance/card/short-term
                                                           calculators + demo seed data +
                                                           glossary/app-help docs
```

Rules:
- One branch = one worktree = one person's active session. Never two people pushing the same
  `feat/*` branch.
- Rebase on `main` before opening a PR. No CI (skipped deliberately to save setup time) — run
  tests locally before merging.
- Merges are continuous (no fixed windows) — merge whenever your slice is green.
- Only the infra/deploy lead deploys (`sam deploy`) and touches shared files
  (`template.yaml`, `contracts/openapi.yaml`).
- No `.env` files committed, ever. Secrets only via Secrets Manager, referenced by ARN/name in
  Lambda env vars.

## Day-1 verification checklist

Do these first, before writing feature code:

1. Bedrock playground: one call with `global.amazon.nova-2-lite-v1:0` in `ap-south-1` console.
2. Upstox Analytics Token: one quote call **from a Lambda**, not just from a laptop — confirms
   no static-IP block on quotes/history/fundamentals.
3. Check whether Upstox historical candles are already split/bonus-adjusted — test against
   RELIANCE's Oct 2024 1:1 bonus. If unadjusted, use Upstox's Corporate Actions endpoint to
   back-adjust before computing volatility/drawdown/CAGR.
4. AppSync Events console availability in `ap-south-1` (documented as available, but the
   Events *feature specifically* was inferred, not directly confirmed — verify).
5. Strands: confirm current SDK version's `BeforeToolCallEvent.cancel_tool` hook API and that
   `ConcurrentToolExecutor` is still the default.

## Exact Bedrock IAM policy (copy-paste, fill in `<account>`)

This is the #1 likely source of a silent `AccessDenied` — all three statements are required,
not just the first two:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "GrantGlobalCrisInferenceProfileRegionAccess",
      "Effect": "Allow",
      "Action": "bedrock:InvokeModel",
      "Resource": ["arn:aws:bedrock:ap-south-1:<account>:inference-profile/global.amazon.nova-2-lite-v1:0"],
      "Condition": {"StringEquals": {"aws:RequestedRegion": "ap-south-1"}}
    },
    {
      "Sid": "GrantGlobalCrisInferenceProfileInRegionModelAccess",
      "Effect": "Allow",
      "Action": "bedrock:InvokeModel",
      "Resource": ["arn:aws:bedrock:ap-south-1::foundation-model/amazon.nova-2-lite-v1:0"],
      "Condition": {"StringEquals": {
        "aws:RequestedRegion": "ap-south-1",
        "bedrock:InferenceProfileArn": "arn:aws:bedrock:ap-south-1:<account>:inference-profile/global.amazon.nova-2-lite-v1:0"
      }}
    },
    {
      "Sid": "GrantGlobalCrisInferenceProfileGlobalModelAccess",
      "Effect": "Allow",
      "Action": "bedrock:InvokeModel",
      "Resource": ["arn:aws:bedrock:::foundation-model/amazon.nova-2-lite-v1:0"],
      "Condition": {"StringEquals": {
        "aws:RequestedRegion": "unspecified",
        "bedrock:InferenceProfileArn": "arn:aws:bedrock:ap-south-1:<account>:inference-profile/global.amazon.nova-2-lite-v1:0"
      }}
    }
  ]
}
```

Also grant `bedrock:InvokeModelWithResponseStream` alongside `InvokeModel` on the same three
resources if Strands' streaming path is used internally (even though we stream to the
*client* via AppSync, not via Bedrock's own response-stream API).

## Repo structure (create these directories in the contract-first hour)

```text
/
├── AGENTS.md  CLAUDE.md  GEMINI.md        (root pointer files, already committed)
├── .agents/                                (shared context — see this directory)
├── .claude/                                (gitignored — infra/deploy lead's private notes only)
├── contracts/
│   └── openapi.yaml
├── docs/
│   ├── submission.md                     (demo script + writeup)
│   └── help/                               (app-support docs, get_app_help tool)
├── frontend/                                (Vite + React + React Router SPA)
│   └── src/
│       ├── pages/onboarding/               (feat/statements-onboarding)
│       ├── pages/<area>/                   overview investments securities fire net-worth chat
│       │                                     (feat/dashboard-ui) · goals loans settings
│       │                                     (feat/node-crud) · statements cashflow
│       │                                     (feat/statements-onboarding) · calculators
│       │                                     (feat/calculators-seed)
│       ├── components/ui/                  (feat/dashboard-ui — design system, shared base)
│       ├── lib/api.js                      (API client for openapi.yaml routes, adds Cognito token)
│       └── mocks/                          (dev-only MSW handlers, VITE_USE_MOCKS=true)
├── backend-node/                            (feat/node-crud — CrudFunction)
├── backend-python/
│   ├── handlers/                            (Lambda entrypoints, one per function)
│   ├── finance/                             (feat/backend-core: portfolio/returns/risk/fire/networth
│   │                                          + feat/calculators-seed: tax/insurance/creditcard/shortterm)
│   ├── statements/                          (feat/statements-onboarding)
│   ├── integrations/                        (feat/agent-integrations: upstox/mfapi/s3/secrets/firecrawl)
│   ├── agent/                                (feat/agent-integrations: agent.py, prompt.py, tools/)
│   ├── models/                               (shared pydantic models, generated/checked against openapi.yaml)
│   └── tests/
├── infra/
│   └── template.yaml  samconfig.toml        (feat/backend-core — infra/deploy lead only,
│                                              after hour 0-3)
├── seed/                                     (feat/calculators-seed + statement test fixtures)
└── scripts/
    └── refresh_instruments.py               (feat/agent-integrations)
```

**Dependency rule**: finance functions in `backend-python/finance/` must be pure — no boto3
calls inside the math. Fetch data in the Lambda handler, pass plain values into the pure
function, return plain values out. This is what makes the FIRE regression fixture and every
other test in [finance-rules.md](finance-rules.md) runnable locally with no AWS credentials.

```python
# Bad — math function reaches into DynamoDB itself
def calculate_fire(user_id):
    profile = dynamodb.get_item(...)   # now untestable without AWS

# Good
def calculate_fire(inputs: FireInputs) -> FireResult:
    ...  # pure math, testable with plain dicts

def handler(event, context):
    user_id = get_authenticated_user_id(event)
    profile = repo.get_profile(user_id)
    return calculate_fire(FireInputs.from_profile(profile))
```

## Exact JWT claims path (HTTP API + Cognito JWT authorizer)

```python
def get_authenticated_user_id(event: dict) -> str:
    return event["requestContext"]["authorizer"]["jwt"]["claims"]["sub"]
```
Hardcode this path in **exactly one place per runtime** (Python + Node each get one helper).
Never inline `event["requestContext"]...` anywhere else in the codebase — if the event shape
ever needs a compatibility shim, there should be one place to fix it.

## Strands Lambda layer (official, ap-south-1 supported)

```text
arn:aws:lambda:ap-south-1:856699698935:layer:strands-agents-py3_13-aarch64:<version>
```
Python 3.10–3.13, x86_64 or aarch64 (we use aarch64 everywhere per the arm64 decision above).
Strands' own Lambda deployment example **does not implement response streaming** — this is
exactly why we stream over AppSync Events instead of trying to stream Bedrock's response
straight out of Lambda (Python Lambda can't stream natively anyway without the Lambda Web
Adapter, which we're deliberately not adding).

## Security / privacy checklist

This is financial data. Non-negotiable even for a 4-day build:

- No secrets in Git, ever — no root keys, no Upstox/Firecrawl secret in browser code, no
  plaintext `.env` committed.
- S3 bucket private, `BlockPublicAccess` all four settings on.
- Every API authenticated; user ID always derived from the verified Cognito `sub`, never from
  a client-supplied `user_id` in body or query string (see the JWT-path helper above).
- Every DynamoDB operation scoped by `user_id` partition key — `Query`/`GetItem` only, no
  table-wide `Scan` on a user-facing path.
- Sanitize filenames/object keys before writing to S3 (statement uploads) — don't trust the
  client-provided filename directly in the key.
- **Never log** full bank statement contents, JWTs/OAuth tokens, passwords, or raw financial
  payloads to CloudWatch. Log structured metadata only (see Logging section below).
- Least-privilege IAM per Lambda execution role — CrudFunction only touches its 4 tables,
  FinanceFunction/AgentFunction only touch theirs (see table-ownership split earlier in this
  file). No Lambda gets `dynamodb:*` on `Resource: "*"`.
- HTTPS only in the deployed environment (API Gateway default — don't add an HTTP listener
  anywhere).

## Logging (CloudWatch — debugging aid, not an observability platform)

Log structured JSON, one event per significant action, no financial values in the payload:

```json
{"event": "portfolio_analysis", "user_hash": "...", "holdings": 7, "duration_ms": 84,
 "flags": ["HOLDING_CONCENTRATION"]}
```

For agent runs, log: request id, tools chosen, tool duration, Bedrock latency, error class,
token usage if available. `user_hash` = a salted hash of the `sub`, never the raw sub, in any
log line that might be searched/shared casually.

## Error-handling contract

Every integration has a defined failure behavior — never let a failure silently become a
plausible-looking fake number.

| Failure | Behavior |
|---|---|
| Upstox quote/history fails | Return cached/last-known data **with its timestamp**, or an explicit `UPSTREAM_UNAVAILABLE`. Never substitute a guessed price. |
| Fundamentals unavailable | Omit the metric, state "not available from configured source" — never let the model fill the gap from memory. |
| Bedrock/agent fails | The deterministic result (portfolio metrics, FIRE result, etc.) must still display. The AI explanation is an enhancement, not a blocker, on every page that also shows a raw number. |
| DynamoDB fails | Return a real `INTERNAL` error. Never silently fall back to empty/fake data — the one exception is an explicit, clearly-labeled demo-fixture mode (`DEMO` holding source), which is opt-in, not a failure fallback. |
| Bank statement parser fails | Mark the `statement-jobs` row `FAILED` / unsupported-format. Never invent transactions to fill the gap. |
| Insufficient history for a metric | Return a metric-specific limitation message (e.g. "CAGR unavailable for <1 year of history") via `warnings`, not a fabricated number — see `INSUFFICIENT_DATA` error code in [api-contract.md](api-contract.md). |
