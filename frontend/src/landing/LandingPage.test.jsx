/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, test, vi } from 'vitest';
import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter } from 'react-router-dom';
import LandingPage from './LandingPage';
import { GITHUB_URL, LOGIN_URL } from './lib/site';

// jsdom lacks these browser APIs, and gsap's ScrollTrigger touches matchMedia while the page
// module is being imported — so they must exist before any import runs.
vi.hoisted(() => {
  window.matchMedia = (query) => ({
    matches: query.includes('prefers-reduced-motion'),
    media: query,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent() {
      return false;
    },
  });
  class Observer {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  window.IntersectionObserver = Observer;
  window.ResizeObserver = Observer;
  window.scrollTo = () => {};
});

afterEach(cleanup);

const renderLanding = () =>
  render(
    <MemoryRouter initialEntries={['/']}>
      <LandingPage />
    </MemoryRouter>,
  );

describe('landing page links', () => {
  test('points the login button at the in-app /login route', () => {
    expect(LOGIN_URL).toBe('/login');
    renderLanding();

    const nav = screen.getByRole('navigation', { name: 'Main' });
    const login = within(nav).getAllByRole('link', { name: 'Login' });
    expect(login.length).toBeGreaterThan(0);
    login.forEach((link) => {
      expect(link).toHaveAttribute('href', '/login');
      expect(link).not.toHaveAttribute('target');
    });
  });

  test('every call-to-action that opens the app goes to /login', () => {
    renderLanding();

    const openAria = screen.getAllByRole('link', { name: /open aria/i });
    expect(openAria.length).toBeGreaterThanOrEqual(2);
    openAria.forEach((link) => expect(link).toHaveAttribute('href', '/login'));
  });

  test('points every GitHub button at the repository in a new tab', () => {
    expect(GITHUB_URL).toBe('https://github.com/Aryan-Pardeshi/AI-CFO');
    renderLanding();

    const github = [
      ...screen.getAllByRole('link', { name: 'GitHub' }),
      ...screen.getAllByRole('link', { name: /view source/i }),
    ];
    expect(github.length).toBeGreaterThanOrEqual(3);
    github.forEach((link) => {
      expect(link).toHaveAttribute('href', GITHUB_URL);
      expect(link).toHaveAttribute('target', '_blank');
      expect(link.getAttribute('rel')).toContain('noopener');
    });
  });

  test('uses the site logo in the nav and footer', () => {
    renderLanding();

    const logos = screen.getAllByRole('img', { name: 'ARIA' });
    expect(logos.length).toBeGreaterThanOrEqual(2);
    logos.forEach((logo) => expect(logo).toHaveAttribute('src', '/aria-logo.png'));
  });

  test('the mobile menu opens with a solid background so page content does not ghost through', () => {
    const { container } = renderLanding();
    const header = container.querySelector('header');
    expect(header.className).toContain('bg-transparent');

    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));

    expect(header.className).toContain('bg-cream');
    expect(header.className).not.toContain('bg-transparent');
    expect(screen.getByRole('button', { name: 'Close menu' })).toHaveAttribute('aria-expanded', 'true');
  });

  test('marks the page with the landing scope class while mounted', () => {
    const { container, unmount } = renderLanding();

    expect(container.querySelector('.aria-landing')).not.toBeNull();
    expect(document.body).toHaveClass('aria-landing-active');
    unmount();
    expect(document.body).not.toHaveClass('aria-landing-active');
  });
});
