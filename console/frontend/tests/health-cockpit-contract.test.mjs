import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const read = (relativePath) => readFileSync(join(root, relativePath), 'utf8');

const protectedMarkers = new RegExp(
  [String.raw`eyJ[A-Za-z0-9_-]+\\.`, 'Bear' + String.raw`er\s+`, 'Author' + 'ization', 'raw' + 'Token'].join('|'),
  'i',
);

describe('Health cockpit backend integration contract', () => {
  it('fetches the live service-health endpoint and normalizes timestamp/evidence fields', () => {
    const health = read('src/lib/health.ts');
    assert.match(health, /\/api\/health\/services/, 'health cockpit must call the backend service-health endpoint');
    assert.match(health, /generated_at/, 'backend generated_at timestamp must be normalized');
    assert.match(health, /last_checked_at/, 'backend last_checked_at timestamp must be normalized');
    assert.match(health, /latency_ms/, 'backend latency_ms evidence must be normalized');
    assert.match(health, /evidence/, 'safe backend evidence must be preserved for operator display');
    assert.doesNotMatch(health, protectedMarkers, 'frontend health integration must not embed raw auth/token affordances');
  });

  it('defines the canonical cockpit groups required by T07', () => {
    const health = read('src/lib/health.ts');
    for (const label of ['API', 'Deriver', 'Storage', 'Network', 'LLM', 'Update', 'Host']) {
      assert.match(health, new RegExp(`label:\\s*["']${label}["']`), `${label} group missing`);
    }
  });

  it('renders degraded/offline states, timestamps, and evidence without raw JSON-first UI', () => {
    const app = read('src/App.tsx');
    const css = read('src/styles/app.css');
    assert.match(app, /Health cockpit is loading live service status/);
    assert.match(app, /Last checked/);
    assert.match(app, /Evidence/);
    assert.match(app, /offline|unavailable|degraded/i);
    assert.doesNotMatch(app, /JSON\.stringify\(check\.evidence\)/, 'evidence must not be dumped as raw JSON');
    assert.match(css, /health-cockpit__meta/);
    assert.match(css, /evidence-pill/);
  });
});
