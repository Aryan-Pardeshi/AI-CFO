import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';

const INDUSTRY_OPTIONS = [
  'Technology & Software',
  'Renewable Energy & EV',
  'Banking & FinTech',
  'Healthcare & Pharma',
  'FMCG & Consumer Brands',
  'Real Estate & Infrastructure',
  'Automobiles & Manufacturing',
  'Defence & Aerospace',
  'Artificial Intelligence & Semi'
];

const INSTRUMENT_OPTIONS = [
  'Equities (Direct Stocks)',
  'Index & Mutual Funds',
  'Exchange Traded Funds (ETFs)',
  'Bonds & Fixed Income',
  'Gold & Precious Metals',
  'Real Estate (REITs)',
  'Crypto & Web3 Assets'
];

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

  // Step 3: Investment Interests & Preferences (For Personalized News & Suggestions)
  const [selectedIndustries, setSelectedIndustries] = useState(['Technology & Software', 'Banking & FinTech']);
  const [selectedInstruments, setSelectedInstruments] = useState(['Equities (Direct Stocks)', 'Index & Mutual Funds']);

  // Step 4: Liabilities & Diversified Expenses
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

  const toggleIndustry = (industry) => {
    setSelectedIndustries(prev => 
      prev.includes(industry) ? prev.filter(i => i !== industry) : [...prev, industry]
    );
  };

  const toggleInstrument = (instrument) => {
    setSelectedInstruments(prev => 
      prev.includes(instrument) ? prev.filter(i => i !== instrument) : [...prev, instrument]
    );
  };

  const handleInvestmentChange = (id, field, value) => {
    const updated = investments.map(inv => {
      if (inv.id === id) {
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
    if (step < 4) {
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
        ticker: inv.ticker.toUpperCase(),
        buyPrice: inv.buyPrice,
        quantity: inv.quantity,
      })),
      preferences: {
        industries: selectedIndustries,
        instruments: selectedInstruments
      },
      liabilities: {
        homeLoanEmi: liabilities.homeLoanEmi,
        carLoanEmi: liabilities.carLoanEmi,
        personalLoanEmi: liabilities.personalLoanEmi,
        educationLoanEmi: liabilities.educationLoanEmi,
        creditCardDebt: liabilities.creditCardDebt,
        creditCardIssuer: liabilities.creditCardIssuer || 'HDFC Bank',
        creditCardLimit: liabilities.creditCardLimit || '250000',
        creditCardDueDate: liabilities.creditCardDueDate || '2026-10-05',
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
        navigate('/overview');
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
    width: '100%', padding: '0.6rem 0.8rem', background: 'transparent',
    border: '1px solid var(--border-color)', color: 'var(--text-primary)', outline: 'none',
    fontSize: '0.875rem',
  };

  const tagStyle = (isSelected) => ({
    padding: '0.5rem 1rem',
    cursor: 'pointer',
    border: `1px solid ${isSelected ? 'var(--accent-color)' : 'var(--border-color)'}`,
    background: isSelected ? 'var(--accent-color)' : 'var(--surface-color)',
    color: isSelected ? '#FFFFFF' : 'var(--text-primary)',
    fontWeight: isSelected ? 600 : 400,
    fontSize: '0.85rem',
    transition: 'all 0.15s ease',
    userSelect: 'none'
  });

  return (
    <div style={{ width: '100%', maxWidth: '820px', background: 'var(--surface-color)', padding: '3rem', border: '1px solid var(--border-color)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h2 style={{ margin: 0 }}>Comprehensive Financial Profile</h2>
        <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: 600 }}>Step {step} of 4</span>
      </div>

      <p style={{ color: 'var(--text-secondary)', marginBottom: '2.5rem' }}>
        {step === 1 && "Map out your diverse monthly income streams and liquid assets."}
        {step === 2 && "Detail your current investment portfolio (Stocks, Mutual Funds, ETFs)."}
        {step === 3 && "Select your favorite investment areas & instruments for personalized market intelligence & stock suggestions."}
        {step === 4 && "Capture your monthly liabilities (EMIs, debts) and itemized living expenses."}
      </p>

      <form onSubmit={handleSubmit}>

        {/* ========== STEP 1: INCOME & LIQUIDITY ========== */}
        {step === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <h3 style={{ margin: 0, fontSize: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>Income Streams (Monthly)</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
              <Input label="Job / Salary Income (₹)" id="jobIncome" type="number" value={formData.jobIncome} onChange={handleInputChange(setFormData)} placeholder="e.g. 110000" />
              <Input label="Business Income (₹)" id="businessIncome" type="number" value={formData.businessIncome} onChange={handleInputChange(setFormData)} placeholder="e.g. 45000" />
              <Input label="Rental Income (₹)" id="rentalIncome" type="number" value={formData.rentalIncome} onChange={handleInputChange(setFormData)} placeholder="e.g. 25000" />
              <Input label="Dividend Income (₹)" id="dividendIncome" type="number" value={formData.dividendIncome} onChange={handleInputChange(setFormData)} placeholder="e.g. 6000" />
              <Input label="Freelance / Consulting (₹)" id="freelanceIncome" type="number" value={formData.freelanceIncome} onChange={handleInputChange(setFormData)} placeholder="e.g. 15000" />
            </div>

            <h3 style={{ margin: 0, fontSize: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>Liquid Assets</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
              <Input label="Bank Savings / Checking Account (₹)" id="bankBalance" type="number" value={formData.bankBalance} onChange={handleInputChange(setFormData)} placeholder="e.g. 250000" />
              <Input label="High-Yield Savings / Secondary Account (₹)" id="savingsAccount" type="number" value={formData.savingsAccount} onChange={handleInputChange(setFormData)} placeholder="e.g. 100000" />
              <Input label="Fixed Deposits (FDs / RDs) (₹)" id="fixedDeposits" type="number" value={formData.fixedDeposits} onChange={handleInputChange(setFormData)} placeholder="e.g. 500000" />
              <Input label="Liquid Cash in Hand (₹)" id="cashOnHand" type="number" value={formData.cashOnHand} onChange={handleInputChange(setFormData)} placeholder="e.g. 20000" />
            </div>
          </div>
        )}

        {/* ========== STEP 2: INVESTMENT PORTFOLIO ========== */}
        {step === 2 && (
          <div style={{ width: '100%', overflowX: 'auto' }}>
            <div style={{ background: 'var(--bg-color)', padding: '1rem', border: '1px solid var(--border-color)', marginBottom: '1.5rem' }}>
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                <strong>Tip:</strong> Enter ticker symbols like <code>AAPL</code>, <code>RELIANCE.NS</code>, <code>TCS.NS</code>, <code>HDFCBANK.NS</code>. Real-time market prices will be fetched live via Yahoo Finance.
              </p>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border-color)' }}>
                  <th style={{ padding: '0.75rem', fontWeight: 600, width: '22%' }}>Asset Type</th>
                  <th style={{ padding: '0.75rem', fontWeight: 600, width: '28%' }}>Ticker / Symbol</th>
                  <th style={{ padding: '0.75rem', fontWeight: 600, width: '25%' }}>Buy Rate (₹)</th>
                  <th style={{ padding: '0.75rem', fontWeight: 600, width: '25%' }}>Quantity</th>
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
                        <option value="Stock">Stock (Equity)</option>
                        <option value="Mutual Fund">Mutual Fund</option>
                        <option value="ETF">ETF</option>
                        <option value="Bond">Bond / Debt</option>
                        <option value="Crypto">Crypto</option>
                        <option value="Gold">Gold</option>
                        <option value="Real Estate">Real Estate</option>
                      </select>
                    </td>
                    <td style={{ padding: '0.5rem' }}>
                      <input
                        type="text"
                        value={inv.ticker}
                        onChange={(e) => handleInvestmentChange(inv.id, 'ticker', e.target.value)}
                        placeholder="e.g. AAPL or RELIANCE.NS"
                        style={inputStyle}
                      />
                    </td>
                    <td style={{ padding: '0.5rem' }}>
                      <input
                        type="number"
                        value={inv.buyPrice}
                        onChange={(e) => handleInvestmentChange(inv.id, 'buyPrice', e.target.value)}
                        placeholder="e.g. 2450.00"
                        style={inputStyle}
                      />
                    </td>
                    <td style={{ padding: '0.5rem' }}>
                      <input
                        type="number"
                        value={inv.quantity}
                        onChange={(e) => handleInvestmentChange(inv.id, 'quantity', e.target.value)}
                        placeholder="e.g. 25"
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

        {/* ========== STEP 3: INVESTMENT INTERESTS & PREFERENCES ========== */}
        {step === 3 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <div>
              <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.05rem' }}>Target Industries & Sectors</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1rem' }}>
                Select the industries you follow or want AI to track and suggest high-alpha opportunities for.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem' }}>
                {INDUSTRY_OPTIONS.map(industry => {
                  const selected = selectedIndustries.includes(industry);
                  return (
                    <div 
                      key={industry}
                      onClick={() => toggleIndustry(industry)}
                      style={tagStyle(selected)}
                    >
                      {selected ? '✓ ' : '+ '} {industry}
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1.5rem' }}>
              <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.05rem' }}>Preferred Investment Instruments</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1rem' }}>
                Choose your favored asset classes for personalized news digests & portfolio suggestions.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem' }}>
                {INSTRUMENT_OPTIONS.map(inst => {
                  const selected = selectedInstruments.includes(inst);
                  return (
                    <div 
                      key={inst}
                      onClick={() => toggleInstrument(inst)}
                      style={tagStyle(selected)}
                    >
                      {selected ? '✓ ' : '+ '} {inst}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ========== STEP 4: LIABILITIES, CREDIT CARDS & ITEMIZE EXPENSES ========== */}
        {step === 4 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <h3 style={{ margin: 0, fontSize: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>Credit Cards & Statement Details</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', background: 'var(--bg-color)', padding: '1.25rem', border: '1px solid var(--border-color)' }}>
              <Input label="Primary Credit Card Issuer / Name" id="creditCardIssuer" value={liabilities.creditCardIssuer || ''} onChange={handleInputChange(setLiabilities)} placeholder="e.g. HDFC Regalia / ICICI Bank" />
              <Input label="Total Credit Limit (₹)" id="creditCardLimit" type="number" value={liabilities.creditCardLimit || ''} onChange={handleInputChange(setLiabilities)} placeholder="e.g. 300000" />
              <Input label="Current Outstanding Balance (₹)" id="creditCardDebt" type="number" value={liabilities.creditCardDebt} onChange={handleInputChange(setLiabilities)} placeholder="e.g. 24500" />
              <Input label="Statement Due Date" id="creditCardDueDate" type="date" value={liabilities.creditCardDueDate || ''} onChange={handleInputChange(setLiabilities)} />
            </div>

            <h3 style={{ margin: 0, fontSize: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>Loans & EMIs</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
              <Input label="Home Loan EMI (₹)" id="homeLoanEmi" type="number" value={liabilities.homeLoanEmi} onChange={handleInputChange(setLiabilities)} placeholder="e.g. 35000" />
              <Input label="Car / Vehicle Loan EMI (₹)" id="carLoanEmi" type="number" value={liabilities.carLoanEmi} onChange={handleInputChange(setLiabilities)} placeholder="e.g. 12000" />
              <Input label="Personal Loan EMI (₹)" id="personalLoanEmi" type="number" value={liabilities.personalLoanEmi} onChange={handleInputChange(setLiabilities)} placeholder="e.g. 8000" />
              <Input label="Education Loan EMI (₹)" id="educationLoanEmi" type="number" value={liabilities.educationLoanEmi} onChange={handleInputChange(setLiabilities)} placeholder="e.g. 5000" />
            </div>

            <h3 style={{ margin: 0, fontSize: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>Monthly Living Expenses (Itemized)</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1.5rem' }}>
              <Input label="Rent / Housing (₹)" id="rent" type="number" value={expenses.rent} onChange={handleInputChange(setExpenses)} placeholder="e.g. 25000" />
              <Input label="Food & Groceries (₹)" id="food" type="number" value={expenses.food} onChange={handleInputChange(setExpenses)} placeholder="e.g. 12000" />
              <Input label="Transportation & Fuel (₹)" id="transportation" type="number" value={expenses.transportation} onChange={handleInputChange(setExpenses)} placeholder="e.g. 5000" />
              <Input label="Utilities (Electricity, Water, Gas) (₹)" id="utilities" type="number" value={expenses.utilities} onChange={handleInputChange(setExpenses)} placeholder="e.g. 4500" />
              <Input label="Insurance (Life, Health, Auto) (₹)" id="insurance" type="number" value={expenses.insurance} onChange={handleInputChange(setExpenses)} placeholder="e.g. 6000" />
              <Input label="Subscriptions (OTT, SaaS, Internet) (₹)" id="subscriptions" type="number" value={expenses.subscriptions} onChange={handleInputChange(setExpenses)} placeholder="e.g. 2500" />
              <Input label="Shopping & Lifestyle (₹)" id="shopping" type="number" value={expenses.shopping} onChange={handleInputChange(setExpenses)} placeholder="e.g. 8000" />
              <Input label="Healthcare & Wellness (₹)" id="healthcare" type="number" value={expenses.healthcare} onChange={handleInputChange(setExpenses)} placeholder="e.g. 3000" />
              <Input label="Education & Skills (₹)" id="education" type="number" value={expenses.education} onChange={handleInputChange(setExpenses)} placeholder="e.g. 4000" />
              <Input label="Dining Out & Leisure (₹)" id="entertainment" type="number" value={expenses.entertainment} onChange={handleInputChange(setExpenses)} placeholder="e.g. 6000" />
              <Input label="Miscellaneous Buffer (₹)" id="miscellaneous" type="number" value={expenses.miscellaneous} onChange={handleInputChange(setExpenses)} placeholder="e.g. 3000" />
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
            {loading ? 'Saving...' : (step < 4 ? 'Continue' : 'Complete Setup')}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default ManualEntry;
