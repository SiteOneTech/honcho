import type { AgentRow, HealthCheck, HealthServicesSnapshot, MemoryExplorerSnapshot, WorkspaceSummaryRow } from './types';

const now = new Date('2026-06-19T16:20:00.000Z').toISOString();
const earlier = new Date('2026-06-19T15:51:00.000Z').toISOString();

export const FIXTURE_META = {
  fixtureOnly: true,
  note: 'Non-health sections use explicit development fixtures until their assigned integration increments land.',
};

export const healthChecksFixture: HealthCheck[] = [
  {
    id: 'honcho-api',
    label: 'Honcho API /health',
    layer: 'service',
    status: 'healthy',
    summary: 'Health endpoint returned ok from the backend adapter.',
    lastCheckedAt: now,
    latencyMs: 14,
    evidence: { http_status: 200, body_status: 'ok' },
    safeToShow: true,
  },
  {
    id: 'docker:deriver',
    label: 'Deriver worker container',
    layer: 'service',
    status: 'degraded',
    summary: 'Container is running but reported a warm-up health state.',
    lastCheckedAt: now,
    latencyMs: null,
    evidence: { state: 'running', health: 'starting', present: true },
    safeToShow: true,
  },
  {
    id: 'postgres',
    label: 'Postgres',
    layer: 'storage',
    status: 'healthy',
    summary: 'SELECT 1 succeeded and table counts were collected.',
    lastCheckedAt: now,
    latencyMs: 6,
    evidence: { select_1: true, table_counts: { workspaces: 4, peers: 15 } },
    safeToShow: true,
  },
  {
    id: 'redis',
    label: 'Redis',
    layer: 'storage',
    status: 'healthy',
    summary: 'PING succeeded.',
    lastCheckedAt: now,
    latencyMs: 3,
    evidence: { ping: true },
    safeToShow: true,
  },
  {
    id: 'tailscale',
    label: 'Tailscale',
    layer: 'network',
    status: 'healthy',
    summary: 'Tailnet node is online with an advertised private address.',
    lastCheckedAt: now,
    latencyMs: null,
    evidence: { hostname: 'honcho-memory-prod', online: true, ips: ['100.71.144.114'] },
    safeToShow: true,
  },
  {
    id: 'provider-config',
    label: 'Provider configuration',
    layer: 'config',
    status: 'degraded',
    summary: 'One or more LLM provider flags are not configured.',
    lastCheckedAt: now,
    latencyMs: null,
    evidence: { provider_keys_configured: { openai: true, anthropic: false }, configured_count: 1 },
    safeToShow: true,
  },
  {
    id: 'systemd:honcho-update.timer',
    label: 'Honcho update timer',
    layer: 'update',
    status: 'healthy',
    summary: 'Update timer is active and waiting for the next run.',
    lastCheckedAt: now,
    latencyMs: null,
    evidence: { ActiveState: 'active', SubState: 'waiting', Result: 'success' },
    safeToShow: true,
  },
  {
    id: 'disk:/opt/honcho',
    label: 'Disk /opt/honcho',
    layer: 'resource',
    status: 'healthy',
    summary: 'Disk /opt/honcho is 51.8% used.',
    lastCheckedAt: now,
    latencyMs: null,
    evidence: { path: '/opt/honcho', used_percent: 51.8 },
    safeToShow: true,
  },
  {
    id: 'systemd:honcho-console.service',
    label: 'Console service',
    layer: 'service',
    status: 'down',
    summary: 'Console service is offline in this fixture until deployment packaging runs.',
    lastCheckedAt: now,
    latencyMs: null,
    evidence: { ActiveState: 'inactive', SubState: 'dead', Result: 'success' },
    safeToShow: true,
  },
];

export const healthSnapshotFixture: HealthServicesSnapshot = {
  service: 'honcho-memory-console',
  status: 'degraded',
  generatedAt: now,
  checks: healthChecksFixture,
  source: 'fixture',
};

export const overviewFixture = {
  healthScore: 86,
  activeAgents: 3,
  workspaces: 4,
  queue: { pending: 12, inProgress: 2, errors: 1 },
  layers: [
    { id: 'API', label: 'Honcho API', status: 'healthy' as const },
    { id: 'Deriver', label: 'Deriver worker', status: 'degraded' as const },
    { id: 'Storage', label: 'Postgres and Redis', status: 'healthy' as const },
    { id: 'Host', label: 'VM resources', status: 'healthy' as const },
  ],
  alerts: [
    {
      code: 'deriver_warmup',
      message: 'Deriver is warming up; queue processing may lag briefly.',
      severity: 'warning' as const,
      source: 'console-fixture',
    },
  ],
};

export const agentsFixture: AgentRow[] = [
  {
    agentId: 'zeus',
    displayName: 'Zeus',
    tenantId: 'sitiouno-jean',
    runtimeVm: 'honcho-memory-prod',
    tailnetIp: '100.71.144.114',
    environment: 'production',
    honchoWorkspace: 'hermes',
    aiPeer: 'Zeus',
    humanPeer: 'Jean-Garcia',
    tokenFingerprint: 'sha256:9f3ab1c2d4e5',
    tokenScope: 'workspace:hermes',
    tokenStatus: 'valid',
    lastWriteAt: earlier,
    memoryCounts: { sessions: 128, messages: 4218, documents: 74, conclusions: 812, peerCardEntries: 39 },
    queueState: { pending: 12, inProgress: 2, completed: 744, errors: 1, status: 'pending' },
    apiActivity: { requests1h: 48, requests24h: 812, errorRate: 0.013, p95LatencyMs: 184 },
    vmHealth: { status: 'degraded', cpuPercent: 34, memoryPercent: 67, diskPercent: 52, serviceState: 'active' },
    alerts: ['queue_pending'],
    sources: ['honcho_config', 'local_health_fixture'],
  },
  {
    agentId: 'bael',
    displayName: 'Bael',
    tenantId: 'sitiouno-lab',
    runtimeVm: 'future-agent-vm',
    tailnetIp: null,
    environment: 'staging',
    honchoWorkspace: 'bael-lab',
    aiPeer: 'Bael',
    humanPeer: 'Jean-Garcia',
    tokenFingerprint: 'sha256:44a8c9d201ef',
    tokenScope: 'read-only',
    tokenStatus: 'unknown',
    lastWriteAt: null,
    memoryCounts: { sessions: 9, messages: 144, documents: 3, conclusions: 27, peerCardEntries: 8 },
    queueState: { pending: 0, inProgress: 0, completed: 18, errors: 0, status: 'healthy' },
    apiActivity: { requests1h: 0, requests24h: 7, errorRate: 0, p95LatencyMs: 96 },
    vmHealth: { status: 'unknown', cpuPercent: null, memoryPercent: null, diskPercent: null, serviceState: null },
    alerts: [],
    sources: ['development_fixture'],
  },
];

export const workspacesFixture: WorkspaceSummaryRow[] = [
  { workspace: 'hermes', peers: 14, sessions: 128, conclusions: 812, lastActivityAt: earlier },
  { workspace: 'bael-lab', peers: 3, sessions: 9, conclusions: 27, lastActivityAt: '2026-06-18T19:42:00.000Z' },
  { workspace: 'console-smoke', peers: 2, sessions: 4, conclusions: 16, lastActivityAt: '2026-06-17T13:20:00.000Z' },
];

export const memoryExplorerFixture: MemoryExplorerSnapshot = {
  source: 'fixture',
  loadedAt: now,
  selectedWorkspaceId: 'hermes',
  selectedPeerId: 'Zeus',
  selectedSessionId: 'session-fixture',
  workspaces: [
    { id: 'hermes', metadata: { owner: 'Jean', tier: 'prod' }, configurationKeys: ['deriver'], createdAt: now },
    { id: 'console-lab', metadata: { owner: 'QA' }, configurationKeys: [], createdAt: '2026-06-18T16:00:00.000Z' },
  ],
  queue: {
    totalWorkUnits: 12,
    completedWorkUnits: 8,
    inProgressWorkUnits: 1,
    pendingWorkUnits: 3,
    sessions: {
      'session-fixture': { totalWorkUnits: 4, completedWorkUnits: 3, inProgressWorkUnits: 0, pendingWorkUnits: 1 },
    },
  },
  peers: [
    { id: 'Zeus', workspaceId: 'hermes', metadata: { role: 'orchestrator' }, configurationKeys: ['observe_me'], createdAt: now },
    { id: 'Jean-Garcia', workspaceId: 'hermes', metadata: { role: 'human' }, configurationKeys: [], createdAt: earlier },
  ],
  peerCard: {
    total: 2,
    entries: [
      { index: 0, text: 'Prefers concise factory evidence.', sensitive: false },
      { index: 1, text: 'Sensitive peer-card detail is redacted by default.', sensitive: true },
    ],
  },
  representation: {
    representation: 'Operator representation is available after explicit peer-context disclosure.',
    sensitive: false,
  },
  context: {
    peerId: 'Zeus',
    targetId: 'Jean-Garcia',
    representation: 'Context links factory handoffs to concise Spanish summaries.',
    peerCard: [{ index: 0, text: 'Use evidence-backed summaries.', sensitive: false }],
    sensitive: false,
  },
  sessions: [
    { id: 'session-fixture', workspaceId: 'hermes', isActive: true, metadata: { topic: 'memory explorer' }, configurationKeys: ['summary'], createdAt: now },
  ],
  messages: [
    {
      id: 'msg-fixture',
      workspaceId: 'hermes',
      sessionId: 'session-fixture',
      peerId: 'Jean-Garcia',
      metadata: { channel: 'factory' },
      createdAt: now,
      tokenCount: 42,
      contentHidden: true,
      contentPreview: 'Sensitive message preview is displayed only after disclosure.',
      sensitive: true,
    },
  ],
  conclusions: [
    {
      id: 'conclusion-fixture',
      observerId: 'Zeus',
      observedId: 'Jean-Garcia',
      sessionId: 'session-fixture',
      createdAt: now,
      contentPreview: 'Jean values evidence-backed Factory work.',
      sensitive: false,
    },
  ],
};

export const telemetryFixture = [
  { label: 'Requests', current: 812, unit: '24h', delta: 18, points: [12, 18, 15, 28, 34, 31, 44, 52] },
  { label: 'p95 latency', current: 184, unit: 'ms', delta: -9, points: [260, 244, 238, 220, 205, 190, 184] },
  { label: 'Queue pending', current: 12, unit: 'items', delta: 4, points: [3, 5, 8, 7, 9, 12] },
];

export const auditFixture = [
  { id: 'evt-1', at: now, actor: 'operator', action: 'view.health', outcome: 'ok' as const },
  { id: 'evt-2', at: earlier, actor: 'operator', action: 'view.agents', outcome: 'ok' as const },
  { id: 'evt-3', at: '2026-06-19T14:02:00.000Z', actor: 'unknown', action: 'api.settings', outcome: 'denied' as const },
  { id: 'evt-4', at: '2026-06-19T13:21:00.000Z', actor: 'operator', action: 'theme.toggle', outcome: 'ok' as const },
];

export const providersFixture = [
  { id: 'openai', label: 'OpenAI', scope: 'Configured flag only; value remains server-side', configured: true },
  { id: 'anthropic', label: 'Anthropic', scope: 'Not configured in this sample snapshot', configured: false },
  { id: 'gemini', label: 'Gemini', scope: 'Prepared for provider posture checks', configured: false },
];
