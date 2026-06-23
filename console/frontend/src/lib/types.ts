export type HealthStatus = 'healthy' | 'degraded' | 'down' | 'unknown';
export type HealthLayer = 'service' | 'storage' | 'resource' | 'network' | 'config' | 'update';
export type TokenStatus = 'valid' | 'expired' | 'mis-scoped' | 'unknown';

export interface HealthCheck {
  id: string;
  label: string;
  layer: HealthLayer;
  status: HealthStatus;
  summary: string;
  lastCheckedAt: string;
  latencyMs: number | null;
  evidence: Record<string, unknown>;
  safeToShow: boolean;
}

export interface HealthServicesSnapshot {
  service: string;
  status: 'ok' | 'degraded';
  generatedAt: string;
  checks: HealthCheck[];
  source: 'live' | 'fixture';
}

export interface MemoryCounts {
  sessions: number | null;
  messages: number | null;
  documents: number | null;
  conclusions: number | null;
  peerCardEntries: number | null;
}

export interface QueueState {
  pending: number | null;
  inProgress: number | null;
  completed: number | null;
  errors: number | null;
  status: 'healthy' | 'pending' | 'degraded' | 'error' | 'unknown';
}

export interface AgentApiActivity {
  requests1h: number | null;
  requests24h: number | null;
  errorRate: number | null;
  p95LatencyMs: number | null;
}

export interface AgentVmHealth {
  status: 'online' | 'offline' | 'degraded' | 'unknown';
  cpuPercent: number | null;
  memoryPercent: number | null;
  diskPercent: number | null;
  serviceState: string | null;
}

export interface RegistryAlert {
  code: string;
  message: string;
  severity: 'info' | 'warning' | 'critical';
  source: string | null;
}

export type AlertValue = string | RegistryAlert;

export interface AgentRow {
  agentId: string;
  displayName: string;
  tenantId: string;
  runtimeVm: string;
  tailnetIp: string | null;
  environment: string;
  honchoWorkspace: string;
  aiPeer: string | null;
  humanPeer: string | null;
  tokenFingerprint: string | null;
  tokenScope: string;
  tokenStatus: TokenStatus;
  lastWriteAt: string | null;
  memoryCounts: MemoryCounts;
  queueState: QueueState;
  apiActivity: AgentApiActivity;
  vmHealth: AgentVmHealth;
  alerts: AlertValue[];
  sources: string[];
}

export interface AgentRegistrySnapshot {
  service: string;
  status: 'ok' | 'degraded';
  total: number;
  agents: AgentRow[];
  alerts: RegistryAlert[];
  source: 'live';
}

export interface AgentDetailSnapshot {
  service: string;
  status: 'ok' | 'degraded';
  agent: AgentRow;
  alerts: RegistryAlert[];
  source: 'live';
}

export interface WorkspaceSummaryRow {
  workspace: string;
  peers: number;
  sessions: number;
  conclusions: number;
  lastActivityAt: string;
}

export type MemorySource = 'live' | 'fixture';

export interface MemoryPageEnvelope<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
  pages: number;
}

export interface MemoryWorkspace {
  id: string;
  metadata: Record<string, unknown>;
  configurationKeys: string[];
  createdAt: string | null;
}

export interface MemoryPeer {
  id: string;
  workspaceId: string | null;
  metadata: Record<string, unknown>;
  configurationKeys: string[];
  createdAt: string | null;
}

export interface QueueWorkUnitSummary {
  totalWorkUnits: number;
  completedWorkUnits: number;
  inProgressWorkUnits: number;
  pendingWorkUnits: number;
}

export interface MemoryQueueSummary extends QueueWorkUnitSummary {
  sessions: Record<string, QueueWorkUnitSummary>;
}

export interface PeerCardEntry {
  index: number;
  text: string;
  sensitive: boolean;
}

export interface PeerCard {
  total: number;
  entries: PeerCardEntry[];
}

export interface PeerRepresentation {
  representation: string | null;
  sensitive: boolean;
}

export interface PeerContext {
  peerId: string | null;
  targetId: string | null;
  representation: string | null;
  peerCard: PeerCardEntry[];
  sensitive: boolean;
}

export interface MemorySession {
  id: string;
  workspaceId: string | null;
  isActive: boolean | null;
  metadata: Record<string, unknown>;
  configurationKeys: string[];
  createdAt: string | null;
}

export interface MessageSummary {
  id: string;
  workspaceId: string | null;
  sessionId: string | null;
  peerId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string | null;
  tokenCount: number | null;
  contentHidden: boolean;
  contentPreview: string | null;
  sensitive: boolean;
}

export interface ConclusionSummary {
  id: string;
  observerId: string | null;
  observedId: string | null;
  sessionId: string | null;
  createdAt: string | null;
  contentPreview: string | null;
  sensitive: boolean;
}

export interface MemoryExplorerSnapshot {
  source: MemorySource;
  loadedAt: string;
  selectedWorkspaceId: string | null;
  selectedPeerId: string | null;
  selectedSessionId: string | null;
  workspaces: MemoryWorkspace[];
  queue: MemoryQueueSummary | null;
  peers: MemoryPeer[];
  peerCard: PeerCard;
  representation: PeerRepresentation;
  context: PeerContext;
  sessions: MemorySession[];
  messages: MessageSummary[];
  conclusions: ConclusionSummary[];
}

export interface OverviewLayer {
  id: string;
  label: string;
  status: HealthStatus;
  summary: string;
}

export interface OverviewMetrics {
  activeAgents: number | null;
  workspaces: number | null;
  memoryItems: number | null;
  queueTotal: number | null;
  queuePending: number | null;
  queueInProgress: number | null;
  queueErrors: number | null;
  requests1h: number | null;
  requests24h: number | null;
  errorRate: number | null;
  p95LatencyMs: number | null;
  auditEvents: number | null;
  total: number | null;
  degraded: number | null;
  down: number | null;
  unknown: number | null;
}

export interface OverviewSnapshot {
  service: string;
  status: 'ok' | 'degraded';
  generatedAt: string;
  privacyBoundary: {
    mode: string;
    publicInternetUrlRequired: boolean;
    publicInternetUrlConfigured: boolean;
    evidenceHint: string;
  };
  honchoApi: {
    available: boolean;
    status: string;
    summary: string;
    upstreamStatus: number | null;
    latencyMs: number | null;
    tokenConfigured: boolean;
  };
  metrics: OverviewMetrics;
  layers: OverviewLayer[];
  alerts: RegistryAlert[];
  sources: string[];
  source: 'live';
}

export interface TelemetryRouteStat {
  route: string;
  requests: number;
  errors: number;
  errorRate: number | null;
  p95LatencyMs: number | null;
}

export interface TelemetrySnapshot {
  service: string;
  status: 'ok' | 'degraded';
  generatedAt: string;
  tokenFingerprint: string | null;
  tokenScope: string;
  totals: AgentApiActivity;
  routes: TelemetryRouteStat[];
  source: 'live';
}

export interface AuditEvent {
  id: string;
  at: string;
  actor: 'operator' | 'unknown';
  action: string;
  outcome: 'ok' | 'denied' | 'error';
  route: string;
  method: string;
  statusCode: number;
  tokenFingerprint: string | null;
  tokenScope: string;
}

export interface AuditEventsSnapshot {
  service: string;
  status: 'ok' | 'degraded';
  total: number;
  events: AuditEvent[];
  source: 'live';
}

export interface SettingsSnapshot {
  auth: {
    enabled: boolean;
    configured: boolean;
    usernameConfigured: boolean;
  };
  honchoApi: {
    url: string;
    tokenConfigured: boolean;
    tokenFingerprint: string | null;
  };
  agentRegistry: {
    agentId: string;
    displayName: string;
    tenantId: string;
    runtimeVm: string;
    tailnetIp: string | null;
    environment: string;
    honchoWorkspace: string;
    aiPeer: string | null;
    humanPeer: string | null;
    fleetRegistryConfigured: boolean;
    fleetRegistryFingerprint: string | null;
  };
  secrets: {
    jwtSecretConfigured: boolean;
    databaseUrlConfigured: boolean;
    redisUrlConfigured: boolean;
    infisicalTokenConfigured: boolean;
    providerKeysConfigured: Record<string, boolean>;
  };
  localHealth: {
    systemdUnits: string[];
    updateTimerUnit: string;
    dockerServices: string[];
    diskPaths: string[];
    dockerComposeDirectoryConfigured: boolean;
  };
  frontend: {
    staticDirConfigured: boolean;
  };
  source: 'live';
}
