function isMockOrQaSession() {
  if (!import.meta.env.DEV) return false;
  if (import.meta.env.VITE_USE_MOCKS === 'true') return true;
  try {
    if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('aicfo_local_qa_user')) {
      return true;
    }
  } catch {}
  return false;
}

export async function signUpUser({ email, password, name }) {
  if (isMockOrQaSession()) {
    const { mockSignUp } = await import('../mocks/auth-mock.js');
    return mockSignUp({ email, name });
  }
  const { signUp } = await import('aws-amplify/auth');
  return signUp({
    username: email,
    password,
    options: { userAttributes: { email, name } },
  });
}

export async function confirmSignUpUser({ email, code }) {
  if (isMockOrQaSession()) {
    const { mockConfirmSignUp } = await import('../mocks/auth-mock.js');
    return mockConfirmSignUp({ email });
  }
  const { confirmSignUp } = await import('aws-amplify/auth');
  return confirmSignUp({ username: email, confirmationCode: code });
}

export async function resendSignUpCodeUser({ email }) {
  if (isMockOrQaSession()) {
    const { mockResendCode } = await import('../mocks/auth-mock.js');
    return mockResendCode({ email });
  }
  const { resendSignUpCode } = await import('aws-amplify/auth');
  return resendSignUpCode({ username: email });
}

export async function signInUser({ email, password }) {
  if (isMockOrQaSession()) {
    const { mockSignIn } = await import('../mocks/auth-mock.js');
    return mockSignIn({ email });
  }
  const { signIn } = await import('aws-amplify/auth');
  return signIn({ username: email, password });
}

export async function signOutUser() {
  if (isMockOrQaSession()) {
    const { mockSignOut } = await import('../mocks/auth-mock.js');
    return mockSignOut();
  }
  const { signOut } = await import('aws-amplify/auth');
  return signOut();
}

export async function getCurrentAuthUser() {
  if (isMockOrQaSession()) {
    const { mockGetCurrentUser } = await import('../mocks/auth-mock.js');
    return mockGetCurrentUser();
  }
  const { getCurrentUser } = await import('aws-amplify/auth');
  return getCurrentUser();
}

export async function signInWithGoogleRedirect() {
  if (isMockOrQaSession()) {
    const { mockSignIn } = await import('../mocks/auth-mock.js');
    return mockSignIn({ email: 'mock.user@example.com' });
  }
  const { signInWithRedirect } = await import('aws-amplify/auth');
  return signInWithRedirect({ provider: 'Google' });
}
