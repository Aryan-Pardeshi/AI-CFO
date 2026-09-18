import React from 'react';
import Button from '../ui/Button';

const StatementAutofillBox = ({ heading, helperText, onClick, message }) => (
  <div style={{ border: '1px solid var(--border-color)', padding: '1.5rem' }}>
    <h3 style={{ marginTop: 0 }}>{heading}</h3>
    <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>{helperText}</p>
    <Button onClick={onClick}>Auto-fill from statement</Button>
    {message && <div style={{ marginTop: '0.75rem', fontSize: '0.875rem' }}>{message}</div>}
  </div>
);

export default StatementAutofillBox;
