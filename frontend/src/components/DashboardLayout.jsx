import React from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { FiLogOut, FiUser, FiMoon, FiSun } from 'react-icons/fi';

const DashboardLayout = () => {
  const { logout, userEmail } = useAuth();
  const { isDarkMode, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const navLinkStyle = ({ isActive }) => ({
    textDecoration: 'none',
    color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
    fontWeight: isActive ? 600 : 500,
    borderBottom: isActive ? '2px solid var(--accent-color)' : '2px solid transparent',
    transition: 'color 0.2s ease, border-color 0.2s ease',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    whiteSpace: 'nowrap',
  });

  return (
    <div className="dash-shell" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', backgroundColor: 'var(--bg-color)' }}>
      {/*
        Responsive shell. The nav carries seven destinations, which cannot fit on a phone in one
        row, so below 1100px the bar becomes two rows and the nav itself turns into a horizontally
        scrollable strip. Scoped here rather than in the shared index.css so this component owns
        its own breakpoints.
      */}
      <style>{`
        .dash-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          padding: 0 2rem;
          background-color: var(--surface-color);
          border-bottom: 1px solid var(--border-color);
          height: 70px;
          position: sticky;
          top: 0;
          z-index: 100;
          box-shadow: var(--shadow-sm);
        }
        .dash-nav {
          display: flex;
          align-items: stretch;
          height: 100%;
          min-width: 0;
          overflow-x: auto;
          overflow-y: hidden;
          scrollbar-width: none;
        }
        .dash-nav::-webkit-scrollbar { display: none; }
        .dash-nav a { padding: 1.5rem 1rem; }

        @media (max-width: 1100px) {
          .dash-header {
            flex-wrap: wrap;
            height: auto;
            padding: 0.5rem 1rem;
            row-gap: 0;
          }
          /* Brand and actions share row one; the nav takes the full width of row two. */
          .dash-nav {
            order: 3;
            flex-basis: 100%;
            height: auto;
            border-top: 1px solid var(--border-color);
            margin: 0 -1rem;
            padding: 0 1rem;
          }
          .dash-nav a { padding: 0.85rem 0.85rem; font-size: 0.9rem; }
          .dash-brand img { width: 40px; height: 40px; }
        }
        @media (max-width: 640px) {
          .dash-user-name { display: none; }
          .dash-logout-label { display: none; }
        }
        @media (prefers-reduced-motion: reduce) {
          .dash-nav a { transition: none; }
        }
      `}</style>

      {/* Top Navigation Bar */}
      <header className="dash-header">
        {/* Logo / Brand */}
        <div className="dash-brand" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <img
            src="/aria-logo.png"
            alt="ARIA"
            style={{ width: '56px', height: '56px', objectFit: 'contain', flexShrink: 0 }}
          />
        </div>

        {/* Navigation Links */}
        <nav className="dash-nav" aria-label="Dashboard sections">
          <NavLink to="/overview" style={navLinkStyle}>Overview</NavLink>
          <NavLink to="/ai-advisory" style={navLinkStyle}>ARIA Advisory</NavLink>
          <NavLink to="/monthly-tracker" style={navLinkStyle}>Monthly Tracker</NavLink>
          <NavLink to="/milestones" style={navLinkStyle}>Milestones</NavLink>
          <NavLink to="/fire" style={navLinkStyle}>FIRE</NavLink>
          <NavLink to="/balance-sheet" style={navLinkStyle}>Balance Sheet</NavLink>
          <NavLink to="/news" style={navLinkStyle}>News &amp; Intelligence</NavLink>
        </nav>

        {/* Right Actions (Profile, Theme, Logout) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
          <button
            onClick={toggleTheme}
            aria-label={isDarkMode ? 'Switch to light theme' : 'Switch to dark theme'}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', padding: '0.5rem', borderRadius: '8px' }}
          >
            {isDarkMode ? <FiSun size={20} /> : <FiMoon size={20} />}
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)', fontSize: '0.875rem', background: 'var(--surface-muted)', padding: '0.35rem 0.85rem', borderRadius: '9999px', border: '1px solid var(--border-color)' }}>
            <div style={{ width: '24px', height: '24px', borderRadius: '50%', backgroundColor: 'var(--accent-color)', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <FiUser size={13} />
            </div>
            <span className="dash-user-name" style={{ fontWeight: 600 }}>{userEmail?.split('@')[0]}</span>
          </div>

          <button
            onClick={handleLogout}
            aria-label="Log out"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.875rem', fontWeight: 500, padding: '0.5rem 0.75rem', borderRadius: '8px' }}
          >
            <FiLogOut size={16} /> <span className="dash-logout-label">Logout</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="dash-main" style={{ flex: 1, padding: 'clamp(1rem, 4vw, 2rem)', maxWidth: '1400px', margin: '0 auto', width: '100%' }}>
        <Outlet />
      </main>
    </div>
  );
};

export default DashboardLayout;
