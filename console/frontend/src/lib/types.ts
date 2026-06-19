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
  alerts: string[];
  sources: string[];
}

export interface WorkspaceSummaryRow {
  workspace: string;
  peers: number;
  sessions: number;
  conclusions: number;
  lastActivityAt: string;
}
