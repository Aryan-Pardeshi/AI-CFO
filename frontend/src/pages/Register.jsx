import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';
import GoogleIcon from '../components/GoogleIcon';
import { signInWithGoogleRedirect, signUpUser } from '../lib/auth.js';

const MOCK_MODE = import.meta.env.DEV && import.meta.env.VITE_USE_MOCKS === 'true';
const COGNITO_DOMAIN = import.meta.env.VITE_COGNITO_DOMAIN;

const Register = () => {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const name = e.target.name?.value;
    const email = e.target.email.value;
    const password = e.target.password.value;
    try {
      const result = await signUpUser({ email, password, name });
      if (result?.nextStep?.signUpStep === 'CONFIRM_SIGN_UP') {
        navigate(`/confirm?email=${encodeURIComponent(email)}`);
      } else {
        navigate(`/confirm?email=${encodeURIComponent(email)}`);
      }
    } catch (err) {
      setError(err?.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError('');
    if (!MOCK_MODE && !COGNITO_DOMAIN) {
      setError("Google sign-in isn't configured yet — use email for now");
      return;
    }
    try {
      await signInWithGoogleRedirect();
    } catch (err) {
      setError(err?.message || 'Google sign-in failed');
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
        <h1 style={{ marginBottom: '0.5rem', fontSize: '1.75rem' }}>Create Account</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Join AICFO to manage your financials.</p>
      </div>

      <form onSubmit={handleSubmit}>
        {error && (
          <div style={{ color: 'var(--error-color)', marginBottom: '1rem', textAlign: 'center', fontSize: '0.875rem' }}>
            {error}
          </div>
        )}
        <Input label="Full Name" id="name" type="text" required placeholder="John Doe" />
        <Input label="Email Address" id="email" type="email" required placeholder="john@company.com" />
        <Input label="Password" id="password" type="password" required placeholder="••••••••" />

        <div style={{ marginTop: '2rem' }}>
          <Button type="submit" disabled={loading}>{loading ? 'Creating…' : 'Create Account'}</Button>
        </div>
      </form>

      <div style={{ margin: '1.5rem 0', display: 'flex', alignItems: 'center', color: 'var(--border-color)' }}>
        <div style={{ flex: 1, height: '1px', background: 'var(--border-color)' }}></div>
        <span style={{ padding: '0 1rem', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>OR</span>
        <div style={{ flex: 1, height: '1px', background: 'var(--border-color)' }}></div>
      </div>

      <Button variant="outline" type="button" onClick={handleGoogle}>
        <GoogleIcon />
        Continue with Google
      </Button>

      <div style={{ marginTop: '2.5rem', textAlign: 'center', fontSize: '0.875rem' }}>
        <span style={{ color: 'var(--text-secondary)' }}>Already have an account? </span>
        <Link to="/login" style={{ color: 'var(--text-primary)', fontWeight: 600, textDecoration: 'none' }}>
          Log in
        </Link>
      </div>
    </div>
  );
};

export default Register;
