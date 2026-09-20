let currentUser = null;

const QA_KEY = 'aicfo_local_qa_user';

function getPersistedUser() {
  try {
    if (typeof sessionStorage !== 'undefined') {
      const stored = sessionStorage.getItem(QA_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return {
          username: parsed.email || 'demo@aicfo.app',
          signInDetails: { loginId: parsed.email || 'demo@aicfo.app' },
          attributes: { email: parsed.email || 'demo@aicfo.app', name: 'Demo User' },
        };
      }
    }
  } catch {}
  return null;
}

function persistUser(user) {
  try {
    if (typeof sessionStorage !== 'undefined') {
      if (user) {
        sessionStorage.setItem(
          QA_KEY,
          JSON.stringify({ email: user.signInDetails?.loginId || user.username }),
        );
      } else {
        sessionStorage.removeItem(QA_KEY);
      }
    }
  } catch {}
}

export function mockIdToken() {
  return 'mock-id-token';
}

export async function mockSignUp({ email, name }) {
  currentUser = { username: email, signInDetails: { loginId: email }, attributes: { name } };
  persistUser(currentUser);
  return { isSignUpComplete: false, nextStep: { signUpStep: 'CONFIRM_SIGN_UP' } };
}

export async function mockConfirmSignUp() {
  return {};
}

export async function mockResendCode() {
  return {};
}

export async function mockSignIn({ email } = {}) {
  const loginId = email || 'demo@aicfo.app';
  currentUser = { username: loginId, signInDetails: { loginId } };
  persistUser(currentUser);
  return { isSignedIn: true, nextStep: { signInStep: 'DONE' } };
}

export async function mockSignOut() {
  currentUser = null;
  persistUser(null);
}

export async function mockGetCurrentUser() {
  if (!currentUser) {
    currentUser = getPersistedUser();
  }
  if (!currentUser) {
    throw new Error('Not signed in');
  }
  return currentUser;
}

export function __resetMockAuth() {
  currentUser = null;
  persistUser(null);
}
