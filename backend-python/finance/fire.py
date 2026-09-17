"""FIRE engine — pure, no AWS calls. Annual steps.

Timing convention (locked, pinned by regression fixture):
- Contributions at START of year, expenses withdrawn at YEAR END.
- Annual compounding, model runs through lifespan_age inclusive.
- Required corpus: backward recursion from C_(lifespan+1) = 0:
    C_a = (C_(a+1) + E_a + G_a + L_a) / (1 + r_a)
- Projected corpus: forward from current age:
    P_(a+1) = (P_a + contribution_a) * (1 + r_a) - G_a
    contribution_a = base_annual * (1 + step_up)^(a - current_age)
- FIRE age = first age A where P_A >= C_A.
- Conservative cross-check: first age where P_A >= 30 * E_A.

FIRE corpus excludes cash, includes FD (caller passes the right corpus in).
No certainty language anywhere in emitted strings.
"""

from __future__ import annotations

DEFAULTS = {
    "inflation": 0.06,
    "step_up": 0.06,
    "return_before_40": 0.12,
    "return_40_to_60": 0.10,
    "return_after_60": 0.08,
    "post_fire_return": None,
    "lifespan_age": 91,
}

GOAL_DEFAULT_INFLATION = 0.06
EDUCATION_DEFAULT_INFLATION = 0.10
CONSERVATIVE_MULTIPLE = 30


def default_assumptions(overrides: dict | None = None) -> dict:
    """Single source of age-stage return defaults.

    networth.py imports this — never a second, contradictory assumption set.
    """
    assumptions = dict(DEFAULTS)
    if overrides:
        for k, v in overrides.items():
            if v is not None and k in assumptions:
                assumptions[k] = v
    return assumptions


def return_for_age(age: int, assumptions: dict) -> float:
    """Stage boundaries: <40 -> before_40; 40..60 -> 40_to_60; >60 -> after_60."""
    if age < 40:
        return assumptions["return_before_40"]
    if age <= 60:
        return assumptions["return_40_to_60"]
    return assumptions["return_after_60"]


def post_fire_return_for_age(age: int, assumptions: dict) -> float:
    """Post-FIRE return if set, else the same age-stage curve."""
    if assumptions.get("post_fire_return") is not None:
        return assumptions["post_fire_return"]
    return return_for_age(age, assumptions)


def expense_at_age(
    annual_expenses_today: float, age: int, current_age: int, inflation: float
) -> float:
    return annual_expenses_today * (1.0 + inflation) ** (age - current_age)


def contribution_at_age(
    base_annual: float, age: int, current_age: int, step_up: float
) -> float:
    return base_annual * (1.0 + step_up) ** (age - current_age)


def goal_inflation_rate(goal: dict) -> float:
    if goal.get("inflation_rate") is not None:
        return goal["inflation_rate"]
    if goal.get("goal_type") == "EDUCATION":
        return EDUCATION_DEFAULT_INFLATION
    return GOAL_DEFAULT_INFLATION


def goal_outflow_at_age(goal: dict, age: int, current_age: int) -> float:
    """Future nominal cost of a one-time goal landing at `age` (0 otherwise)."""
    if goal.get("target_age") != age:
        return 0.0
    amount_today = float(goal.get("amount_today_paise") or 0)
    return amount_today * (1.0 + goal_inflation_rate(goal)) ** (age - current_age)


def loan_outflow_at_age(loan: dict, age: int) -> float:
    """Annual EMI outflow falling in `age` (0 once the loan ends)."""
    if age > int(loan.get("end_age", 0)):
        return 0.0
    return float(loan.get("annual_emi_paise") or 0)


def _goals_at_age(goals: list[dict], age: int, current_age: int) -> float:
    return sum(goal_outflow_at_age(g, age, current_age) for g in goals)


def _loans_at_age(loans: list[dict], age: int) -> float:
    return sum(loan_outflow_at_age(loan, age) for loan in loans)


def required_corpus_curve(inputs: dict, assumptions: dict) -> dict[int, float]:
    """Backward recursion C_a from end of modeled life (C_(life+1) = 0)."""
    current_age = inputs["current_age"]
    lifespan = assumptions["lifespan_age"]
    annual_exp = float(inputs["monthly_expenses_paise"]) * 12.0
    goals = inputs.get("goals") or []
    loans = inputs.get("loans") or []
    curve: dict[int, float] = {}
    next_c = 0.0
    for age in range(lifespan, current_age - 1, -1):
        outflow = (
            expense_at_age(annual_exp, age, current_age,
                           assumptions["inflation"])
            + _goals_at_age(goals, age, current_age)
            + _loans_at_age(loans, age)
        )
        curve[age] = (next_c + outflow) / (1.0 + return_for_age(age, assumptions))
        next_c = curve[age]
    return curve


def projected_corpus_curve(inputs: dict, assumptions: dict) -> dict[int, float]:
    """Forward accumulation P_a from current corpus (contributions at start)."""
    current_age = inputs["current_age"]
    lifespan = assumptions["lifespan_age"]
    base_annual = float(inputs["monthly_investment_paise"]) * 12.0
    goals = inputs.get("goals") or []
    curve: dict[int, float] = {current_age: float(inputs["current_corpus_paise"])}
    for age in range(current_age, lifespan + 1):
        contrib = contribution_at_age(base_annual, age, current_age,
                                      assumptions["step_up"])
        curve[age + 1] = (
            (curve[age] + contrib) * (1.0 + return_for_age(age, assumptions))
            - _goals_at_age(goals, age, current_age)
        )
    return curve


def calculate_fire(inputs: dict) -> dict:
    """Main PV-recursion FIRE age + 30x conservative cross-check.

    Inputs (paise ints, plain values): current_age, monthly_expenses_paise,
    monthly_investment_paise, current_corpus_paise, goals, loans, plus
    assumption overrides (inflation, step_up, return_*, post_fire_return,
    lifespan_age). Returns a FireResult-shaped dict.
    """
    assumptions = default_assumptions(inputs)
    current_age = inputs["current_age"]
    lifespan = assumptions["lifespan_age"]
    required = required_corpus_curve(inputs, assumptions)
    projected = projected_corpus_curve(inputs, assumptions)
    annual_exp_today = float(inputs["monthly_expenses_paise"]) * 12.0
    warnings: list[str] = []

    fire_age = None
    for age in range(current_age, lifespan + 1):
        if projected[age] >= required[age]:
            fire_age = age
            break
    if fire_age is None:
        warnings.append(
            "FIRE age not reached by age %d under these assumptions; "
            "higher contributions or lower expenses would be needed." % lifespan
        )

    conservative_age = None
    for age in range(current_age, lifespan + 1):
        if projected[age] >= CONSERVATIVE_MULTIPLE * expense_at_age(
            annual_exp_today, age, current_age, assumptions["inflation"]
        ):
            conservative_age = age
            break

    if fire_age is not None:
        req_at_fire = required[fire_age]
        proj_at_fire = projected[fire_age]
        exp_at_fire = expense_at_age(annual_exp_today, fire_age, current_age,
                                     assumptions["inflation"])
        implied_wdr = exp_at_fire / req_at_fire * 100.0 if req_at_fire > 0 else None
    else:
        req_at_fire = None
        proj_at_fire = None
        implied_wdr = None

    current_corpus = float(inputs["current_corpus_paise"])
    progress = (
        current_corpus / req_at_fire * 100.0
        if fire_age is not None and req_at_fire
        else 0.0
    )

    to_curve = lambda curve: [
        {"age": age, "corpus_paise": int(round(curve[age]))}
        for age in range(current_age, lifespan + 1)
    ]
    return {
        "fire_age": fire_age,
        "required_corpus_at_fire_paise": (
            int(round(req_at_fire)) if req_at_fire is not None else None
        ),
        "projected_corpus_at_fire_paise": (
            int(round(proj_at_fire)) if proj_at_fire is not None else None
        ),
        "implied_withdrawal_rate_pct": implied_wdr,
        "conservative_fire_age": conservative_age,
        "progress_pct_today": progress,
        "assumptions": {
            "inflation": assumptions["inflation"],
            "step_up": assumptions["step_up"],
            "return_before_40": assumptions["return_before_40"],
            "return_40_to_60": assumptions["return_40_to_60"],
            "return_after_60": assumptions["return_after_60"],
            "post_fire_return": assumptions["post_fire_return"],
            "lifespan_age": assumptions["lifespan_age"],
        },
        "required_curve": to_curve(required),
        "projected_curve": to_curve(projected),
        "warnings": warnings,
    }


def simulate_goal_impact(baseline_inputs: dict, candidate_goal: dict) -> dict:
    """Run engine with and without one added goal; return both ages + delta."""
    baseline = calculate_fire(baseline_inputs)
    with_goal = calculate_fire(
        {**baseline_inputs,
         "goals": list(baseline_inputs.get("goals") or []) + [candidate_goal]}
    )
    base_age = baseline["fire_age"]
    goal_age = with_goal["fire_age"]
    if base_age is not None and goal_age is not None:
        delta = goal_age - base_age
    elif base_age is None and goal_age is None:
        delta = 0
    elif base_age is None:
        delta = None  # already unreachable; goal changes nothing measurable
    else:
        delta = None  # goal made FIRE unreachable
    return {
        "baseline_fire_age": base_age,
        "with_goal_fire_age": goal_age,
        "delta_years": delta,
        "baseline_required_corpus_paise": baseline[
            "required_corpus_at_fire_paise"],
        "with_goal_required_corpus_paise": with_goal[
            "required_corpus_at_fire_paise"],
    }
