"""Shared enums — mirror contracts/openapi.yaml exactly. Do not invent values."""

from enum import Enum


class AssetType(str, Enum):
    STOCK = "STOCK"
    ETF = "ETF"
    MUTUAL_FUND = "MUTUAL_FUND"
    FD = "FD"
    CASH = "CASH"
    CRYPTO = "CRYPTO"
    OTHER = "OTHER"


class HoldingSource(str, Enum):
    UPSTOX = "UPSTOX"
    MANUAL = "MANUAL"
    DEMO = "DEMO"
    IMPORTED = "IMPORTED"


class RiskProfile(str, Enum):
    CONSERVATIVE = "CONSERVATIVE"
    MODERATE = "MODERATE"
    AGGRESSIVE = "AGGRESSIVE"


class StrategyGoal(str, Enum):
    WEALTH_GROWTH = "WEALTH_GROWTH"
    INCOME = "INCOME"
    CAPITAL_PRESERVATION = "CAPITAL_PRESERVATION"
    FIRE = "FIRE"


class GoalType(str, Enum):
    CAR = "CAR"
    WEDDING = "WEDDING"
    HOUSE_DOWN_PAYMENT = "HOUSE_DOWN_PAYMENT"
    EDUCATION = "EDUCATION"
    TRAVEL = "TRAVEL"
    OTHER = "OTHER"


class LoanType(str, Enum):
    HOME = "HOME"
    CAR = "CAR"
    PERSONAL = "PERSONAL"
    EDUCATION = "EDUCATION"
    CREDIT_CARD = "CREDIT_CARD"
    OTHER = "OTHER"


class RateType(str, Enum):
    FLOATING = "FLOATING"
    FIXED = "FIXED"


class Direction(str, Enum):
    CREDIT = "CREDIT"
    DEBIT = "DEBIT"


class TxnCategory(str, Enum):
    INCOME = "INCOME"
    RENT = "RENT"
    GROCERIES = "GROCERIES"
    FOOD_DELIVERY = "FOOD_DELIVERY"
    DINING = "DINING"
    TRANSPORT = "TRANSPORT"
    SHOPPING = "SHOPPING"
    UTILITIES = "UTILITIES"
    SUBSCRIPTIONS = "SUBSCRIPTIONS"
    EMI = "EMI"
    INVESTMENTS = "INVESTMENTS"
    TRANSFER = "TRANSFER"
    HEALTH = "HEALTH"
    EDUCATION = "EDUCATION"
    ENTERTAINMENT = "ENTERTAINMENT"
    OTHER = "OTHER"


class StatementStatus(str, Enum):
    PENDING_UPLOAD = "PENDING_UPLOAD"
    UPLOADED = "UPLOADED"
    EXTRACTING = "EXTRACTING"
    VALIDATING = "VALIDATING"
    REVIEW_REQUIRED = "REVIEW_REQUIRED"
    COMMITTED = "COMMITTED"
    FAILED = "FAILED"


class ChatJobStatus(str, Enum):
    QUEUED = "QUEUED"
    RUNNING = "RUNNING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


class FlagSeverity(str, Enum):
    info = "info"
    warning = "warning"
    critical = "critical"


class FdType(str, Enum):
    CUMULATIVE = "CUMULATIVE"
    PAYOUT = "PAYOUT"


class ErrorCode(str, Enum):
    VALIDATION_ERROR = "VALIDATION_ERROR"
    UNAUTHORIZED = "UNAUTHORIZED"
    NOT_FOUND = "NOT_FOUND"
    UPSTREAM_UNAVAILABLE = "UPSTREAM_UNAVAILABLE"
    INSUFFICIENT_DATA = "INSUFFICIENT_DATA"
    INTERNAL = "INTERNAL"
    NOT_IMPLEMENTED = "NOT_IMPLEMENTED"
    CONFLICT = "CONFLICT"
