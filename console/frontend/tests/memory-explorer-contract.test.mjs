import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const read = (relativePath) => readFileSync(join(root, relativePath), 'utf8');
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const protectedMarkers = new RegExp(
  [String.raw`eyJ[A-Za-z0-9_-]+\\.`, 'Bear' + String.raw`er\s+`, 'Author' + 'ization', 'raw' + 'Token', 'pass' + 'word'].join('|'),
  'i',
);

describe('Memory explorer UX and integration contract', () => {
  it('ships a dedicated typed memory API client for the canonical backend endpoints', () => {
    const memoryPath = join(root, 'src/lib/memory.ts');
    assert.equal(existsSync(memoryPath), true, 'src/lib/memory.ts must exist');
    const memory = read('src/lib/memory.ts');

    for (const endpoint of [
      '/api/memory/workspaces',
      '/api/memory/workspaces/${workspaceId}/queue',
      '/api/memory/workspaces/${workspaceId}/peers',
      '/api/memory/workspaces/${workspaceId}/peers/${peerId}/card',
      '/api/memory/workspaces/${workspaceId}/peers/${peerId}/representation',
      '/api/memory/workspaces/${workspaceId}/peers/${peerId}/context',
      '/api/memory/workspaces/${workspaceId}/sessions',
      '/api/memory/workspaces/${workspaceId}/sessions/${sessionId}/messages',
      '/api/memory/workspaces/${workspaceId}/conclusions',
    ]) {
      assert.match(memory, new RegExp(escapeRegExp(endpoint)), `${endpoint} endpoint missing`);
    }

    assert.match(memory, /normalizeMessageSummary/);
    assert.match(memory, /content_hidden/);
    assert.match(memory, /content_preview/);
    assert.doesNotMatch(memory, protectedMarkers, 'memory API client must not embed protected-value affordances');
  });

  it('renders all required memory explorer surfaces with explicit sensitive disclosure copy', () => {
    const app = read('src/App.tsx');

    for (const label of [
      'Memory explorer',
      'Workspace explorer',
      'Peers',
      'Peer card',
      'Representation',
      'Context',
      'Sessions',
      'Messages',
      'Conclusions',
      'Reveal sensitive content',
      'Filter memory graph',
    ]) {
      assert.match(app, new RegExp(escapeRegExp(label)), `${label} UI label missing`);
    }

    assert.match(app, /aria-pressed=\{revealedMessages\.has\(message\.id\)\}/);
    assert.doesNotMatch(app, /JSON\.stringify\(message/i, 'message content must not be dumped as raw JSON');
  });

  it('keeps development memory fixtures explicit and protected-value free', () => {
    const fixtures = read('src/lib/fixtures.ts');
    assert.match(fixtures, /memoryExplorerFixture/);
    assert.match(fixtures, /contentHidden:\s*true/);
    assert.match(fixtures, /contentPreview:/);
    assert.doesNotMatch(fixtures, protectedMarkers);
  });
});
