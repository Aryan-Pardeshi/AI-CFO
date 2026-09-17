# AI-CFO — agent context index

This file is the entry point for any AI coding tool working in this repo (Codex, Cursor,
Copilot, or anything reading `AGENTS.md` directly). Claude Code and Gemini CLI have their own
root files (`CLAUDE.md`, `GEMINI.md`) that import this one — keep this file as the actual
content, not a stub, since it's the one some tools read with no import mechanism.

## Read in this order

1. [.agents/hackathon.md](.agents/hackathon.md) — event rules, judging, the clock/disqualification
   rule, submission requirements. Read this first, always.
2. [.agents/project.md](.agents/project.md) — product scope, feature areas, do-not-change list.
3. [.agents/architecture.md](.agents/architecture.md) — stack, region, IAM, git workflow, day-1
   checks.
4. [.agents/api-contract.md](.agents/api-contract.md) — conventions, enums, DynamoDB schema,
   routes. Machine source of truth: [contracts/openapi.yaml](contracts/openapi.yaml).
5. [.agents/finance-rules.md](.agents/finance-rules.md) — every locked formula, the FIRE
   regression fixture, required test cases.
6. [.agents/agent-guide.md](.agents/agent-guide.md) — Upstox/mfapi/Firecrawl/Bedrock/AppSync
   facts and limits; chatbot tool design, boundaries, web content safety.
7. Your own module brief in [.agents/modules.md](.agents/modules.md) (`# Module: <your-module>`
   section) — owned paths, levels, gate.

## Ground rules for any AI tool in this repo

- **Numbers first, AI second.** Never let a model improvise financial math. All money math
  lives in tested pure Python, called by both the API and the agent.
- **Stay inside your module's owned paths.** Shared files (`contracts/openapi.yaml`,
  `infra/template.yaml`, this file) change only through small, separate PRs.
- **Never commit secrets.** No `.env` files, no API keys, no AWS credentials in code or git
  history. Secrets Manager only.
- **Build in levels, not phases-that-get-cut.** Level 1 (engine + tests + endpoint) before
  Level 2 (UI) before Level 3 (polish/agent-wiring) — for your module specifically, and
  ideally in step with the rest of the team so no feature area is left at zero.
- **User identity always comes from the verified Cognito `sub` claim.** Never trust a
  client-supplied `user_id`.
- **This repo's git history must match the event window (17-20 Sept 2026).** Nothing
  pre-dates kickoff — see hackathon.md for why this matters.
