import React from 'react';
import { useNavigate } from 'react-router-dom';

const OnboardingMethod = () => {
  const navigate = useNavigate();

  const handleSelect = (method) => {
    if (method === 'csv') {
      navigate('/onboarding/csv');
    } else {
      navigate('/onboarding/manual');
    }
  };

  const cardStyle = {
    flex: 1,
    background: 'var(--surface-color)',
    border: '1px solid var(--border-color)',
    padding: '2rem',
    cursor: 'pointer',
    transition: 'border-color 0.2s',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: '1rem',
  };

  return (
    <div style={{ width: '100%', maxWidth: '800px' }}>
      <div style={{ marginBottom: '3rem' }}>
        <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>Welcome to AICFO</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem', marginBottom: '0.5rem' }}>
          Let's set up your financial data. How would you like to provide your information?
        </p>
        <p style={{ color: 'var(--text-primary)', fontSize: '0.9rem', fontWeight: 500 }}>
          You have to do this section only once while creating the account.
        </p>
      </div>

      <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
        
        {/* CSV Option */}
        <div 
          style={cardStyle} 
          onClick={() => handleSelect('csv')}
          onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--text-primary)'}
          onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border-color)'}
        >
          <div style={{ 
            background: 'var(--text-primary)', 
            color: 'var(--surface-color)', 
            padding: '0.75rem', 
            display: 'flex'
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="17 8 12 3 7 8"></polyline>
              <line x1="12" y1="3" x2="12" y2="15"></line>
            </svg>
          </div>
          <h2 style={{ fontSize: '1.25rem', margin: 0 }}>Upload CSV</h2>
          <p style={{ color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
            Fastest method. Upload your recent bank statements or accounting exports and we will automatically extract the data.
          </p>
        </div>

        {/* Manual Option */}
        <div 
          style={cardStyle} 
          onClick={() => handleSelect('manual')}
          onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--text-primary)'}
          onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border-color)'}
        >
          <div style={{ 
            background: 'var(--text-primary)', 
            color: 'var(--surface-color)', 
            padding: '0.75rem', 
            display: 'flex'
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter">
              <path d="M12 20h9"></path>
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
            </svg>
          </div>
          <h2 style={{ fontSize: '1.25rem', margin: 0 }}>Manual Entry</h2>
          <p style={{ color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
            Write down your current balances, revenue, and major expenses step-by-step manually.
          </p>
        </div>

      </div>
    </div>
  );
};

export default OnboardingMethod;
