"""Tests for finance/insurance.py â€” educational cover estimates only."""

import pytest

from finance.insurance import estimate_insurance_needs


def test_term_cover_not_applicable_without_dependents_or_loans():
    result = estimate_insurance_needs(
        annual_income_paise=120000000,
        annual_expenses_paise=60000000,
        current_age=30,
        dependents_count=0,
        outstanding_loans_paise=0,
        investments_paise=50000000,
        city_tier="METRO",
    )

    assert result["term_cover"]["applicable"] is False
    assert result["term_cover"]["gap_paise"] is None
    assert "not applicable" in result["term_cover"]["reason"].lower()


def test_employer_only_cover_does_not_reduce_personal_term_gap():
    result = estimate_insurance_needs(
        annual_income_paise=120000000,
        annual_expenses_paise=60000000,
        current_age=59,
        dependents_count=1,
        outstanding_loans_paise=10000000,
        investments_paise=0,
        personal_term_cover_paise=0,
        employer_term_cover_paise=50000000,
        city_tier="METRO",
    )

    term = result["term_cover"]
    assert term["applicable"] is True
    assert term["rule_of_thumb_min_paise"] == 1200000000
    assert term["rule_of_thumb_max_paise"] == 1800000000
    assert term["existing_employer_cover_paise"] == 50000000
    assert term["gap_paise"] == term["needs_based_paise"]
    assert term["gap_paise"] > 0


def test_term_needs_pv_includes_only_education_and_wedding_goals():
    base = estimate_insurance_needs(
        annual_income_paise=120000000,
        annual_expenses_paise=60000000,
        current_age=30,
        dependents_count=1,
        outstanding_loans_paise=0,
        investments_paise=10000000,
        personal_term_cover_paise=0,
        goals=[],
        city_tier="TIER_2",
    )
    with_goals = estimate_insurance_needs(
        annual_income_paise=120000000,
        annual_expenses_paise=60000000,
        current_age=30,
        dependents_count=1,
        outstanding_loans_paise=0,
        investments_paise=10000000,
        personal_term_cover_paise=0,
        goals=[
            {"goal_type": "EDUCATION", "amount_today_paise": 20000000, "target_age": 40},
            {"goal_type": "WEDDING", "amount_today_paise": 10000000, "target_age": 35},
            {"goal_type": "CAR", "amount_today_paise": 50000000, "target_age": 35},
        ],
        city_tier="TIER_2",
    )

    assert with_goals["term_cover"]["needs_based_paise"] > base["term_cover"]["needs_based_paise"]


@pytest.mark.parametrize(
    "city_tier,family,expected_min,expected_max",
    [
        ("METRO", False, 100000000, 100000000),
        ("METRO", True, 200000000, 250000000),
        ("TIER_2", False, 100000000, 150000000),
        ("TIER_3", False, 50000000, 100000000),
    ],
)
def test_health_guidance_by_city_tier(city_tier, family, expected_min, expected_max):
    result = estimate_insurance_needs(
        annual_income_paise=120000000,
        annual_expenses_paise=60000000,
        current_age=30,
        dependents_count=1,
        outstanding_loans_paise=1,
        city_tier=city_tier,
        family_floater=family,
        personal_health_cover_paise=100000000,
    )

    health = result["health_cover"]
    assert health["recommended_min_paise"] == expected_min
    assert health["recommended_max_paise"] == expected_max
    assert health["current_cover_paise"] == 100000000
    assert health["ten_year_real_value_min_paise"] < 100000000
    assert health["ten_year_real_value_max_paise"] < 100000000
    assert health["medical_inflation_pct"] == {"min": 12.0, "max": 14.0}
    assert "slab" not in health["guidance"].lower()

