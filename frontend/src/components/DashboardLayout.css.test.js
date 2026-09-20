import { describe, expect, test } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// jsdom does no layout, so the regression is pinned at the CSS source: the header is
// `position: sticky`, and an `absolute` drawer landed at the top of the *document* — once the
// page was scrolled, tapping the hamburger opened a menu nobody could see.
describe('dashboard mobile navigation', () => {
  const css = fs.readFileSync(path.resolve('src/components/DashboardLayout.css'), 'utf8');
  const drawerRule = css.match(/\.mobile-drawer\s*\{[^}]*\}/)?.[0] ?? '';

  test('the mobile drawer is pinned to the viewport, not the document', () => {
    expect(drawerRule).toMatch(/position:\s*fixed/);
    expect(drawerRule).not.toMatch(/position:\s*absolute/);
  });

  test('the drawer sits directly under the 60px mobile header', () => {
    expect(drawerRule).toMatch(/top:\s*60px/);
    expect(css).toMatch(/\.dashboard-header\s*\{[^}]*height:\s*60px/);
  });
});
