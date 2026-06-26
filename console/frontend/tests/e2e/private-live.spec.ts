import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const username = process.env.HONCHO_CONSOLE_BASIC_AUTH_USERNAME;
const password = process.env.HONCHO_CONSOLE_BASIC_AUTH_PASSWORD;
const evidenceDir = resolve(
  process.cwd(),
  '../../factory/projects/honcho-memory-console/evidence/t11p-private-tailscale-ui-qa',
);

if (!username || !password) {
  throw new Error('HONCHO_CONSOLE_BASIC_AUTH_USERNAME/PASSWORD are required for private live QA');
}

test.use({
  httpCredentials: { username, password },
});

const firstPartyFailure = (url: string, baseURL: string | undefined) => {
  if (!baseURL) return false;
  try {
    return new URL(url).origin === new URL(baseURL).origin;
  } catch {
    return false;
  }
};

test('private Tailscale live console is coherent, useful, and non-fixture backed', async ({ page, request, baseURL }, testInfo) => {
  mkdirSync(evidenceDir, { recursive: true });
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const netFailures: string[] = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('requestfailed', (req) => {
    if (firstPartyFailure(req.url(), baseURL)) {
      netFailures.push(`${req.method()} ${req.url()} — ${req.failure()?.errorText ?? 'unknown'}`);
    }
  });

  const apiChecks = [
    ['/api/overview', (json: any) => {
      expect(json.service).toBe('honcho-memory-console');
      expect(json.status).not.toBe('scaffold');
      expect(json.privacy_boundary?.mode).toBe('private_tailscale_internal');
      expect(json.privacy_boundary?.public_internet_url_required).toBe(false);
      expect(json.honcho_api?.token_configured).toBe(true);
    }],
    ['/api/agents', (json: any) => {
      expect(json.status).toBe('ok');
      expect(json.total).toBeGreaterThan(0);
      expect(json.agents?.[0]?.runtime_vm).toBe('honcho-memory-prod');
      expect(json.agents?.[0]?.tailnet_ip).toBe('100.71.144.114');
    }],
    ['/api/health/services', (json: any) => {
      expect(json.service).toBe('honcho-memory-console');
      expect(Array.isArray(json.checks)).toBe(true);
      expect(json.checks.length).toBeGreaterThan(0);
    }],
    ['/api/telemetry', (json: any) => {
      expect(json.status).toBe('ok');
      expect(json.token_fingerprint).toMatch(/^sha256:/);
      expect(json.token_scope).toBeTruthy();
    }],
    ['/api/audit/events', (json: any) => {
      expect(json.status).toBe('ok');
      expect(json.total).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(json.events)).toBe(true);
    }],
    ['/api/settings', (json: any) => {
      expect(json.auth?.enabled).toBe(true);
      expect(json.auth?.configured).toBe(true);
      expect(json.honcho_api?.token_configured).toBe(true);
      expect(json.agent_registry?.runtime_vm).toBe('honcho-memory-prod');
    }],
    ['/api/memory/workspaces', (json: any, status: number) => {
      // Honcho memory endpoints may truthfully surface an upstream unavailable state;
      // the acceptance criterion is no fake fixture production data.
      expect([200, 502]).toContain(status);
      if (status === 200) {
        expect(Array.isArray(json.items)).toBe(true);
        expect(json.total).toBeGreaterThanOrEqual(0);
      } else {
        expect(JSON.stringify(json).toLowerCase()).toMatch(/unavailable|upstream|error|honcho/);
      }
    }],
  ] as const;

  for (const [path, assertion] of apiChecks) {
    const response = await request.get(path);
    const status = response.status();
    if (path !== '/api/memory/workspaces') {
      expect(status, path).toBe(200);
    }
    assertion(await response.json(), status);
  }

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/', { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { name: /Honcho memory console/i })).toBeVisible();
  await expect(page.getByText(/private.*tailscale|private_tailscale_internal/i).first()).toBeVisible();

  for (const label of ['Overview', 'Agents', 'Memory', 'Health', 'Telemetry', 'Audit', 'Settings']) {
    const nav = page.getByLabel(`Open ${label}`);
    await expect(nav, `nav ${label}`).toBeVisible();
    await nav.click();
    await expect(page.locator('main')).toBeVisible();
  }

  await page.getByLabel('Open Agents').click();
  await expect(page.getByText('honcho-memory-prod').first()).toBeVisible();
  await expect(page.getByText(/sha256:/).first()).toBeVisible();
  await page.screenshot({
    path: resolve(evidenceDir, 'desktop-live-console.png'),
    fullPage: true,
  });

  await page.setViewportSize({ width: 390, height: 844 });
  const menuButton = page.getByLabel('Open navigation');
  if (await menuButton.isVisible()) {
    await menuButton.click();
  }
  await page.getByLabel('Open Memory').click();
  await expect(page.getByRole('heading', { name: /Memory/i })).toBeVisible();
  await page.screenshot({
    path: resolve(evidenceDir, 'mobile-live-memory.png'),
    fullPage: true,
  });

  expect(consoleErrors, 'console_error_check').toEqual([]);
  expect(pageErrors, 'page_error_check').toEqual([]);
  expect(netFailures, 'first_party_network_failures').toEqual([]);

  await testInfo.attach('private-live-qa-summary', {
    body: JSON.stringify({
      baseURL,
      privacy: 'private_tailscale_internal',
      public_url_required: false,
      screenshots: ['desktop-live-console.png', 'mobile-live-memory.png'],
      api_paths: apiChecks.map(([path]) => path),
    }, null, 2),
    contentType: 'application/json',
  });
});
