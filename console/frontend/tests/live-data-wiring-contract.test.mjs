import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const read = (relativePath) => readFileSync(join(root, relativePath), 'utf8');

const forbiddenProductionFixtures = /overviewFixture|agentsFixture|telemetryFixture|auditFixture|providersFixture|FIXTURE_META|Sample fixture|Fixture mode|simulated timer|setTimeout\(\(\) => setPhase\('ready'/;

describe('T13 live data wiring contract', () => {
  it('ships typed live API clients for every non-fixture console surface', () => {
    const liveClientPath = join(root, 'src/lib/live.ts');
    assert.equal(existsSync(liveClientPath), true, 'src/lib/live.ts must exist');
    const live = read('src/lib/live.ts');

    for (const endpoint of [
      '/api/overview',
      '/api/agents',
      '/api/agents/${agentId}',
      '/api/telemetry',
      '/api/audit/events',
      '/api/settings',
    ]) {
      assert.match(live, new RegExp(endpoint.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `${endpoint} client missing`);
    }

    for (const fetcher of [
      'fetchOverviewSnapshot',
      'fetchAgentRegistry',
      'fetchAgentDetail',
      'fetchTelemetrySnapshot',
      'fetchAuditEvents',
      'fetchSettingsSnapshot',
    ]) {
      assert.match(live, new RegExp(`export async function ${fetcher}`), `${fetcher} export missing`);
    }
  });

  it('wires Overview, Memory, Health, Telemetry, Audit, and Settings pages to live backend fetchers', () => {
    const app = read('src/App.tsx');

    for (const fetcher of [
      'fetchOverviewSnapshot',
      'fetchMemoryExplorerSnapshot',
      'fetchServiceHealth',
      'fetchTelemetrySnapshot',
      'fetchAuditEvents',
      'fetchSettingsSnapshot',
    ]) {
      assert.match(app, new RegExp(`${fetcher}\\(`), `${fetcher} must be called from App.tsx`);
    }

    for (const unavailableCopy of [
      'Overview backend unavailable',
      'Memory backend unavailable',
      'Health backend unavailable',
      'Telemetry backend unavailable',
      'Audit backend unavailable',
      'Settings backend unavailable',
    ]) {
      assert.match(app, new RegExp(unavailableCopy), `${unavailableCopy} state missing`);
    }

    assert.doesNotMatch(app, forbiddenProductionFixtures, 'App must not render fixture-only production data');
  });

  it('wires Agents table and detail drawer to live backend data with explicit unavailable events', () => {
    const agentsView = read('src/components/AgentsView.tsx');

    assert.match(agentsView, /fetchAgentRegistry\(/, 'Agents table must call /api/agents');
    assert.match(agentsView, /fetchAgentDetail\(/, 'Agent detail must call /api/agents/{agentId}');
    assert.match(agentsView, /Agent registry unavailable/, 'Agents view must expose an unavailable state');
    assert.match(agentsView, /Agent-scoped event stream unavailable/, 'Synthetic fixture events must be replaced by truthful unavailable copy');
    assert.doesNotMatch(agentsView, forbiddenProductionFixtures, 'Agents view must not render fixture-only production data');
  });
});
