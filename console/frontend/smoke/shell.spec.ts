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
  await expect(page.getByRole('heading', { name: 'Workspace and conclusion inventory' })).toBeVisible();
  await expect(page.getByText('No message body opened')).toBeVisible();
  await page.screenshot({
    path: resolve(evidenceDir, 'mobile-memory-shell.png'),
    fullPage: true,
  });

  expect(consoleErrors, 'console_error_check').toEqual([]);
  expect(pageErrors, 'page_error_check').toEqual([]);
});
