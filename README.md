# AIRA Personal AI CFO

> Numbers first. AI second.

AIRA Personal AI CFO is a financial intelligence platform for Indian investors. It brings together investments, cash flow, goals, loans, net worth, and FIRE planning, then uses **ARIA**, its grounded financial copilot, to explain what the numbers mean.

- **Live app:** https://main.d19guqu2l1q2px.amplifyapp.com/
- **Hackathon:** [WeMakeDevs x AWS First Commit](https://www.wemakedevs.org/aws/first-commit)
- **Track:** Ship It, Bharat Builds Tour 2026

## The problem

Financial lives are fragmented. Holdings live in broker apps, transactions in bank statements, goals in spreadsheets, and important decisions often get made without a complete view of the numbers.

AIRA gives users one place to understand their money. It is educational decision support, not buy/sell advice or a replacement for a registered financial adviser.

## What it does

- Shows net worth, holdings, asset allocation, concentration signals, balance-sheet information, goals, loans, and monthly cash flow.
- Captures financial goals, income, expenses, investing experience, and risk preferences during onboarding.
- Imports supported bank and broker CSV statements to prefill transactions and holdings.
- Models Financial Independence, Retire Early (FIRE) using corpus, expenses, inflation, returns, and life events. Adding a car, wedding, or home down payment updates the projected FIRE age.
- Provides personalised portfolio, market, and news intelligence based on a user's saved information.
- Lets users ask ARIA practical questions such as “Can I afford a ₹70,000 gaming laptop?” ARIA retrieves relevant financial data and explains the trade-offs.
- Requires an explicit confirmation before ARIA saves a proposed change. It cannot silently alter user data or execute trades.

## Numbers first, AI second

Financial calculations are deterministic Python code, not LLM-generated text. Net worth, portfolio analysis, cash flow, affordability, and FIRE projections are calculated by backend services. ARIA calls those same services and explains their structured results in plain language.

This makes every important number traceable to data and a repeatable calculation rather than a model guess.

## Architecture

```text
React + Vite SPA (AWS Amplify Hosting)
        |
Amazon Cognito authentication
        |
Amazon API Gateway
        |
AWS Lambda: Node.js CRUD APIs + Python finance and ARIA services
        |
Amazon DynamoDB + Amazon S3
```

| Layer | Technology |
| --- | --- |
| Frontend | React, Vite, React Router, Recharts |
| Hosting | AWS Amplify Hosting |
| Identity | Amazon Cognito |
| APIs | Amazon API Gateway HTTP API |
| Compute | AWS Lambda, Node.js and Python |
| Data | Amazon DynamoDB |
| Statements | Amazon S3 |
| Secrets and monitoring | AWS Secrets Manager and Amazon CloudWatch |
| Market data | Upstox and mfapi.in |
| Research | Firecrawl |
| AI model gateway | OpenRouter, currently GLM-5.3-Flash |

All backend requests derive the user identity from Cognito's verified `sub` claim. The client never supplies a trusted user ID.

## AWS deployment

The application is deployed end to end on AWS. Amplify serves the public frontend, Cognito secures accounts, API Gateway and Lambda run the application services, DynamoDB stores isolated user data, S3 stores statement uploads, Secrets Manager protects credentials, and CloudWatch provides operational logs.

We initially explored Amazon Bedrock for ARIA's model layer. Production model-access constraints during the hackathon led us to use OpenRouter for the live model gateway while retaining the AWS application, identity, data, storage, secrets, and monitoring stack.

## Run locally

Prerequisites: Node.js 22+, Python 3.13+, AWS CLI credentials for deployed-service work, and configured environment variables. Never commit credentials or API keys.

```bash
cd frontend
npm ci
npm run dev
```

The API and infrastructure contracts are documented in [AGENTS.md](AGENTS.md) and [contracts/openapi.yaml](contracts/openapi.yaml). Read the repository guidance before making backend or infrastructure changes.

## What is next

- Expand statement ingestion beyond CSV while preserving review and validation steps.
- Improve market-data coverage and freshness indicators.
- Deepen ARIA's scenario planning and source-backed research while keeping calculations deterministic and changes confirmation-gated.

## Team

- **Aryan Pardeshi**: Product architecture, AWS deployment, deterministic financial engine, ARIA tool layer, backend integration, GitHub workflow, and final release readiness.
- **Aviral Mishra**: Complete user-facing UI, including the landing page, authentication, onboarding, dashboard, portfolio, FIRE, goals, trackers, data visualisations, responsive design, and demo-user experience. ARIA's chat interface was handled separately.

## Built for

Built during the [WeMakeDevs x AWS First Commit](https://www.wemakedevs.org/aws/first-commit) hackathon as a Ship It project.

## License

See [LICENSE](LICENSE).
