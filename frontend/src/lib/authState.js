export async function resolveAuthState(getCurrentAuthUser) {
  try {
    const user = await getCurrentAuthUser();
    const userEmail = user?.signInDetails?.loginId || user?.username || user?.attributes?.email || null;
    return {
      userEmail,
      isAuthenticated: Boolean(userEmail || user),
    };
  } catch {
    return {
      userEmail: null,
      isAuthenticated: false,
    };
  }
}
