import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const read = (relativePath) => readFileSync(join(root, relativePath), 'utf8');

// Markers that must never appear in operator-facing agent UI or registry fixtures.
const protectedStateMarkers = new RegExp(['raw' + 'Token', 'sec' + 'ret', 'Author' + 'ization'].join('|'), 'i');
const protectedFixtureMarkers = new RegExp(
  [String.raw`eyJ[A-Za-z0-9_-]+\\.`, 'Bear' + String.raw`er\s+`, 'raw' + 'Token', 'pass' + 'word', 'sec' + 'ret'].join('|'),
  'i',
);

const REQUIRED_COLUMN_LABELS = ['Agent', 'Tenant', 'Token', 'Memory', 'Queue', 'VM', 'Health'];
const REQUIRED_COLUMN_GROUPS = ['identity', 'token', 'memory', 'queue', 'vm'];
const REQUIRED_DETAIL_SECTIONS = ['Overview', 'Memory', 'Token', 'VM Health', 'Events'];

describe('Honcho Memory Console agents table + detail contract (T06)', () => {
  it('ships fingerprint-only, sample-labeled agent registry fixtures', () => {
    const fixtures = read('src/lib/fixtures.ts');

    assert.match(fixtures, /fixtureOnly:\s*true/, 'fixtures must be flagged fixtureOnly');
    assert.match(fixtures, /generatedAt/, 'fixtures must carry a sample generatedAt, not implied live data');
    assert.match(fixtures, /export const agentRegistrySnapshot/, 'agentRegistrySnapshot export is required');
    assert.match(fixtures, /export const agentsFixture/, 'agentsFixture export is required');

    // Token identity is fingerprint-only, including the canonical smoke fingerprint.
    assert.match(fixtures, /sha256:9f3ab1c2d4e5/, 'canonical sample fingerprint must be present');
    assert.match(fixtures, /sha256:[a-z0-9]{6,}/i, 'fingerprints must use sha256 format');
    assert.doesNotMatch(fixtures, protectedFixtureMarkers, 'fixtures must not contain raw secrets/tokens');

    // Variety so degraded / down / mis-scoped states are demonstrable.
    assert.match(fixtures, /'degraded'/, 'a degraded sample is required');
    assert.match(fixtures, /'mis-scoped'/, 'a mis-scoped token sample is required');
    assert.match(fixtures, /'expired'|'offline'/, 'an expired/offline sample is required');
  });

  it('exposes pure search, health-filter, and sortable column helpers for the registry', () => {
    const agents = read('src/lib/agents.ts');

    assert.match(agents, /export function searchAgents/, 'searchAgents helper is required');
    assert.match(agents, /export function sortAgents/, 'sortAgents helper is required');
    assert.match(agents, /export function filterAgentsByHealth/, 'filterAgentsByHealth helper is required');
    assert.match(agents, /export function agentHealth/, 'agentHealth roll-up helper is required');
    assert.match(agents, /export function memoryTotal/, 'memoryTotal helper is required');
    assert.match(agents, /AGENT_COLUMNS/, 'AGENT_COLUMNS definition is required');

    for (const group of REQUIRED_COLUMN_GROUPS) {
      assert.match(agents, new RegExp(`group:\\s*'${group}'`), `column group '${group}' missing`);
    }
    for (const label of REQUIRED_COLUMN_LABELS) {
      assert.match(agents, new RegExp(`label:\\s*'${label}`), `column label '${label}' missing`);
    }

    assert.doesNotMatch(agents, protectedStateMarkers, 'agent logic must not reference raw secrets/tokens');
  });

  it('renders a searchable, filterable, sortable agents table', () => {
    const view = read('src/components/AgentsView.tsx');

    assert.match(view, /AGENT_COLUMNS/, 'table must be driven by AGENT_COLUMNS');
    assert.match(view, /aria-label="[^"]*[Ss]earch agents/, 'an accessible agent search input is required');
    assert.match(view, /searchAgents\(/, 'search input must feed searchAgents');
    assert.match(view, /aria-label="[^"]*[Ff]ilter agents/, 'an accessible health filter is required');
    assert.match(view, /filterAgentsByHealth\(/, 'filter must feed filterAgentsByHealth');
    assert.match(view, /aria-sort=/, 'sortable column headers must expose aria-sort');
    assert.match(view, /sortAgents\(/, 'column sort must feed sortAgents');
  });

  it('renders an agent detail with Overview, Memory, Token, VM Health, and Events sections', () => {
    const view = read('src/components/AgentsView.tsx');
    for (const section of REQUIRED_DETAIL_SECTIONS) {
      assert.match(view, new RegExp(`'${section}'|>${section}<`), `agent detail section '${section}' missing`);
    }
    // Token identity is surfaced as a fingerprint, never a raw value.
    assert.match(view, /fingerprint/i, 'detail must surface token fingerprint identity');
  });

  it('handles loading, empty, degraded, and error states', () => {
    const view = read('src/components/AgentsView.tsx');
    assert.match(view, /Skeleton/, 'loading state (Skeleton) is required');
    assert.match(view, /EmptyState/, 'empty state is required');
    assert.match(view, /ErrorState/, 'error state is required');
    assert.match(view, /'loading'/, 'loading phase must be handled');
    assert.match(view, /'error'/, 'error phase must be handled');
    assert.match(view, /degraded/, 'degraded state must be handled');
  });

  it('never exposes raw secrets/tokens and marks data as sample fixtures', () => {
    const view = read('src/components/AgentsView.tsx');
    assert.doesNotMatch(view, protectedStateMarkers, 'agents view must not expose raw secrets/tokens');
    assert.match(view, /FIXTURE_META|[Ss]ample|fixture/, 'view must mark data as sample, not live production metrics');
  });

  it('declares browser-safe shared agent types aligned with the backend contract', () => {
    const types = read('src/lib/types.ts');
    assert.match(types, /export interface AgentRow/, 'AgentRow type is required');
    assert.match(types, /tokenFingerprint/, 'AgentRow must carry tokenFingerprint identity');
    assert.match(types, /export type TokenStatus/, 'TokenStatus union is required');
    assert.match(types, /export type HealthStatus/, 'HealthStatus union is required');
    assert.doesNotMatch(types, protectedStateMarkers, 'types must not reference raw secrets/tokens');
  });
});
