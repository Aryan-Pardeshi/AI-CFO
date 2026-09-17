import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../components/ui/Button';

const CSVUpload = () => {
  const navigate = useNavigate();
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleUpload = async () => {
    if (!file) {
      alert("Please select a file first.");
      return;
    }

    setLoading(true);
    
    // Mock processing delay
    await new Promise(r => setTimeout(r, 1500));

    const email = localStorage.getItem('userEmail');
    if (!email) {
      navigate('/login');
      return;
    }

    const financials = {
      onboardingMethod: 'csv_extraction',
      extractedData: {
        fileName: file.name,
        totalTransactions: 342,
        currentBalance: "14500.50",
        monthlyRevenue: "6200.00",
        monthlyExpenses: "1850.25"
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
        alert('Failed to save extracted data.');
      }
    } catch (err) {
      alert('Network error.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ width: '100%', maxWidth: '600px', background: 'var(--surface-color)', padding: '3rem', border: '1px solid var(--border-color)', textAlign: 'center' }}>
      <h2 style={{ marginBottom: '1.5rem' }}>Upload Financial Data</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem', lineHeight: '1.6' }}>
        Upload your bank statements, portfolio exports, or expense sheets (CSV format). We will automatically extract your complete financial profile including your assets, diverse income streams (job, business, rental), stock and mutual fund holdings, EMIs, and daily living expenses.
      </p>

      <div style={{ padding: '2rem', border: '1px dashed var(--border-color)', marginBottom: '2rem', background: 'var(--background-color)' }}>
        <input 
          type="file" 
          accept=".csv" 
          onChange={(e) => setFile(e.target.files[0])} 
          style={{ width: '100%' }}
        />
      </div>
      
      <Button onClick={handleUpload} disabled={loading || !file}>
        {loading ? 'Extracting Data...' : 'Upload and Extract'}
      </Button>
    </div>
  );
};

export default CSVUpload;
