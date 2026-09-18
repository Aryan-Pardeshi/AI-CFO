# Seed data

Owned by `feat/calculators-seed`, with test-fixture content coordinated with
`feat/statements-onboarding`.

Expected files (see `.agents/modules.md#module-calculators-seed` and
`.agents/modules.md#module-statements-onboarding`):

- `demo-portfolio.json` — the onboarding "load demo portfolio" dataset. Needs a mix of
  STOCK/ETF/MUTUAL_FUND/FD and at least one holding >25% weight (demo needs to show the
  concentration flag). NOTE: must stay in sync with `frontend/src/data/demoPortfolio.json` (deliberate duplicate — Vite can't reliably serve files outside its project root).
  Cost bases are set near the 18 Sep 2026 Yahoo prices (RELIANCE ~1,226, HDFCBANK ~731,
  NIFTYBEES ~266) so the Balance Sheet shows a plausible P&L against live quotes; RELIANCE
  stays at ~31% of the portfolio so the strict >25% concentration flag still fires.
- `fundamentals.json` — 15-20 demo securities with P/E, ROE, sector, sector-reference P/E,
  debt metric. Record `source` and `as_of` on every entry — never let the model fill a gap.
- `glossary.json` — curated term definitions backing `explain_financial_term`.
- Statement test fixtures (one PDF, 3 overlapping screenshots, one CSV, one pasted-text
  sample) — hand-checked totals, used by both the statement pipeline's tests and the demo
  video's cash-flow segment.
