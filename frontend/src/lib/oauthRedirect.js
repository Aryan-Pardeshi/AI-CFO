export function resolveOAuthRedirectUrl(origin, loginPath = '/login') {
  return new URL(loginPath, origin).toString();
}
