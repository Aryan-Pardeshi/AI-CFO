import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';

const ManualEntry = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1);

  // Step 1: Income & Liquidity
  const [formData, setFormData] = useState({
    jobIncome: '', businessIncome: '', rentalIncome: '', dividendIncome: '', freelanceIncome: '',
    bankBalance: '', cashOnHand: '', savingsAccount: '', fixedDeposits: '',
  });

  // Step 2: Investments (Dynamic Table)
  const [investments, setInvestments] = useState([
    { id: Date.now(), type: 'Stock', ticker: '', buyPrice: '', quantity: '' }
  ]);

  // Step 3: Liabilities & Diversified Expenses
  const [liabilities, setLiabilities] = useState({
    homeLoanEmi: '', carLoanEmi: '', personalLoanEmi: '', educationLoanEmi: '', creditCardDebt: '',
  });

  const [expenses, setExpenses] = useState({
    rent: '', food: '', transportation: '', utilities: '', insurance: '',
    subscriptions: '', shopping: '', healthcare: '', education: '', entertainment: '', miscellaneous: '',
  });

  const handleInputChange = (setter) => (e) => {
    setter(prev => ({ ...prev, [e.target.id]: e.target.value }));
  };

  const handleInvestmentChange = (id, field, value) => {
    const updated = investments.map(inv => {
      if (inv.id === id) {
        // Auto-add a new row when typing in the last row
        if (investments[investments.length - 1].id === id && value.length === 1) {
          setTimeout(() => addInvestmentRow(), 50);
        }
        return { ...inv, [field]: value };
      }
      return inv;
    });
    setInvestments(updated);
  };

  const addInvestmentRow = () => {
    setInvestments(prev => [...prev, { id: Date.now(), type: 'Stock', ticker: '', buyPrice: '', quantity: '' }]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (step < 3) {
      setStep(step + 1);
      return;
    }

    setLoading(true);
    const email = localStorage.getItem('userEmail');
    if (!email) {
      alert("No active session found. Please log in again.");
      navigate('/login');
      return;
    }

    const validInvestments = investments.filter(inv => inv.ticker.trim() !== '');

    const financials = {
      onboardingMethod: 'manual_advanced',
      incomes: {
        jobSalary: formData.jobIncome,
        business: formData.businessIncome,
        rental: formData.rentalIncome,
        dividend: formData.dividendIncome,
        freelance: formData.freelanceIncome,
      },
      liquidAssets: {
        bankBalance: formData.bankBalance,
        savingsAccount: formData.savingsAccount,
        fixedDeposits: formData.fixedDeposits,
        cashOnHand: formData.cashOnHand,
      },
      portfolio: validInvestments.map(inv => ({
        type: inv.type,
        ticker: inv.ticker,
        buyPrice: inv.buyPrice,
        quantity: inv.quantity,
      })),
      liabilities: {
        homeLoanEmi: liabilities.homeLoanEmi,
        carLoanEmi: liabilities.carLoanEmi,
        personalLoanEmi: liabilities.personalLoanEmi,
        educationLoanEmi: liabilities.educationLoanEmi,
        creditCardDebt: liabilities.creditCardDebt,
      },
      monthlyExpenses: {
        rent: expenses.rent,
        food: expenses.food,
        transportation: expenses.transportation,
        utilities: expenses.utilities,
        insurance: expenses.insurance,
        subscriptions: expenses.subscriptions,
        shopping: expenses.shopping,
        healthcare: expenses.healthcare,
        education: expenses.education,
        entertainment: expenses.entertainment,
        miscellaneous: expenses.miscellaneous,
      }
    };

    try {
      const res = await fetch('http://localhost:5000/api/auth/financials', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, financials })
      });
      if (res.ok) {
        navigate('/dashboard');
      } else {
        alert('Failed to save data.');
      }
    } catch (err) {
      alert('Network error.');
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = {
    width: '100%', padding: '0.5rem', background: 'transparent',
    border: '1px solid var(--border-color)', color: 'var(--text-primary)', outline: 'none',
    fontSize: '0.875rem',
  };

  return (
    <div style={{ width: '100%', maxWidth: '800px', background: 'var(--surface-color)', padding: '3rem', border: '1px solid var(--border-color)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h2 style={{ margin: 0 }}>Comprehensive Financial Profile</h2>
        <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: 600 }}>Step {step} of 3</span>
      </div>

      <p style={{ color: 'var(--text-secondary)', marginBottom: '2.5rem' }}>
        {step === 1 && "Map out your diverse income streams and liquid assets."}
        {step === 2 && "Detail your investment portfolio. New rows appear automatically as you type."}
        {step === 3 && "Capture your liabilities (EMIs, debts) and itemized monthly living expenses."}
      </p>

      <form onSubmit={handleSubmit}>

        {/* ========== STEP 1: INCOME & LIQUIDITY ========== */}
        {step === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <h3 style={{ margin: 0, fontSize: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>Income Streams (Monthly)</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
              <Input label="Job / Salary" id="jobIncome" type="number" value={formData.jobIncome} onChange={handleInputChange(setFormData)} placeholder="e.g. 8000" />
              <Input label="Business Income" id="businessIncome" type="number" value={formData.businessIncome} onChange={handleInputChange(setFormData)} placeholder="e.g. 3500" />
              <Input label="Rental Income" id="rentalIncome" type="number" value={formData.rentalIncome} onChange={handleInputChange(setFormData)} placeholder="e.g. 1200" />
              <Input label="Dividend Income" id="dividendIncome" type="number" value={formData.dividendIncome} onChange={handleInputChange(setFormData)} placeholder="e.g. 400" />
              <Input label="Freelance / Side Income" id="freelanceIncome" type="number" value={formData.freelanceIncome} onChange={handleInputChange(setFormData)} placeholder="e.g. 1000" />
            </div>

            <h3 style={{ margin: 0, fontSize: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>Liquid Assets</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
              <Input label="Current / Checking Account Balance" id="bankBalance" type="number" value={formData.bankBalance} onChange={handleInputChange(setFormData)} placeholder="e.g. 45000" />
              <Input label="Savings Account Balance" id="savingsAccount" type="number" value={formData.savingsAccount} onChange={handleInputChange(setFormData)} placeholder="e.g. 20000" />
              <Input label="Fixed Deposits" id="fixedDeposits" type="number" value={formData.fixedDeposits} onChange={handleInputChange(setFormData)} placeholder="e.g. 50000" />
              <Input label="Cash on Hand" id="cashOnHand" type="number" value={formData.cashOnHand} onChange={handleInputChange(setFormData)} placeholder="e.g. 1500" />
            </div>
          </div>
        )}

        {/* ========== STEP 2: INVESTMENT PORTFOLIO (Dynamic Table) ========== */}
        {step === 2 && (
          <div style={{ width: '100%', overflowX: 'auto' }}>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1rem' }}>
              We will use YFinance to automatically fetch the current market value of your holdings.
            </p>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border-color)' }}>
                  <th style={{ padding: '0.75rem', fontWeight: 600, width: '20%' }}>Asset Type</th>
                  <th style={{ padding: '0.75rem', fontWeight: 600, width: '25%' }}>Ticker / Name</th>
                  <th style={{ padding: '0.75rem', fontWeight: 600, width: '25%' }}>Buy Price ($)</th>
                  <th style={{ padding: '0.75rem', fontWeight: 600, width: '30%' }}>Quantity</th>
                </tr>
              </thead>
              <tbody>
                {investments.map((inv) => (
                  <tr key={inv.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '0.5rem' }}>
                      <select
                        value={inv.type}
                        onChange={(e) => handleInvestmentChange(inv.id, 'type', e.target.value)}
                        style={inputStyle}
                      >
                        <option value="Stock">Stock</option>
                        <option value="Mutual Fund">Mutual Fund</option>
                        <option value="ETF">ETF</option>
                        <option value="Bond">Bond</option>
                        <option value="Crypto">Crypto</option>
                        <option value="Real Estate">Real Estate</option>
                        <option value="Gold">Gold</option>
                        <option value="Other">Other</option>
                      </select>
                    </td>
                    <td style={{ padding: '0.5rem' }}>
                      <input
                        type="text"
                        value={inv.ticker}
                        onChange={(e) => handleInvestmentChange(inv.id, 'ticker', e.target.value)}
                        placeholder="e.g. AAPL, RELIANCE.NS"
                        style={inputStyle}
                      />
                    </td>
                    <td style={{ padding: '0.5rem' }}>
                      <input
                        type="number"
                        value={inv.buyPrice}
                        onChange={(e) => handleInvestmentChange(inv.id, 'buyPrice', e.target.value)}
                        placeholder="e.g. 150.25"
                        style={inputStyle}
                      />
                    </td>
                    <td style={{ padding: '0.5rem' }}>
                      <input
                        type="number"
                        value={inv.quantity}
                        onChange={(e) => handleInvestmentChange(inv.id, 'quantity', e.target.value)}
                        placeholder="e.g. 10"
                        style={inputStyle}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end' }}>
              <Button type="button" variant="outline" onClick={addInvestmentRow}>
                + Add Another Holding
              </Button>
            </div>
          </div>
        )}

        {/* ========== STEP 3: LIABILITIES & ITEMIZED EXPENSES ========== */}
        {step === 3 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <h3 style={{ margin: 0, fontSize: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>Liabilities (Monthly EMIs / Debts)</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
              <Input label="Home Loan EMI" id="homeLoanEmi" type="number" value={liabilities.homeLoanEmi} onChange={handleInputChange(setLiabilities)} placeholder="e.g. 1500" />
              <Input label="Car Loan EMI" id="carLoanEmi" type="number" value={liabilities.carLoanEmi} onChange={handleInputChange(setLiabilities)} placeholder="e.g. 450" />
              <Input label="Personal Loan EMI" id="personalLoanEmi" type="number" value={liabilities.personalLoanEmi} onChange={handleInputChange(setLiabilities)} placeholder="e.g. 300" />
              <Input label="Education Loan EMI" id="educationLoanEmi" type="number" value={liabilities.educationLoanEmi} onChange={handleInputChange(setLiabilities)} placeholder="e.g. 200" />
              <Input label="Credit Card Debt (Outstanding)" id="creditCardDebt" type="number" value={liabilities.creditCardDebt} onChange={handleInputChange(setLiabilities)} placeholder="e.g. 2000" />
            </div>

            <h3 style={{ margin: 0, fontSize: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>Monthly Living Expenses (Itemized)</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1.5rem' }}>
              <Input label="Rent / Housing" id="rent" type="number" value={expenses.rent} onChange={handleInputChange(setExpenses)} placeholder="e.g. 1200" />
              <Input label="Food / Groceries" id="food" type="number" value={expenses.food} onChange={handleInputChange(setExpenses)} placeholder="e.g. 600" />
              <Input label="Transportation" id="transportation" type="number" value={expenses.transportation} onChange={handleInputChange(setExpenses)} placeholder="e.g. 200" />
              <Input label="Utilities (Electric, Water, Gas)" id="utilities" type="number" value={expenses.utilities} onChange={handleInputChange(setExpenses)} placeholder="e.g. 150" />
              <Input label="Insurance Premiums" id="insurance" type="number" value={expenses.insurance} onChange={handleInputChange(setExpenses)} placeholder="e.g. 300" />
              <Input label="Subscriptions (OTT, SaaS)" id="subscriptions" type="number" value={expenses.subscriptions} onChange={handleInputChange(setExpenses)} placeholder="e.g. 50" />
              <Input label="Shopping / Clothing" id="shopping" type="number" value={expenses.shopping} onChange={handleInputChange(setExpenses)} placeholder="e.g. 200" />
              <Input label="Healthcare / Medicine" id="healthcare" type="number" value={expenses.healthcare} onChange={handleInputChange(setExpenses)} placeholder="e.g. 100" />
              <Input label="Education / Courses" id="education" type="number" value={expenses.education} onChange={handleInputChange(setExpenses)} placeholder="e.g. 150" />
              <Input label="Entertainment / Dining Out" id="entertainment" type="number" value={expenses.entertainment} onChange={handleInputChange(setExpenses)} placeholder="e.g. 250" />
              <Input label="Miscellaneous" id="miscellaneous" type="number" value={expenses.miscellaneous} onChange={handleInputChange(setExpenses)} placeholder="e.g. 100" />
            </div>
          </div>
        )}

        <div style={{ marginTop: '3rem', display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border-color)', paddingTop: '1.5rem' }}>
          {step > 1 ? (
            <Button type="button" variant="outline" onClick={() => setStep(step - 1)}>
              Back
            </Button>
          ) : <div></div>}

          <Button type="submit" disabled={loading}>
            {loading ? 'Saving...' : (step < 3 ? 'Continue' : 'Submit Portfolio')}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default ManualEntry;
