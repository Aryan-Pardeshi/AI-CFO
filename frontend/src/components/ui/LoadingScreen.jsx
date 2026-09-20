import React, { useEffect, useState } from 'react';
import { FiRefreshCw } from 'react-icons/fi';

// Honest post-login transition: purely presentational. The parent renders this
// ONLY while real async work (Cognito session + profile/onboarding resolution)
// is in flight, and removes it the moment routing or an error is known.
// There are no timers or fake step progressions here.

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() => {
    try {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    let mql;
    try {
      mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    } catch {
      return undefined;
    }
    const onChange = (e) => setReduced(e.matches);
    if (mql.addEventListener) mql.addEventListener('change', onChange);
    else if (mql.addListener) mql.addListener(onChange);
    return () => {
      if (mql.removeEventListener) mql.removeEventListener('change', onChange);
      else if (mql.removeListener) mql.removeListener(onChange);
    };
  }, []);

  return reduced;
}

const LoadingScreen = ({ message = 'Signing you in…', stage = '' }) => {
  const prefersReducedMotion = usePrefersReducedMotion();

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={stage || message}
      style={{
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
        padding: '2rem',
        textAlign: 'center',
      }}
    >
      <div style={{ position: 'relative', width: '120px', height: '120px', marginBottom: '2rem' }} aria-hidden="true">
        <div style={{ position: 'absolute', inset: 0, border: '2px dashed rgba(110,231,183,0.3)', borderRadius: '50%', animation: prefersReducedMotion ? 'none' : 'spin 6s linear infinite' }} />
        <div style={{ position: 'absolute', inset: '12px', border: '2px solid rgba(6,78,59,0.8)', borderRadius: '50%', animation: prefersReducedMotion ? 'none' : 'spin 2.5s reverse linear infinite' }} />
        <div style={{ position: 'absolute', inset: '24px', background: '#064E3B', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 30px rgba(110,231,183,0.4)', border: '1px solid #6EE7B7' }}>
          <span style={{ fontFamily: 'var(--font-serif)', fontSize: '1.5rem', fontWeight: 800, color: '#ECFDF5' }}>A</span>
        </div>
      </div>

      <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.4rem', fontWeight: 600, color: '#ECFDF5', marginBottom: '0.75rem' }}>
        {message}
      </h2>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', background: 'rgba(6,78,59,0.35)', border: '1px solid rgba(110,231,183,0.2)', padding: '0.5rem 1.25rem', borderRadius: '20px' }}>
        <FiRefreshCw className={prefersReducedMotion ? '' : 'spin'} color="#6EE7B7" size={14} aria-hidden="true" />
        <span style={{ fontSize: '0.85rem', color: '#A7F3D0', fontWeight: 500 }}>
          {stage || 'Working…'}
        </span>
      </div>
    </div>
  );
};

export default LoadingScreen;
