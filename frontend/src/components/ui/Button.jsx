import React from 'react';

const Button = ({ children, variant = 'primary', style, ...props }) => {
  const isOutline = variant === 'outline';
  
  return (
    <button 
      className={isOutline ? 'btn-outline' : 'btn'}
      style={{
        padding: '0.75rem 1.5rem',
        width: '100%',
        fontSize: '1rem',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        gap: '0.5rem',
        ...style
      }}
      {...props}
    >
      {children}
    </button>
  );
};

export default Button;
