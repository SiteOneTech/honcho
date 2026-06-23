import { useCallback, useEffect, useState } from 'react';

import { Icon, type IconName } from './components/Icon';
import { AgentsView } from './components/AgentsView';
import { EmptyState, ErrorState, Skeleton } from './components/StatePanels';
import { absoluteTime, compactNumber, relativeTime, statusLabel } from './lib/format';
import {
  HEALTH_GROUPS,
  fetchServiceHealth,
  groupHealthChecks,
  summarizeEvidence,
  type HealthEvidencePill,
  type HealthGroupId,
} from './lib/health';
import { fetchMemoryExplorerSnapshot } from './lib/memory';
import {
  fetchAuditEvents,
  fetchOverviewSnapshot,
  fetchSettingsSnapshot,
  fetchTelemetrySnapshot,
} from './lib/live';
import { navigate, type RouteId, useRoute } from './lib/router';
import { applyTheme, readInitialTheme, type ThemeMode } from './lib/theme';
import type {
  AuditEvent,
  AuditEventsSnapshot,
  ConclusionSummary,
  HealthCheck,
  HealthServicesSnapshot,
  HealthStatus,
  MemoryExplorerSnapshot,
  MemoryPeer,
  MemorySession,
  MemoryWorkspace,
  MessageSummary,
  OverviewSnapshot,
  PeerCardEntry,
  SettingsSnapshot,
  TelemetrySnapshot,
} from './lib/types';

interface NavItem {
  id: RouteId;
  label: string;
  icon: IconName;
  description: string;
  badge?: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'overview', label: 'Overview', icon: 'overview', description: 'Executive memory control plane.' },
  { id: 'agents', label: 'Agents', icon: 'agents', description: 'Registry, tenants, and token fingerprints.' },
  { id: 'memory', label: 'Memory', icon: 'memory', description: 'Workspaces, peers, and conclusion inventory.' },
  { id: 'health', label: 'Health', icon: 'health', description: 'Service, storage, network, and update posture.' },
  { id: 'telemetry', label: 'Telemetry', icon: 'telemetry', description: 'Request, latency, and queue movement.' },
  { id: 'audit', label: 'Audit', icon: 'audit', description: 'Read-only operator event trail.' },
  { id: 'settings', label: 'Settings', icon: 'settings', description: 'Provider and console preferences.' },
];

const SECTION_COPY: Record<RouteId, { eyebrow: string; title: string; description: string }> = {
  overview: {
    eyebrow: 'Command surface',
    title: 'Honcho memory console',
    description:
      'A private operator shell for inspecting memory posture, agent inventory, service health, and safe telemetry without exposing sensitive runtime material.',
  },
  agents: {
    eyebrow: 'Registry',
    title: 'Agent operating map',
    description:
      'Tenant, workspace, peer, queue, VM, and token-fingerprint context in one dense control surface.',
  },
  memory: {
    eyebrow: 'Memory graph',
    title: 'Memory explorer',
    description:
      'Summary-first navigation for workspaces, peers, sessions, messages, conclusions, and peer context with sensitive content hidden by default.',
  },
  health: {
    eyebrow: 'Cockpit',
    title: 'Service health by layer',
    description:
      'Readable status groups for API, derivation, storage, host resources, Tailnet, and update automation.',
  },
  telemetry: {
    eyebrow: 'Signals',
    title: 'Token-safe API telemetry',
    description:
      'Aggregated request, latency, and queue signals prepared for the telemetry adapter increment.',
  },
  audit: {
    eyebrow: 'Governance',
    title: 'Operator audit trail',
    description:
      'Every view and safe refresh is represented as an auditable event with clear outcome labels.',
  },
  settings: {
    eyebrow: 'Console',
    title: 'Display and provider posture',
    description:
      'Theme preference, configured providers, and v1 read-only guardrails for the private console.',
  },
};

const CHIP_CLASS: Record<HealthStatus, string> = {
  healthy: 'chip--healthy',
  degraded: 'chip--degraded',
  down: 'chip--down',
  unknown: 'chip--unknown',
};


function App() {
  const route = useRoute();
  const [theme, setTheme] = useState<ThemeMode>(readInitialTheme);
  const [railOpen, setRailOpen] = useState(false);
  const active = NAV_ITEMS.find((item) => item.id === route) ?? NAV_ITEMS[0]!;
  const copy = SECTION_COPY[route];

  const toggleTheme = () => {
    const next: ThemeMode = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    applyTheme(next);
  };

  const openRoute = (id: RouteId) => {
    navigate(id);
    setRailOpen(false);
  };

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to dashboard content
      </a>

      {railOpen ? (
        <button
          className="rail-scrim"
          type="button"
          aria-label="Close navigation"
          onClick={() => setRailOpen(false)}
        />
      ) : null}

      <aside className="rail" data-open={railOpen ? 'true' : 'false'} aria-label="Console navigation">
        <div className="brand">
          <div className="brand__mark" aria-hidden="true">
            <Icon name="spark" size={22} />
          </div>
          <div>
            <div className="brand__name">Honcho Memory</div>
            <div className="brand__sub">Console</div>
          </div>
        </div>

        <nav className="nav" aria-label="Primary sections">
          <div className="nav__group-label">Operations</div>
          {NAV_ITEMS.map((item) => (
            <a
              className="nav__item"
              href={`#/${item.id}`}
              key={item.id}
              aria-label={`Open ${item.label}`}
              aria-current={route === item.id ? 'page' : undefined}
              onClick={() => openRoute(item.id)}
            >
              <Icon className="nav__icon" name={item.icon} size={18} />
              <span className="nav__label">{item.label}</span>
              {item.badge ? <span className="nav__badge">{item.badge}</span> : null}
            </a>
          ))}
        </nav>

        <div className="rail__footer">
          <Icon name="shield" size={16} />
          <span>Private by design · Tailscale/internal only</span>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <button
            className="icon-button rail-toggle"
            type="button"
            aria-label="Open navigation"
            onClick={() => setRailOpen(true)}
          >
            <Icon name="menu" size={18} />
          </button>

          <label className="topbar__search">
            <Icon className="topbar__search-icon" name="search" size={17} />
            <input
              aria-label="Search workspace, peer, agent, or token fingerprint"
              placeholder="Search workspace, peer, agent, or sha256 fingerprint…"
              type="search"
            />
          </label>
          <span className="kbd" aria-hidden="true">
            ⌘K
          </span>
          <div className="topbar__spacer" />
          <div className="topbar__actions">
            <button className="icon-button" type="button" aria-label="Refresh active dashboard data">
              <Icon name="refresh" size={18} />
            </button>
            <button className="icon-button" type="button" aria-label="Toggle color mode" onClick={toggleTheme}>
              <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={18} />
            </button>
          </div>
        </header>

        <section className="content" id="main-content" tabIndex={-1}>
          <div className="sr-only" role="status" aria-live="polite">
            Viewing {active.label}: {active.description}
          </div>

          <div className="boundary-banner" data-route={route}>
            <Icon name="alert" size={17} />
            <span>
              <strong>
                {route === 'health'
                  ? 'Live health integration.'
                  : route === 'memory'
                    ? 'Live memory integration.'
                    : 'Live backend wiring.'}
              </strong>{' '}
              {route === 'health'
                ? 'The Health cockpit queries /api/health/services and shows an explicit unavailable state when the backend cannot be reached.'
                : route === 'memory'
                  ? 'The Memory explorer queries /api/memory and keeps sensitive message content behind explicit disclosure controls.'
                  : 'This private Tailscale console uses the backend API for this surface, or shows a truthful unavailable state instead of production sample data.'}
            </span>
          </div>

          <header className="page-header">
            <div>
              <div className="page-header__eyebrow">{copy.eyebrow}</div>
              <h1>{copy.title}</h1>
              <p>{copy.description}</p>
            </div>
            <StatusChip status="unknown" label="Private Tailnet" />
          </header>

          <Page route={route} />
        </section>
      </main>
    </div>
  );
}

export default App;

function Page({ route }: { route: RouteId }) {
  switch (route) {
    case 'overview':
      return <OverviewPage />;
    case 'agents':
      return <AgentsPage />;
    case 'memory':
      return <MemoryPage />;
    case 'health':
      return <HealthPage />;
    case 'telemetry':
      return <TelemetryPage />;
    case 'audit':
      return <AuditPage />;
    case 'settings':
      return <SettingsPage />;
  }
}

function StatusChip({ status, label = statusLabel(status) }: { status: HealthStatus; label?: string }) {
  return (
    <span className={`chip ${CHIP_CLASS[status]}`}>
      <span className="chip__dot" aria-hidden="true" />
      {label}
    </span>
  );
}

function Metric({ label, value, detail, icon }: { label: string; value: string; detail: string; icon: IconName }) {
  return (
    <article className="metric">
      <div className="metric__label">
        <Icon name={icon} size={16} />
        {label}
      </div>
      <div className="metric__value">{value}</div>
      <div className="metric__foot">{detail}</div>
    </article>
  );
}

function OverviewPage() {
  const [snapshot, setSnapshot] = useState<OverviewSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadOverview = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setSnapshot(await fetchOverviewSnapshot());
    } catch {
      setSnapshot(null);
      setError('The backend /api/overview endpoint is unavailable or requires a valid private-console login.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  if (isLoading && snapshot === null) {
    return <Skeleton rows={5} title="Overview is loading live backend summary data" />;
  }

  if (error && snapshot === null) {
    return (
      <Panel title="Overview backend unavailable" hint="No production fallback data shown">
        <ErrorState
          title="Overview backend unavailable"
          description="The overview could not reach /api/overview, so live summary metrics are unavailable instead of replaced with sample production data."
          actionLabel="Retry overview"
          onAction={loadOverview}
        />
      </Panel>
    );
  }

  if (snapshot === null) return null;

  const degradedLayers = snapshot.layers.filter((layer) => layer.status !== 'healthy');
  return (
    <>
      <section className="metric-strip" aria-label="Overview metrics">
        <Metric label="Agents" value={compactNumber(snapshot.metrics.activeAgents)} detail="Live /api/agents rows" icon="agents" />
        <Metric label="Workspaces" value={compactNumber(snapshot.metrics.workspaces)} detail="Honcho workspace inventory" icon="memory" />
        <Metric label="Queue pending" value={compactNumber(snapshot.metrics.queuePending)} detail={`${compactNumber(snapshot.metrics.queueInProgress)} in progress · ${compactNumber(snapshot.metrics.queueErrors)} errors`} icon="health" />
        <Metric label="API requests" value={compactNumber(snapshot.metrics.requests24h)} detail={`${compactNumber(snapshot.metrics.requests1h)} in the last hour`} icon="pulse" />
      </section>

      {error ? (
        <div className="health-cockpit__notice" role="status">
          Overview refresh degraded: {error}
        </div>
      ) : null}

      <section className="grid grid--2">
        <Panel title="Operational layers" hint={`Source: ${snapshot.source} · ${absoluteTime(snapshot.generatedAt)}`}>
          <div className="grid grid--health">
            {snapshot.layers.map((layer) => (
              <div className="health-card" key={layer.id}>
                <div className="health-card__head">
                  <div>
                    <div className="health-card__layer">{layer.id}</div>
                    <strong>{layer.label}</strong>
                    <div className="health-row__summary">{layer.summary}</div>
                  </div>
                  <StatusChip status={layer.status} />
                </div>
              </div>
            ))}
          </div>
          {degradedLayers.length === 0 ? (
            <EmptyState title="All live layers healthy" description="No degraded live layers are reported by /api/overview." icon="check" />
          ) : null}
        </Panel>

        <Panel title="Signal watchlist" hint="Live alerts or explicit empty state">
          {snapshot.alerts.length === 0 ? (
            <EmptyState title="No active overview alerts" description="The backend returned no overview alerts for this live snapshot." icon="check" />
          ) : (
            snapshot.alerts.map((alert) => (
              <div className="health-row" key={`${alert.code}:${alert.source ?? 'console'}`}>
                <div className="health-row__main">
                  <div className="health-row__label">{alert.message}</div>
                  <div className="health-row__summary">{alert.source ?? 'console'} · {alert.code}</div>
                </div>
                <span className={`chip ${alert.severity === 'critical' ? 'chip--down' : alert.severity === 'warning' ? 'chip--degraded' : 'chip--info'}`}>
                  <span className="chip__dot" aria-hidden="true" />
                  {alert.severity}
                </span>
              </div>
            ))
          )}
        </Panel>
      </section>
    </>
  );
}

function AgentsPage() {
  return <AgentsView />;
}

function MemoryPage() {
  const [snapshot, setSnapshot] = useState<MemoryExplorerSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [peerContextRevealed, setPeerContextRevealed] = useState(false);
  const [revealedMessages, setRevealedMessages] = useState<Set<string>>(() => new Set());

  const loadMemory = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setPeerContextRevealed(false);
    setRevealedMessages(new Set());
    try {
      const next = await fetchMemoryExplorerSnapshot();
      setSnapshot(next);
    } catch {
      setSnapshot(null);
      setError('The backend /api/memory endpoint is unavailable or requires a valid private-console login.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMemory();
  }, [loadMemory]);

  if (isLoading && snapshot === null) {
    return <Skeleton rows={6} title="Memory explorer is loading workspace, peer, session, and conclusion metadata" />;
  }

  if (error && snapshot === null) {
    return (
      <Panel title="Memory backend unavailable" hint="No production fallback data shown">
        <ErrorState
          title="Memory backend unavailable"
          description="The console could not reach /api/memory, so workspaces, peers, sessions, messages, and conclusions are unavailable instead of replaced with sample memory data."
          actionLabel="Retry memory"
          onAction={loadMemory}
        />
      </Panel>
    );
  }

  if (snapshot === null) return null;

  const visibleWorkspaces = filterWorkspaces(snapshot.workspaces, filter);
  const visiblePeers = filterPeers(snapshot.peers, filter);
  const visibleCardEntries = filterPeerCard(snapshot.peerCard.entries, filter);
  const visibleSessions = filterSessions(snapshot.sessions, filter);
  const visibleMessages = filterMessages(snapshot.messages, filter);
  const visibleConclusions = filterConclusions(snapshot.conclusions, filter);

  const toggleMessage = (messageId: string) => {
    setRevealedMessages((current) => {
      const next = new Set(current);
      if (next.has(messageId)) {
        next.delete(messageId);
      } else {
        next.add(messageId);
      }
      return next;
    });
  };

  return (
    <section className="memory-explorer" aria-label="Memory explorer surfaces">
      <div className="memory-toolbar">
        <div>
          <div className="memory-toolbar__source">
            Source: backend /api/memory · Loaded{' '}
            {absoluteTime(snapshot.loadedAt)}
          </div>
          <div className="memory-toolbar__summary">
            {snapshot.workspaces.length} workspaces · {snapshot.peers.length} peers · {snapshot.sessions.length}{' '}
            sessions · {snapshot.messages.length} messages · {snapshot.conclusions.length} conclusions
          </div>
        </div>
        <label className="memory-filter">
          <Icon className="topbar__search-icon" name="search" size={17} />
          <input
            aria-label="Filter memory graph"
            placeholder="Filter memory graph by workspace, peer, session, message, or conclusion…"
            type="search"
            value={filter}
            onChange={(event) => setFilter(event.currentTarget.value)}
          />
        </label>
        <button className="button button--accent" type="button" onClick={loadMemory} disabled={isLoading}>
          <Icon name="refresh" size={16} />
          {isLoading ? 'Refreshing…' : 'Refresh memory'}
        </button>
      </div>

      {error ? (
        <div className="health-cockpit__notice" role="status">
          Memory refresh degraded: {error}
        </div>
      ) : null}

      <section className="metric-strip" aria-label="Memory explorer metrics">
        <Metric label="Workspaces" value={compactNumber(snapshot.workspaces.length)} detail={snapshot.selectedWorkspaceId ?? 'No workspace selected'} icon="memory" />
        <Metric label="Peers" value={compactNumber(snapshot.peers.length)} detail={snapshot.selectedPeerId ? 'Selected peer active' : 'No peer selected'} icon="agents" />
        <Metric label="Queue pending" value={compactNumber(snapshot.queue?.pendingWorkUnits ?? 0)} detail={`${compactNumber(snapshot.queue?.completedWorkUnits ?? 0)} completed`} icon="health" />
        <Metric label="Messages" value={compactNumber(snapshot.messages.length)} detail="Sensitive message content hidden by default" icon="shield" />
      </section>

      <section className="grid grid--2 memory-grid">
        <Panel title="Workspace explorer" hint="Live workspace metadata">
          <WorkspaceExplorerTable workspaces={visibleWorkspaces} selectedWorkspaceId={snapshot.selectedWorkspaceId} />
        </Panel>

        <Panel title="Peers" hint="Peer metadata and configuration keys">
          <PeersTable peers={visiblePeers} selectedPeerId={snapshot.selectedPeerId} />
        </Panel>

        <Panel title="Peer card" hint={`${snapshot.peerCard.total} entries reported`}>
          <PeerCardList entries={visibleCardEntries} />
        </Panel>

        <Panel title="Representation" hint="Explicit disclosure required">
          <PeerDisclosure
            label="representation"
            revealed={peerContextRevealed}
            onReveal={() => setPeerContextRevealed((current) => !current)}
            text={snapshot.representation.representation}
            sensitive={snapshot.representation.sensitive}
          />
        </Panel>

        <Panel title="Context" hint="Peer-to-target context">
          <PeerContextDisclosure
            contextEntries={snapshot.context.peerCard}
            peerContextRevealed={peerContextRevealed}
            representation={snapshot.context.representation}
            sensitive={snapshot.context.sensitive}
          />
        </Panel>

        <Panel title="Sessions" hint="Metadata only">
          <SessionsTable sessions={visibleSessions} selectedSessionId={snapshot.selectedSessionId} />
        </Panel>

        <Panel title="Messages" hint="Reveal sensitive content only when needed">
          <MessagesTable messages={visibleMessages} revealedMessages={revealedMessages} onToggleMessage={toggleMessage} />
        </Panel>

        <Panel title="Conclusions" hint="Preview text only">
          <ConclusionsTable conclusions={visibleConclusions} />
        </Panel>
      </section>
    </section>
  );
}

function WorkspaceExplorerTable({
  workspaces,
  selectedWorkspaceId,
}: {
  workspaces: MemoryWorkspace[];
  selectedWorkspaceId: string | null;
}) {
  if (workspaces.length === 0) {
    return <EmptyState title="No workspaces match" description="Adjust the memory graph filter or refresh the backend memory adapter." icon="memory" />;
  }
  return (
    <div className="table-wrap">
      <table className="data">
        <caption className="sr-only">Workspace memory data</caption>
        <thead>
          <tr>
            <th scope="col">Workspace</th>
            <th scope="col">Configuration</th>
            <th scope="col">Metadata</th>
            <th scope="col">Created</th>
          </tr>
        </thead>
        <tbody>
          {workspaces.map((workspace) => (
            <tr key={workspace.id} data-selected={workspace.id === selectedWorkspaceId ? 'true' : 'false'}>
              <td className="cell-primary">{workspace.id}</td>
              <td>{configurationLabel(workspace.configurationKeys)}</td>
              <td>{metadataSummary(workspace.metadata)}</td>
              <td>{absoluteTime(workspace.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PeersTable({ peers, selectedPeerId }: { peers: MemoryPeer[]; selectedPeerId: string | null }) {
  if (peers.length === 0) {
    return <EmptyState title="No peers match" description="Peer metadata is filtered out or unavailable from the memory adapter." icon="agents" />;
  }
  return (
    <div className="table-wrap">
      <table className="data">
        <caption className="sr-only">Peer metadata data</caption>
        <thead>
          <tr>
            <th scope="col">Peer</th>
            <th scope="col">Workspace</th>
            <th scope="col">Configuration</th>
            <th scope="col">Metadata</th>
          </tr>
        </thead>
        <tbody>
          {peers.map((peer) => (
            <tr key={peer.id} data-selected={peer.id === selectedPeerId ? 'true' : 'false'}>
              <td className="cell-primary">{peer.id}</td>
              <td>{peer.workspaceId ?? 'not reported'}</td>
              <td>{configurationLabel(peer.configurationKeys)}</td>
              <td>{metadataSummary(peer.metadata)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PeerCardList({ entries }: { entries: PeerCardEntry[] }) {
  if (entries.length === 0) {
    return <EmptyState title="No peer-card entries" description="The selected peer has no card entries matching the current filter." icon="inbox" />;
  }
  return (
    <div className="memory-card-list">
      {entries.map((entry) => (
        <article className="memory-card-entry" key={`${entry.index}:${entry.text}`}>
          <div className="memory-card-entry__index">#{entry.index}</div>
          <div className="memory-card-entry__text">{entry.text}</div>
          {entry.sensitive ? (
            <span className="chip chip--degraded">
              <span className="chip__dot" aria-hidden="true" />
              Sensitive
            </span>
          ) : (
            <span className="chip chip--info">
              <span className="chip__dot" aria-hidden="true" />
              Summary
            </span>
          )}
        </article>
      ))}
    </div>
  );
}

function PeerDisclosure({
  label,
  revealed,
  onReveal,
  text,
  sensitive,
}: {
  label: string;
  revealed: boolean;
  onReveal: () => void;
  text: string | null;
  sensitive: boolean;
}) {
  return (
    <div className="memory-disclosure">
      <button className="button" type="button" aria-pressed={revealed} onClick={onReveal}>
        <Icon name="shield" size={16} />
        Reveal peer context
      </button>
      {revealed ? (
        <div className="memory-copy">
          <div className="memory-copy__label">{label}{sensitive ? ' · sensitive' : ''}</div>
          <p>{text ?? 'No representation text reported.'}</p>
        </div>
      ) : (
        <EmptyState
          title="Peer context hidden"
          description="Representation and context stay hidden until an operator explicitly reveals the peer context."
          icon="shield"
        />
      )}
    </div>
  );
}

function PeerContextDisclosure({
  contextEntries,
  peerContextRevealed,
  representation,
  sensitive,
}: {
  contextEntries: PeerCardEntry[];
  peerContextRevealed: boolean;
  representation: string | null;
  sensitive: boolean;
}) {
  if (!peerContextRevealed) {
    return (
      <EmptyState
        title="Context hidden by default"
        description="Use Reveal peer context in the Representation panel to disclose contextual text for this selected peer."
        icon="shield"
      />
    );
  }

  return (
    <div className="memory-copy">
      <div className="memory-copy__label">Context{sensitive ? ' · sensitive' : ''}</div>
      <p>{representation ?? 'No context representation reported.'}</p>
      {contextEntries.length > 0 ? (
        <div className="memory-card-list memory-card-list--compact">
          {contextEntries.map((entry) => (
            <div className="memory-card-entry" key={`${entry.index}:${entry.text}`}>
              <span className="memory-card-entry__index">#{entry.index}</span>
              <span>{entry.text}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SessionsTable({ sessions, selectedSessionId }: { sessions: MemorySession[]; selectedSessionId: string | null }) {
  if (sessions.length === 0) {
    return <EmptyState title="No sessions match" description="No session metadata matches the active memory graph filter." icon="inbox" />;
  }
  return (
    <div className="table-wrap">
      <table className="data">
        <caption className="sr-only">Session metadata data</caption>
        <thead>
          <tr>
            <th scope="col">Session</th>
            <th scope="col">Active</th>
            <th scope="col">Configuration</th>
            <th scope="col">Created</th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((session) => (
            <tr key={session.id} data-selected={session.id === selectedSessionId ? 'true' : 'false'}>
              <td className="cell-primary">{session.id}</td>
              <td>{session.isActive === null ? 'unknown' : session.isActive ? 'active' : 'inactive'}</td>
              <td>{configurationLabel(session.configurationKeys)}</td>
              <td>{absoluteTime(session.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MessagesTable({
  messages,
  revealedMessages,
  onToggleMessage,
}: {
  messages: MessageSummary[];
  revealedMessages: Set<string>;
  onToggleMessage: (messageId: string) => void;
}) {
  if (messages.length === 0) {
    return <EmptyState title="No messages match" description="Message metadata is filtered out or unavailable for the selected session." icon="inbox" />;
  }
  return (
    <div className="table-wrap">
      <table className="data">
        <caption className="sr-only">Message metadata data</caption>
        <thead>
          <tr>
            <th scope="col">Message</th>
            <th scope="col">Peer</th>
            <th scope="col">Metadata</th>
            <th scope="col">Content control</th>
          </tr>
        </thead>
        <tbody>
          {messages.map((message) => (
            <MessageRow key={message.id} message={message} revealedMessages={revealedMessages} onToggleMessage={onToggleMessage} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MessageRow({
  message,
  revealedMessages,
  onToggleMessage,
}: {
  message: MessageSummary;
  revealedMessages: Set<string>;
  onToggleMessage: (messageId: string) => void;
}) {
  const isRevealed = !message.contentHidden || revealedMessages.has(message.id);
  return (
    <tr>
      <td>
        <div className="cell-primary">{message.id}</div>
        <div className="cell-sub">{absoluteTime(message.createdAt)} · {message.tokenCount ?? 0} tokens</div>
      </td>
      <td>{message.peerId ?? 'not reported'}</td>
      <td>{metadataSummary(message.metadata)}</td>
      <td>
        <div className="memory-message-control">
          <div className={isRevealed ? 'memory-message-preview' : 'memory-message-preview memory-message-preview--hidden'}>
            {isRevealed ? message.contentPreview ?? 'No safe preview reported.' : 'Message content hidden by default.'}
          </div>
          {message.contentHidden ? (
            <button className="button" type="button" aria-pressed={revealedMessages.has(message.id)} onClick={() => onToggleMessage(message.id)}>
              <Icon name="shield" size={16} />
              {revealedMessages.has(message.id) ? `Hide sensitive content for ${message.id}` : `Reveal sensitive content for ${message.id}`}
            </button>
          ) : null}
        </div>
      </td>
    </tr>
  );
}

function ConclusionsTable({ conclusions }: { conclusions: ConclusionSummary[] }) {
  if (conclusions.length === 0) {
    return <EmptyState title="No conclusions match" description="Conclusion previews are filtered by id and preview text only." icon="inbox" />;
  }
  return (
    <div className="table-wrap">
      <table className="data">
        <caption className="sr-only">Conclusion preview data</caption>
        <thead>
          <tr>
            <th scope="col">Conclusion</th>
            <th scope="col">Session</th>
            <th scope="col">Preview</th>
            <th scope="col">Created</th>
          </tr>
        </thead>
        <tbody>
          {conclusions.map((conclusion) => (
            <tr key={conclusion.id}>
              <td className="cell-primary">{conclusion.id}</td>
              <td>{conclusion.sessionId ?? 'global'}</td>
              <td>{conclusion.contentPreview ?? 'No preview reported.'}</td>
              <td>{absoluteTime(conclusion.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function filterWorkspaces(workspaces: MemoryWorkspace[], filter: string): MemoryWorkspace[] {
  return workspaces.filter((workspace) => matchesFilter([workspace.id, metadataSummary(workspace.metadata), configurationLabel(workspace.configurationKeys)], filter));
}

function filterPeers(peers: MemoryPeer[], filter: string): MemoryPeer[] {
  return peers.filter((peer) => matchesFilter([peer.id, peer.workspaceId ?? '', metadataSummary(peer.metadata), configurationLabel(peer.configurationKeys)], filter));
}

function filterPeerCard(entries: PeerCardEntry[], filter: string): PeerCardEntry[] {
  return entries.filter((entry) => matchesFilter([entry.text, String(entry.index)], filter));
}

function filterSessions(sessions: MemorySession[], filter: string): MemorySession[] {
  return sessions.filter((session) => matchesFilter([session.id, session.workspaceId ?? '', metadataSummary(session.metadata)], filter));
}

function filterMessages(messages: MessageSummary[], filter: string): MessageSummary[] {
  return messages.filter((message) =>
    matchesFilter([message.id, message.peerId ?? '', message.sessionId ?? '', message.contentHidden ? '' : message.contentPreview ?? ''], filter),
  );
}

function filterConclusions(conclusions: ConclusionSummary[], filter: string): ConclusionSummary[] {
  return conclusions.filter((conclusion) => matchesFilter([conclusion.id, conclusion.contentPreview ?? ''], filter));
}

function matchesFilter(values: string[], filter: string): boolean {
  const needle = filter.trim().toLowerCase();
  if (!needle) return true;
  return values.some((value) => value.toLowerCase().includes(needle));
}

function configurationLabel(keys: string[]): string {
  return keys.length === 0 ? 'none' : keys.join(', ');
}

function metadataSummary(metadata: Record<string, unknown>): string {
  const entries = Object.entries(metadata);
  if (entries.length === 0) return 'No metadata';
  return entries.slice(0, 3).map(([key, value]) => `${key}: ${metadataValue(value)}`).join(' · ');
}

function metadataValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'not reported';
  if (typeof value === 'string') return value.length > 32 ? `${value.slice(0, 29)}…` : value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return `${value.length} item${value.length === 1 ? '' : 's'}`;
  return 'object';
}

function HealthPage() {
  const [snapshot, setSnapshot] = useState<HealthServicesSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadHealth = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const next = await fetchServiceHealth();
      setSnapshot(next);
    } catch {
      setSnapshot(null);
      setError('The backend health adapter is unavailable or requires a valid console login.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHealth();
  }, [loadHealth]);

  if (isLoading && snapshot === null) {
    return <Skeleton rows={5} title="Health cockpit is loading live service status" />;
  }

  if (error && snapshot === null) {
    return (
      <Panel title="Health cockpit offline" hint="Backend unavailable">
        <ErrorState
          title="Health backend unavailable"
          description="The cockpit could not reach /api/health/services, so no live service evidence is displayed. Authenticate to the private console or retry from the deployed backend path."
          actionLabel="Retry live health"
          onAction={loadHealth}
        />
      </Panel>
    );
  }

  if (snapshot === null) return null;

  const grouped = groupHealthChecks(snapshot.checks);
  const totals = healthTotals(snapshot.checks);

  return (
    <section className="health-cockpit" aria-label="Health checks by API, Deriver, Storage, Network, LLM, Update, and Host">
      <div className="health-cockpit__toolbar">
        <div>
          <div className="health-cockpit__meta">
            Source: backend /api/health/services · Last checked{' '}
            {absoluteTime(snapshot.generatedAt)}
          </div>
          <div className="health-cockpit__summary">
            {totals.total} checks · {totals.degraded} degraded · {totals.offline} offline · {totals.unknown} unknown
          </div>
        </div>
        <button className="button button--accent" type="button" onClick={loadHealth} disabled={isLoading}>
          <Icon name="refresh" size={16} />
          {isLoading ? 'Refreshing…' : 'Refresh live health'}
        </button>
      </div>

      {error ? (
        <div className="health-cockpit__notice" role="status">
          Live refresh degraded: {error}
        </div>
      ) : null}

      <div className="grid grid--health">
        {HEALTH_GROUPS.map((group) => (
          <HealthGroupCard checks={grouped[group.id]} groupId={group.id} key={group.id} />
        ))}
      </div>
    </section>
  );
}

function healthTotals(checks: HealthCheck[]): { total: number; degraded: number; offline: number; unknown: number } {
  return {
    total: checks.length,
    degraded: checks.filter((check) => check.status === 'degraded').length,
    offline: checks.filter((check) => check.status === 'down').length,
    unknown: checks.filter((check) => check.status === 'unknown').length,
  };
}

function HealthGroupCard({ groupId, checks }: { groupId: HealthGroupId; checks: HealthCheck[] }) {
  const group = HEALTH_GROUPS.find((item) => item.id === groupId)!;
  const status = checks.length === 0 ? 'unknown' : worstStatus(checks);
  return (
    <article className="health-card health-card--cockpit">
      <div className="health-card__head">
        <div>
          <div className="health-card__layer">{group.description}</div>
          <strong>{group.label}</strong>
        </div>
        <StatusChip status={status} />
      </div>
      {checks.length === 0 ? (
        <EmptyState
          title={`No ${group.label} checks reported`}
          description="The backend response did not include a safe check for this cockpit group. This is shown as unknown rather than hidden."
          icon="inbox"
        />
      ) : (
        checks.map((check) => <HealthRow check={check} key={check.id} />)
      )}
    </article>
  );
}

function worstStatus(checks: HealthCheck[]): HealthStatus {
  if (checks.some((check) => check.status === 'down')) return 'down';
  if (checks.some((check) => check.status === 'degraded')) return 'degraded';
  if (checks.some((check) => check.status === 'unknown')) return 'unknown';
  return 'healthy';
}

function HealthRow({ check }: { check: HealthCheck }) {
  const evidence = check.safeToShow ? summarizeEvidence(check.evidence) : [];
  return (
    <div className="health-row health-row--rich">
      <div className="health-row__main">
        <div className="health-row__label">{check.label}</div>
        <div className="health-row__summary">{check.summary}</div>
        <div className="health-row__timestamp">Last checked {absoluteTime(check.lastCheckedAt)}</div>
        <EvidencePills evidence={evidence} />
      </div>
      <StatusChip
        status={check.status}
        label={check.latencyMs === null ? statusLabel(check.status) : `${statusLabel(check.status)} · ${check.latencyMs}ms`}
      />
    </div>
  );
}

function EvidencePills({ evidence }: { evidence: HealthEvidencePill[] }) {
  if (evidence.length === 0) {
    return <div className="health-row__evidence-label">Evidence: not shown by adapter</div>;
  }
  return (
    <div className="health-row__evidence" aria-label="Evidence">
      <span className="health-row__evidence-label">Evidence</span>
      {evidence.map((item) => (
        <span className="evidence-pill" key={`${item.label}:${item.value}`}>
          {item.label}: {item.value}
        </span>
      ))}
    </div>
  );
}

function TelemetryPage() {
  const [snapshot, setSnapshot] = useState<TelemetrySnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadTelemetry = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setSnapshot(await fetchTelemetrySnapshot());
    } catch {
      setSnapshot(null);
      setError('The backend /api/telemetry endpoint is unavailable or requires a valid private-console login.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTelemetry();
  }, [loadTelemetry]);

  if (isLoading && snapshot === null) {
    return <Skeleton rows={4} title="Telemetry is loading live request aggregates" />;
  }

  if (error && snapshot === null) {
    return (
      <Panel title="Telemetry backend unavailable" hint="No production fallback data shown">
        <ErrorState
          title="Telemetry backend unavailable"
          description="The console could not reach /api/telemetry, so live request and latency aggregates are unavailable instead of replaced with sample metrics."
          actionLabel="Retry telemetry"
          onAction={loadTelemetry}
        />
      </Panel>
    );
  }

  if (snapshot === null) return null;

  return (
    <>
      <section className="metric-strip" aria-label="Telemetry metrics">
        <Metric label="Requests 1h" value={compactNumber(snapshot.totals.requests1h)} detail="Console API requests" icon="telemetry" />
        <Metric label="Requests 24h" value={compactNumber(snapshot.totals.requests24h)} detail={`Source: ${snapshot.source}`} icon="pulse" />
        <Metric label="Error rate" value={snapshot.totals.errorRate === null ? '—' : `${(snapshot.totals.errorRate * 100).toFixed(1)}%`} detail="4xx/5xx share" icon="alert" />
        <Metric label="p95 latency" value={snapshot.totals.p95LatencyMs === null ? '—' : `${Math.round(snapshot.totals.p95LatencyMs)}ms`} detail="Observed API route latency" icon="health" />
      </section>

      <section className="grid grid--2">
        <Panel title="Token-safe telemetry scope" hint={`Generated ${absoluteTime(snapshot.generatedAt)}`}>
          <dl className="defs">
            <dt>Token fingerprint</dt>
            <dd className="mono fingerprint">{snapshot.tokenFingerprint ?? 'not configured'}</dd>
            <dt>Token scope</dt>
            <dd>{snapshot.tokenScope}</dd>
            <dt>Status</dt>
            <dd><StatusChip status={snapshot.status === 'ok' ? 'healthy' : 'degraded'} /></dd>
          </dl>
        </Panel>

        <Panel title="Route aggregates" hint="Safe request metadata only">
          {snapshot.routes.length === 0 ? (
            <EmptyState title="No telemetry routes yet" description="No console API requests are retained in the telemetry window yet." icon="inbox" />
          ) : (
            <TelemetryRoutesTable routes={snapshot.routes} />
          )}
        </Panel>
      </section>
    </>
  );
}

function TelemetryRoutesTable({ routes }: { routes: TelemetrySnapshot['routes'] }) {
  return (
    <div className="table-wrap">
      <table className="data">
        <caption className="sr-only">Telemetry route aggregates</caption>
        <thead>
          <tr>
            <th scope="col">Route</th>
            <th scope="col">Requests</th>
            <th scope="col">Errors</th>
            <th scope="col">p95</th>
          </tr>
        </thead>
        <tbody>
          {routes.map((route) => (
            <tr key={route.route}>
              <td className="mono">{route.route}</td>
              <td>{compactNumber(route.requests)}</td>
              <td>{compactNumber(route.errors)}</td>
              <td>{route.p95LatencyMs === null ? '—' : `${Math.round(route.p95LatencyMs)}ms`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AuditPage() {
  const [snapshot, setSnapshot] = useState<AuditEventsSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAudit = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setSnapshot(await fetchAuditEvents());
    } catch {
      setSnapshot(null);
      setError('The backend /api/audit/events endpoint is unavailable or requires a valid private-console login.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAudit();
  }, [loadAudit]);

  if (isLoading && snapshot === null) {
    return <Skeleton rows={4} title="Audit trail is loading live operator events" />;
  }

  if (error && snapshot === null) {
    return (
      <Panel title="Audit backend unavailable" hint="No production fallback data shown">
        <ErrorState
          title="Audit backend unavailable"
          description="The console could not reach /api/audit/events, so live event history is unavailable instead of replaced with sample audit rows."
          actionLabel="Retry audit"
          onAction={loadAudit}
        />
      </Panel>
    );
  }

  if (snapshot === null) return null;

  return (
    <section className="grid grid--2">
      <Panel title="Event trail" hint={`${snapshot.total} live events · ${snapshot.source}`}>
        {snapshot.events.length === 0 ? (
          <EmptyState title="No audit events yet" description="The live audit trail is reachable but no events are retained yet." icon="inbox" />
        ) : (
          <AuditEventsTable events={snapshot.events} />
        )}
      </Panel>
      <Panel title="Audit posture" hint="Read-only console">
        <EmptyState
          title="Audit data is sanitized"
          description="Events contain route templates, status, and token fingerprints only. Request bodies, response bodies, and headers are not rendered."
          icon="shield"
        />
      </Panel>
    </section>
  );
}

function AuditEventsTable({ events }: { events: AuditEvent[] }) {
  return (
    <div className="table-wrap">
      <table className="data">
        <caption className="sr-only">Console audit events</caption>
        <thead>
          <tr>
            <th scope="col">Time</th>
            <th scope="col">Actor</th>
            <th scope="col">Action</th>
            <th scope="col">Outcome</th>
          </tr>
        </thead>
        <tbody>
          {events.map((event) => (
            <tr key={event.id}>
              <td>{relativeTime(event.at)}</td>
              <td>{event.actor}</td>
              <td className="mono">{event.action}</td>
              <td>
                <span className={`chip ${event.outcome === 'ok' ? 'chip--healthy' : event.outcome === 'denied' ? 'chip--degraded' : 'chip--down'}`}>
                  <span className="chip__dot" aria-hidden="true" />
                  {event.outcome}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SettingsPage() {
  const [snapshot, setSnapshot] = useState<SettingsSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSettings = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setSnapshot(await fetchSettingsSnapshot());
    } catch {
      setSnapshot(null);
      setError('The backend /api/settings endpoint is unavailable or requires a valid private-console login.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  if (isLoading && snapshot === null) {
    return <Skeleton rows={4} title="Settings are loading sanitized runtime configuration" />;
  }

  if (error && snapshot === null) {
    return (
      <Panel title="Settings backend unavailable" hint="No production fallback data shown">
        <ErrorState
          title="Settings backend unavailable"
          description="The console could not reach /api/settings, so sanitized runtime configuration is unavailable instead of replaced with sample provider flags."
          actionLabel="Retry settings"
          onAction={loadSettings}
        />
      </Panel>
    );
  }

  if (snapshot === null) return null;

  const providers = Object.entries(snapshot.secrets.providerKeysConfigured);
  return (
    <section className="grid grid--2">
      <Panel title="Provider posture" hint="Configured flags only">
        {providers.length === 0 ? (
          <EmptyState title="No provider flags reported" description="The backend did not report configured provider key flags." icon="settings" />
        ) : (
          providers.map(([provider, configured]) => (
            <div className="health-row" key={provider}>
              <div className="health-row__main">
                <div className="health-row__label">{provider}</div>
                <div className="health-row__summary">Server-side credential value is never rendered.</div>
              </div>
              <ConfiguredChip configured={configured} />
            </div>
          ))
        )}
      </Panel>
      <Panel title="Console runtime" hint="Sanitized backend settings">
        <dl className="defs">
          <dt>Auth</dt>
          <dd>{snapshot.auth.configured ? 'configured' : 'not configured'}</dd>
          <dt>Honcho API</dt>
          <dd>{snapshot.honchoApi.url}</dd>
          <dt>Token fingerprint</dt>
          <dd className="mono fingerprint">{snapshot.honchoApi.tokenFingerprint ?? 'not configured'}</dd>
          <dt>Agent registry</dt>
          <dd>{snapshot.agentRegistry.displayName} · {snapshot.agentRegistry.honchoWorkspace}</dd>
          <dt>Private boundary</dt>
          <dd>Tailscale/internal only; no public internet URL configured by this console.</dd>
        </dl>
      </Panel>
    </section>
  );
}

function ConfiguredChip({ configured }: { configured: boolean }) {
  return (
    <span className={`chip ${configured ? 'chip--healthy' : 'chip--unknown'}`}>
      <span className="chip__dot" aria-hidden="true" />
      {configured ? 'Configured' : 'Not configured'}
    </span>
  );
}

function Panel({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="panel">
      <header className="panel__header">
        <div className="panel__title">{title}</div>
        {hint ? <div className="panel__hint">{hint}</div> : null}
      </header>
      <div className="panel__body">{children}</div>
    </section>
  );
}
