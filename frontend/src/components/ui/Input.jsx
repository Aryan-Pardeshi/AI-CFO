import React from 'react';

const Input = ({ label, id, ...props }) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.25rem' }}>
      {label && (
        <label 
          htmlFor={id} 
          style={{ 
            fontSize: '0.875rem', 
            color: 'var(--text-secondary)',
            fontWeight: 500
          }}
        >
          {label}
        </label>
      )}
      <input
        id={id}
        style={{
          padding: '0.75rem',
          border: '1px solid var(--border-color)',
          background: 'var(--surface-color)',
          color: 'var(--text-primary)',
          fontSize: '1rem',
          borderRadius: 0, // Sharp corners
          outline: 'none',
          fontFamily: 'var(--font-sans)',
          transition: 'border-color 0.2s'
        }}
        onFocus={(e) => e.target.style.borderColor = 'var(--accent-color)'}
        onBlur={(e) => e.target.style.borderColor = 'var(--border-color)'}
        {...props}
      />
    </div>
  );
};

export default Input;
