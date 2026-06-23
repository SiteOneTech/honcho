/// <reference types="node" />

import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';

const evidenceDir = resolve(
  process.cwd(),
  '../../factory/projects/honcho-memory-console/evidence/t05-premium-frontend-shell',
);

function prepareEvidenceDir() {
  mkdirSync(evidenceDir, { recursive: true });
}

const pageEnvelope = <T,>(items: T[]) => ({ items, total: items.length, page: 1, size: 50, pages: 1 });

test('premium shell renders, navigates, toggles theme, and captures UI evidence', async ({ page }) => {
  prepareEvidenceDir();
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];

  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown;
    if (path === '/api/overview') {
      body = {
        service: 'honcho-memory-console',
        status: 'ok',
        generated_at: '2026-06-23T15:00:00Z',
        privacy_boundary: {
          mode: 'private_tailscale_internal',
          public_internet_url_required: false,
          public_internet_url_configured: false,
          evidence_hint: 'Use the private internal URL for evidence.',
        },
        honcho_api: { available: true, status: 'healthy', summary: 'Smoke backend online.', upstream_status: 200, latency_ms: 12, token_configured: true },
        metrics: { active_agents: 1, workspaces: 1, memory_items: 7, queue_total: 4, queue_pending: 1, queue_in_progress: 0, queue_errors: 0, requests_1h: 3, requests_24h: 9, error_rate: 0, p95_latency_ms: 24, audit_events: 1, total: 3, degraded: 0, down: 0, unknown: 0 },
        layers: [{ id: 'api', label: 'Honcho API', status: 'healthy', summary: 'Smoke API layer.' }],
        alerts: [],
        sources: ['/api/overview', '/api/agents'],
      };
    } else if (path === '/api/agents') {
      body = {
        service: 'honcho-memory-console',
        status: 'ok',
        total: 1,
        source: 'live',
        alerts: [],
        agents: [{
          agent_id: 'honcho-console-worker',
          display_name: 'Honcho Console Worker',
          tenant_id: 'sitiouno',
          runtime_vm: 'honcho-memory-prod',
          tailnet_ip: '100.64.0.10',
          environment: 'internal-smoke',
          honcho_workspace: 'hermes',
          ai_peer: 'Zeus',
          human_peer: 'Jean-Garcia',
          token_fingerprint: 'sha256:9f3ab1c2d4e5',
          token_scope: 'console:read',
          token_status: 'valid',
          last_write_at: '2026-06-23T15:00:00Z',
          memory_counts: { sessions: 1, messages: 1, documents: 0, conclusions: 1, peer_card_entries: 1 },
          queue_state: { pending: 1, in_progress: 0, completed: 3, errors: 0, status: 'healthy' },
          api_activity: { requests_1h: 3, requests_24h: 9, error_rate: 0, p95_latency_ms: 24 },
          vm_health: { status: 'online', cpu_percent: 18, memory_percent: 42, disk_percent: 55, service_state: 'active' },
          alerts: [],
          sources: ['/api/agents'],
        }],
      };
    } else if (path === '/api/agents/honcho-console-worker') {
      body = {
        service: 'honcho-memory-console',
        status: 'ok',
        source: 'live',
        alerts: [],
        agent: {
          agent_id: 'honcho-console-worker',
          display_name: 'Honcho Console Worker',
          tenant_id: 'sitiouno',
          runtime_vm: 'honcho-memory-prod',
          tailnet_ip: '100.64.0.10',
          environment: 'internal-smoke',
          honcho_workspace: 'hermes',
          ai_peer: 'Zeus',
          human_peer: 'Jean-Garcia',
          token_fingerprint: 'sha256:9f3ab1c2d4e5',
          token_scope: 'console:read',
          token_status: 'valid',
          last_write_at: '2026-06-23T15:00:00Z',
          memory_counts: { sessions: 1, messages: 1, documents: 0, conclusions: 1, peer_card_entries: 1 },
          queue_state: { pending: 1, in_progress: 0, completed: 3, errors: 0, status: 'healthy' },
          api_activity: { requests_1h: 3, requests_24h: 9, error_rate: 0, p95_latency_ms: 24 },
          vm_health: { status: 'online', cpu_percent: 18, memory_percent: 42, disk_percent: 55, service_state: 'active' },
          alerts: [],
          sources: ['/api/agents/{agent_id}'],
        },
      };
    } else if (path === '/api/health/services') {
      body = { service: 'honcho-memory-console', status: 'ok', generated_at: '2026-06-23T15:00:00Z', source: 'live', checks: [{ id: 'api', label: 'Console API', layer: 'service', status: 'healthy', summary: 'Smoke health online.', last_checked_at: '2026-06-23T15:00:00Z', latency_ms: 10, evidence: { endpoint: '/api/health/services' }, safe_to_show: true }] };
    } else if (path === '/api/telemetry') {
      body = { service: 'honcho-memory-console', status: 'ok', generated_at: '2026-06-23T15:00:00Z', token_fingerprint: 'sha256:9f3ab1c2d4e5', token_scope: 'console:read', totals: { requests_1h: 3, requests_24h: 9, error_rate: 0, p95_latency_ms: 24 }, routes: [{ route: '/api/overview', requests: 3, errors: 0, error_rate: 0, p95_latency_ms: 24 }] };
    } else if (path === '/api/audit/events') {
      body = { service: 'honcho-memory-console', status: 'ok', total: 1, source: 'live', events: [{ id: 'audit-smoke', at: '2026-06-23T15:00:00Z', actor: 'operator', action: 'view.overview', outcome: 'ok', route: '/api/overview', method: 'GET', status_code: 200, token_fingerprint: 'sha256:9f3ab1c2d4e5', token_scope: 'console:read' }] };
    } else if (path === '/api/settings') {
      body = { auth: { enabled: true, configured: true, username_configured: true }, honcho_api: { url: 'http://honcho-memory-prod.internal', token_configured: true, token_fingerprint: 'sha256:9f3ab1c2d4e5' }, agent_registry: { agent_id: 'honcho-console-worker', display_name: 'Honcho Console Worker', tenant_id: 'sitiouno', runtime_vm: 'honcho-memory-prod', tailnet_ip: '100.64.0.10', environment: 'internal-smoke', honcho_workspace: 'hermes', ai_peer: 'Zeus', human_peer: 'Jean-Garcia', fleet_registry_configured: false, fleet_registry_fingerprint: null }, secrets: { jwt_secret_configured: true, database_url_configured: false, redis_url_configured: false, infisical_token_configured: false, provider_keys_configured: { openrouter: true, anthropic: false } }, local_health: { systemd_units: [], update_timer_unit: 'not configured', docker_services: [], disk_paths: ['/'], docker_compose_directory_configured: false }, frontend: { static_dir_configured: true } };
    } else if (path === '/api/memory/workspaces') {
      body = pageEnvelope([{ id: 'hermes', metadata: { owner: 'Jean' }, configuration_keys: ['deriver'], created_at: '2026-06-19T16:00:00Z' }]);
    } else if (path === '/api/memory/workspaces/hermes/queue') {
      body = { total_work_units: 4, completed_work_units: 3, in_progress_work_units: 0, pending_work_units: 1, sessions: {} };
    } else if (path === '/api/memory/workspaces/hermes/peers') {
      body = pageEnvelope([{ id: 'Zeus', workspace_id: 'hermes', metadata: { role: 'orchestrator' }, configuration_keys: [], created_at: '2026-06-19T16:01:00Z' }]);
    } else if (path === '/api/memory/workspaces/hermes/peers/Zeus/card') {
      body = { total: 1, entries: [{ index: 0, text: 'Use concise evidence.', sensitive: false }] };
    } else if (path === '/api/memory/workspaces/hermes/peers/Zeus/representation') {
      body = { representation: 'Peer representation is available after disclosure.', sensitive: false };
    } else if (path === '/api/memory/workspaces/hermes/peers/Zeus/context') {
      body = { peer_id: 'Zeus', target_id: 'Jean-Garcia', representation: 'Context is available after disclosure.', peer_card: [], sensitive: false };
    } else if (path === '/api/memory/workspaces/hermes/sessions') {
      body = pageEnvelope([{ id: 'session-shell', workspace_id: 'hermes', is_active: true, metadata: { topic: 'shell smoke' }, configuration_keys: [], created_at: '2026-06-19T16:02:00Z' }]);
    } else if (path === '/api/memory/workspaces/hermes/sessions/session-shell/messages') {
      body = pageEnvelope([{ id: 'msg-shell', workspace_id: 'hermes', session_id: 'session-shell', peer_id: 'Jean-Garcia', metadata: {}, created_at: '2026-06-19T16:03:00Z', token_count: 12, content_hidden: true, content_preview: 'Shell smoke message preview.', sensitive: true }]);
    } else if (path === '/api/memory/workspaces/hermes/conclusions') {
      body = pageEnvelope([{ id: 'conclusion-shell', observer_id: 'Zeus', observed_id: 'Jean-Garcia', session_id: 'session-shell', created_at: '2026-06-19T16:04:00Z', content_preview: 'Shell smoke conclusion preview.', sensitive: false }]);
    } else {
      body = pageEnvelope([]);
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Honcho memory console' })).toBeVisible();

  for (const label of ['Overview', 'Agents', 'Memory', 'Health', 'Telemetry', 'Audit', 'Settings']) {
    await expect(page.getByLabel(`Open ${label}`)).toBeVisible();
  }

  await page.getByLabel('Open Agents').click();
  await expect(page.getByRole('heading', { name: 'Agent operating map' })).toBeVisible();
  await expect(page.getByText('sha256:9f3ab1c2d4e5')).toBeVisible();

  const html = page.locator('html');
  const beforeTheme = await html.getAttribute('data-theme');
  await page.getByLabel('Toggle color mode').click();
  await expect(html).not.toHaveAttribute('data-theme', beforeTheme ?? '');

  await page.screenshot({
    path: resolve(evidenceDir, 'desktop-premium-shell.png'),
    fullPage: true,
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel('Open navigation').click();
  await page.getByLabel('Open Memory').click();
  await expect(page.getByRole('heading', { name: 'Memory explorer' })).toBeVisible();
  await expect(page.getByLabel('Filter memory graph')).toBeVisible();
  await expect(page.getByText('Message content hidden by default.')).toBeVisible();
  await page.screenshot({
    path: resolve(evidenceDir, 'mobile-memory-shell.png'),
    fullPage: true,
  });

  expect(consoleErrors, 'console_error_check').toEqual([]);
  expect(pageErrors, 'page_error_check').toEqual([]);
});
