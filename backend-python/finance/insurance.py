"""Educational term- and health-cover estimates for Indian households.

This module does not name insurers, calculate premiums, or recommend products.
It is a pure estimate and is not insurance or financial advice.
"""

from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP


DISCLAIMER = "Educational insurance estimate only; not insurance or financial advice."
RETIREMENT_AGE = 60
EXPENSE_GROWTH = Decimal("0.06")
DISCOUNT_RATE = Decimal("0.07")
MEDICAL_INFLATION_MIN = Decimal("0.12")
MEDICAL_INFLATION_MAX = Decimal("0.14")


def _decimal(value: int | float | Decimal) -> Decimal:
    return Decimal(str(value))


def _paise(value: Decimal) -> int:
    return int(value.to_integral_value(rounding=ROUND_HALF_UP))


def _present_value_of_expenses(annual_expenses_paise: int, current_age: int) -> tuple[int, Decimal]:
    years = max(0, RETIREMENT_AGE - current_age)
    factor = sum(
        (Decimal(1) + EXPENSE_GROWTH) ** year
        / (Decimal(1) + DISCOUNT_RATE) ** (year + 1)
        for year in range(years)
    )
    return _paise(_decimal(annual_expenses_paise) * factor), factor


def _goal_present_value(goal: dict, current_age: int) -> int:
    goal_type = str(goal.get("goal_type", "")).upper()
    if goal_type not in {"EDUCATION", "WEDDING"}:
        return 0
    target_age = int(goal.get("target_age", current_age))
    years = max(0, target_age - current_age)
    amount = int(goal.get("amount_today_paise") or goal.get("amount_paise") or 0)
    if "amount_today_paise" in goal:
        growth = _decimal(
            goal.get(
                "inflation_rate",
                Decimal("0.10") if goal_type == "EDUCATION" else Decimal("0.06"),
            )
        )
        amount = _paise(_decimal(amount) * (Decimal(1) + growth) ** years)
    return _paise(_decimal(amount) / (Decimal(1) + DISCOUNT_RATE) ** years)


def _term_cover_estimate(values: dict) -> dict:
    annual_income = int(values.get("annual_income_paise") or 0)
    annual_expenses = int(
        values.get("annual_expenses_paise")
        or int(values.get("monthly_expenses_paise") or 0) * 12
    )
    current_age = int(values.get("current_age", 0))
    dependents = int(values.get("dependents_count") or 0)
    loans = values.get("loans") or []
    outstanding_loans = int(values.get("outstanding_loans_paise") or 0)
    outstanding_loans += sum(int(loan.get("outstanding_paise") or 0) for loan in loans)
    applicable = dependents > 0 or outstanding_loans > 0 or bool(loans)
    personal_cover = int(
        values.get("personal_term_cover_paise")
        if values.get("personal_term_cover_paise") is not None
        else values.get("existing_term_cover_paise")
        if values.get("existing_term_cover_paise") is not None
        else values.get("personal_cover_paise") or 0
    )
    employer_cover = int(
        values.get("employer_term_cover_paise")
        or values.get("employer_cover_paise")
        or 0
    )
    result = {
        "applicable": applicable,
        "rule_of_thumb_min_paise": annual_income * 10,
        "rule_of_thumb_max_paise": annual_income * 15,
        "existing_personal_cover_paise": personal_cover,
        "existing_employer_cover_paise": employer_cover,
        "income_replacement_pv_paise": None,
        "outstanding_loans_paise": outstanding_loans,
        "goals_pv_paise": None,
        "investments_paise": int(
            values.get("investments_paise")
            or values.get("investment_corpus_paise")
            or values.get("fire_corpus_paise")
            or 0
        ),
        "needs_based_paise": None,
        "gap_paise": None,
        "warnings": [],
        "disclaimer": DISCLAIMER,
    }
    if not applicable:
        result["reason"] = (
            "Term-cover gap is not applicable because there are no dependents and no outstanding loans."
        )
        return result

    income_pv, annuity_factor = _present_value_of_expenses(annual_expenses, current_age)
    goals_pv = sum(_goal_present_value(goal, current_age) for goal in values.get("goals") or [])
    investments = result["investments_paise"]
    needs = max(0, income_pv + outstanding_loans + goals_pv - investments)
    result.update(
        {
            "income_replacement_pv_paise": income_pv,
            "income_replacement_annuity_factor": float(annuity_factor),
            "goals_pv_paise": goals_pv,
            "needs_based_paise": needs,
            "gap_paise": max(0, needs - personal_cover),
        }
    )
    if employer_cover and not personal_cover:
        result["warnings"].append(
            "Employer cover is shown separately and does not reduce the personal-cover gap because it ends with the job."
        )
    return result


def _health_cover_estimate(values: dict) -> dict:
    tier = str(values.get("city_tier") or "TIER_2").upper().replace("-", "_")
    family = bool(values.get("family_floater") or values.get("is_family_floater"))
    guidance = {
        "METRO": (200000000, 250000000) if family else (100000000, 100000000),
        "TIER_2": (100000000, 150000000),
        "TIER_3": (50000000, 100000000),
    }
    if tier not in guidance:
        tier = "TIER_2"
    recommended_min, recommended_max = guidance[tier]
    personal = int(
        values.get("personal_health_cover_paise")
        if values.get("personal_health_cover_paise") is not None
        else values.get("existing_health_cover_paise")
        if values.get("existing_health_cover_paise") is not None
        else values.get("current_health_cover_paise") or 0
    )
    employer = int(
        values.get("employer_health_cover_paise")
        or values.get("employer_cover_paise")
        or 0
    )
    real_min = _paise(_decimal(personal) / (Decimal(1) + MEDICAL_INFLATION_MAX) ** 10)
    real_max = _paise(_decimal(personal) / (Decimal(1) + MEDICAL_INFLATION_MIN) ** 10)
    return {
        "city_tier": tier,
        "family_floater": family,
        "recommended_min_paise": recommended_min,
        "recommended_max_paise": recommended_max,
        "current_cover_paise": personal,
        "employer_cover_paise": employer,
        "gap_paise": max(0, recommended_min - personal),
        "ten_year_real_value_min_paise": real_min,
        "ten_year_real_value_max_paise": real_max,
        "ten_year_erosion_min_paise": max(0, personal - real_min),
        "ten_year_erosion_max_paise": max(0, personal - real_max),
        "ten_year_nominal_need_min_paise": _paise(
            _decimal(personal) * (Decimal(1) + MEDICAL_INFLATION_MIN) ** 10
        ),
        "ten_year_nominal_need_max_paise": _paise(
            _decimal(personal) * (Decimal(1) + MEDICAL_INFLATION_MAX) ** 10
        ),
        "medical_inflation_pct": {"min": 12.0, "max": 14.0},
        "guidance": (
            "Medical costs may rise 12-14% annually; the 10-year values show the purchasing power "
            "of current personal cover in today's terms. Employer cover is separate."
        ),
        "warnings": [],
        "disclaimer": DISCLAIMER,
    }


def estimate_insurance_needs(inputs: dict | None = None, **kwargs) -> dict:
    """Return term-cover and health-cover educational estimates."""
    values = dict(inputs or {})
    values.update(kwargs)
    return {
        "term_cover": _term_cover_estimate(values),
        "health_cover": _health_cover_estimate(values),
        "warnings": [],
        "disclaimer": DISCLAIMER,
    }


def estimate_term_cover_needs(**kwargs) -> dict:
    """Convenience wrapper for the term-cover portion of the estimate."""
    return _term_cover_estimate(kwargs)


def estimate_health_cover_guidance(**kwargs) -> dict:
    """Convenience wrapper for the health-cover portion of the estimate."""
    return _health_cover_estimate(kwargs)
