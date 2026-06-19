/// <reference types="node" />

import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';

const evidenceDir = resolve(
  process.cwd(),
  '../../factory/projects/honcho-memory-console/evidence/t07-health-cockpit',
);

const serviceHealthPayload = {
  service: 'honcho-memory-console',
  status: 'degraded',
  generated_at: '2026-06-19T16:40:00+00:00',
  checks: [
    {
      id: 'honcho-api',
      label: 'Honcho API /health',
      layer: 'service',
      status: 'healthy',
      summary: 'Honcho API health endpoint responded successfully.',
      last_checked_at: '2026-06-19T16:39:58+00:00',
      latency_ms: 12,
      evidence: { http_status: 200, body_status: 'ok' },
      safe_to_show: true,
    },
    {
      id: 'docker-compose',
      label: 'Docker compose services',
      layer: 'service',
      status: 'degraded',
      summary: 'One or more compose services are degraded.',
      last_checked_at: '2026-06-19T16:39:58+00:00',
      latency_ms: null,
      evidence: {
        services: {
          api: { state: 'running', health: 'healthy', status: 'healthy', present: true },
          deriver: { state: 'running', health: 'starting', status: 'degraded', present: true },
          database: { state: 'running', health: 'healthy', status: 'healthy', present: true },
          redis: { state: 'running', health: 'healthy', status: 'healthy', present: true },
          console: { state: 'exited', health: null, status: 'down', present: true },
        },
      },
      safe_to_show: true,
    },
    {
      id: 'postgres',
      label: 'Postgres',
      layer: 'storage',
      status: 'healthy',
      summary: 'Postgres SELECT 1 succeeded.',
      last_checked_at: '2026-06-19T16:39:58+00:00',
      latency_ms: 5,
      evidence: { select_1: true, table_counts: { workspaces: 4, peers: 15 } },
      safe_to_show: true,
    },
    {
      id: 'tailscale',
      label: 'Tailscale',
      layer: 'network',
      status: 'healthy',
      summary: 'Tailscale is online.',
      last_checked_at: '2026-06-19T16:39:58+00:00',
      latency_ms: null,
      evidence: { hostname: 'honcho-memory-prod', online: true, ips: ['100.71.144.114'] },
      safe_to_show: true,
    },
    {
      id: 'provider-config',
      label: 'Provider configuration',
      layer: 'config',
      status: 'degraded',
      summary: 'Provider configuration is present without exposing values.',
      last_checked_at: '2026-06-19T16:39:58+00:00',
      latency_ms: null,
      evidence: { provider_keys_configured: { openai: true, anthropic: false }, configured_count: 1 },
      safe_to_show: true,
    },
    {
      id: 'systemd:honcho-update.timer',
      label: 'Honcho update timer',
      layer: 'update',
      status: 'healthy',
      summary: 'honcho-update.timer is active/waiting.',
      last_checked_at: '2026-06-19T16:39:58+00:00',
      latency_ms: null,
      evidence: { ActiveState: 'active', SubState: 'waiting' },
      safe_to_show: true,
    },
    {
      id: 'memory',
      label: 'Memory',
      layer: 'resource',
      status: 'healthy',
      summary: 'Memory is 62.4% used.',
      last_checked_at: '2026-06-19T16:39:58+00:00',
      latency_ms: null,
      evidence: { used_percent: 62.4 },
      safe_to_show: true,
    },
  ],
};

function prepareEvidenceDir() {
  mkdirSync(evidenceDir, { recursive: true });
}

test('health cockpit renders backend statuses, evidence, offline states, and screenshots', async ({ page }) => {
  prepareEvidenceDir();
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];

  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.route('**/api/health/services', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(serviceHealthPayload),
    });
  });

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/#/health');
  await expect(page.getByRole('heading', { name: 'Service health by layer' })).toBeVisible();
  await expect(page.getByText('backend /api/health/services')).toBeVisible();

  for (const group of ['API', 'Deriver', 'Storage', 'Network', 'LLM', 'Update', 'Host']) {
    await expect(page.getByText(group, { exact: true })).toBeVisible();
  }

  await expect(page.getByText('Honcho API /health')).toBeVisible();
  await expect(page.getByText('Docker deriver')).toBeVisible();
  await expect(page.getByText('Docker console')).toBeVisible();
  await expect(page.getByText('Offline').first()).toBeVisible();
  await expect(page.getByText('Evidence').first()).toBeVisible();
  await expect(page.getByText(/Last checked/).first()).toBeVisible();
  await expect(page.getByText(/Bearer|Authorization|factory-generated|rawToken/i)).toHaveCount(0);

  await page.screenshot({
    path: resolve(evidenceDir, 'desktop-health-cockpit.png'),
    fullPage: true,
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: resolve(evidenceDir, 'mobile-health-cockpit.png'),
    fullPage: true,
  });

  expect(consoleErrors, 'console_error_check').toEqual([]);
  expect(pageErrors, 'page_error_check').toEqual([]);
});
