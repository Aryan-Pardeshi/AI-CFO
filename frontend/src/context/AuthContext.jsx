import React, { createContext, useContext, useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { Hub } from 'aws-amplify/utils';
import { getCurrentAuthUser, getCurrentAuthUserAttributes, signOutUser } from '../lib/auth.js';
import { resolveAuthState } from '../lib/authState.js';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [userEmail, setUserEmail] = useState(null);
  const [userName, setUserName] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  const refreshAuth = async () => {
    const { userEmail: currentEmail, userName: currentName, isAuthenticated: authenticated } = await resolveAuthState(getCurrentAuthUser, getCurrentAuthUserAttributes);
    setUserEmail(currentEmail);
    setUserName(currentName);
    setIsAuthenticated(authenticated);
    setLoading(false);
    return currentEmail;
  };

  useEffect(() => {
    let mounted = true;
    const refresh = async () => {
      const state = await resolveAuthState(getCurrentAuthUser, getCurrentAuthUserAttributes);
      if (!mounted) return;
      setUserEmail(state.userEmail);
      setUserName(state.userName);
      setIsAuthenticated(state.isAuthenticated);
      setLoading(false);
    };
    const unsubscribe = Hub.listen('auth', ({ payload }) => {
      if (payload.event === 'signedOut') {
        setUserEmail(null);
        setUserName(null);
        setIsAuthenticated(false);
        setLoading(false);
      } else if (payload.event === 'signedIn' || payload.event === 'signInWithRedirect') {
        refresh();
      }
    });
    refresh();
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  const login = refreshAuth;

  const logout = async () => {
    await signOutUser();
    setUserEmail(null);
    setUserName(null);
    setIsAuthenticated(false);
  };

  if (loading) {
    return <div>Loading...</div>; // simple loading state
  }

  return (
    <AuthContext.Provider value={{ userEmail, userName, login, logout, isAuthenticated }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);

export const ProtectedRoute = ({ children }) => {
  const { isAuthenticated } = useAuth();
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  
  return children;
};
