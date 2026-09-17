"""Shared DTOs — mirror contracts/openapi.yaml schemas.

Conventions: money integer paise (never float), snake_case, rates as
decimal fraction, _pct fields 0-100, dates YYYY-MM-DD, timestamps ISO 8601 UTC.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Any, Optional

from pydantic import BaseModel, Field

from .enums import (
    AssetType,
    ChatJobStatus,
    Direction,
    ErrorCode,
    FdType,
    FlagSeverity,
    GoalType,
    HoldingSource,
    LoanType,
    RateType,
    RiskProfile,
    StatementStatus,
    StrategyGoal,
    TxnCategory,
)


class ErrorDetail(BaseModel):
    code: ErrorCode
    message: str
    details: Optional[dict[str, Any]] = None


class ErrorResponse(BaseModel):
    error: ErrorDetail


class UserProfile(BaseModel):
    user_id: Optional[str] = Field(default=None, description="Cognito sub")
    name: Optional[str] = None
    date_of_birth: Optional[date] = None
    base_currency: str = "INR"
    monthly_income_paise: Optional[int] = None
    monthly_expenses_paise: Optional[int] = Field(default=None, description="excludes EMIs")
    monthly_investment_paise: Optional[int] = None
    declared_net_worth_paise: Optional[int] = None
    cash_balance_paise: Optional[int] = None
    emergency_fund_target_months: int = 6
    risk_profile: Optional[RiskProfile] = None
    risk_score: Optional[int] = None
    investment_horizon_years: Optional[int] = None
    strategy_goal: Optional[StrategyGoal] = None
    dependents_count: Optional[int] = None
    existing_term_cover_paise: Optional[int] = None
    existing_health_cover_paise: Optional[int] = None
    employment_type: Optional[str] = None
    city_tier: Optional[str] = None
    onboarding_step: Optional[int] = None
    onboarded: Optional[bool] = None


class Holding(BaseModel):
    holding_id: Optional[str] = None
    asset_type: Optional[AssetType] = None
    source: Optional[HoldingSource] = None
    instrument_key: Optional[str] = None
    symbol: Optional[str] = None
    isin: Optional[str] = None
    name: Optional[str] = None
    quantity: Optional[float] = None
    avg_buy_price_paise: Optional[int] = None
    first_buy_date: Optional[date] = None
    manual_current_value_paise: Optional[int] = None
    sector: Optional[str] = None
    sip_monthly_paise: Optional[int] = None
    fd_type: Optional[FdType] = None
    fd_principal_paise: Optional[int] = None
    fd_annual_rate: Optional[float] = None
    fd_start_date: Optional[date] = None
    fd_maturity_date: Optional[date] = None


class Goal(BaseModel):
    goal_id: Optional[str] = None
    name: Optional[str] = None
    goal_type: Optional[GoalType] = None
    amount_today_paise: Optional[int] = None
    target_age: Optional[int] = None
    inflation_rate: Optional[float] = Field(
        default=None, description="default 0.10 for EDUCATION, else 0.06"
    )
    priority: Optional[int] = None


class Loan(BaseModel):
    loan_id: Optional[str] = None
    name: Optional[str] = None
    loan_type: Optional[LoanType] = None
    principal_paise: Optional[int] = None
    outstanding_paise: Optional[int] = None
    annual_rate: Optional[float] = None
    tenure_months: Optional[int] = None
    start_date: Optional[date] = None
    rate_type: Optional[RateType] = None
    prepayment_charge_pct: float = 0


class PortfolioHolding(BaseModel):
    holding_id: Optional[str] = None
    symbol: Optional[str] = None
    asset_type: Optional[AssetType] = None
    quantity: Optional[float] = None
    price_paise: Optional[int] = None
    value_paise: Optional[int] = None
    weight_pct: Optional[float] = None
    pnl_paise: Optional[int] = None
    price_as_of: Optional[datetime] = None


class AllocationEntry(BaseModel):
    key: Optional[str] = None
    value_paise: Optional[int] = None
    weight_pct: Optional[float] = None


class PortfolioRisk(BaseModel):
    annualized_volatility_pct: Optional[float] = None
    volatility_basis: Optional[str] = None
    max_drawdown_pct: Optional[float] = None
    cagr_pct: Optional[float] = None
    lookback: Optional[str] = None


class PortfolioFlag(BaseModel):
    code: Optional[str] = None
    symbol: Optional[str] = None
    weight_pct: Optional[float] = None
    threshold_pct: Optional[float] = None
    severity: Optional[FlagSeverity] = None


class PortfolioAnalysis(BaseModel):
    as_of: Optional[datetime] = None
    price_source: Optional[str] = None
    total_value_paise: Optional[int] = None
    total_cost_paise: Optional[int] = None
    unrealized_pnl_paise: Optional[int] = None
    unrealized_pnl_pct: Optional[float] = None
    holdings: list[PortfolioHolding] = Field(default_factory=list)
    allocation_by_asset_type: list[AllocationEntry] = Field(default_factory=list)
    allocation_by_sector: list[AllocationEntry] = Field(default_factory=list)
    risk: Optional[PortfolioRisk] = None
    flags: list[PortfolioFlag] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class FireAssumptions(BaseModel):
    inflation: Optional[float] = None
    step_up: Optional[float] = None
    return_before_40: Optional[float] = None
    return_40_to_60: Optional[float] = None
    return_after_60: Optional[float] = None
    post_fire_return: Optional[float] = None
    lifespan_age: Optional[int] = None


class FireResult(BaseModel):
    fire_age: Optional[int] = None
    required_corpus_at_fire_paise: Optional[int] = None
    projected_corpus_at_fire_paise: Optional[int] = None
    implied_withdrawal_rate_pct: Optional[float] = None
    conservative_fire_age: Optional[int] = None
    progress_pct_today: Optional[float] = None
    assumptions: Optional[FireAssumptions] = None
    required_curve: list[dict[str, Any]] = Field(default_factory=list)
    projected_curve: list[dict[str, Any]] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


# Re-export enums also referenced by table rows (not full DTOs in openapi.yaml).
__all__ = [
    "AssetType",
    "HoldingSource",
    "RiskProfile",
    "StrategyGoal",
    "GoalType",
    "LoanType",
    "RateType",
    "Direction",
    "TxnCategory",
    "StatementStatus",
    "ChatJobStatus",
    "FlagSeverity",
    "FdType",
    "ErrorCode",
    "ErrorDetail",
    "ErrorResponse",
    "UserProfile",
    "Holding",
    "Goal",
    "Loan",
    "PortfolioAnalysis",
    "PortfolioHolding",
    "PortfolioRisk",
    "PortfolioFlag",
    "AllocationEntry",
    "FireResult",
    "FireAssumptions",
]
