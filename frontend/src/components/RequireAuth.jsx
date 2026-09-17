import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { getCurrentAuthUser } from '../lib/auth.js';

export default function RequireAuth({ children }) {
  const [state, setState] = useState('checking');
  const location = useLocation();

  useEffect(() => {
    let mounted = true;
    getCurrentAuthUser()
      .then(() => {
        if (mounted) setState('signed-in');
      })
      .catch(() => {
        if (mounted) setState('signed-out');
      });
    return () => {
      mounted = false;
    };
  }, []);

  if (state === 'checking') {
    return <p>Loading…</p>;
  }
  if (state === 'signed-out') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return children;
}
