import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const read = (relativePath) => readFileSync(join(root, relativePath), 'utf8');

const protectedStateMarkers = new RegExp(['raw' + 'Token', 'sec' + 'ret', 'Author' + 'ization'].join('|'), 'i');
const protectedFixtureMarkers = new RegExp(
  [String.raw`eyJ[A-Za-z0-9_-]+\\.`, 'Bear' + String.raw`er\s+`, 'raw' + 'Token', 'pass' + 'word', 'sec' + 'ret'].join('|'),
  'i',
);

describe('Honcho Memory Console frontend shell contract', () => {
  it('ships a Vite React TypeScript scaffold with verification scripts', () => {
    const packagePath = join(root, 'package.json');
    assert.equal(existsSync(packagePath), true, 'console/frontend/package.json must exist');
    const pkg = JSON.parse(read('package.json'));

    assert.equal(pkg.type, 'module');
    assert.match(pkg.scripts?.build ?? '', /vite build/);
    assert.match(pkg.scripts?.typecheck ?? '', /tsc/);
    assert.match(pkg.scripts?.test ?? '', /node --test/);
    assert.match(pkg.scripts?.smoke ?? '', /playwright/);
  });

  it('exposes the required top-level navigation labels in the application shell', () => {
    const app = read('src/App.tsx');
    for (const label of ['Overview', 'Agents', 'Memory', 'Health', 'Telemetry', 'Audit', 'Settings']) {
      assert.match(app, new RegExp(`aria-label=.*${label}|>${label}<|label:\\s*["']${label}["']`), `${label} nav label missing`);
    }
    assert.match(app, /aria-label="Toggle color mode"/);
    assert.match(app, /role="status"/);
    assert.match(app, /aria-live="polite"/);
  });

  it('defines coherent design tokens for light and dark modes plus focus and state surfaces', () => {
    const tokens = read('src/styles/tokens.css');
    for (const token of ['--color-bg', '--color-surface', '--color-text', '--color-accent', '--color-focus', '--shadow-panel', '--radius-panel']) {
      assert.match(tokens, new RegExp(token), `${token} token missing`);
    }
    assert.match(tokens, /:root\s*{/);
    assert.match(tokens, /\[data-theme="dark"\]/);
    assert.match(tokens, /prefers-reduced-motion/);
    assert.match(tokens, /focus-visible/);
    assert.match(tokens, /skeleton/);
  });

  it('includes loading, empty, and error state components without protected-value affordances', () => {
    const states = read('src/components/StatePanels.tsx');
    assert.match(states, /Skeleton/);
    assert.match(states, /EmptyState/);
    assert.match(states, /ErrorState/);
    assert.doesNotMatch(states, protectedStateMarkers);
  });

  it('marks bundled dashboard data as explicit development fixtures', () => {
    const fixtures = read('src/lib/fixtures.ts');
    assert.match(fixtures, /fixtureOnly:\s*true/);
    assert.match(fixtures, /sha256:[a-z0-9]{6,}/i);
    assert.doesNotMatch(fixtures, protectedFixtureMarkers);
  });
});
