# ARIA v2 Task 2 report

## Delivered

- Added authenticated, query-only profile/holdings/loans reads with `NOT_FOUND` handling.
- Added deterministic EMI, prepayment, income-tax, capital-gains, insurance, credit-card,
  and short-term-fit tools. Model-facing money inputs/outputs cross the boundary as rupees;
  finance engines continue to receive paise.
- Added validated, write-free preview helpers for profile/risk, dashboard preferences,
  holdings, goals, loans, FIRE scenarios, and transaction-category changes.
- Expanded latest-turn routing so calculator and action requests select fresh relevant tools.

## TDD evidence

Focused RED was recorded with the new tests before production changes: 4 failures for missing
registry tools, missing `action_proposals`, and missing calculator implementation.

Focused GREEN:

```text
21 passed
```

Agent/finance focused suite after implementation:

```text
116 passed
```

## Concern

The repository's existing `test_only_shipped_tools_registered` still asserts the pre-ARIA-v2
registry allow-list, so the full legacy agent suite reports that one expected contract failure.
The new task registry intentionally includes the newly backed tools.
