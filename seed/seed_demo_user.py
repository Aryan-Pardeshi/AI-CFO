"""Seed the demo user (demo@aicfo.app) in DynamoDB with comprehensive financial data."""

from decimal import Decimal
import uuid
from datetime import datetime, timezone
import boto3

REGION = "ap-south-1"
DEMO_SUB = "f1639d0a-3041-70d4-5228-2d1a3fad886f"

ddb = boto3.resource("dynamodb", region_name=REGION)
users_table = ddb.Table("aicfo-dev-users")
holdings_table = ddb.Table("aicfo-dev-holdings")
loans_table = ddb.Table("aicfo-dev-loans")
goals_table = ddb.Table("aicfo-dev-goals")
txns_table = ddb.Table("aicfo-dev-transactions")

NOW = datetime.now(timezone.utc).isoformat()

def seed_user():
    print("Seeding user profile & dashboard financials...")
    item = {
        "user_id": DEMO_SUB,
        "name": "Aryan Pardeshi",
        "date_of_birth": "1998-05-14",
        "base_currency": "INR",
        "employment_type": "SALARIED",
        "city_tier": "METRO",
        "dependents_count": 0,
        "monthly_income_paise": 17500000,      # ₹1,75,000
        "monthly_expenses_paise": 8000000,     # ₹80,000
        "cash_balance_paise": 25000000,        # ₹2,50,000
        "monthly_investment_paise": 7500000,   # ₹75,000
        "emergency_fund_target_months": 6,
        "risk_profile": "AGGRESSIVE",
        "risk_score": 12,
        "risk_answers": ["3", "3", "3", "3"],
        "strategy_goal": "WEALTH_GROWTH",
        "investment_horizon_years": 15,
        "onboarded": True,
        "onboarding_step": "8",
        "consent_accepted_at": NOW,
        "created_at": NOW,
        "updated_at": NOW,
        "dashboard_financials": {
            "onboardingMethod": "manual_advanced",
            "incomes": {
                "Salary": "150000",
                "Consulting": "15000",
                "Dividends": "10000",
            },
            "liquidAssets": {
                "bankBalance": "250000",
                "fixedDeposits": "500000",
            },
            "portfolio": [
                {
                    "type": "Stock",
                    "ticker": "RELIANCE.NS",
                    "buyPrice": "1150.00",
                    "quantity": "200",
                },
                {
                    "type": "Stock",
                    "ticker": "HDFCBANK.NS",
                    "buyPrice": "700.00",
                    "quantity": "80",
                },
                {
                    "type": "Stock",
                    "ticker": "INFY.NS",
                    "buyPrice": "1850.00",
                    "quantity": "60",
                },
                {
                    "type": "ETF",
                    "ticker": "NIFTYBEES.NS",
                    "buyPrice": "245.00",
                    "quantity": "600",
                },
                {
                    "type": "ETF",
                    "ticker": "GOLDBEES.NS",
                    "buyPrice": "62.00",
                    "quantity": "800",
                },
                {
                    "type": "Stock",
                    "ticker": "TCS.NS",
                    "buyPrice": "3400.00",
                    "quantity": "30",
                },
            ],
            "monthlyExpenses": {
                "Housing & Rent": "35000",
                "Food & Groceries": "18000",
                "Dining & Outing": "9500",
                "Utilities & Bills": "6500",
                "Transport & Fuel": "7000",
                "Subscriptions": "4000",
            },
            "liabilities": {
                "homeLoanEmi": "39052",
                "carLoanEmi": "16607",
                "personalLoanEmi": "9964",
                "educationLoanEmi": "7914",
            },
            "preferences": {
                "industries": ["Technology", "Banking & Finance", "Renewable Energy", "Automobile"],
                "instruments": ["Stocks", "Mutual Funds", "ETFs", "Fixed Deposits"],
            },
        },
    }
    users_table.put_item(Item=item)
    print("  [OK] User profile seeded successfully")


def seed_loans():
    print("Seeding loans...")
    from boto3.dynamodb.conditions import Key
    existing = loans_table.query(KeyConditionExpression=Key("user_id").eq(DEMO_SUB)).get("Items", [])
    for ex in existing:
        loans_table.delete_item(Key={"user_id": DEMO_SUB, "loan_id": ex["loan_id"]})

    loans = [
        {
            "user_id": DEMO_SUB,
            "loan_id": "loan-home-001",
            "name": "HDFC Home Loan",
            "loan_type": "HOME",
            "principal_paise": 450000000,      # ₹45,00,000
            "outstanding_paise": 420000000,    # ₹42,00,000
            "annual_rate": Decimal("0.085"),
            "tenure_months": 240,
            "rate_type": "FIXED",
            "start_date": "2023-04-01",
            "prepayment_charge_pct": Decimal("0"),
            "created_at": NOW,
            "updated_at": NOW,
        },
        {
            "user_id": DEMO_SUB,
            "loan_id": "loan-car-002",
            "name": "ICICI Car Loan",
            "loan_type": "CAR",
            "principal_paise": 80000000,       # ₹8,00,000
            "outstanding_paise": 65000000,     # ₹6,50,000
            "annual_rate": Decimal("0.090"),
            "tenure_months": 60,
            "rate_type": "FIXED",
            "start_date": "2024-06-01",
            "prepayment_charge_pct": Decimal("0"),
            "created_at": NOW,
            "updated_at": NOW,
        },
        {
            "user_id": DEMO_SUB,
            "loan_id": "loan-personal-003",
            "name": "Axis Personal Loan",
            "loan_type": "PERSONAL",
            "principal_paise": 30000000,       # ₹3,00,000
            "outstanding_paise": 22000000,     # ₹2,20,000
            "annual_rate": Decimal("0.120"),
            "tenure_months": 36,
            "rate_type": "FIXED",
            "start_date": "2025-01-01",
            "prepayment_charge_pct": Decimal("0"),
            "created_at": NOW,
            "updated_at": NOW,
        },
        {
            "user_id": DEMO_SUB,
            "loan_id": "loan-edu-004",
            "name": "SBI Scholar Education Loan",
            "loan_type": "EDUCATION",
            "principal_paise": 50000000,       # ₹5,00,000
            "outstanding_paise": 38000000,     # ₹3,80,000
            "annual_rate": Decimal("0.085"),
            "tenure_months": 84,
            "rate_type": "FLOATING",
            "start_date": "2022-08-01",
            "prepayment_charge_pct": Decimal("0"),
            "created_at": NOW,
            "updated_at": NOW,
        },
    ]
    for loan in loans:
        loans_table.put_item(Item=loan)
    print(f"  [OK] {len(loans)} loans seeded successfully")


def seed_goals():
    print("Seeding goals...")
    from boto3.dynamodb.conditions import Key
    existing = goals_table.query(KeyConditionExpression=Key("user_id").eq(DEMO_SUB)).get("Items", [])
    for ex in existing:
        goals_table.delete_item(Key={"user_id": DEMO_SUB, "goal_id": ex["goal_id"]})

    goals = [
        {
            "user_id": DEMO_SUB,
            "goal_id": "goal-car-001",
            "name": "Electric SUV Downpayment",
            "goal_type": "CAR",
            "amount_today_paise": 120000000,   # ₹12,00,000
            "current_saved_paise": 40000000,   # ₹4,00,000
            "target_age": 32,
            "target_date": "2030-06-30",
            "inflation_rate": Decimal("0.06"),
            "created_at": NOW,
            "updated_at": NOW,
        },
        {
            "user_id": DEMO_SUB,
            "goal_id": "goal-house-002",
            "name": "Dream Home Downpayment",
            "goal_type": "HOUSE_DOWN_PAYMENT",
            "amount_today_paise": 250000000,   # ₹25,00,000
            "current_saved_paise": 80000000,   # ₹8,00,000
            "target_age": 36,
            "target_date": "2034-12-31",
            "inflation_rate": Decimal("0.06"),
            "created_at": NOW,
            "updated_at": NOW,
        },
    ]
    for goal in goals:
        goals_table.put_item(Item=goal)
    print(f"  [OK] {len(goals)} goals seeded successfully")


def seed_holdings():
    print("Seeding holdings...")
    from boto3.dynamodb.conditions import Key
    existing = holdings_table.query(KeyConditionExpression=Key("user_id").eq(DEMO_SUB)).get("Items", [])
    for ex in existing:
        holdings_table.delete_item(Key={"user_id": DEMO_SUB, "holding_id": ex["holding_id"]})

    holdings = [
        {
            "user_id": DEMO_SUB,
            "holding_id": "h-reliance-001",
            "name": "Reliance Industries",
            "symbol": "RELIANCE",
            "asset_type": "STOCK",
            "quantity": 200,
            "avg_buy_price_paise": 115000,     # ₹1,150
            "source": "DEMO",
            "created_at": NOW,
            "updated_at": NOW,
        },
        {
            "user_id": DEMO_SUB,
            "holding_id": "h-hdfc-002",
            "name": "HDFC Bank",
            "symbol": "HDFCBANK",
            "asset_type": "STOCK",
            "quantity": 80,
            "avg_buy_price_paise": 70000,      # ₹700
            "source": "DEMO",
            "created_at": NOW,
            "updated_at": NOW,
        },
        {
            "user_id": DEMO_SUB,
            "holding_id": "h-infy-003",
            "name": "Infosys",
            "symbol": "INFY",
            "asset_type": "STOCK",
            "quantity": 60,
            "avg_buy_price_paise": 185000,     # ₹1,850
            "source": "DEMO",
            "created_at": NOW,
            "updated_at": NOW,
        },
        {
            "user_id": DEMO_SUB,
            "holding_id": "h-niftybees-004",
            "name": "Nippon India ETF Nifty BeES",
            "symbol": "NIFTYBEES",
            "asset_type": "ETF",
            "quantity": 600,
            "avg_buy_price_paise": 24500,      # ₹245
            "source": "DEMO",
            "created_at": NOW,
            "updated_at": NOW,
        },
        {
            "user_id": DEMO_SUB,
            "holding_id": "h-goldbees-005",
            "name": "Nippon India ETF Gold BeES",
            "symbol": "GOLDBEES",
            "asset_type": "ETF",
            "quantity": 800,
            "avg_buy_price_paise": 6200,       # ₹62
            "source": "DEMO",
            "created_at": NOW,
            "updated_at": NOW,
        },
        {
            "user_id": DEMO_SUB,
            "holding_id": "h-ppfcf-006",
            "name": "Parag Parikh Flexi Cap Fund",
            "symbol": "PPFCF",
            "asset_type": "MUTUAL_FUND",
            "quantity": 1500,
            "avg_buy_price_paise": 8000,       # ₹80
            "source": "DEMO",
            "created_at": NOW,
            "updated_at": NOW,
        },
        {
            "user_id": DEMO_SUB,
            "holding_id": "h-fd-007",
            "name": "Fixed Deposit (7.2% Cumulative)",
            "asset_type": "FD",
            "fd_type": "CUMULATIVE",
            "fd_principal_paise": 50000000,    # ₹5,00,000
            "fd_annual_rate": Decimal("0.072"),
            "fd_start_date": "2026-01-15",
            "source": "DEMO",
            "created_at": NOW,
            "updated_at": NOW,
        },
    ]
    for holding in holdings:
        holdings_table.put_item(Item=holding)
    print(f"  [OK] {len(holdings)} holdings seeded successfully")


def seed_transactions():
    print("Seeding 6-month historical transactions (Apr - Sep 2026)...")
    months = [
        ("2026-04", 15000000, 1500000, 7200000),   # April: Income ₹1.65L, Expense ₹72K
        ("2026-05", 15000000, 2000000, 8400000),   # May: Income ₹1.70L, Expense ₹84K
        ("2026-06", 15500000, 1800000, 7900000),   # June: Income ₹1.73L, Expense ₹79K
        ("2026-07", 15000000, 2500000, 8800000),   # July: Income ₹1.75L, Expense ₹88K
        ("2026-08", 16000000, 1500000, 8100000),   # August: Income ₹1.75L, Expense ₹81K
        ("2026-09", 15000000, 2500000, 7500000),   # September: Income ₹1.75L, Expense ₹75K
    ]

    txns = []
    job_id = "seed-demo-statement-job"
    balance = 20000000  # Start with ₹2,00,000 balance

    for month_str, sal, bonus, exp_total in months:
        # Salary credit on 1st
        balance += sal
        sal_id = f"t_sal_{month_str.replace('-', '')}"
        txns.append({
            "user_id": DEMO_SUB,
            "txn_sk": f"{month_str}-01#{sal_id}",
            "txn_id": sal_id,
            "txn_date": f"{month_str}-01",
            "description": "TechCorp Solutions Monthly Salary",
            "amount_paise": sal,
            "direction": "CREDIT",
            "category": "INCOME",
            "category_source": "rule",
            "balance_paise": balance,
            "source_job_id": job_id,
        })

        # Consulting / Bonus credit on 5th
        balance += bonus
        bon_id = f"t_bon_{month_str.replace('-', '')}"
        txns.append({
            "user_id": DEMO_SUB,
            "txn_sk": f"{month_str}-05#{bon_id}",
            "txn_id": bon_id,
            "txn_date": f"{month_str}-05",
            "description": "Advisory / Consulting Retainer",
            "amount_paise": bonus,
            "direction": "CREDIT",
            "category": "INCOME",
            "category_source": "rule",
            "balance_paise": balance,
            "source_job_id": job_id,
        })

        # Rent on 3rd
        rent_paise = 3500000
        balance -= rent_paise
        rent_id = f"t_rent_{month_str.replace('-', '')}"
        txns.append({
            "user_id": DEMO_SUB,
            "txn_sk": f"{month_str}-03#{rent_id}",
            "txn_id": rent_id,
            "txn_date": f"{month_str}-03",
            "description": "Apartment Monthly Rent - Prime Housing",
            "amount_paise": rent_paise,
            "direction": "DEBIT",
            "category": "RENT",
            "category_source": "rule",
            "balance_paise": balance,
            "source_job_id": job_id,
        })

        # EMI on 5th
        emi_paise = 3905200
        balance -= emi_paise
        emi_id = f"t_emi_{month_str.replace('-', '')}"
        txns.append({
            "user_id": DEMO_SUB,
            "txn_sk": f"{month_str}-05#{emi_id}",
            "txn_id": emi_id,
            "txn_date": f"{month_str}-05",
            "description": "HDFC Bank Home Loan Auto-Debit",
            "amount_paise": emi_paise,
            "direction": "DEBIT",
            "category": "EMI",
            "category_source": "rule",
            "balance_paise": balance,
            "source_job_id": job_id,
        })

        # Groceries
        groc_paise = 1200000
        balance -= groc_paise
        groc_id = f"t_groc_{month_str.replace('-', '')}"
        txns.append({
            "user_id": DEMO_SUB,
            "txn_sk": f"{month_str}-10#{groc_id}",
            "txn_id": groc_id,
            "txn_date": f"{month_str}-10",
            "description": "Blinkit / Nature's Basket Groceries",
            "amount_paise": groc_paise,
            "direction": "DEBIT",
            "category": "GROCERIES",
            "category_source": "rule",
            "balance_paise": balance,
            "source_job_id": job_id,
        })

        # Dining & Food delivery
        dine_paise = 650000
        balance -= dine_paise
        dine_id = f"t_dine_{month_str.replace('-', '')}"
        txns.append({
            "user_id": DEMO_SUB,
            "txn_sk": f"{month_str}-14#{dine_id}",
            "txn_id": dine_id,
            "txn_date": f"{month_str}-14",
            "description": "Swiggy / Zomato Dining & Delivery",
            "amount_paise": dine_paise,
            "direction": "DEBIT",
            "category": "FOOD_DELIVERY",
            "category_source": "rule",
            "balance_paise": balance,
            "source_job_id": job_id,
        })

        # Utilities & Bills
        util_paise = 550000
        balance -= util_paise
        util_id = f"t_util_{month_str.replace('-', '')}"
        txns.append({
            "user_id": DEMO_SUB,
            "txn_sk": f"{month_str}-18#{util_id}",
            "txn_id": util_id,
            "txn_date": f"{month_str}-18",
            "description": "Electricity & High-Speed Broadband Bill",
            "amount_paise": util_paise,
            "direction": "DEBIT",
            "category": "UTILITIES",
            "category_source": "rule",
            "balance_paise": balance,
            "source_job_id": job_id,
        })

        # Subscriptions
        sub_paise = 250000
        balance -= sub_paise
        sub_id = f"t_sub_{month_str.replace('-', '')}"
        txns.append({
            "user_id": DEMO_SUB,
            "txn_sk": f"{month_str}-22#{sub_id}",
            "txn_id": sub_id,
            "txn_date": f"{month_str}-22",
            "description": "Netflix + Spotify + Apple One Subscriptions",
            "amount_paise": sub_paise,
            "direction": "DEBIT",
            "category": "SUBSCRIPTIONS",
            "category_source": "rule",
            "balance_paise": balance,
            "source_job_id": job_id,
        })

        # SIP Investments
        inv_paise = 2500000
        balance -= inv_paise
        inv_id = f"t_inv_{month_str.replace('-', '')}"
        txns.append({
            "user_id": DEMO_SUB,
            "txn_sk": f"{month_str}-25#{inv_id}",
            "txn_id": inv_id,
            "txn_date": f"{month_str}-25",
            "description": "Zerodha Coin Mutual Fund SIP",
            "amount_paise": inv_paise,
            "direction": "DEBIT",
            "category": "INVESTMENTS",
            "category_source": "rule",
            "balance_paise": balance,
            "source_job_id": job_id,
        })

    for txn in txns:
        txns_table.put_item(Item=txn)
    print(f"  [OK] {len(txns)} transactions seeded across 6 months ({months[0][0]} to {months[-1][0]})")


def main():
    print(f"=== Seeding Demo User ({DEMO_SUB}) on {REGION} ===")
    seed_user()
    seed_loans()
    seed_goals()
    seed_holdings()
    seed_transactions()
    print("=== All demo user tables seeded successfully! ===")

if __name__ == "__main__":
    main()
