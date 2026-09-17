# Financial calculation rules — must be deterministic, must be tested

This is the highest-risk area for silently-plausible bugs. Every formula below needs a unit
test before its endpoint is trusted by any UI or agent tool.

## Money & rounding

Store paise (integer). Never use binary float for a rupee balance. Numpy/float is fine for
ratio math (returns, volatility) but never for cash values.

## Holding value, weight, concentration

```text
V_i = quantity_i × price_i          V = Σ V_i          w_i = V_i / V × 100
```

**Denominator for weights/concentration**: all investment holdings **including FD**,
**excluding cash** (`users.cash_balance_paise` is never in the denominator).

**Concentration flag rule (locked):**
```text
STOCK/CRYPTO, weight_pct > 25   → severity "warning"    (strict >, not >=)
ETF/MUTUAL_FUND, weight_pct > 25 → severity "info"        (diversified fund ≠ single-name risk)
FD/CASH                          → never flagged
```
Exactly 25.00% is **not** flagged. Test cases: 24.99% no flag, exactly 25% no flag, 25.01%
flags.

Also aggregate by sector (`w_s`) and asset class — shown as percentages, no locked threshold
for sector concentration yet.

## Returns, volatility, drawdown

- Simple period return: `r_t = P_t / P_{t-1} - 1`. Upstox candles are **price return**
  (no dividend reinvestment) — label CAGR/drawdown accordingly, it will differ from a TRI
  figure.
- **Standard deviation: sample, `ddof=1`.** Pandas `.std()` defaults to `ddof=1`; **NumPy
  `np.std()` defaults to `ddof=0`** — this is a real, silent bug if the two get mixed. Lock
  `ddof=1` explicitly everywhere and test it.
- Annualizing: daily × `sqrt(252)`, monthly × `sqrt(12)`. (NSE actually has ~247-248 trading
  days/year — 252 is the industry convention anyway, used deliberately, label it as such.)
- **Corporate actions**: Upstox candle docs don't state whether prices are split/bonus
  adjusted. Day-1 test against RELIANCE's Oct 2024 1:1 bonus. If unadjusted, back-adjust using
  Upstox's Corporate Actions endpoint before computing any of the metrics below.
- CAGR: `(V_end/V_start)^(1/years) - 1`, `years = (end-start).days/365.25`. Only shown when
  `years >= 1`; otherwise show plain period return, never a misleading annualization.
- Max drawdown: running peak on closing prices, `drawdown_t = V_t/peak_t - 1`,
  `max_drawdown = min(drawdown_t)`. Return peak date + trough date alongside the number.
- **Sharpe**: `(mean_daily_excess × 252) / (std_daily × sqrt(252))`, daily risk-free =
  `rf/252`. Default `rf = 0.0526` (91-day T-bill, editable, show `rf_as_of`). Only computed
  with ≥ 1 year of daily data.
- **Portfolio volatility**: `sqrt(wᵀ Σ w)` — **never** a weighted average of individual
  volatilities. Σ from daily returns **inner-joined by date** across assets (MF NAV dates and
  stock trading dates won't line up). Require ≥ 120 aligned days or return
  `INSUFFICIENT_DATA` with the number of aligned days used, in the response.
- Unrealized P&L: `value - quantity × avg_buy_price`, paise + pct, skipped when no cost basis.

## FIRE — implementation contract {#fire-contract}

Keep FIRE logic in a pure module (`finance/fire.py`), independent of Lambda handlers and the
LLM. No AWS calls inside the math functions — inputs in, result out, unit-testable locally.

### Locked timing convention

- Annual steps, contributions paid **at the start** of each year, expenses withdrawn at
  **year end**, annual compounding, model runs through **age 91** inclusive.
- **Contribution step-up: default 6%/year** (tracks inflation — salaries rise). This is an
  explicit input, not hardcoded, but 6% is the default.
- Default assumptions: inflation 6%, returns 12% (<40) / 10% (40-60) / 8% (>60), post-FIRE
  return defaults to the same age-stage curve but is a separate editable field.
- FIRE corpus **excludes cash** (emergency fund), **includes FD**. EMIs and monthly expenses
  in the profile **exclude EMI** — loans are modeled separately from the `loans` table so
  their cash-flow impact isn't double-counted once a loan finishes.

### Formulas

Required corpus, backward recursion from end of modeled life (`C_92 = 0`):
```text
C_{a} = (C_{a+1} + E_a + G_a + L_a) / (1 + r_a)
  E_a = annual expenses inflated at 6% (or per-goal rate for goal-linked expense changes)
  G_a = one-time goal outflows landing at age a (own inflation rate, default 6%, EDUCATION 10%)
  L_a = EMI payments falling in age a (from the loans amortization schedule)
  r_a = age-stage return rate
```

Projected corpus, forward from current age:
```text
P_{a+1} = (P_a + contribution_a) × (1 + r_a) - G_a
  contribution_a = base_contribution × (1.06)^(a - current_age)     [step-up]
```

**FIRE age = first age A where P_A >= C_A.**

Show two numbers side by side in the UI:
1. Main PV-recursion result (above).
2. Conservative cross-check: age at which projected corpus reaches **30× that year's
   annual expenses** (≈3.33% withdrawal rate — more realistic than 4% for a 50-60yr Indian
   retirement horizon per ERN/freefincal research). Implied withdrawal rate shown next to the
   main FIRE age too.

### Locked regression fixture (write this test first)

Inputs: current age **17**, no goals, no loans, monthly expenses ₹10,000 today (₹1,20,000/yr),
monthly investment ₹10,000 today, current corpus ₹28,295, inflation 6%, **contribution
step-up 6%/yr**, lifespan 91, stage returns 12/10/8.

Expected: **FIRE age 31**, required corpus at 31 ≈ **₹56.71 lakh** (handoff's original number,
₹56.62L, was rounding — reconciled exactly with this convention). Conservative (30×) check on
the same inputs: **age 35**.

**If a code change moves this fixture's answer, that's a signal the timing convention broke
— fix the convention, don't just update the expected value.**

### Result shape
```json
{
  "fire_age": 31, "required_corpus_at_fire_paise": 5671000000,
  "projected_corpus_at_fire_paise": 5671000000, "implied_withdrawal_rate_pct": 4.8,
  "conservative_fire_age": 35, "progress_pct_today": 0.5,
  "assumptions": {"inflation": 0.06, "step_up": 0.06, "return_before_40": 0.12,
    "return_40_to_60": 0.10, "return_after_60": 0.08, "post_fire_return": null,
    "lifespan_age": 91},
  "required_curve": [], "projected_curve": [], "warnings": []
}
```
Never state a FIRE result as a certainty — always "under these assumptions."

## Net worth

`net_worth = total_assets - total_liabilities`. Assets: market-priced holdings + FD (accrued
value, not maturity value) + cash + manual. Liabilities: loan outstanding from the
amortization schedule (manual override allowed). Snapshots: one row/user/day. Projection
shares the same age-stage return assumptions as FIRE — **never a second contradictory model**.
Post-FIRE-age projection = retirement drawdown (expenses + goals + EMIs coming out of the
corpus), not continued accumulation.

**Which total wins**: once any holdings exist for a user, holdings-derived net worth **wins**
over `users.declared_net_worth_paise` (the onboarding fallback for someone who skipped adding
holdings). The UI must show which source is in use — don't silently switch without saying so.

**Emergency fund coverage** (shown on the Net worth / Overview page):
```text
coverage_months = cash_balance_paise / (monthly_expenses_paise + sum(active loan EMIs))
```
EMIs count in the denominator — an emergency still requires paying them.

## Loans / EMI

- EMI (reducing balance): `EMI = P·i·(1+i)^n / ((1+i)^n - 1)`, `i = annual_rate/12`.
- Indian default prepayment mode: **reduce tenure**, keep EMI fixed (saves ~3-4x more
  interest than reducing the EMI amount — this is also what most Indian banks default to).
- **RBI (Pre-payment Charges on Loans) Directions, 2025**: no prepayment charges on
  **floating-rate**, non-business loans to individuals, for loans **sanctioned/renewed on or
  after 2026-01-01**. `prepayment_charge_pct` defaults to 0 under those conditions; otherwise
  the user enters the bank's stated charge.

## FD / SIP

- FD cumulative: `A = P × (1 + r/4)^(4t)` (quarterly compounding — the Indian banking
  standard). Payout-type FDs are valued at principal; interest is income, not asset growth.
- SIP future value (annuity due, start-of-month contributions — matches SEBI/AMFI
  calculators): `FV = P × [((1+i)^n - 1)/i] × (1+i)`, `i = annual/12`.
- `sip_monthly_paise` on an MF holding is informational; `users.monthly_investment_paise`
  stays the single number FIRE uses. Warn if the sum of SIPs exceeds it.
- **Never invent a separate "SIP asset"** with its own price series. A SIP is a recurring
  contribution stream into an existing MF holding — it has no price of its own, only the
  underlying fund's NAV does.

## Goals

`future_cost = amount_today × (1 + inflation)^(target_age - current_age)`. Default inflation
6%, except `EDUCATION` which defaults **10%** (well-documented in India as running ~2x general
CPI — see sources). Both editable per goal.

## Required tests checklist (write these before trusting any endpoint/UI)

**Concentration**
- One holding at 24.99% → no flag. Exactly 25% → no flag (strict `>`). 25.01% → warning
  (STOCK/CRYPTO) or info (ETF/MUTUAL_FUND). Weights sum to ~100% within floating tolerance.

**Volatility**
- Constant-price series → zero volatility (edge case, don't divide by zero / NaN).
- A known small return series with a hand-computed expected std (`ddof=1`).
- Daily annualization uses `sqrt(252)`; monthly uses `sqrt(12)`.
- NaNs from `pct_change()` are dropped intentionally, not silently propagated.

**Portfolio volatility**
- 2-asset covariance test with known inputs.
- Perfectly-correlated vs uncorrelated assets behave as expected (higher vs lower portfolio
  vol than a naive average would suggest).
- Fewer than 120 aligned days → `INSUFFICIENT_DATA`, not a number.

**CAGR**
- Known start/end/years case matches a hand-computed value.
- Non-positive start value handled (doesn't crash, returns an error/warning).
- Sub-1-year period falls back to plain period return, not a misleading annualized number.

**Drawdown**
- Monotonically rising series → max drawdown = 0.
- A known peak-to-trough example matches a hand-computed value, with correct peak/trough
  dates returned.

**FIRE**
- No-goal baseline matches the locked regression fixture (age 17 → FIRE age 31, ≈₹56.71L).
- A one-time goal pushes FIRE age later (or leaves it the same) — **never earlier** from a
  sign error.
- Return-stage boundaries at ages 40 and 60 behave correctly (no off-by-one).
- Inflation increases future nominal expenses as expected.
- Contribution step-up compounds correctly year over year.

**Auth**
- Missing/invalid JWT → rejected (401).
- A token for user A cannot fetch user B's data (test with two real Cognito test users, not
  just unit-level mocking).
- A `user_id` sent in the request body/query is ignored — verify the helper never reads it.

**Statement pipeline**
- Parser on the known demo statement produces correct credit/debit totals.
- Basic recurring-merchant detection fixture (e.g. same merchant, same rough amount, monthly
  cadence) is flagged.
- Overlapping-screenshot dedupe produces the correct row count, not double-counted totals.

## Sources worth re-checking if numbers feel off

- 91-day T-bill yield (CEIC) — Sharpe risk-free default.
- Nifty 50 TRI since-inception ~12.4% CAGR, but 20yr rolling fell below 10% in FY26 — don't
  assume 12% forever holds; it's a modeling assumption, shown as such in the UI.
- RBI inflation target 4% ±2%; long-run CPI average ~5.8% (2000-2026) — 6% default is
  reasonably conservative.
- ERN Safe Withdrawal Rate series / freefincal — basis for the conservative 30x cross-check.
