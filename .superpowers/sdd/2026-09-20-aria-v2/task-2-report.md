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

## Fix round 1 TDD evidence

Added failing regression tests for all six review findings, including the locked
reduce-tenure prepayment mode, explicit proposal schemas, trusted-message binding, malformed
calculator inputs, warning envelopes, and routing precedence. Initial RED run: 6 failures.

After implementation, the complete agent/finance suite is green:

```text
134 passed
```

The contract allow-list now includes all newly shipped tools and retains only genuinely
unshipped names as bans.

## Fix round 2 TDD evidence

Added routing regressions proving read questions containing “change” do not select proposal
tools, while imperative edits still do. RED initially showed both read questions selecting
the action branch. The classifier now requires an imperative edit verb at the start of the
request (and rejects question-form input).

Focused runner tests: `18 passed`.
Full backend suite: `198 passed`.

## Fix round 3 TDD evidence

Added regressions for conversational explicit edits (`Can you update...` and `I want to
update...`). RED initially routed both to calculator/cashflow reads. Routing now recognizes
only explicit edit verbs in imperative or tightly bounded conversational request prefixes;
passive/historical change wording remains a read query.

Focused runner tests: `20 passed`.
Full backend suite: `200 passed`.
