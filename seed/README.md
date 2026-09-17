# Seed data

Owned by `feat/calculators-seed`, with test-fixture content coordinated with
`feat/statements-onboarding`.

Expected files (see `.agents/modules.md#module-calculators-seed` and
`.agents/modules.md#module-statements-onboarding`):

- `demo-portfolio.json` — the onboarding "load demo portfolio" dataset. Needs a mix of
  STOCK/ETF/MUTUAL_FUND/FD and at least one holding >25% weight (demo needs to show the
  concentration flag).
- `fundamentals.json` — 15-20 demo securities with P/E, ROE, sector, sector-reference P/E,
  debt metric. Record `source` and `as_of` on every entry — never let the model fill a gap.
- `glossary.json` — curated term definitions backing `explain_financial_term`.
- Statement test fixtures (one PDF, 3 overlapping screenshots, one CSV, one pasted-text
  sample) — hand-checked totals, used by both the statement pipeline's tests and the demo
  video's cash-flow segment.
