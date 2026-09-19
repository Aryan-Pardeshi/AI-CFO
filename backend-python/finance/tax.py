"""Indian income-tax and capital-gains estimates for FY 2026-27.

Pure calculation helpers only. All monetary inputs and outputs are integer paise;
the returned values are educational estimates, not tax advice.
"""

from __future__ import annotations

from datetime import date


DISCLAIMER = "Estimate for FY 2026-27; not tax advice."
CESS_RATE_PCT = 4
MAX_TAXABLE_INCOME_PAISE = 500000000  # Rs 50 lakh
NEW_STANDARD_DEDUCTION_PAISE = 7500000
OLD_STANDARD_DEDUCTION_PAISE = 5000000
NEW_REBATE_LIMIT_PAISE = 120000000
NEW_REBATE_MAX_PAISE = 6000000
OLD_REBATE_LIMIT_PAISE = 50000000
OLD_REBATE_MAX_PAISE = 1250000
LTCG_ANNUAL_EXEMPTION_PAISE = 12500000  # Rs 1.25 lakh of equity LTCG per financial year

_SLABS = {
    "new": (
        (0, 40000000, 0),
        (40000000, 80000000, 5),
        (80000000, 120000000, 10),
        (120000000, 160000000, 15),
        (160000000, 200000000, 20),
        (200000000, 240000000, 25),
        (240000000, None, 30),
    ),
    "old": (
        (0, 25000000, 0),
        (25000000, 50000000, 5),
        (50000000, 100000000, 20),
        (100000000, None, 30),
    ),
}


def _slab_tax_paise(taxable_income_paise: int, regime: str) -> int:
    tax = 0
    for lower, upper, rate_pct in _SLABS[regime]:
        if taxable_income_paise <= lower:
            continue
        slab_amount = taxable_income_paise - lower
        if upper is not None:
            slab_amount = min(slab_amount, upper - lower)
        tax += slab_amount * rate_pct // 100
    return tax


def _resolve_inputs(
    income_paise: int | None,
    taxable_income_paise: int | None,
    gross_income_paise: int | None,
    annual_income_paise: int | None,
    standard_deduction_paise: int,
) -> tuple[int | None, int | None]:
    explicit_taxable = taxable_income_paise
    if explicit_taxable is not None:
        if explicit_taxable < 0:
            raise ValueError("taxable income cannot be negative")
        return None, int(explicit_taxable)

    gross = (
        gross_income_paise
        if gross_income_paise is not None
        else annual_income_paise
        if annual_income_paise is not None
        else income_paise
    )
    if gross is None:
        raise TypeError("income_paise or taxable_income_paise is required")
    if gross < 0:
        raise ValueError("income cannot be negative")
    return int(gross), max(0, int(gross) - standard_deduction_paise)


def _out_of_scope_result(
    regime: str,
    gross_income_paise: int | None,
    taxable_income_paise: int,
    standard_deduction_paise: int,
    warning: str,
) -> dict:
    return {
        "regime": regime,
        "gross_income_paise": gross_income_paise,
        "standard_deduction_paise": standard_deduction_paise,
        "taxable_income_paise": taxable_income_paise,
        "tax_before_rebate_paise": None,
        "rebate_paise": None,
        "tax_after_rebate_paise": None,
        "cess_paise": None,
        "tax_paise": None,
        "warnings": [warning],
        "disclaimer": DISCLAIMER,
    }


def estimate_income_tax(
    income_paise: int | None = None,
    regime: str = "new",
    *,
    taxable_income_paise: int | None = None,
    gross_income_paise: int | None = None,
    annual_income_paise: int | None = None,
    resident: bool = True,
    age: int | None = None,
    under_60: bool | None = None,
) -> dict:
    """Estimate income tax under one FY 2026-27 regime.

    ``income_paise`` is gross income and receives the regime's standard
    deduction. Pass ``taxable_income_paise`` when the deduction has already
    been applied. The scope is a resident individual under 60 with taxable
    income through Rs 50 lakh.
    """
    regime = regime.lower()
    if regime not in _SLABS:
        raise ValueError("regime must be 'new' or 'old'")
    standard_deduction = (
        NEW_STANDARD_DEDUCTION_PAISE if regime == "new" else OLD_STANDARD_DEDUCTION_PAISE
    )
    gross, taxable = _resolve_inputs(
        income_paise,
        taxable_income_paise,
        gross_income_paise,
        annual_income_paise,
        standard_deduction,
    )

    if not resident:
        return _out_of_scope_result(
            regime, gross, taxable, standard_deduction,
            "Out of scope: this estimate covers resident individuals only.",
        )
    if age is not None and age >= 60:
        return _out_of_scope_result(
            regime, gross, taxable, standard_deduction,
            "Out of scope: senior-citizen slabs are not modeled.",
        )
    if under_60 is False:
        return _out_of_scope_result(
            regime, gross, taxable, standard_deduction,
            "Out of scope: senior-citizen slabs are not modeled.",
        )
    if taxable > MAX_TAXABLE_INCOME_PAISE:
        return _out_of_scope_result(
            regime, gross, taxable, standard_deduction,
            "Out of scope: taxable income above Rs 50 lakh would require surcharge bands.",
        )

    tax_before_rebate = _slab_tax_paise(taxable, regime)
    rebate_limit = NEW_REBATE_LIMIT_PAISE if regime == "new" else OLD_REBATE_LIMIT_PAISE
    rebate_max = NEW_REBATE_MAX_PAISE if regime == "new" else OLD_REBATE_MAX_PAISE
    rebate = min(tax_before_rebate, rebate_max) if taxable <= rebate_limit else 0
    tax_after_rebate = tax_before_rebate - rebate
    cess = tax_after_rebate * CESS_RATE_PCT // 100
    warnings: list[str] = []
    if regime == "new" and taxable > NEW_REBATE_LIMIT_PAISE:
        warnings.append(
            "Marginal relief above Rs 12 lakh taxable income is not modeled; this is a slab estimate."
        )

    return {
        "regime": regime,
        "gross_income_paise": gross,
        "standard_deduction_paise": standard_deduction,
        "taxable_income_paise": taxable,
        "tax_before_rebate_paise": tax_before_rebate,
        "rebate_paise": rebate,
        "tax_after_rebate_paise": tax_after_rebate,
        "cess_paise": cess,
        "tax_paise": tax_after_rebate + cess,
        "warnings": warnings,
        "disclaimer": DISCLAIMER,
    }


def compare_tax_regimes(
    income_paise: int | None = None,
    *,
    gross_income_paise: int | None = None,
    annual_income_paise: int | None = None,
    taxable_income_paise: int | None = None,
    resident: bool = True,
    age: int | None = None,
    under_60: bool | None = None,
) -> dict:
    """Return new- and old-regime estimates and the lower result."""
    common = {
        "income_paise": income_paise,
        "gross_income_paise": gross_income_paise,
        "annual_income_paise": annual_income_paise,
        "taxable_income_paise": taxable_income_paise,
        "resident": resident,
        "age": age,
        "under_60": under_60,
    }
    new = estimate_income_tax(regime="new", **common)
    old = estimate_income_tax(regime="old", **common)
    warnings = list(dict.fromkeys(new["warnings"] + old["warnings"]))
    if new["tax_paise"] is None or old["tax_paise"] is None:
        lower = None
    elif new["tax_paise"] < old["tax_paise"]:
        lower = "new"
    elif old["tax_paise"] < new["tax_paise"]:
        lower = "old"
    else:
        lower = "equal"
    return {
        "new_regime": new,
        "old_regime": old,
        "lower_regime": lower,
        "warnings": warnings,
        "disclaimer": DISCLAIMER,
    }


def _parse_date(value: date | str | None) -> date | None:
    if value is None or isinstance(value, date):
        return value
    return date.fromisoformat(value)


def _capital_gains_result(
    *,
    gain_paise: int,
    taxable_gain_paise: int,
    tax_before_cess_paise: int,
    tax_rate_pct: float | None,
    tax_rate_type: str,
    warnings: list[str] | None = None,
    exemption_applied_paise: int = 0,
) -> dict:
    cess = tax_before_cess_paise * CESS_RATE_PCT // 100
    return {
        "gain_paise": gain_paise,
        "taxable_gain_paise": taxable_gain_paise,
        "exemption_applied_paise": exemption_applied_paise,
        "tax_rate_pct": tax_rate_pct,
        "tax_rate_type": tax_rate_type,
        "tax_before_cess_paise": tax_before_cess_paise,
        "cess_paise": cess,
        "tax_paise": tax_before_cess_paise + cess,
        "indexation_applied": False,
        "warnings": warnings or [],
        "disclaimer": DISCLAIMER,
    }


def estimate_capital_gains_tax(
    gain_paise: int,
    asset_type: str = "LISTED_EQUITY",
    holding_period_months: int | None = None,
    *,
    purchase_date: date | str | None = None,
    first_buy_date: date | str | None = None,
    sale_date: date | str | None = None,
    is_long_term: bool | None = None,
    taxable_income_paise: int | None = None,
    regime: str = "new",
    slab_rate_pct: float | None = None,
    annual_exemption_used_paise: int | None = None,
) -> dict:
    """Estimate tax for listed equity/equity-MF and post-Apr-2023 debt MFs.

    The Rs 1.25 lakh LTCG exemption belongs to the financial year, not to a
    single sale: pass ``annual_exemption_used_paise`` for equity LTCG already
    booked this year so only the remaining exemption is applied here.

    Equity is classified as STCG at 12 months or less and LTCG above 12
    months. Debt mutual funds bought after April 2023 are added to taxable
    income for a marginal slab estimate. Post-23 July 2024 indexation is not
    applied.
    """
    if gain_paise < 0:
        raise ValueError("capital gain cannot be negative")
    asset = asset_type.upper().replace("-", "_").replace(" ", "_")
    warnings: list[str] = []
    if asset in {"LISTED_EQUITY", "EQUITY", "EQUITY_MUTUAL_FUND", "MUTUAL_FUND_EQUITY"}:
        if is_long_term is not None:
            is_ltcg = is_long_term
        elif holding_period_months is not None:
            is_ltcg = holding_period_months > 12
        elif first_buy_date is not None and sale_date is not None:
            bought = _parse_date(first_buy_date)
            sold = _parse_date(sale_date)
            is_ltcg = (sold.year, sold.month, sold.day) > (
                bought.year + 1,
                bought.month,
                bought.day,
            )
        else:
            is_ltcg = False
        if is_ltcg:
            exemption_available = max(
                0,
                LTCG_ANNUAL_EXEMPTION_PAISE
                - max(0, int(annual_exemption_used_paise or 0)),
            )
            exemption_applied = min(gain_paise, exemption_available)
            taxable_gain = max(0, gain_paise - exemption_available)
            rate = 12.5
            kind = "listed_equity_ltcg"
            warnings.append(
                "The Rs 1.25 lakh equity LTCG exemption applies once per financial "
                f"year; Rs {exemption_applied // 100:,} of it is used by this sale, so "
                "any other equity LTCG booked this year shares the same limit "
                "(pass annual_exemption_used_paise)."
            )
        else:
            exemption_applied = 0
            taxable_gain = gain_paise
            rate = 20.0
            kind = "equity_stcg"
        tax_before_cess = int(round(taxable_gain * rate / 100))
        return _capital_gains_result(
            gain_paise=gain_paise,
            taxable_gain_paise=taxable_gain,
            tax_before_cess_paise=tax_before_cess,
            tax_rate_pct=rate,
            tax_rate_type=kind,
            warnings=warnings,
            exemption_applied_paise=exemption_applied,
        )

    if asset in {"DEBT_MUTUAL_FUND", "MUTUAL_FUND_DEBT", "DEBT_MF"}:
        bought_after_april_2023 = (
            _parse_date(purchase_date) or date(2023, 4, 2)
        ) > date(2023, 4, 1)
        if not bought_after_april_2023:
            warnings.append(
                "Only debt mutual funds bought after April 2023 are modeled in this branch."
            )
        if slab_rate_pct is not None:
            tax_before_cess = int(round(gain_paise * slab_rate_pct / 100))
            rate = slab_rate_pct
        elif taxable_income_paise is not None:
            before = estimate_income_tax(
                taxable_income_paise=taxable_income_paise,
                regime=regime,
            )
            after = estimate_income_tax(
                taxable_income_paise=taxable_income_paise + gain_paise,
                regime=regime,
            )
            if before["tax_paise"] is None or after["tax_paise"] is None:
                return {
                    "gain_paise": gain_paise,
                    "taxable_gain_paise": gain_paise,
                    "exemption_applied_paise": 0,
                    "tax_rate_pct": None,
                    "tax_rate_type": "slab",
                    "tax_before_cess_paise": None,
                    "cess_paise": None,
                    "tax_paise": None,
                    "indexation_applied": False,
                    "warnings": [
                        "Out of scope: the debt-fund slab estimate exceeds the income-tax scope.",
                    ],
                    "disclaimer": DISCLAIMER,
                }
            tax_before_cess = (
                after["tax_after_rebate_paise"]
                - before["tax_after_rebate_paise"]
            )
            rate = None
        else:
            raise TypeError("debt mutual fund estimates require taxable_income_paise or slab_rate_pct")
        return _capital_gains_result(
            gain_paise=gain_paise,
            taxable_gain_paise=gain_paise,
            tax_before_cess_paise=tax_before_cess,
            tax_rate_pct=rate,
            tax_rate_type="slab",
            warnings=warnings,
        )

    raise ValueError("asset_type must be listed equity, equity mutual fund, or debt mutual fund")
