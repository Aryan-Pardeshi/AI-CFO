import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';
import { confirmSignUpUser, resendSignUpCodeUser } from '../lib/auth.js';

const ConfirmSignUp = () => {
  const [searchParams] = useSearchParams();
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const email = searchParams.get('email') || '';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setInfo('');
    setLoading(true);
    const code = e.target.code.value.trim();
    const emailValue = e.target.email.value.trim();
    try {
      await confirmSignUpUser({ email: emailValue, code });
      navigate('/login', { replace: true });
    } catch (err) {
      setError(err?.message || 'Confirmation failed');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setError('');
    setInfo('');
    try {
      const emailValue = document.getElementById('email')?.value || email;
      await resendSignUpCodeUser({ email: emailValue });
      setInfo('A new code was sent.');
    } catch (err) {
      setError(err?.message || 'Could not resend code');
    }
  };

  return (
    <div style={{
      width: '100%',
      maxWidth: '400px',
      background: 'var(--surface-color)',
      padding: '3rem 2rem',
      border: '1px solid var(--border-color)'
    }}>
      <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
        <h1 style={{ marginBottom: '0.5rem', fontSize: '1.75rem' }}>Confirm Account</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Enter the code sent to your email.</p>
      </div>
      <form onSubmit={handleSubmit}>
        {error && (
          <div style={{ color: 'var(--error-color)', marginBottom: '1rem', textAlign: 'center', fontSize: '0.875rem' }}>
            {error}
          </div>
        )}
        {info && (
          <div style={{ marginBottom: '1rem', textAlign: 'center', fontSize: '0.875rem' }}>
            {info}
          </div>
        )}
        <Input label="Email Address" id="email" type="email" required defaultValue={email} placeholder="john@company.com" />
        <Input label="Confirmation Code" id="code" type="text" required placeholder="123456" />
        <div style={{ marginTop: '2rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <Button type="submit" disabled={loading}>{loading ? 'Confirming…' : 'Confirm'}</Button>
          <Button type="button" variant="outline" onClick={handleResend}>Resend code</Button>
        </div>
      </form>
    </div>
  );
};

export default ConfirmSignUp;
