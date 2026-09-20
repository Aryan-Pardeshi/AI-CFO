"""Pure financial calculation engine for ARIA Portfolio Fit assessment.

Rules:
- Numbers first, AI second: pure deterministic Python, no LLM, no boto3.
- Integer paise throughout; weights in basis points (bps, 100 bps = 1.00%).
- Single-stock concentration ceiling: strictly > 25.00% is flagged CAUTION.
- Denominator excludes cash, includes FD (per finance-rules.md).
- If required profile or quote data is missing, returns INSUFFICIENT_DATA with explicit reasons.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any


def calculate_portfolio_fit(
    *,
    user_profile: dict[str, Any] | None,
    holdings: list[dict[str, Any]],
    security: dict[str, Any] | None,
    add_amount_paise: int,
    quote: dict[str, Any] | None,
    source: str = "UPSTOX",
    as_of: str | None = None,
) -> dict[str, Any]:
    """Calculate deterministic portfolio fit factors and assessment.

    Returns the exact contract shape:
    {
        "assessment": "POTENTIAL_FIT" | "NEEDS_REVIEW" | "INSUFFICIENT_DATA",
        "inputs": {
            "add_amount_paise": int,
            "portfolio_value_before_paise": int,
            "portfolio_value_after_paise": int,
        },
        "allocation": {
            "current_weight_bps": int,
            "projected_weight_bps": int,
        },
        "factors": [
            {"key": str, "status": "ALIGNS"|"CAUTION"|"UNKNOWN", "title": str, "detail": str}
        ],
        "warnings": list[str],
        "source": str,
        "as_of": str,
    }
    """
    now_iso = as_of or datetime.now(timezone.utc).isoformat()
    warnings: list[str] = []

    # Validate amount
    if not isinstance(add_amount_paise, int) or add_amount_paise <= 0:
        return {
            "assessment": "INSUFFICIENT_DATA",
            "inputs": {
                "add_amount_paise": add_amount_paise if isinstance(add_amount_paise, int) else 0,
                "portfolio_value_before_paise": 0,
                "portfolio_value_after_paise": 0,
            },
            "allocation": {
                "current_weight_bps": 0,
                "projected_weight_bps": 0,
            },
            "factors": [],
            "warnings": ["add_amount_paise must be a positive integer in paise"],
            "source": source,
            "as_of": now_iso,
        }

    # Validate security metadata
    if not security or not security.get("symbol") or not security.get("asset_type"):
        return {
            "assessment": "INSUFFICIENT_DATA",
            "inputs": {
                "add_amount_paise": add_amount_paise,
                "portfolio_value_before_paise": 0,
                "portfolio_value_after_paise": 0,
            },
            "allocation": {
                "current_weight_bps": 0,
                "projected_weight_bps": 0,
            },
            "factors": [],
            "warnings": ["Security identification or classification data is missing"],
            "source": source,
            "as_of": now_iso,
        }

    # Validate quote
    if not quote or quote.get("last_price_paise") is None:
        return {
            "assessment": "INSUFFICIENT_DATA",
            "inputs": {
                "add_amount_paise": add_amount_paise,
                "portfolio_value_before_paise": 0,
                "portfolio_value_after_paise": 0,
            },
            "allocation": {
                "current_weight_bps": 0,
                "projected_weight_bps": 0,
            },
            "factors": [],
            "warnings": ["Live quote is unavailable for this security"],
            "source": source,
            "as_of": now_iso,
        }

    # Validate user profile
    if not user_profile:
        return {
            "assessment": "INSUFFICIENT_DATA",
            "inputs": {
                "add_amount_paise": add_amount_paise,
                "portfolio_value_before_paise": 0,
                "portfolio_value_after_paise": 0,
            },
            "allocation": {
                "current_weight_bps": 0,
                "projected_weight_bps": 0,
            },
            "factors": [],
            "warnings": ["User profile not found. Please complete onboarding first."],
            "source": source,
            "as_of": now_iso,
        }

    # Calculate portfolio values (excluding CASH, including FD)
    symbol = (security.get("symbol") or "").upper()
    instrument_key = security.get("instrument_key")
    asset_type = (security.get("asset_type") or "STOCK").upper()
    sector = security.get("sector")

    invested_holdings = [h for h in holdings if h.get("asset_type") != "CASH"]
    total_value_before = sum(int(h.get("value_paise") or 0) for h in invested_holdings)
    total_value_after = total_value_before + add_amount_paise

    # Find existing holding if any
    current_holding_value = 0
    for h in invested_holdings:
        h_key = h.get("instrument_key")
        h_sym = (h.get("symbol") or "").upper()
        if (instrument_key and h_key == instrument_key) or (symbol and h_sym == symbol):
            current_holding_value += int(h.get("value_paise") or 0)

    projected_holding_value = current_holding_value + add_amount_paise

    current_weight_bps = (
        int(round((current_holding_value / total_value_before) * 10000))
        if total_value_before > 0
        else 0
    )
    projected_weight_bps = (
        int(round((projected_holding_value / total_value_after) * 10000))
        if total_value_after > 0
        else 10000
    )

    factors: list[dict[str, Any]] = []
    has_caution = False
    has_unknown_critical = False

    # Factor 1: Risk Profile Compatibility
    risk_profile = user_profile.get("risk_profile")
    if not risk_profile:
        factors.append({
            "key": "risk_profile",
            "status": "UNKNOWN",
            "title": "Risk Profile Not Set",
            "detail": "No risk profile was recorded. Complete the onboarding quiz to evaluate risk suitability.",
        })
        has_unknown_critical = True
        warnings.append("User risk profile is missing")
    else:
        risk_str = str(risk_profile).upper()
        if asset_type == "STOCK":
            if risk_str == "CONSERVATIVE":
                factors.append({
                    "key": "risk_profile",
                    "status": "CAUTION",
                    "title": "Equity Volatility Caution",
                    "detail": "Direct equities carry individual company risk and volatility that may exceed a conservative risk tolerance.",
                })
                has_caution = True
            elif risk_str == "MODERATE":
                factors.append({
                    "key": "risk_profile",
                    "status": "ALIGNS",
                    "title": "Moderate Growth Fit",
                    "detail": f"{symbol} can serve as a selective growth holding within a balanced, multi-asset portfolio.",
                })
            else:  # AGGRESSIVE
                factors.append({
                    "key": "risk_profile",
                    "status": "ALIGNS",
                    "title": "Aggressive Growth Alignment",
                    "detail": f"Direct equity in {symbol} aligns with your aggressive profile targeting higher capital growth.",
                })
        elif asset_type == "ETF":
            # Check if this ETF has a verified low-risk / debt / conservative classification
            is_conservative_etf = (
                (security.get("risk_category") or "").upper() in {"CONSERVATIVE", "LOW_RISK", "DEBT", "LIQUID"}
                or (security.get("sector") or "").upper() in {"DEBT", "LIQUID", "OVERNIGHT"}
            )
            if risk_str == "CONSERVATIVE":
                if is_conservative_etf:
                    factors.append({
                        "key": "risk_profile",
                        "status": "ALIGNS",
                        "title": "Capital Preservation Fit",
                        "detail": f"Low-volatility ETF '{symbol}' aligns with your conservative risk profile.",
                    })
                else:
                    factors.append({
                        "key": "risk_profile",
                        "status": "INSUFFICIENT_DATA",
                        "title": "Risk Classification Insufficient",
                        "detail": f"Risk classification for ETF '{symbol}' is not verified as conservative. Equity and index ETFs carry market volatility that requires verified risk classification before assessing conservative compatibility.",
                    })
                    has_unknown_critical = True
                    warnings.append(f"Risk classification for ETF '{symbol}' is unverified for conservative profile")
            elif risk_str == "MODERATE":
                factors.append({
                    "key": "risk_profile",
                    "status": "ALIGNS",
                    "title": "Core Allocation Fit",
                    "detail": "ETFs provide diversified market exposure that serves as an efficient building block for your moderate strategy.",
                })
            else:  # AGGRESSIVE
                factors.append({
                    "key": "risk_profile",
                    "status": "ALIGNS",
                    "title": "Aggressive Core Fit",
                    "detail": "ETFs provide diversified market exposure aligned with long-term equity growth.",
                })
        else:
            factors.append({
                "key": "risk_profile",
                "status": "ALIGNS",
                "title": "Asset Profile Fit",
                "detail": f"{asset_type} holding is compatible with your risk profile.",
            })

    # Factor 2: Concentration Effect
    projected_pct = projected_weight_bps / 100.0
    if asset_type == "STOCK":
        if projected_weight_bps > 2500:  # strictly > 25.00%
            factors.append({
                "key": "concentration",
                "status": "CAUTION",
                "title": "Single-Stock Concentration Ceiling Exceeded",
                "detail": f"Projected allocation of {projected_pct:.2f}% exceeds the 25.00% single-stock concentration guideline.",
            })
            has_caution = True
        else:
            factors.append({
                "key": "concentration",
                "status": "ALIGNS",
                "title": "Concentration Within Limits",
                "detail": f"Projected allocation of {projected_pct:.2f}% remains within the 25.00% single-holding limit.",
            })
    elif asset_type == "ETF":
        if projected_weight_bps > 2500:
            factors.append({
                "key": "concentration",
                "status": "ALIGNS",
                "title": "High Diversified Allocation",
                "detail": f"Projected allocation is {projected_pct:.2f}%. As an ETF, this represents diversified underlying securities rather than single-name risk.",
            })
        else:
            factors.append({
                "key": "concentration",
                "status": "ALIGNS",
                "title": "Balanced Allocation",
                "detail": f"Projected allocation of {projected_pct:.2f}% maintains balanced portfolio distribution.",
            })
    else:
        factors.append({
            "key": "concentration",
            "status": "ALIGNS",
            "title": "Allocation Impact",
            "detail": f"Projected weight will be {projected_pct:.2f}%.",
        })

    # Factor 3: Investment Horizon Compatibility
    horizon = user_profile.get("investment_horizon_years")
    if horizon is None:
        factors.append({
            "key": "investment_horizon",
            "status": "UNKNOWN",
            "title": "Horizon Not Specified",
            "detail": "Investment horizon is not specified in your profile.",
        })
        warnings.append("Investment horizon is not recorded in profile")
    else:
        try:
            horizon_int = int(horizon)
        except (ValueError, TypeError):
            horizon_int = 0
        if horizon_int < 3:
            factors.append({
                "key": "investment_horizon",
                "status": "CAUTION",
                "title": "Short Investment Horizon",
                "detail": f"Your stated horizon is {horizon_int} year{'s' if horizon_int != 1 else ''}. Equities and ETFs typically require a 3–5+ year horizon to manage market downturns.",
            })
            has_caution = True
        else:
            factors.append({
                "key": "investment_horizon",
                "status": "ALIGNS",
                "title": "Horizon Compatibility",
                "detail": f"Your {horizon_int}-year horizon provides ample time to navigate equity market cycles.",
            })

    # Factor 4: Diversification / Sector Overlap (Shown informationally without arbitrary threshold)
    if sector:
        current_sector_value = sum(
            int(h.get("value_paise") or 0)
            for h in invested_holdings
            if (h.get("sector") or "").upper() == sector.upper()
        )
        projected_sector_value = current_sector_value + add_amount_paise
        projected_sector_bps = (
            int(round((projected_sector_value / total_value_after) * 10000))
            if total_value_after > 0
            else 0
        )
        projected_sector_pct = projected_sector_bps / 100.0

        if current_sector_value > 0:
            current_sector_pct = (current_sector_value / total_value_before * 100.0) if total_value_before > 0 else 0.0
            factors.append({
                "key": "diversification",
                "status": "INFO",
                "title": f"Sector Exposure ({sector})",
                "detail": f"Adjusts your existing {sector} exposure from {current_sector_pct:.1f}% to {projected_sector_pct:.1f}% of invested portfolio.",
            })
        else:
            factors.append({
                "key": "diversification",
                "status": "INFO",
                "title": f"New Sector Exposure ({sector})",
                "detail": f"Introduces new exposure to {sector} ({projected_sector_pct:.1f}% of invested portfolio).",
            })
    else:
        factors.append({
            "key": "diversification",
            "status": "INFO",
            "title": "Broad Market Participation",
            "detail": "Adds market exposure without creating identifiable single-sector clustering.",
        })

    # Determine overall assessment
    if has_unknown_critical:
        assessment = "INSUFFICIENT_DATA"
    elif has_caution:
        assessment = "NEEDS_REVIEW"
    else:
        assessment = "POTENTIAL_FIT"

    return {
        "assessment": assessment,
        "inputs": {
            "add_amount_paise": add_amount_paise,
            "portfolio_value_before_paise": total_value_before,
            "portfolio_value_after_paise": total_value_after,
        },
        "allocation": {
            "current_weight_bps": current_weight_bps,
            "projected_weight_bps": projected_weight_bps,
        },
        "factors": factors,
        "warnings": warnings,
        "source": source,
        "as_of": now_iso,
    }
