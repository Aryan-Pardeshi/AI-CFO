/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, test, vi } from 'vitest';
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Layout from './Layout';

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: false, userEmail: '', logout: vi.fn() }),
}));
vi.mock('./ThemeToggle', () => ({ default: () => null }));

afterEach(cleanup);

describe('auth / onboarding header', () => {
  test('shows the ARIA logo instead of the plain AICFO text', () => {
    render(
      <MemoryRouter initialEntries={['/onboarding']}>
        <Routes>
          <Route element={<Layout />}>
            <Route path="onboarding" element={<div>step</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    const logo = screen.getByRole('img', { name: 'ARIA' });
    expect(logo).toHaveAttribute('src', '/aria-logo.png');
    expect(screen.queryByText('AICFO')).not.toBeInTheDocument();
  });
});
