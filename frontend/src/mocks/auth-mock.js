let currentUser = null;

export function mockIdToken() {
  return 'mock-id-token';
}

export async function mockSignUp({ email, name }) {
  currentUser = { username: email, signInDetails: { loginId: email }, attributes: { name } };
  return { isSignUpComplete: false, nextStep: { signUpStep: 'CONFIRM_SIGN_UP' } };
}

export async function mockConfirmSignUp() {
  return {};
}

export async function mockResendCode() {
  return {};
}

export async function mockSignIn({ email } = {}) {
  const loginId = email || 'mock.user@example.com';
  currentUser = { username: loginId, signInDetails: { loginId } };
  return { isSignedIn: true, nextStep: { signInStep: 'DONE' } };
}

export async function mockSignOut() {
  currentUser = null;
}

export async function mockGetCurrentUser() {
  if (!currentUser) {
    throw new Error('Not signed in');
  }
  return currentUser;
}

export function __resetMockAuth() {
  currentUser = null;
}
