import type { HealthCheck, HealthLayer, HealthServicesSnapshot, HealthStatus } from './types';

export type HealthGroupId = 'api' | 'deriver' | 'storage' | 'network' | 'llm' | 'update' | 'host';

export interface HealthGroupDefinition {
  id: HealthGroupId;
  label: string;
  description: string;
}

export interface HealthEvidencePill {
  label: string;
  value: string;
}

interface BackendHealthCheck {
  id?: unknown;
  label?: unknown;
  layer?: unknown;
  status?: unknown;
  summary?: unknown;
  last_checked_at?: unknown;
  latency_ms?: unknown;
  evidence?: unknown;
  safe_to_show?: unknown;
}

interface BackendHealthResponse {
  service?: unknown;
  status?: unknown;
  generated_at?: unknown;
  checks?: unknown;
}

export const HEALTH_GROUPS: readonly HealthGroupDefinition[] = [
  { id: 'api', label: 'API', description: 'Honcho API process, HTTP health, and API-facing containers.' },
  { id: 'deriver', label: 'Deriver', description: 'Queue consumers, representation workers, and background derivation.' },
  { id: 'storage', label: 'Storage', description: 'Postgres, Redis, table counts, and queue backing stores.' },
  { id: 'network', label: 'Network', description: 'Tailnet reachability and private advertised addresses.' },
  { id: 'llm', label: 'LLM', description: 'Provider configuration flags without browser-visible credential material.' },
  { id: 'update', label: 'Update', description: 'Update timer state and last/next automation evidence.' },
  { id: 'host', label: 'Host', description: 'Systemd service state, CPU, memory, disk, and console host posture.' },
];

export async function fetchServiceHealth(fetcher: typeof fetch = fetch): Promise<HealthServicesSnapshot> {
  const response = await fetcher('/api/health/services', {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`health_services_${response.status}`);
  }
  const payload = (await response.json()) as BackendHealthResponse;
  return normalizeServiceHealth(payload, 'live');
}

export function normalizeServiceHealth(
  payload: BackendHealthResponse,
  source: HealthServicesSnapshot['source'],
): HealthServicesSnapshot {
  const checks = Array.isArray(payload.checks) ? payload.checks : [];
  return {
    service: asString(payload.service, 'honcho-memory-console'),
    status: payload.status === 'ok' ? 'ok' : 'degraded',
    generatedAt: asString(payload.generated_at, new Date().toISOString()),
    checks: checks.map((item) => normalizeHealthCheck(item as BackendHealthCheck)),
    source,
  };
}

export function groupHealthChecks(checks: readonly HealthCheck[]): Record<HealthGroupId, HealthCheck[]> {
  const groups = HEALTH_GROUPS.reduce<Record<HealthGroupId, HealthCheck[]>>(
    (acc, group) => ({ ...acc, [group.id]: [] }),
    { api: [], deriver: [], storage: [], network: [], llm: [], update: [], host: [] },
  );

  for (const check of expandCompositeChecks(checks)) {
    groups[classifyHealthGroup(check)].push(check);
  }

  return groups;
}

export function classifyHealthGroup(check: HealthCheck): HealthGroupId {
  const haystack = `${check.id} ${check.label} ${check.layer}`.toLowerCase();

  if (haystack.includes('deriver') || haystack.includes('queue-manager') || haystack.includes('representation')) {
    return 'deriver';
  }
  if (check.layer === 'storage' || /postgres|database|redis|queue/.test(haystack)) {
    return 'storage';
  }
  if (check.layer === 'network' || /tailscale|tailnet|network/.test(haystack)) {
    return 'network';
  }
  if (check.layer === 'config' || /provider|llm|embedding|openai|anthropic|gemini/.test(haystack)) {
    return 'llm';
  }
  if (check.layer === 'update' || /update|timer/.test(haystack)) {
    return 'update';
  }
  if (/honcho-api|\/health|\bapi\b/.test(haystack)) {
    return 'api';
  }
  return 'host';
}

export function summarizeEvidence(evidence: Record<string, unknown>, limit = 4): HealthEvidencePill[] {
  return Object.entries(evidence)
    .slice(0, limit)
    .map(([key, value]) => ({
      label: evidenceLabel(key),
      value: evidenceValue(key, value),
    }));
}

function normalizeHealthCheck(raw: BackendHealthCheck): HealthCheck {
  return {
    id: asString(raw.id, 'unknown-check'),
    label: asString(raw.label, 'Unknown check'),
    layer: asLayer(raw.layer),
    status: asStatus(raw.status),
    summary: asString(raw.summary, 'No backend summary was provided.'),
    lastCheckedAt: asString(raw.last_checked_at, new Date().toISOString()),
    latencyMs: asNumberOrNull(raw.latency_ms),
    evidence: asRecord(raw.evidence),
    safeToShow: raw.safe_to_show === false ? false : true,
  };
}

function expandCompositeChecks(checks: readonly HealthCheck[]): HealthCheck[] {
  const expanded: HealthCheck[] = [];
  for (const check of checks) {
    if (check.id === 'docker-compose') {
      expanded.push(...composeServiceChecks(check));
    }
    expanded.push(check);
  }
  return expanded;
}

function composeServiceChecks(check: HealthCheck): HealthCheck[] {
  const services = check.evidence.services;
  if (!isRecord(services)) return [];

  return Object.entries(services).map(([service, value]) => {
    const serviceRecord = isRecord(value) ? value : {};
    const status = asStatus(serviceRecord.status);
    return {
      id: `docker:${service}`,
      label: `Docker ${service}`,
      layer: service === 'database' || service === 'redis' ? 'storage' : 'service',
      status,
      summary: dockerServiceSummary(service, serviceRecord, status),
      lastCheckedAt: check.lastCheckedAt,
      latencyMs: null,
      evidence: serviceRecord,
      safeToShow: true,
    } satisfies HealthCheck;
  });
}

function dockerServiceSummary(service: string, data: Record<string, unknown>, status: HealthStatus): string {
  const state = asString(data.state, 'unknown');
  const health = asString(data.health, 'not reported');
  return `${service} is ${state}; health is ${health}; cockpit status is ${status}.`;
}

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function asNumberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asStatus(value: unknown): HealthStatus {
  return value === 'healthy' || value === 'degraded' || value === 'down' || value === 'unknown' ? value : 'unknown';
}

function asLayer(value: unknown): HealthLayer {
  return value === 'service' ||
    value === 'storage' ||
    value === 'resource' ||
    value === 'network' ||
    value === 'config' ||
    value === 'update'
    ? value
    : 'service';
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function evidenceLabel(key: string): string {
  if (/token|credential|pass|auth/i.test(key)) return 'protected flag';
  if (/provider.*keys/i.test(key)) return 'provider flags';
  return key.replace(/_/g, ' ');
}

function evidenceValue(key: string, value: unknown): string {
  if (/token|credential|pass|auth/i.test(key)) {
    return 'server-side only';
  }
  if (value === null || value === undefined || value === '') return 'not reported';
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(2);
  if (typeof value === 'string') return value.length > 48 ? `${value.slice(0, 45)}…` : value;
  if (Array.isArray(value)) return `${value.length} item${value.length === 1 ? '' : 's'}`;
  if (isRecord(value)) {
    const entries = Object.entries(value);
    const booleans = entries.filter(([, item]) => typeof item === 'boolean');
    if (booleans.length === entries.length && entries.length > 0) {
      const configured = booleans.filter(([, item]) => item).length;
      return `${configured}/${entries.length} configured`;
    }
    return `${entries.length} field${entries.length === 1 ? '' : 's'}`;
  }
  return 'reported';
}
