/**
 * AgentsView — Agents table and agent detail for the Honcho Memory Console.
 *
 * This view implements T06 acceptance criteria:
 * - Searchable, filterable, sortable agents table
 * - Agent detail drawer with Overview, Memory, Token, VM Health, Events sections
 * - Loading / empty / degraded / error states
 * - Fingerprint-only token identity (no raw tokens)
 * - All data marked as sample fixtures
 */

import { useState, useEffect } from 'react';

import { Icon } from './Icon';
import { EmptyState, ErrorState, Skeleton } from './StatePanels';
import { agentsFixture } from '../lib/fixtures';
import { AGENT_COLUMNS } from '../lib/agents';
import type { AgentRow, HealthStatus } from '../lib/types';
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

interface AgentEvent {
  id: string;
  at: string | null;
  action: string;
  actor: string;
  outcome: 'ok' | 'error' | 'denied';
}

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

function LoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <ErrorState
      icon="alert"
      title="Failed to load agents"
      description="Could not retrieve the agent registry. The operator console remains usable for other sections."
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
  onClose,
}: {
  agent: AgentRow;
  onClose: () => void;
}) {
  const health = agentHealth(agent);
  const memTotal = memoryTotal(agent);
  const [activeSection, setActiveSection] = useState<
    'Overview' | 'Memory' | 'Token' | 'VM Health' | 'Events'
  >('Overview');

  const sections = ['Overview', 'Memory', 'Token', 'VM Health', 'Events'] as const;

  const eventBaseAt = agent.lastWriteAt ?? new Date(0).toISOString();
  const eventBaseMs = Date.parse(eventBaseAt);

  // Synthetic events derived from fixture state (no real event log in fixture mode).
  const events: AgentEvent[] = [
    {
      id: 'evt_detail_1',
      at: eventBaseAt,
      action: 'memory.write',
      actor: agent.agentId,
      outcome: health === 'healthy' ? 'ok' : 'error',
    },
    {
      id: 'evt_detail_2',
      at: new Date(eventBaseMs - 5 * 60 * 1000).toISOString(),
      action: 'queue.poll',
      actor: agent.agentId,
      outcome: agent.queueState.errors === 0 ? 'ok' : 'error',
    },
    {
      id: 'evt_detail_3',
      at: new Date(eventBaseMs - 12 * 60 * 1000).toISOString(),
      action: 'token.validate',
      actor: agent.agentId,
      outcome: agent.tokenStatus === 'valid' ? 'ok' : 'denied',
    },
  ];

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
          <div className="table-wrap">
            <table className="data">
              <caption className="sr-only">Recent agent events</caption>
              <thead>
                <tr>
                  <th scope="col">Time</th>
                  <th scope="col">Action</th>
                  <th scope="col">Outcome</th>
                </tr>
              </thead>
              <tbody>
                {events.map((evt) => (
                  <tr key={evt.id}>
                    <td>{relativeTime(evt.at)}</td>
                    <td className="mono">{evt.action}</td>
                    <td>
                      <span
                        className={`chip ${
                          evt.outcome === 'ok'
                            ? 'chip--healthy'
                            : evt.outcome === 'denied'
                              ? 'chip--degraded'
                              : 'chip--down'
                        }`}
                      >
                        <span className="chip__dot" aria-hidden="true" />
                        {evt.outcome}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="detail-drawer__foot">
        <span>Sample fixture · {agent.agentId}</span>
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
  const [phase, setPhase] = useState<'loading' | 'error' | 'ready'>('loading');

  // Simulate async load in fixture mode.
  // In live mode this would be replaced by a real API call.
  useEffect(() => {
    const timer = setTimeout(() => setPhase('ready'), 700);
    return () => clearTimeout(timer);
  }, []);

  const handleRetry = () => {
    setPhase('loading');
    setTimeout(() => setPhase('ready'), 700);
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
        <LoadError onRetry={handleRetry} />
      </div>
    );
  }

  const allAgents = agentsFixture;
  const searched = searchAgents(allAgents, query);
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

  // Determine if any agent is degraded (for degraded state test).
  const hasDegraded = sorted.some((a) => agentHealth(a) === 'degraded');

  return (
    <div className="agents-view" data-fixture="true">
      {/* Fixture banner */}
      <div className="fixture-label" role="status">
        <Icon name="alert" size={14} />
        Sample fixture data · Agent inventory is illustrative
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
            onClose={() => setSelectedAgent(null)}
          />
        )}
      </div>
    </div>
  );
}

export default AgentsView;
