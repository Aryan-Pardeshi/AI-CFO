export async function resolveAuthState(getCurrentAuthUser, getUserAttributes = async () => ({})) {
  try {
    const user = await getCurrentAuthUser();
    let attributes = user?.attributes || {};
    if (!attributes?.name || !attributes?.email) {
      try {
        attributes = { ...attributes, ...(await getUserAttributes()) };
      } catch {
        // Authenticated identity remains valid even if profile attributes cannot refresh.
      }
    }
    const userEmail = attributes?.email || user?.signInDetails?.loginId || user?.username || null;
    const userName = attributes?.name?.trim()
      || (userEmail?.includes('@') ? userEmail.split('@')[0] : 'Account');
    return {
      userEmail,
      userName,
      isAuthenticated: Boolean(userEmail || user),
    };
  } catch {
    return {
      userEmail: null,
      userName: null,
      isAuthenticated: false,
    };
  }
}
