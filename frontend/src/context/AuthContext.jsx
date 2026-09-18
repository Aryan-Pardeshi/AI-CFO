import React, { createContext, useContext, useState, useEffect } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [userEmail, setUserEmail] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check local storage on mount to persist login
    const email = localStorage.getItem('userEmail');
    if (email) {
      setUserEmail(email);
    }
    setLoading(false);
  }, []);

  const login = (email) => {
    localStorage.setItem('userEmail', email);
    setUserEmail(email);
  };

  const logout = () => {
    localStorage.removeItem('userEmail');
    setUserEmail(null);
  };

  if (loading) {
    return <div>Loading...</div>; // simple loading state
  }

  return (
    <AuthContext.Provider value={{ userEmail, login, logout, isAuthenticated: !!userEmail }}>
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
