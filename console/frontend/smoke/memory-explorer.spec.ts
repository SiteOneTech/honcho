/// <reference types="node" />

import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';

const evidenceDir = resolve(
  process.cwd(),
  '../../factory/projects/honcho-memory-console/evidence/t08-memory-explorer',
);

function prepareEvidenceDir() {
  mkdirSync(evidenceDir, { recursive: true });
}

const pageEnvelope = <T,>(items: T[]) => ({ items, total: items.length, page: 1, size: 50, pages: 1 });

test('memory explorer loads backend memory surfaces, filters, and gates sensitive message content', async ({ page }) => {
  prepareEvidenceDir();
  const requestedPaths = new Set<string>();
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];

  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.route('**/api/memory/**', async (route) => {
    const url = new URL(route.request().url());
    requestedPaths.add(url.pathname);
    const path = url.pathname;
    let body: unknown;

    if (path === '/api/memory/workspaces') {
      body = pageEnvelope([
        { id: 'hermes', metadata: { owner: 'Jean', tier: 'prod' }, configuration_keys: ['deriver'], created_at: '2026-06-19T16:00:00Z' },
        { id: 'console-lab', metadata: { owner: 'QA' }, configuration_keys: [], created_at: '2026-06-18T16:00:00Z' },
      ]);
    } else if (path === '/api/memory/workspaces/hermes/queue') {
      body = { total_work_units: 8, completed_work_units: 5, in_progress_work_units: 1, pending_work_units: 2, sessions: { 'session-a': { total_work_units: 3, completed_work_units: 2, in_progress_work_units: 0, pending_work_units: 1 } } };
    } else if (path === '/api/memory/workspaces/hermes/peers') {
      body = pageEnvelope([
        { id: 'Zeus', workspace_id: 'hermes', metadata: { role: 'orchestrator' }, configuration_keys: ['observe_me'], created_at: '2026-06-19T16:01:00Z' },
        { id: 'Jean-Garcia', workspace_id: 'hermes', metadata: { role: 'human' }, configuration_keys: [], created_at: '2026-06-19T16:02:00Z' },
      ]);
    } else if (path === '/api/memory/workspaces/hermes/peers/Zeus/card') {
      body = { total: 2, entries: [{ index: 0, text: 'Prefers concise factory evidence.', sensitive: false }, { index: 1, text: 'Sensitive peer-card detail is redacted.', sensitive: true }] };
    } else if (path === '/api/memory/workspaces/hermes/peers/Zeus/representation') {
      body = { representation: 'Zeus represents Jean as an operator who prioritizes verified delivery.', sensitive: false };
    } else if (path === '/api/memory/workspaces/hermes/peers/Zeus/context') {
      body = { peer_id: 'Zeus', target_id: 'Jean-Garcia', representation: 'Context links Zeus to Jean factory handoffs.', peer_card: [{ index: 0, text: 'Use Spanish summaries.', sensitive: false }], sensitive: false };
    } else if (path === '/api/memory/workspaces/hermes/sessions') {
      body = pageEnvelope([{ id: 'session-a', workspace_id: 'hermes', is_active: true, metadata: { topic: 'memory explorer' }, configuration_keys: ['summary'], created_at: '2026-06-19T16:03:00Z' }]);
    } else if (path === '/api/memory/workspaces/hermes/sessions/session-a/messages') {
      body = pageEnvelope([{ id: 'msg-1', workspace_id: 'hermes', session_id: 'session-a', peer_id: 'Jean-Garcia', metadata: { channel: 'factory' }, created_at: '2026-06-19T16:04:00Z', token_count: 42, content_hidden: true, content_preview: 'Sensitive message preview only after disclosure.', sensitive: true }]);
    } else if (path === '/api/memory/workspaces/hermes/conclusions') {
      body = pageEnvelope([{ id: 'conclusion-1', observer_id: 'Zeus', observed_id: 'Jean-Garcia', session_id: 'session-a', created_at: '2026-06-19T16:05:00Z', content_preview: 'Jean values evidence-backed Factory work.', sensitive: false }]);
    } else {
      body = pageEnvelope([]);
    }

    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/#/memory');
  await expect(page.getByRole('heading', { name: 'Memory explorer' })).toBeVisible();
  await expect(page.getByText('Source: backend /api/memory')).toBeVisible();

  for (const requiredPath of [
    '/api/memory/workspaces',
    '/api/memory/workspaces/hermes/queue',
    '/api/memory/workspaces/hermes/peers',
    '/api/memory/workspaces/hermes/peers/Zeus/card',
    '/api/memory/workspaces/hermes/peers/Zeus/representation',
    '/api/memory/workspaces/hermes/peers/Zeus/context',
    '/api/memory/workspaces/hermes/sessions',
    '/api/memory/workspaces/hermes/sessions/session-a/messages',
    '/api/memory/workspaces/hermes/conclusions',
  ]) {
    expect(requestedPaths.has(requiredPath), `${requiredPath} was not requested`).toBe(true);
  }

  for (const sectionTitle of [
    'Workspace explorer',
    'Peers',
    'Peer card',
    'Representation',
    'Context',
    'Sessions',
    'Messages',
    'Conclusions',
  ]) {
    await expect(page.locator('.panel__title').filter({ hasText: new RegExp(`^${sectionTitle}$`) })).toBeVisible();
  }
  await expect(page.getByText('Sensitive message preview only after disclosure.')).toHaveCount(0);

  await page.getByLabel('Filter memory graph').fill('Zeus');
  await expect(page.getByText('Zeus')).toBeVisible();
  await expect(page.getByText('conclusion-1')).toHaveCount(0);
  await page.getByLabel('Filter memory graph').fill('');

  await page.getByRole('button', { name: 'Reveal peer context' }).click();
  await expect(page.getByText('Zeus represents Jean as an operator who prioritizes verified delivery.')).toBeVisible();
  await page.getByRole('button', { name: 'Reveal sensitive content for msg-1' }).click();
  await expect(page.getByText('Sensitive message preview only after disclosure.')).toBeVisible();
  await expect(page.getByText(/Bearer|Authorization|rawToken/i)).toHaveCount(0);

  await page.screenshot({
    path: resolve(evidenceDir, 'desktop-memory-explorer.png'),
    fullPage: true,
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: resolve(evidenceDir, 'mobile-memory-explorer.png'),
    fullPage: true,
  });

  expect(consoleErrors, 'console_error_check').toEqual([]);
  expect(pageErrors, 'page_error_check').toEqual([]);
});
