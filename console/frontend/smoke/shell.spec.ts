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

  await page.route('**/api/memory/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown;
    if (path === '/api/memory/workspaces') {
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
