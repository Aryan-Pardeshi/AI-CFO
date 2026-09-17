# Personal AI CFO

A personal AI CFO for Indian users — portfolio intelligence, net worth, cash-flow analysis,
financial goals, and FIRE planning, plus an AI agent that uses the same real financial tools
as the app. Built for **WeMakeDevs × AWS First Commit** (Bharat Builds Tour), 17-20 Sept 2026.

Numbers first, AI second: every calculation is deterministic Python, tested, and the agent
only ever explains real tool results — it never improvises financial math.

## Start here

- [AGENTS.md](AGENTS.md) — full context index for any AI coding tool working in this repo.
- [.agents/](.agents/) — hackathon rules, product scope, architecture, API contract, finance
  rules, agent guide (integrations + agent design), module briefs. Read these before writing code.
- [contracts/openapi.yaml](contracts/openapi.yaml) — the API source of truth.

## Stack

Next.js (Amplify Hosting) · API Gateway HTTP API · Cognito · Lambda (Node CRUD + Python
finance/agent) · DynamoDB · S3 · Bedrock (Nova 2 Lite) · Strands Agents SDK · AppSync Events ·
Upstox market data · Firecrawl web search.

## Status

In progress — hackathon build, 17-20 Sept 2026.

## License

See [LICENSE](LICENSE).
