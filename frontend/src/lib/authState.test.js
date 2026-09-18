import { describe, expect, test } from 'vitest';
import { resolveAuthState } from './authState.js';
import fs from 'node:fs';
import path from 'node:path';

describe('Cognito auth state', () => {
  test('resolves the signed-in identity from Cognito and ignores local storage', async () => {
    globalThis.localStorage = {
      getItem: () => 'stale.local.storage@example.com',
    };

    await expect(resolveAuthState(async () => ({ username: 'cognito@example.com' }))).resolves.toEqual({
      userEmail: 'cognito@example.com',
      isAuthenticated: true,
    });
  });

  test('resolves unauthenticated state when Cognito has no current user', async () => {
    await expect(resolveAuthState(async () => {
      throw new Error('No current user');
    })).resolves.toEqual({
      userEmail: null,
      isAuthenticated: false,
    });
  });

  test('credential login refreshes Cognito context before entering protected routes', () => {
    const loginSource = fs.readFileSync(path.resolve('src/pages/Login.jsx'), 'utf8');
    const contextSource = fs.readFileSync(path.resolve('src/context/AuthContext.jsx'), 'utf8');

    expect(loginSource).toContain('const { login } = useAuth()');
    expect(loginSource).toContain('await login()');
    expect(contextSource).toContain("Hub.listen('auth'");
    expect(contextSource).not.toContain("localStorage.getItem('userEmail')");
  });

  test('ported frontend contains no legacy localhost API or localStorage identity', () => {
    const files = [
      'src/pages/ManualEntry.jsx',
      'src/pages/CSVUpload.jsx',
      'src/pages/dashboard/Overview.jsx',
      'src/pages/dashboard/BalanceSheet.jsx',
      'src/pages/dashboard/News.jsx',
      'src/context/AuthContext.jsx',
    ];
    const source = files.map((file) => fs.readFileSync(path.resolve(file), 'utf8')).join('\n');

    expect(source).not.toContain('localhost:5000');
    expect(source).not.toContain('/api/auth');
    expect(source).not.toContain("localStorage.setItem('userEmail'");
  });

  test('keeps the canonical eight-step onboarding at /onboarding', () => {
    const appSource = fs.readFileSync(path.resolve('src/App.jsx'), 'utf8');

    expect(appSource).toContain("import Onboarding from './pages/Onboarding'");
    expect(appSource).toContain('path="onboarding" element={<ProtectedRoute><Onboarding /></ProtectedRoute>}');
  });

  test('news lets the backend derive personalization when the user has no holdings', () => {
    const newsSource = fs.readFileSync(path.resolve('src/pages/dashboard/News.jsx'), 'utf8');

    expect(newsSource).toContain('let tickers = []');
    expect(newsSource).not.toContain("let tickers = ['AAPL', 'RELIANCE.NS']");
  });

  test('news market pulse and flash wire are driven by live API data', () => {
    const newsSource = fs.readFileSync(path.resolve('src/pages/dashboard/News.jsx'), 'utf8');

    expect(newsSource).toContain('getPortfolioPrices');
    expect(newsSource).toContain("ticker: '^NSEI'");
    expect(newsSource).toContain('news.slice(0, 7).map');
    expect(newsSource).not.toContain("value: '25,388.90'");
    expect(newsSource).not.toContain('RBI Monetary Policy Committee maintains Repo Rate');
  });
});
