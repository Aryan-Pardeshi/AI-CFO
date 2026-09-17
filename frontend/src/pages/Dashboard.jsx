import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../components/ui/Button';

const Dashboard = () => {
  const [userData, setUserData] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchUser = async () => {
      const email = localStorage.getItem('userEmail');
      if (!email) {
        navigate('/login');
        return;
      }
      
      try {
        const res = await fetch(`http://localhost:5000/api/auth/user/${encodeURIComponent(email)}`);
        if (res.ok) {
          const data = await res.json();
          setUserData(data.user);
        }
      } catch (err) {
        console.error("Failed to fetch user data", err);
      }
    };
    fetchUser();
  }, [navigate]);

  return (
    <div style={{ width: '100%', maxWidth: '800px' }}>
      <h1 style={{ marginBottom: '2rem' }}>Dashboard Overview</h1>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
        Here is the raw data stored in DynamoDB for your account.
      </p>

      {userData ? (
        <pre style={{ 
          background: 'var(--surface-color)', 
          padding: '1.5rem', 
          border: '1px solid var(--border-color)',
          overflowX: 'auto',
          fontSize: '0.9rem',
          lineHeight: '1.5'
        }}>
          {JSON.stringify(userData, null, 2)}
        </pre>
      ) : (
        <p>Loading your data...</p>
      )}

      <div style={{ marginTop: '2rem' }}>
        <Button variant="outline" onClick={() => {
          localStorage.removeItem('userEmail');
          navigate('/login');
        }}>
          Log Out
        </Button>
      </div>
    </div>
  );
};

export default Dashboard;
