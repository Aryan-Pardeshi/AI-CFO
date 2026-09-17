export async function signUpUser({ email, password, name }) {
  if (import.meta.env.DEV && import.meta.env.VITE_USE_MOCKS === 'true') {
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
  if (import.meta.env.DEV && import.meta.env.VITE_USE_MOCKS === 'true') {
    const { mockConfirmSignUp } = await import('../mocks/auth-mock.js');
    return mockConfirmSignUp({ email });
  }
  const { confirmSignUp } = await import('aws-amplify/auth');
  return confirmSignUp({ username: email, confirmationCode: code });
}

export async function resendSignUpCodeUser({ email }) {
  if (import.meta.env.DEV && import.meta.env.VITE_USE_MOCKS === 'true') {
    const { mockResendCode } = await import('../mocks/auth-mock.js');
    return mockResendCode({ email });
  }
  const { resendSignUpCode } = await import('aws-amplify/auth');
  return resendSignUpCode({ username: email });
}

export async function signInUser({ email, password }) {
  if (import.meta.env.DEV && import.meta.env.VITE_USE_MOCKS === 'true') {
    const { mockSignIn } = await import('../mocks/auth-mock.js');
    return mockSignIn({ email });
  }
  const { signIn } = await import('aws-amplify/auth');
  return signIn({ username: email, password });
}

export async function signOutUser() {
  if (import.meta.env.DEV && import.meta.env.VITE_USE_MOCKS === 'true') {
    const { mockSignOut } = await import('../mocks/auth-mock.js');
    return mockSignOut();
  }
  const { signOut } = await import('aws-amplify/auth');
  return signOut();
}

export async function getCurrentAuthUser() {
  if (import.meta.env.DEV && import.meta.env.VITE_USE_MOCKS === 'true') {
    const { mockGetCurrentUser } = await import('../mocks/auth-mock.js');
    return mockGetCurrentUser();
  }
  const { getCurrentUser } = await import('aws-amplify/auth');
  return getCurrentUser();
}

export async function signInWithGoogleRedirect() {
  if (import.meta.env.DEV && import.meta.env.VITE_USE_MOCKS === 'true') {
    const { mockSignIn } = await import('../mocks/auth-mock.js');
    return mockSignIn({ email: 'mock.user@example.com' });
  }
  const { signInWithRedirect } = await import('aws-amplify/auth');
  return signInWithRedirect({ provider: 'Google' });
}
