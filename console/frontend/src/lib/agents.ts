/**
 * Pure helper functions for the agent registry table and detail view.
 *
 * All helpers operate on browser-safe AgentRow objects. Token identity is
 * represented only as a SHA-256 fingerprint; raw bearer values, passwords,
 * and auth header references do not appear in this module.
 */

import type { AgentRow, HealthStatus, TokenStatus } from './types';

// ---------------------------------------------------------------------------
// Column definition (drives table rendering)
// ---------------------------------------------------------------------------

export interface AgentColumn {
  id: string;
  label: string;
  group: 'identity' | 'token' | 'memory' | 'queue' | 'vm';
  sortable: boolean;
  align?: 'left' | 'right' | 'center';
}

export const AGENT_COLUMNS: AgentColumn[] = [
  // Identity group
  { id: 'displayName',     label: 'Agent',     group: 'identity', sortable: true  },
  { id: 'tenantId',        label: 'Tenant',    group: 'identity', sortable: true  },
  // Token group
  { id: 'tokenFingerprint',label: 'Token',     group: 'token',   sortable: true, align: 'right' },
  // Memory group
  { id: 'memoryTotal',     label: 'Memory',    group: 'memory',  sortable: true, align: 'right' },
  // Queue group
  { id: 'queuePending',    label: 'Queue',     group: 'queue',   sortable: true, align: 'right' },
  // VM group
  { id: 'vmHealth',        label: 'VM',        group: 'vm',     sortable: true  },
  // Health (overall) — derived
  { id: 'healthStatus',    label: 'Health',   group: 'identity', sortable: true, align: 'center' },
];

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

/**
 * Case-insensitive substring match across the most relevant agent fields.
 * Safe for fixture and live data — never logs or leaks token values.
 */
export function searchAgents(agents: AgentRow[], query: string): AgentRow[] {
  if (!query.trim()) return agents;
  const q = query.toLowerCase();
  return agents.filter(
    (a) =>
      a.displayName.toLowerCase().includes(q) ||
      a.agentId.toLowerCase().includes(q) ||
      a.tenantId.toLowerCase().includes(q) ||
      a.runtimeVm.toLowerCase().includes(q) ||
      (a.tokenFingerprint ?? '').toLowerCase().includes(q) ||
      a.honchoWorkspace.toLowerCase().includes(q),
  );
}

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

export type SortField = keyof AgentRow;
export type SortDir = 'asc' | 'desc';

/** Sort agents by a given field and direction. */
export function sortAgents(agents: AgentRow[], field: SortField, dir: SortDir): AgentRow[] {
  const sorted = [...agents].sort((a, b) => {
    const av = a[field];
    const bv = b[field];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === 'number' && typeof bv === 'number') {
      return dir === 'asc' ? av - bv : bv - av;
    }
    const as = String(av);
    const bs = String(bv);
    return dir === 'asc' ? as.localeCompare(bs) : bs.localeCompare(as);
  });
  return sorted;
}

// ---------------------------------------------------------------------------
// Health filtering
// ---------------------------------------------------------------------------

/** Return only agents whose overall health roll-up matches the given status. */
export function filterAgentsByHealth(agents: AgentRow[], status: HealthStatus | 'all'): AgentRow[] {
  if (status === 'all') return agents;
  return agents.filter((a) => agentHealth(a) === status);
}

// ---------------------------------------------------------------------------
// Derived helpers
// ---------------------------------------------------------------------------

/**
 * Roll up overall agent health from VM health and token status.
 * Priority: down > degraded > unknown > healthy.
 */
export function agentHealth(agent: AgentRow): HealthStatus {
  if (agent.vmHealth.status === 'offline') return 'down';
  if (agent.tokenStatus === 'expired') return 'down';
  if (agent.vmHealth.status === 'degraded' || agent.tokenStatus === 'mis-scoped') return 'degraded';
  if (agent.vmHealth.status === 'unknown' && agent.tokenStatus === 'unknown') return 'unknown';
  return 'healthy';
}

/**
 * Total memory footprint in absolute number of stored items.
 * Used for sortable column values and display.
 */
export function memoryTotal(agent: AgentRow): number {
  const { sessions, messages, documents, conclusions, peerCardEntries } = agent.memoryCounts;
  return (sessions ?? 0) + (messages ?? 0) + (documents ?? 0) + (conclusions ?? 0) + (peerCardEntries ?? 0);
}

/** Map a TokenStatus to a human label for display. */
export function tokenLabel(status: TokenStatus): string {
  if (status === 'mis-scoped') return 'Mis-scoped';
  return status[0]!.toUpperCase() + status.slice(1);
}
