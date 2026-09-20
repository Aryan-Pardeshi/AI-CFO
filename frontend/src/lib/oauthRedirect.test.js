import { describe, expect, test } from 'vitest';
import { resolveOAuthRedirectUrl } from './oauthRedirect.js';

describe('resolveOAuthRedirectUrl', () => {
  test('uses the active deployed origin rather than a build-machine localhost URL', () => {
    expect(resolveOAuthRedirectUrl(
      'https://main.d19guqu2l1q2px.amplifyapp.com',
      '/login',
    )).toBe('https://main.d19guqu2l1q2px.amplifyapp.com/login');
  });
});
