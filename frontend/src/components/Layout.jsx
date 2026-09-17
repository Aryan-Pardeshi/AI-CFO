import React from 'react';
import { Outlet } from 'react-router-dom';
import ThemeToggle from './ThemeToggle';

const Layout = () => {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        padding: '1.5rem 2rem',
        borderBottom: '1px solid var(--border-color)'
      }}>
        <div style={{ fontFamily: 'var(--font-serif)', fontSize: '1.5rem', fontWeight: 600 }}>
          AICFO
        </div>
        <ThemeToggle />
      </header>
      
      <main style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
        <Outlet />
      </main>
    </div>
  );
};

export default Layout;
