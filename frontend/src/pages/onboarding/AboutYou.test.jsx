/**
 * @vitest-environment jsdom
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, test } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import '../../index.css';
import AboutYou from './AboutYou.jsx';

afterEach(() => {
  cleanup();
  delete document.documentElement.dataset.theme;
});

describe('AboutYou native dropdowns', () => {
  test('keeps option text readable when the native popup is white in dark mode', () => {
    document.documentElement.dataset.theme = 'dark';
    render(<AboutYou profile={{}} saveAndAdvance={async () => {}} goBack={() => {}} />);

    const employmentOptions = screen.getAllByRole('combobox')[0].querySelectorAll('option');
    expect(getComputedStyle(employmentOptions[1]).color).toBe('rgb(28, 25, 23)');
    expect(getComputedStyle(employmentOptions[1]).backgroundColor).toBe('rgb(255, 255, 255)');
  });
});
