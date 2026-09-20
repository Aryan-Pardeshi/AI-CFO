import React from 'react';
import Button from '../ui/Button';

const StatementAutofillBox = ({ heading, helperText, onClick, onFileSelected, message, loading = false, fileLabel = 'CSV statement', inputId = 'onboarding-statement-csv' }) => (
  <div style={{ border: '1px solid var(--border-color)', padding: '1.5rem' }}>
    <h3 style={{ marginTop: 0 }}>{heading}</h3>
    <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>{helperText}</p>
    {onFileSelected ? (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <label htmlFor={inputId}>{fileLabel}</label>
        <input
          id={inputId}
          type="file"
          accept=".csv,text/csv"
          disabled={loading}
          onChange={(event) => {
            const [file] = event.target.files || [];
            if (file) onFileSelected(file);
            event.target.value = '';
          }}
        />
      </div>
    ) : <Button onClick={onClick}>Auto-fill from statement</Button>}
    {message && <div role="status" style={{ marginTop: '0.75rem', fontSize: '0.875rem' }}>{message}</div>}
  </div>
);

export default StatementAutofillBox;
