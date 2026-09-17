"""Net worth math — pure, no I/O.

net_worth = total_assets - total_liabilities.
Assets = market-priced holdings + FD accrued value + cash (+ declared
fallback only when no holdings exist). Liabilities = loan outstanding.

Source rule: once any holdings exist, holdings-derived wins over
users.declared_net_worth_paise. The active source is always returned —
never silently switch. Without holdings, declared_net_worth_paise is the
user's stated total-asset figure (cash not added on top — presumed
included, never double-count).

Projection reuses finance/fire.py's assumption defaults and curve logic —
imported, never a second contradictory set.
"""

from __future__ import annotations

from datetime import date

from .fire import (
    contribution_at_age,
    default_assumptions,
    expense_at_age,
    goal_outflow_at_age,
    loan_outflow_at_age,
    post_fire_return_for_age,
    return_for_age,
)

__all__ = [
    "default_assumptions",  # re-exported: same object as fire's, by design
    "fd_accrued_value_paise",
    "calculate_net_worth",
    "emergency_fund_coverage_months",
    "project_net_worth",
]

DAYS_PER_YEAR = 365.25


def fd_accrued_value_paise(
    principal_paise: int,
    annual_rate: float,
    start_date: date,
    as_of: date,
    fd_type: str = "CUMULATIVE",
) -> float:
    """FD accrued value. CUMULATIVE: A = P*(1+r/4)^(4t) quarterly, t in
    fractional years. PAYOUT: principal only (interest is income)."""
    if fd_type == "PAYOUT":
        return float(principal_paise)
    elapsed_days = (as_of - start_date).days
    if elapsed_days <= 0:
        return float(principal_paise)
    t = elapsed_days / DAYS_PER_YEAR
    return float(principal_paise) * (1.0 + annual_rate / 4.0) ** (4.0 * t)


def calculate_net_worth(
    holdings_value_paise: int,
    fd_accrued_paise: float,
    cash_paise: int | None,
    declared_net_worth_paise: int | None,
    liabilities_paise: int,
    has_holdings: bool,
) -> dict:
    """Totals + which source is active."""
    cash = int(cash_paise or 0)
    liabilities = int(liabilities_paise or 0)
    if has_holdings:
        assets = int(holdings_value_paise or 0) + int(round(fd_accrued_paise or 0)) + cash
        source = "holdings"
    else:
        assets = int(declared_net_worth_paise or 0)
        source = "declared"
    return {
        "total_assets_paise": assets,
        "total_liabilities_paise": liabilities,
        "net_worth_paise": assets - liabilities,
        "source": source,
    }


def emergency_fund_coverage_months(
    cash_paise: int,
    monthly_expenses_paise: int,
    monthly_emi_paise_list: list[int] | None = None,
) -> float | None:
    """cash / (monthly expenses + active loan EMIs). None if no outflow."""
    monthly_outflow = int(monthly_expenses_paise or 0) + sum(
        monthly_emi_paise_list or []
    )
    if monthly_outflow <= 0:
        return None
    return float(cash_paise or 0) / monthly_outflow


def project_net_worth(inputs: dict, years: int = 30) -> list[dict]:
    """Invested-corpus projection sharing FIRE's age-stage assumptions.

    Before fire_age: accumulation (contribution at start, stage returns,
    goal outflows). From fire_age on: retirement drawdown at
    post_fire_return (expenses + goals + EMIs out each year end).
    Corpus floored at zero. Cash is excluded (emergency fund, not invested).
    """
    assumptions = default_assumptions(inputs)
    current_age = inputs["current_age"]
    fire_age = inputs.get("fire_age")
    annual_exp_today = float(inputs.get("monthly_expenses_paise") or 0) * 12.0
    base_annual = float(inputs.get("monthly_investment_paise") or 0) * 12.0
    goals = inputs.get("goals") or []
    loans = inputs.get("loans") or []
    corpus = float(inputs.get("current_invested_paise") or 0)

    curve = [{"age": current_age, "corpus_paise": int(round(corpus))}]
    for age in range(current_age, current_age + years):
        goals_out = sum(goal_outflow_at_age(g, age, current_age) for g in goals)
        loans_out = sum(loan_outflow_at_age(loan, age) for loan in loans)
        if fire_age is not None and age >= fire_age:
            expenses_out = expense_at_age(annual_exp_today, age, current_age,
                                          assumptions["inflation"])
            corpus = (corpus * (1.0 + post_fire_return_for_age(age, assumptions))
                      - expenses_out - goals_out - loans_out)
        else:
            contrib = contribution_at_age(base_annual, age, current_age,
                                          assumptions["step_up"])
            corpus = ((corpus + contrib)
                      * (1.0 + return_for_age(age, assumptions)) - goals_out)
        corpus = max(corpus, 0.0)
        curve.append({"age": age + 1, "corpus_paise": int(round(corpus))})
    return curve
