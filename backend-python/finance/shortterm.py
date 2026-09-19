"""Historical rolling-window analysis for short-term fit, without signals."""

from __future__ import annotations

from statistics import median


DISCLAIMER = "Historical estimate only; not financial advice and not a prediction."
TAX_RATE_NOTE = (
    "Equity held under 12 months is taxed at 20% STCG; debt mutual funds are taxed at slab rate."
)


def _price(value) -> float:
    if isinstance(value, dict):
        value = value.get("price", value.get("close", value.get("value")))
    return float(value)


def _base_result(status: str, windows_analyzed: int) -> dict:
    return {
        "status": status,
        "windows_analyzed": windows_analyzed,
        "worst_return_pct": None,
        "median_return_pct": None,
        "best_return_pct": None,
        "loss_window_pct": None,
        "loss_percentage_pct": None,
        "percentage_windows_with_loss": None,
        "max_drawdown_pct": None,
        "maximum_drawdown_pct": None,
        "tax_rate_note": TAX_RATE_NOTE,
        "warnings": [],
        "disclaimer": DISCLAIMER,
    }


def analyze_short_term_fit(price_history, horizon_months: int) -> dict:
    """Analyze every rolling horizon window in a plain price sequence.

    A horizon of N months needs N+1 monthly prices. Returns are percentages,
    while the input prices are treated only as ratio data, not as money.
    """
    if horizon_months < 1:
        raise ValueError("horizon_months must be at least 1")
    prices = [_price(value) for value in price_history]
    if any(price <= 0 for price in prices):
        raise ValueError("price history values must be positive")
    window_size = horizon_months + 1
    window_count = max(0, len(prices) - window_size + 1)
    if window_count == 0:
        result = _base_result("INSUFFICIENT_DATA", 0)
        result["warnings"].append(
            "Insufficient data: at least horizon_months + 1 price points are required."
        )
        return result

    returns = [
        (prices[start + horizon_months] / prices[start] - 1.0) * 100.0
        for start in range(window_count)
    ]
    max_drawdown = 0.0
    for start in range(window_count):
        window = prices[start : start + window_size]
        peak = window[0]
        for price in window:
            peak = max(peak, price)
            max_drawdown = min(max_drawdown, (price / peak - 1.0) * 100.0)
    loss_window_pct = sum(return_pct < 0 for return_pct in returns) / window_count * 100.0
    result = _base_result("OK", window_count)
    result.update(
        {
            "worst_return_pct": min(returns),
            "median_return_pct": median(returns),
            "best_return_pct": max(returns),
            "loss_window_pct": loss_window_pct,
            "loss_percentage_pct": loss_window_pct,
            "percentage_windows_with_loss": loss_window_pct,
            "max_drawdown_pct": max_drawdown,
            "maximum_drawdown_pct": max_drawdown,
        }
    )
    return result
