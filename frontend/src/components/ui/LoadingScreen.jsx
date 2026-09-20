import React, { useEffect, useState } from 'react';
import { FiShield, FiCheckCircle, FiLock, FiCpu, FiDatabase, FiRefreshCw } from 'react-icons/fi';

const statusSteps = [
  "Authenticating security keys...",
  "Decrypting portfolio ledger...",
  "Connecting to Yahoo Finance live market feeds...",
  "Initializing ARIA AI Advisory engine...",
  "Loading executive overview..."
];

const LoadingScreen = ({ message = "Logging in..." }) => {
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentStep((prev) => (prev < statusSteps.length - 1 ? prev + 1 : prev));
    }, 240);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 9999,
      backgroundColor: '#061208',
      backgroundImage: 'radial-gradient(circle at 50% 40%, rgba(6,78,59,0.35) 0%, rgba(3,14,8,0.95) 70%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#FAFAF9',
      fontFamily: 'var(--font-sans)',
      padding: '2rem'
    }}>
      {/* Animated Radar Radar Circle */}
      <div style={{ position: 'relative', width: '120px', height: '120px', marginBottom: '2.5rem' }}>
        {/* Outer Ring Spin */}
        <div style={{
          position: 'absolute',
          inset: 0,
          border: '2px dashed rgba(110,231,183,0.3)',
          borderRadius: '50%',
          animation: 'spin 6s linear infinite'
        }} />
        
        {/* Middle Pulse Ring */}
        <div style={{
          position: 'absolute',
          inset: '12px',
          border: '2px solid rgba(6,78,59,0.8)',
          borderRadius: '50%',
          animation: 'spin 2.5s reverse linear infinite'
        }} />

        {/* Center Logo Box */}
        <div style={{
          position: 'absolute',
          inset: '24px',
          background: '#064E3B',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 0 30px rgba(110,231,183,0.4)',
          border: '1px solid #6EE7B7'
        }}>
          <span style={{
            fontFamily: 'var(--font-serif)',
            fontSize: '1.5rem',
            fontWeight: 800,
            color: '#ECFDF5',
            letterSpacing: '-1px'
          }}>A</span>
        </div>
      </div>

      {/* Main Title */}
      <h2 style={{
        fontFamily: 'var(--font-serif)',
        fontSize: '1.6rem',
        fontWeight: 600,
        color: '#ECFDF5',
        marginBottom: '0.75rem',
        letterSpacing: '0.5px'
      }}>
        {message}
      </h2>

      {/* Status Progress Tick */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.6rem',
        background: 'rgba(6,78,59,0.35)',
        border: '1px solid rgba(110,231,183,0.2)',
        padding: '0.5rem 1.25rem',
        borderRadius: '20px',
        marginBottom: '2rem'
      }}>
        <FiRefreshCw className="spin" color="#6EE7B7" size={14} />
        <span style={{ fontSize: '0.85rem', color: '#A7F3D0', fontWeight: 500 }}>
          {statusSteps[currentStep]}
        </span>
      </div>

      {/* Progress Bar */}
      <div style={{
        width: '280px',
        height: '4px',
        background: 'rgba(255,255,255,0.1)',
        borderRadius: '2px',
        overflow: 'hidden'
      }}>
        <div style={{
          width: `${((currentStep + 1) / statusSteps.length) * 100}%`,
          height: '100%',
          background: 'linear-gradient(90deg, #064E3B, #6EE7B7)',
          transition: 'width 0.25s ease'
        }} />
      </div>
    </div>
  );
};

export default LoadingScreen;
