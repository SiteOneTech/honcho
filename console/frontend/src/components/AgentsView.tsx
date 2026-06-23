/**
 * AgentsView — Agents table and agent detail for the Honcho Memory Console.
 *
 * This view implements the console agent registry contract:
 * - Searchable, filterable, sortable agents table
 * - Agent detail drawer with Overview, Memory, Token, VM Health, Events sections
 * - Loading / empty / degraded / error states
 * - Fingerprint-only token identity (no raw tokens)
 * - Live backend data with explicit unavailable states
 */

import { useCallback, useEffect, useState } from 'react';

import { Icon } from './Icon';
import { EmptyState, ErrorState, Skeleton } from './StatePanels';
import { AGENT_COLUMNS } from '../lib/agents';
import { fetchAgentDetail, fetchAgentRegistry } from '../lib/live';
import type { AgentRow, HealthStatus, RegistryAlert } from '../lib/types';
import {
  agentHealth,
  filterAgentsByHealth,
  memoryTotal,
  searchAgents,
  sortAgents,
} from '../lib/agents';
import { compactNumber, percent, relativeTime, statusLabel } from '../lib/format';

// ---------------------------------------------------------------------------
// Health status chip
// ---------------------------------------------------------------------------

const HEALTH_CHIP: Record<HealthStatus, string> = {
  healthy: 'chip--healthy',
  degraded: 'chip--degraded',
  down: 'chip--down',
  unknown: 'chip--unknown',
};

function HealthChip({ status }: { status: HealthStatus }) {
  return (
    <span className={`chip ${HEALTH_CHIP[status]}`}>
      <span className="chip__dot" aria-hidden="true" />
      {statusLabel(status)}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Loading state
// ---------------------------------------------------------------------------

function TableSkeleton() {
  return (
    <div className="table-wrap" aria-busy="true" aria-label="Loading agents table">
      <Skeleton rows={5} title="Loading agents registry" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function NoAgents({
  hasFilters,
  onClear,
}: {
  hasFilters: boolean;
  onClear: () => void;
}) {
  if (hasFilters) {
    return (
      <EmptyState
        icon="search"
        title="No agents match your filters"
        description="Try adjusting the search query or health filter."
        actionLabel="Clear filters"
        onAction={onClear}
      />
    );
  }
  return (
    <EmptyState
      icon="inbox"
      title="No agents registered"
      description="The agent registry is empty. Agents will appear here as they connect."
    />
  );
}

// ---------------------------------------------------------------------------
// Error state
// ---------------------------------------------------------------------------

function LoadError({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  return (
    <ErrorState
      icon="alert"
      title="Agent registry unavailable"
      description={error ?? 'Could not retrieve the live agent registry. No fixture agent rows are shown as production state.'}
      actionLabel="Retry"
      onAction={onRetry}
    />
  );
}

// ---------------------------------------------------------------------------
// Column header with aria-sort
// ---------------------------------------------------------------------------

type SortDir = 'asc' | 'desc' | null;

function SortHeader({
  label,
  sorted,
  align,
  onClick,
}: {
  label: string;
  sorted: SortDir;
  align?: 'left' | 'right' | 'center';
  onClick: () => void;
}) {
  const ariaSort: 'ascending' | 'descending' | 'none' =
    sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : 'none';
  const style: React.CSSProperties = align ? { textAlign: align } : {};
  return (
    <th scope="col" aria-sort={ariaSort} style={style}>
      <button
        type="button"
        className="sort-btn"
        onClick={onClick}
        aria-label={`Sort by ${label}${sorted === 'asc' ? ', currently ascending' : sorted === 'desc' ? ', currently descending' : ''}`}
      >
        {label}
        <span className="sort-icon" aria-hidden="true">
          {sorted === 'asc' ? ' ↑' : sorted === 'desc' ? ' ↓' : ' ↕'}
        </span>
      </button>
    </th>
  );
}

// ---------------------------------------------------------------------------
// Agent table row
// ---------------------------------------------------------------------------

function AgentRow_({
  agent,
  selected,
  onSelect,
}: {
  agent: AgentRow;
  selected: boolean;
  onSelect: (a: AgentRow) => void;
}) {
  const health = agentHealth(agent);
  const memTotal = memoryTotal(agent);

  return (
    <tr
      className={selected ? 'row--selected' : ''}
      onClick={() => onSelect(agent)}
      style={{ cursor: 'pointer' }}
      aria-selected={selected}
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelect(agent); }}
    >
      <td>
        <div className="cell-primary">{agent.displayName}</div>
        <div className="cell-sub">{agent.runtimeVm}</div>
      </td>
      <td>{agent.tenantId}</td>
      <td className="mono fingerprint">{agent.tokenFingerprint}</td>
      <td className="num">{compactNumber(memTotal)}</td>
      <td className="num">
        {compactNumber(agent.queueState.pending)} pending
        {(agent.queueState.errors ?? 0) > 0 && (
          <span className="err-count"> · {agent.queueState.errors} errors</span>
        )}
      </td>
      <td>
        <HealthChip status={health} />
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Agent detail drawer
// ---------------------------------------------------------------------------

function AgentDetail({
  agent,
  detailError,
  detailPhase,
  onClose,
}: {
  agent: AgentRow;
  detailError: string | null;
  detailPhase: 'idle' | 'loading' | 'ready' | 'error';
  onClose: () => void;
}) {
  const health = agentHealth(agent);
  const memTotal = memoryTotal(agent);
  const [activeSection, setActiveSection] = useState<
    'Overview' | 'Memory' | 'Token' | 'VM Health' | 'Events'
  >('Overview');

  const sections = ['Overview', 'Memory', 'Token', 'VM Health', 'Events'] as const;

  return (
    <aside className="detail-drawer" aria-label={`${agent.displayName} detail`}>
      <div className="detail-drawer__head">
        <div>
          <div className="detail-drawer__name">{agent.displayName}</div>
          <div className="detail-drawer__sub">
            <span className="mono fingerprint">{agent.tokenFingerprint}</span>
            <span aria-hidden="true"> · </span>
            <HealthChip status={health} />
          </div>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="Close agent detail"
          onClick={onClose}
        >
          <Icon name="menu" size={16} />
        </button>
      </div>

      <div className="detail-tabs" role="tablist" aria-label="Agent detail sections">
        {sections.map((sec) => (
          <button
            key={sec}
            role="tab"
            type="button"
            aria-selected={activeSection === sec}
            className={`detail-tab ${activeSection === sec ? 'detail-tab--active' : ''}`}
            onClick={() => setActiveSection(sec)}
          >
            {sec}
          </button>
        ))}
      </div>

      <div
        className="detail-drawer__body"
        role="tabpanel"
        aria-label={`${activeSection} section`}
      >
        {activeSection === 'Overview' && (
          <dl className="defs">
            <dt>AI peer</dt>
            <dd className="mono">{agent.aiPeer}</dd>
            {agent.humanPeer && (
              <>
                <dt>Human peer</dt>
                <dd className="mono">{agent.humanPeer}</dd>
              </>
            )}
            <dt>Tenant</dt>
            <dd>{agent.tenantId}</dd>
            <dt>Runtime VM</dt>
            <dd>{agent.runtimeVm}</dd>
            <dt>Workspace</dt>
            <dd className="mono">{agent.honchoWorkspace}</dd>
            <dt>Scope</dt>
            <dd>{agent.tokenScope}</dd>
            <dt>Last write</dt>
            <dd>{relativeTime(agent.lastWriteAt)}</dd>
            <dt>Sources</dt>
            <dd>{agent.sources.join(', ')}</dd>
          </dl>
        )}

        {activeSection === 'Memory' && (
          <dl className="defs">
            <dt>Total items</dt>
            <dd className="metric__value">{compactNumber(memTotal)}</dd>
            <dt>Sessions</dt>
            <dd>{compactNumber(agent.memoryCounts.sessions)}</dd>
            <dt>Messages</dt>
            <dd>{compactNumber(agent.memoryCounts.messages)}</dd>
            <dt>Documents</dt>
            <dd>{compactNumber(agent.memoryCounts.documents)}</dd>
            <dt>Conclusions</dt>
            <dd>{compactNumber(agent.memoryCounts.conclusions)}</dd>
            <dt>Peer cards</dt>
            <dd>{compactNumber(agent.memoryCounts.peerCardEntries)}</dd>
          </dl>
        )}

        {activeSection === 'Token' && (
          <dl className="defs">
            <dt>Identity</dt>
            <dd className="mono fingerprint">{agent.tokenFingerprint}</dd>
            <dt>Status</dt>
            <dd>
              <HealthChip status={agent.tokenStatus === 'valid' ? 'healthy' : agent.tokenStatus === 'expired' ? 'down' : 'degraded'} />
            </dd>
            <dt>Scope</dt>
            <dd>{agent.tokenScope}</dd>
            <dt>Token status</dt>
            <dd style={{ textTransform: 'capitalize' }}>{agent.tokenStatus}</dd>
            <dt className="defs__note" style={{ gridColumn: '1 / -1' }}>
              Raw tokens are never displayed. Token identity is surfaced as a SHA-256 fingerprint only.
            </dt>
          </dl>
        )}

        {activeSection === 'VM Health' && (
          <dl className="defs">
            <dt>VM status</dt>
            <dd><HealthChip status={agentHealth(agent)} /></dd>
            <dt>CPU</dt>
            <dd>{percent(agent.vmHealth.cpuPercent)}</dd>
            <dt>RAM</dt>
            <dd>{percent(agent.vmHealth.memoryPercent)}</dd>
            <dt>Disk</dt>
            <dd>{percent(agent.vmHealth.diskPercent)}</dd>
            {agent.tailnetIp && (
              <>
                <dt>Tailnet IP</dt>
                <dd className="mono">{agent.tailnetIp}</dd>
              </>
            )}
          </dl>
        )}

        {activeSection === 'Events' && (
          <EmptyState
            icon="audit"
            title="Agent-scoped event stream unavailable"
            description="The live backend exposes the global audit trail at /api/audit/events, but it does not expose per-agent event history yet. No synthetic events are shown."
          />
        )}
      </div>

      {detailPhase === 'loading' ? (
        <div className="health-cockpit__notice" role="status">
          Refreshing detail from /api/agents/{agent.agentId}…
        </div>
      ) : null}
      {detailError ? (
        <div className="health-cockpit__notice" role="status">
          Detail refresh degraded: {detailError}
        </div>
      ) : null}

      <div className="detail-drawer__foot">
        <span>
          {detailPhase === 'error' ? 'Live list row · detail endpoint unavailable' : 'Live backend · /api/agents/{agent_id}'} · {agent.agentId}
        </span>
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------

export function AgentsView() {
  const [query, setQuery] = useState('');
  const [healthFilter, setHealthFilter] = useState<HealthStatus | 'all'>('all');
  const [sortField, setSortField] = useState<string>('displayName');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [selectedAgent, setSelectedAgent] = useState<AgentRow | null>(null);
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [registryAlerts, setRegistryAlerts] = useState<RegistryAlert[]>([]);
  const [phase, setPhase] = useState<'loading' | 'error' | 'ready'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [detailPhase, setDetailPhase] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [detailError, setDetailError] = useState<string | null>(null);

  const loadAgents = useCallback(async () => {
    setPhase('loading');
    setError(null);
    try {
      const snapshot = await fetchAgentRegistry();
      setAgents(snapshot.agents);
      setRegistryAlerts(snapshot.alerts);
      setSelectedAgent((current) => {
        if (!current) return null;
        return snapshot.agents.find((agent) => agent.agentId === current.agentId) ?? null;
      });
      setPhase('ready');
    } catch {
      setAgents([]);
      setRegistryAlerts([]);
      setSelectedAgent(null);
      setError('The backend /api/agents endpoint is unavailable or requires a valid private-console login.');
      setPhase('error');
    }
  }, []);

  useEffect(() => {
    void loadAgents();
  }, [loadAgents]);

  useEffect(() => {
    if (!selectedAgent) {
      setDetailPhase('idle');
      setDetailError(null);
      return;
    }
    let cancelled = false;
    setDetailPhase('loading');
    setDetailError(null);
    fetchAgentDetail(selectedAgent.agentId)
      .then((snapshot) => {
        if (cancelled) return;
        setSelectedAgent(snapshot.agent);
        setDetailPhase('ready');
      })
      .catch(() => {
        if (cancelled) return;
        setDetailError('The backend /api/agents/{agent_id} detail endpoint could not be refreshed; showing the live list row only.');
        setDetailPhase('error');
      });
    return () => {
      cancelled = true;
    };
  }, [selectedAgent?.agentId]);

  const handleRetry = () => {
    void loadAgents();
  };

  if (phase === 'loading') {
    return (
      <div className="agents-view">
        <TableSkeleton />
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div className="agents-view">
        <LoadError error={error} onRetry={handleRetry} />
      </div>
    );
  }

  const searched = searchAgents(agents, query);
  const filtered = filterAgentsByHealth(searched, healthFilter);
  const sorted = sortAgents(filtered, sortField as keyof AgentRow, sortDir);

  const hasFilters = query.trim() !== '' || healthFilter !== 'all';

  function toggleSort(field: string) {
    if (field === sortField) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  }

  function clearFilters() {
    setQuery('');
    setHealthFilter('all');
    setSelectedAgent(null);
  }

  const hasDegraded = sorted.some((a) => agentHealth(a) === 'degraded');

  return (
    <div className="agents-view">
      <div className="live-label" role="status">
        <Icon name="alert" size={14} />
        Live backend data · /api/agents · {agents.length} rows
        {registryAlerts.length > 0 ? ` · ${registryAlerts.length} registry alert${registryAlerts.length === 1 ? '' : 's'}` : ''}
      </div>

      {/* Controls */}
      <div className="agents-controls">
        <label className="agents-search">
          <Icon name="search" size={15} aria-hidden="true" />
          <input
            type="search"
            aria-label="Search agents by name, tenant, VM, workspace, or fingerprint"
            placeholder="Search agents…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>

        <label className="agents-filter">
          <span className="sr-only">Filter by health status</span>
          <select
            aria-label="Filter agents by health status"
            value={healthFilter}
            onChange={(e) => setHealthFilter(e.target.value as HealthStatus | 'all')}
          >
            <option value="all">All health</option>
            <option value="healthy">Healthy</option>
            <option value="degraded">Degraded</option>
            <option value="down">Down</option>
            <option value="unknown">Unknown</option>
          </select>
        </label>

        {hasFilters && (
          <button type="button" className="clear-btn" onClick={clearFilters}>
            Clear
          </button>
        )}
      </div>

      {/* Table + Detail layout */}
      <div className={`agents-layout ${selectedAgent ? 'agents-layout--split' : ''}`}>
        {/* Table panel */}
        <div className="agents-table-panel">
          {sorted.length === 0 ? (
            <NoAgents hasFilters={hasFilters} onClear={clearFilters} />
          ) : (
            <div className="table-wrap">
              <table className="data agents-table" aria-label="Agents registry">
                <caption className="sr-only">
                  Honcho Memory Console — agents registry
                </caption>
                <thead>
                  <tr>
                    {AGENT_COLUMNS.map((col) => (
                      <SortHeader
                        key={col.id}
                        label={col.label}
                        align={col.align}
                        sorted={sortField === col.id ? sortDir : null}
                        onClick={() => toggleSort(col.id)}
                      />
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((agent) => (
                    <AgentRow_
                      key={agent.agentId}
                      agent={agent}
                      selected={selectedAgent?.agentId === agent.agentId}
                      onSelect={setSelectedAgent}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {hasDegraded && sorted.length > 0 && (
            <p className="degraded-note" role="status" aria-live="polite">
              <Icon name="alert" size={13} />
              One or more agents are operating in a degraded state.
            </p>
          )}
        </div>

        {/* Detail panel */}
        {selectedAgent && (
          <AgentDetail
            agent={selectedAgent}
            detailError={detailError}
            detailPhase={detailPhase}
            onClose={() => setSelectedAgent(null)}
          />
        )}
      </div>
    </div>
  );
}

export default AgentsView;
