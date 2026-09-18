import React from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { FiLogOut, FiUser, FiMoon, FiSun } from 'react-icons/fi';

const DashboardLayout = () => {
  const { logout, userEmail } = useAuth();
  const { isDarkMode, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navLinkStyle = ({ isActive }) => ({
    textDecoration: 'none',
    color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
    fontWeight: isActive ? 600 : 500,
    padding: '1.5rem 1rem',
    borderBottom: isActive ? '2px solid var(--accent-color)' : '2px solid transparent',
    transition: 'all 0.2s ease',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', backgroundColor: 'var(--bg-color)' }}>
      {/* Top Navigation Bar */}
      <header style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between', 
        padding: '0 2rem', 
        backgroundColor: 'var(--surface-color)',
        borderBottom: '1px solid var(--border-color)',
        height: '70px',
        position: 'sticky',
        top: 0,
        zIndex: 100
      }}>
        {/* Logo / Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ width: '32px', height: '32px', backgroundColor: 'var(--accent-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold' }}>
            A
          </div>
          <div>
            <h1 style={{ fontSize: '1.1rem', margin: 0, lineHeight: 1 }}>ARIA</h1>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>AI CFO Intelligence</span>
          </div>
        </div>

        {/* Navigation Links */}
        <nav style={{ display: 'flex', alignItems: 'center', height: '100%' }}>
          <NavLink to="/overview" style={navLinkStyle}>Overview</NavLink>
          <NavLink to="/ai-advisory" style={navLinkStyle}>ARIA Advisory</NavLink>
          <NavLink to="/milestones" style={navLinkStyle}>Milestones</NavLink>
          <NavLink to="/balance-sheet" style={navLinkStyle}>Balance Sheet</NavLink>
          <NavLink to="/news" style={navLinkStyle}>News & Intelligence</NavLink>
        </nav>

        {/* Right Actions (Profile, Theme, Logout) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <button onClick={toggleTheme} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
            {isDarkMode ? <FiSun size={20} /> : <FiMoon size={20} />}
          </button>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)', fontSize: '0.9rem' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: 'var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <FiUser size={16} />
            </div>
            <span>{userEmail?.split('@')[0]}</span>
          </div>
          
          <button onClick={handleLogout} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <FiLogOut size={16} /> <span style={{ fontSize: '0.875rem' }}>Logout</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main style={{ flex: 1, padding: '2rem', maxWidth: '1400px', margin: '0 auto', width: '100%' }}>
        <Outlet />
      </main>
    </div>
  );
};

export default DashboardLayout;
