import type {
  AgentApiActivity,
  AgentDetailSnapshot,
  AgentRegistrySnapshot,
  AgentRow,
  AgentVmHealth,
  AlertValue,
  AuditEvent,
  AuditEventsSnapshot,
  HealthStatus,
  MemoryCounts,
  OverviewLayer,
  OverviewMetrics,
  OverviewSnapshot,
  QueueState,
  RegistryAlert,
  SettingsSnapshot,
  TelemetryRouteStat,
  TelemetrySnapshot,
  TokenStatus,
} from './types';

type Fetcher = typeof fetch;
type JsonRecord = Record<string, unknown>;

interface BackendAgentRegistryResponse {
  service?: unknown;
  status?: unknown;
  total?: unknown;
  agents?: unknown;
  alerts?: unknown;
}

interface BackendAgentDetailResponse {
  service?: unknown;
  status?: unknown;
  agent?: unknown;
  alerts?: unknown;
}

interface BackendOverviewResponse {
  service?: unknown;
  status?: unknown;
  generated_at?: unknown;
  privacy_boundary?: unknown;
  honcho_api?: unknown;
  metrics?: unknown;
  layers?: unknown;
  alerts?: unknown;
  sources?: unknown;
}

interface BackendTelemetryResponse {
  service?: unknown;
  status?: unknown;
  generated_at?: unknown;
  token_fingerprint?: unknown;
  token_scope?: unknown;
  totals?: unknown;
  routes?: unknown;
}

interface BackendAuditEventsResponse {
  service?: unknown;
  status?: unknown;
  total?: unknown;
  events?: unknown;
}

export async function fetchOverviewSnapshot(fetcher: Fetcher = fetch): Promise<OverviewSnapshot> {
  const payload = (await fetchJson('/api/overview', fetcher)) as BackendOverviewResponse;
  return normalizeOverview(payload);
}

export async function fetchAgentRegistry(fetcher: Fetcher = fetch): Promise<AgentRegistrySnapshot> {
  const payload = (await fetchJson('/api/agents', fetcher)) as BackendAgentRegistryResponse;
  const rawAgents = Array.isArray(payload.agents) ? payload.agents : [];
  const rawAlerts = Array.isArray(payload.alerts) ? payload.alerts : [];
  return {
    service: asString(payload.service, 'honcho-memory-console'),
    status: asOkDegraded(payload.status),
    total: asNumber(payload.total, rawAgents.length),
    agents: rawAgents.map(normalizeAgentRow),
    alerts: rawAlerts.map(normalizeRegistryAlert),
    source: 'live',
  };
}

export async function fetchAgentDetail(agentIdInput: string, fetcher: Fetcher = fetch): Promise<AgentDetailSnapshot> {
  const agentId = encodeURIComponent(agentIdInput);
  const payload = (await fetchJson(`/api/agents/${agentId}`, fetcher)) as BackendAgentDetailResponse;
  const rawAlerts = Array.isArray(payload.alerts) ? payload.alerts : [];
  return {
    service: asString(payload.service, 'honcho-memory-console'),
    status: asOkDegraded(payload.status),
    agent: normalizeAgentRow(payload.agent),
    alerts: rawAlerts.map(normalizeRegistryAlert),
    source: 'live',
  };
}

export async function fetchTelemetrySnapshot(fetcher: Fetcher = fetch): Promise<TelemetrySnapshot> {
  const payload = (await fetchJson('/api/telemetry', fetcher)) as BackendTelemetryResponse;
  const routes = Array.isArray(payload.routes) ? payload.routes : [];
  return {
    service: asString(payload.service, 'honcho-memory-console'),
    status: asOkDegraded(payload.status),
    generatedAt: asString(payload.generated_at, new Date().toISOString()),
    tokenFingerprint: asNullableString(payload.token_fingerprint),
    tokenScope: asString(payload.token_scope, 'unknown'),
    totals: normalizeApiActivity(payload.totals),
    routes: routes.map(normalizeTelemetryRoute),
    source: 'live',
  };
}

export async function fetchAuditEvents(fetcher: Fetcher = fetch): Promise<AuditEventsSnapshot> {
  const payload = (await fetchJson('/api/audit/events', fetcher)) as BackendAuditEventsResponse;
  const events = Array.isArray(payload.events) ? payload.events : [];
  return {
    service: asString(payload.service, 'honcho-memory-console'),
    status: asOkDegraded(payload.status),
    total: asNumber(payload.total, events.length),
    events: events.map(normalizeAuditEvent),
    source: 'live',
  };
}

export async function fetchSettingsSnapshot(fetcher: Fetcher = fetch): Promise<SettingsSnapshot> {
  const payload = asRecord(await fetchJson('/api/settings', fetcher));
  const auth = asRecord(payload.auth);
  const honchoApi = asRecord(payload.honcho_api);
  const registry = asRecord(payload.agent_registry);
  const secrets = asRecord(payload.secrets);
  const localHealth = asRecord(payload.local_health);
  const frontend = asRecord(payload.frontend);
  return {
    auth: {
      enabled: asBoolean(auth.enabled, true),
      configured: asBoolean(auth.configured, false),
      usernameConfigured: asBoolean(auth.username_configured, false),
    },
    honchoApi: {
      url: asString(honchoApi.url, 'not reported'),
      tokenConfigured: asBoolean(honchoApi.token_configured, false),
      tokenFingerprint: asNullableString(honchoApi.token_fingerprint),
    },
    agentRegistry: {
      agentId: asString(registry.agent_id, 'not reported'),
      displayName: asString(registry.display_name, 'not reported'),
      tenantId: asString(registry.tenant_id, 'not reported'),
      runtimeVm: asString(registry.runtime_vm, 'not reported'),
      tailnetIp: asNullableString(registry.tailnet_ip),
      environment: asString(registry.environment, 'not reported'),
      honchoWorkspace: asString(registry.honcho_workspace, 'not reported'),
      aiPeer: asNullableString(registry.ai_peer),
      humanPeer: asNullableString(registry.human_peer),
      fleetRegistryConfigured: asBoolean(registry.fleet_registry_configured, false),
      fleetRegistryFingerprint: asNullableString(registry.fleet_registry_fingerprint),
    },
    secrets: {
      jwtSecretConfigured: asBoolean(secrets.jwt_secret_configured, false),
      databaseUrlConfigured: asBoolean(secrets.database_url_configured, false),
      redisUrlConfigured: asBoolean(secrets.redis_url_configured, false),
      infisicalTokenConfigured: asBoolean(secrets.infisical_token_configured, false),
      providerKeysConfigured: asBooleanRecord(secrets.provider_keys_configured),
    },
    localHealth: {
      systemdUnits: asStringArray(localHealth.systemd_units),
      updateTimerUnit: asString(localHealth.update_timer_unit, 'not reported'),
      dockerServices: asStringArray(localHealth.docker_services),
      diskPaths: asStringArray(localHealth.disk_paths),
      dockerComposeDirectoryConfigured: asBoolean(localHealth.docker_compose_directory_configured, false),
    },
    frontend: {
      staticDirConfigured: asBoolean(frontend.static_dir_configured, false),
    },
    source: 'live',
  };
}

async function fetchJson(path: string, fetcher: Fetcher): Promise<unknown> {
  const response = await fetcher(path, {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`console_api_${response.status}`);
  }
  return response.json();
}

function normalizeOverview(payload: BackendOverviewResponse): OverviewSnapshot {
  const privacy = asRecord(payload.privacy_boundary);
  const honchoApi = asRecord(payload.honcho_api);
  const metrics = asRecord(payload.metrics);
  const layers = Array.isArray(payload.layers) ? payload.layers : [];
  const alerts = Array.isArray(payload.alerts) ? payload.alerts : [];
  return {
    service: asString(payload.service, 'honcho-memory-console'),
    status: asOkDegraded(payload.status),
    generatedAt: asString(payload.generated_at, new Date().toISOString()),
    privacyBoundary: {
      mode: asString(privacy.mode, 'private_tailscale_internal'),
      publicInternetUrlRequired: asBoolean(privacy.public_internet_url_required, false),
      publicInternetUrlConfigured: asBoolean(privacy.public_internet_url_configured, false),
      evidenceHint: asString(privacy.evidence_hint, 'Use private Tailscale/internal address for QA evidence.'),
    },
    honchoApi: {
      available: asBoolean(honchoApi.available, false),
      status: asString(honchoApi.status, 'unknown'),
      summary: asString(honchoApi.summary, 'No Honcho API summary reported.'),
      upstreamStatus: asNullableNumber(honchoApi.upstream_status),
      latencyMs: asNullableNumber(honchoApi.latency_ms),
      tokenConfigured: asBoolean(honchoApi.token_configured, false),
    },
    metrics: normalizeOverviewMetrics(metrics),
    layers: layers.map(normalizeOverviewLayer),
    alerts: alerts.map(normalizeRegistryAlert),
    sources: asStringArray(payload.sources),
    source: 'live',
  };
}

function normalizeAgentRow(raw: unknown): AgentRow {
  const item = asRecord(raw);
  return {
    agentId: asString(item.agent_id, 'unknown-agent'),
    displayName: asString(item.display_name, asString(item.agent_id, 'Unknown agent')),
    tenantId: asString(item.tenant_id, 'not reported'),
    runtimeVm: asString(item.runtime_vm, 'not reported'),
    tailnetIp: asNullableString(item.tailnet_ip),
    environment: asString(item.environment, 'not reported'),
    honchoWorkspace: asString(item.honcho_workspace, 'not reported'),
    aiPeer: asNullableString(item.ai_peer),
    humanPeer: asNullableString(item.human_peer),
    tokenFingerprint: asNullableString(item.token_fingerprint),
    tokenScope: asString(item.token_scope, 'unknown'),
    tokenStatus: asTokenStatus(item.token_status),
    lastWriteAt: asNullableString(item.last_write_at),
    memoryCounts: normalizeMemoryCounts(item.memory_counts),
    queueState: normalizeQueueState(item.queue_state),
    apiActivity: normalizeApiActivity(item.api_activity),
    vmHealth: normalizeVmHealth(item.vm_health),
    alerts: normalizeAlertValues(item.alerts),
    sources: asStringArray(item.sources),
  };
}

function normalizeMemoryCounts(raw: unknown): MemoryCounts {
  const item = asRecord(raw);
  return {
    sessions: asNullableNumber(item.sessions),
    messages: asNullableNumber(item.messages),
    documents: asNullableNumber(item.documents),
    conclusions: asNullableNumber(item.conclusions),
    peerCardEntries: asNullableNumber(item.peer_card_entries),
  };
}

function normalizeQueueState(raw: unknown): QueueState {
  const item = asRecord(raw);
  const status = item.status;
  return {
    pending: asNullableNumber(item.pending),
    inProgress: asNullableNumber(item.in_progress),
    completed: asNullableNumber(item.completed),
    errors: asNullableNumber(item.errors),
    status: status === 'healthy' || status === 'pending' || status === 'degraded' || status === 'error' || status === 'unknown' ? status : 'unknown',
  };
}

function normalizeApiActivity(raw: unknown): AgentApiActivity {
  const item = asRecord(raw);
  return {
    requests1h: asNullableNumber(item.requests_1h),
    requests24h: asNullableNumber(item.requests_24h),
    errorRate: asNullableNumber(item.error_rate),
    p95LatencyMs: asNullableNumber(item.p95_latency_ms),
  };
}

function normalizeVmHealth(raw: unknown): AgentVmHealth {
  const item = asRecord(raw);
  const status = item.status;
  return {
    status: status === 'online' || status === 'offline' || status === 'degraded' || status === 'unknown' ? status : 'unknown',
    cpuPercent: asNullableNumber(item.cpu_percent),
    memoryPercent: asNullableNumber(item.memory_percent),
    diskPercent: asNullableNumber(item.disk_percent),
    serviceState: asNullableString(item.service_state),
  };
}

function normalizeOverviewMetrics(item: JsonRecord): OverviewMetrics {
  return {
    activeAgents: asNullableNumber(item.active_agents),
    workspaces: asNullableNumber(item.workspaces),
    memoryItems: asNullableNumber(item.memory_items),
    queueTotal: asNullableNumber(item.queue_total),
    queuePending: asNullableNumber(item.queue_pending),
    queueInProgress: asNullableNumber(item.queue_in_progress),
    queueErrors: asNullableNumber(item.queue_errors),
    requests1h: asNullableNumber(item.requests_1h),
    requests24h: asNullableNumber(item.requests_24h),
    errorRate: asNullableNumber(item.error_rate),
    p95LatencyMs: asNullableNumber(item.p95_latency_ms),
    auditEvents: asNullableNumber(item.audit_events),
    total: asNullableNumber(item.total),
    degraded: asNullableNumber(item.degraded),
    down: asNullableNumber(item.down),
    unknown: asNullableNumber(item.unknown),
  };
}

function normalizeOverviewLayer(raw: unknown): OverviewLayer {
  const item = asRecord(raw);
  return {
    id: asString(item.id, 'unknown-layer'),
    label: asString(item.label, 'Unknown layer'),
    status: asHealthStatus(item.status),
    summary: asString(item.summary, 'No summary reported.'),
  };
}

function normalizeTelemetryRoute(raw: unknown): TelemetryRouteStat {
  const item = asRecord(raw);
  return {
    route: asString(item.route, '/api/unavailable'),
    requests: asNumber(item.requests, 0),
    errors: asNumber(item.errors, 0),
    errorRate: asNullableNumber(item.error_rate),
    p95LatencyMs: asNullableNumber(item.p95_latency_ms),
  };
}

function normalizeAuditEvent(raw: unknown): AuditEvent {
  const item = asRecord(raw);
  const actor = item.actor === 'operator' || item.actor === 'unknown' ? item.actor : 'unknown';
  const outcome = item.outcome === 'ok' || item.outcome === 'denied' || item.outcome === 'error' ? item.outcome : 'error';
  return {
    id: asString(item.id, 'unknown-audit-event'),
    at: asString(item.at, new Date().toISOString()),
    actor,
    action: asString(item.action, 'view.unknown'),
    outcome,
    route: asString(item.route, '/api/unavailable'),
    method: asString(item.method, 'GET'),
    statusCode: asNumber(item.status_code, 0),
    tokenFingerprint: asNullableString(item.token_fingerprint),
    tokenScope: asString(item.token_scope, 'unknown'),
  };
}

function normalizeAlertValues(raw: unknown): AlertValue[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => (typeof item === 'string' ? item : normalizeRegistryAlert(item)));
}

function normalizeRegistryAlert(raw: unknown): RegistryAlert {
  const item = asRecord(raw);
  return {
    code: asString(item.code, 'unknown_alert'),
    message: asString(item.message, 'An adapter reported an unavailable state.'),
    severity: item.severity === 'info' || item.severity === 'critical' ? item.severity : 'warning',
    source: asNullableString(item.source),
  };
}

function asRecord(value: unknown): JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asNullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function asBooleanRecord(value: unknown): Record<string, boolean> {
  const record = asRecord(value);
  return Object.entries(record).reduce<Record<string, boolean>>((acc, [key, item]) => {
    acc[key] = item === true;
    return acc;
  }, {});
}

function asOkDegraded(value: unknown): 'ok' | 'degraded' {
  return value === 'ok' ? 'ok' : 'degraded';
}

function asHealthStatus(value: unknown): HealthStatus {
  return value === 'healthy' || value === 'degraded' || value === 'down' || value === 'unknown' ? value : 'unknown';
}

function asTokenStatus(value: unknown): TokenStatus {
  return value === 'valid' || value === 'expired' || value === 'mis-scoped' || value === 'unknown' ? value : 'unknown';
}
