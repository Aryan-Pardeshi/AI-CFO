import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Hub } from 'aws-amplify/utils';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';
import GoogleIcon from '../components/GoogleIcon';
import { getMe } from '../lib/api.js';
import { getCurrentAuthUser, signInUser, signInWithGoogleRedirect } from '../lib/auth.js';

function routeAfterSignIn(profile) {
  if (!profile || profile.onboarded === false || profile.onboarded === undefined) {
    return '/onboarding';
  }
  return '/dashboard';
}

const MOCK_MODE = import.meta.env.DEV && import.meta.env.VITE_USE_MOCKS === 'true';
const COGNITO_DOMAIN = import.meta.env.VITE_COGNITO_DOMAIN;
const DEMO_EMAIL = import.meta.env.VITE_DEMO_EMAIL;
const DEMO_PASSWORD = import.meta.env.VITE_DEMO_PASSWORD;

const Login = () => {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const unsub = Hub.listen('auth', ({ payload }) => {
      if (payload.event === 'signInWithRedirect' || payload.event === 'signedIn') {
        afterAuth().catch(() => {});
      }
    });
    getCurrentAuthUser()
      .then(() => afterAuth().catch(() => {}))
      .catch(() => {});
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function afterAuth() {
    try {
      const profile = await getMe();
      if (profile && typeof profile.onboarding_step === 'number') {
        navigate(profile.onboarded ? '/dashboard' : '/onboarding', { replace: true });
      } else if (!profile || profile.onboarded === false) {
        navigate('/onboarding', { replace: true });
      } else {
        navigate('/dashboard', { replace: true });
      }
    } catch (err) {
      if (err && (err.status === 404 || err.code === 'NOT_FOUND')) {
        navigate('/onboarding', { replace: true });
      }
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const email = e.target.email.value;
    const password = e.target.password.value;
    try {
      const result = await signInUser({ email, password });
      if (result?.nextStep?.signInStep === 'CONFIRM_SIGN_UP') {
        navigate(`/confirm?email=${encodeURIComponent(email)}`);
        return;
      }
      const profile = await getMe().catch((err) => {
        if (err && (err.status === 404 || err.code === 'NOT_FOUND')) return null;
        throw err;
      });
      navigate(routeAfterSignIn(profile), { replace: true });
    } catch (err) {
      setError(err?.message || 'Login failed');
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
      if (location) {
        await afterAuth();
      }
    } catch (err) {
      setError(err?.message || 'Google sign-in failed');
    }
  };

  const handleDemo = async () => {
    setError('');
    if (!MOCK_MODE && (!DEMO_EMAIL || !DEMO_PASSWORD)) {
      setError("Demo login isn't configured yet — use email for now");
      return;
    }
    setLoading(true);
    try {
      const email = DEMO_EMAIL || 'demo@aicfo.app';
      const password = DEMO_PASSWORD || 'demo';
      const result = await signInUser({ email, password });
      if (result?.nextStep?.signInStep === 'CONFIRM_SIGN_UP') {
        setError('Demo account is unverified — ask the team to fix the seeded demo user');
        return;
      }
      const profile = await getMe().catch((err) => {
        if (err && (err.status === 404 || err.code === 'NOT_FOUND')) return null;
        throw err;
      });
      navigate(routeAfterSignIn(profile), { replace: true });
    } catch (err) {
      setError(err?.message || 'Demo login failed');
    } finally {
      setLoading(false);
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
        <h1 style={{ marginBottom: '0.5rem', fontSize: '1.75rem' }}>Welcome Back</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Log in to your AICFO account.</p>
      </div>

      <form onSubmit={handleSubmit}>
        {error && (
          <div style={{ color: 'var(--error-color)', marginBottom: '1rem', textAlign: 'center', fontSize: '0.875rem' }}>
            {error}
          </div>
        )}
        <Input label="Email Address" id="email" type="email" required placeholder="john@company.com" />
        <Input label="Password" id="password" type="password" required placeholder="••••••••" />

        <div style={{ marginTop: '2rem' }}>
          <Button type="submit" disabled={loading}>{loading ? 'Logging in…' : 'Log In'}</Button>
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

      <div style={{ marginTop: '0.75rem' }}>
        <Button variant="outline" type="button" onClick={handleDemo} disabled={loading}>
          Try the Demo
        </Button>
      </div>

      <div style={{ marginTop: '2.5rem', textAlign: 'center', fontSize: '0.875rem' }}>
        <span style={{ color: 'var(--text-secondary)' }}>Don&apos;t have an account? </span>
        <Link to="/register" style={{ color: 'var(--text-primary)', fontWeight: 600, textDecoration: 'none' }}>
          Create one
        </Link>
      </div>
    </div>
  );
};

export default Login;
