import React, { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { FiLogOut, FiUser, FiMoon, FiSun, FiMenu, FiX } from 'react-icons/fi';
import './DashboardLayout.css';

const DashboardLayout = () => {
  const { logout, userName } = useAuth();
  const { isDarkMode, toggleTheme } = useTheme();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const navigate = useNavigate();

  const handleLogout = async () => {
    setIsMobileMenuOpen(false);
    await logout();
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

  const closeMobileMenu = () => setIsMobileMenuOpen(false);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', backgroundColor: 'var(--bg-color)' }}>
      {/* Top Navigation Bar */}
      <header className="dashboard-header">
        {/* Logo / Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <img
            src="/aria-logo.png"
            alt="ARIA"
            style={{ width: '40px', height: '40px', objectFit: 'contain', flexShrink: 0 }}
          />
        </div>

        {/* Desktop Navigation Links */}
        <nav className="desktop-nav">
          <NavLink to="/overview" style={navLinkStyle}>Overview</NavLink>
          <NavLink to="/ai-advisory" style={navLinkStyle}>ARIA Advisory</NavLink>
          <NavLink to="/monthly-tracker" style={navLinkStyle}>Monthly Tracker</NavLink>
          <NavLink to="/milestones" style={navLinkStyle}>Milestones</NavLink>
          <NavLink to="/fire" style={navLinkStyle}>FIRE</NavLink>
          <NavLink to="/balance-sheet" style={navLinkStyle}>Balance Sheet</NavLink>
          <NavLink to="/news" style={navLinkStyle}>News & Intelligence</NavLink>
        </nav>

        {/* Desktop Right Actions (Profile, Theme, Logout) */}
        <div className="desktop-actions">
          <button onClick={toggleTheme} aria-label="Toggle theme" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', padding: '0.5rem', borderRadius: '8px' }}>
            {isDarkMode ? <FiSun size={20} /> : <FiMoon size={20} />}
          </button>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)', fontSize: '0.875rem', background: 'var(--surface-muted)', padding: '0.35rem 0.85rem', borderRadius: '9999px', border: '1px solid var(--border-color)' }}>
            <div style={{ width: '24px', height: '24px', borderRadius: '50%', backgroundColor: 'var(--accent-color)', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <FiUser size={13} />
            </div>
            <span style={{ fontWeight: 600 }}>{userName || 'Account'}</span>
          </div>
          
          <button onClick={handleLogout} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.875rem', fontWeight: 500, padding: '0.5rem 0.75rem', borderRadius: '8px' }}>
            <FiLogOut size={16} /> <span>Logout</span>
          </button>
        </div>

        {/* Mobile Actions (Theme Toggle + Menu Toggle) */}
        <div className="mobile-actions">
          <button onClick={toggleTheme} aria-label="Toggle theme" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', padding: '0.5rem', borderRadius: '8px' }}>
            {isDarkMode ? <FiSun size={18} /> : <FiMoon size={18} />}
          </button>
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            aria-label={isMobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={isMobileMenuOpen}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0.5rem',
              borderRadius: '8px',
            }}
          >
            {isMobileMenuOpen ? <FiX size={22} /> : <FiMenu size={22} />}
          </button>
        </div>
      </header>

      {/* Mobile Drawer (Visible when hamburger is opened) */}
      {isMobileMenuOpen && (
        <div className="mobile-drawer" role="navigation" aria-label="Mobile Navigation">
          <NavLink to="/overview" className={({ isActive }) => `mobile-nav-link ${isActive ? 'active' : ''}`} onClick={closeMobileMenu}>
            Overview
          </NavLink>
          <NavLink to="/ai-advisory" className={({ isActive }) => `mobile-nav-link ${isActive ? 'active' : ''}`} onClick={closeMobileMenu}>
            ARIA Advisory
          </NavLink>
          <NavLink to="/monthly-tracker" className={({ isActive }) => `mobile-nav-link ${isActive ? 'active' : ''}`} onClick={closeMobileMenu}>
            Monthly Tracker
          </NavLink>
          <NavLink to="/milestones" className={({ isActive }) => `mobile-nav-link ${isActive ? 'active' : ''}`} onClick={closeMobileMenu}>
            Milestones
          </NavLink>
          <NavLink to="/fire" className={({ isActive }) => `mobile-nav-link ${isActive ? 'active' : ''}`} onClick={closeMobileMenu}>
            FIRE
          </NavLink>
          <NavLink to="/balance-sheet" className={({ isActive }) => `mobile-nav-link ${isActive ? 'active' : ''}`} onClick={closeMobileMenu}>
            Balance Sheet
          </NavLink>
          <NavLink to="/news" className={({ isActive }) => `mobile-nav-link ${isActive ? 'active' : ''}`} onClick={closeMobileMenu}>
            News & Intelligence
          </NavLink>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '1rem', marginTop: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)', fontSize: '0.85rem' }}>
              <div style={{ width: '24px', height: '24px', borderRadius: '50%', backgroundColor: 'var(--accent-color)', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <FiUser size={12} />
              </div>
              <span style={{ fontWeight: 600 }}>{userName || 'Account'}</span>
            </div>
            <button
              onClick={handleLogout}
              style={{
                background: 'none',
                border: '1px solid var(--border-color)',
                cursor: 'pointer',
                color: 'var(--text-secondary)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                fontSize: '0.8rem',
                fontWeight: 500,
                padding: '0.4rem 0.75rem',
                borderRadius: '6px',
              }}
            >
              <FiLogOut size={14} /> <span>Logout</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="dashboard-main">
        <Outlet />
      </main>
    </div>
  );
};

export default DashboardLayout;
