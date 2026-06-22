import { useCallback, useEffect, useState } from 'react';

import { Icon, type IconName } from './components/Icon';
import { AgentsView } from './components/AgentsView';
import { EmptyState, ErrorState, Skeleton } from './components/StatePanels';
import {
  FIXTURE_META,
  auditFixture,
  healthSnapshotFixture,
  memoryExplorerFixture,
  overviewFixture,
  providersFixture,
  telemetryFixture,
} from './lib/fixtures';
import { absoluteTime, compactNumber, relativeTime, sparklinePath, statusLabel } from './lib/format';
import {
  HEALTH_GROUPS,
  fetchServiceHealth,
  groupHealthChecks,
  summarizeEvidence,
  type HealthEvidencePill,
  type HealthGroupId,
} from './lib/health';
import { fetchMemoryExplorerSnapshot } from './lib/memory';
import { navigate, type RouteId, useRoute } from './lib/router';
import { applyTheme, readInitialTheme, type ThemeMode } from './lib/theme';
import type {
  ConclusionSummary,
  HealthCheck,
  HealthServicesSnapshot,
  HealthStatus,
  MemoryExplorerSnapshot,
  MemoryPeer,
  MemorySession,
  MemoryWorkspace,
  MessageSummary,
  PeerCardEntry,
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
  { id: 'audit', label: 'Audit', icon: 'audit', description: 'Read-only operator event trail.', badge: '4' },
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
          <span>Private by design · {FIXTURE_META.fixtureOnly ? 'Fixture mode' : 'Live mode'}</span>
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
            <button className="icon-button" type="button" aria-label="Refresh dashboard fixtures">
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

          <div className="fixture-banner" data-live-health={route === 'health' ? 'true' : 'false'}>
            <Icon name="alert" size={17} />
            <span>
              <strong>
                {route === 'health'
                  ? 'Live health integration.'
                  : route === 'memory'
                    ? 'Live memory integration.'
                    : 'Fixture-supported shell.'}
              </strong>{' '}
              {route === 'health'
                ? 'The Health cockpit queries /api/health/services and falls back to an explicit offline state when the backend cannot be reached.'
                : route === 'memory'
                  ? 'The Memory explorer queries /api/memory and keeps sensitive message content behind explicit disclosure controls.'
                  : FIXTURE_META.note}
            </span>
          </div>

          <header className="page-header">
            <div>
              <div className="page-header__eyebrow">{copy.eyebrow}</div>
              <h1>{copy.title}</h1>
              <p>{copy.description}</p>
            </div>
            <StatusChip status={overviewFixture.layers[0]?.status ?? 'unknown'} label="API reachable" />
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
  const degradedLayers = overviewFixture.layers.filter((layer) => layer.status !== 'healthy');
  return (
    <>
      <section className="metric-strip" aria-label="Overview metrics">
        <Metric label="Memory posture" value={`${overviewFixture.healthScore}%`} detail="Global confidence score" icon="pulse" />
        <Metric label="Active agents" value={compactNumber(overviewFixture.activeAgents)} detail="Known console consumers" icon="agents" />
        <Metric label="Workspaces" value={compactNumber(overviewFixture.workspaces)} detail="Memory namespaces tracked" icon="memory" />
        <Metric label="Queue" value={compactNumber(overviewFixture.queue.pending)} detail={`${overviewFixture.queue.inProgress} in progress · ${overviewFixture.queue.errors} errors`} icon="health" />
      </section>

      <section className="grid grid--2">
        <Panel title="Operational layers" hint="Status labels are always explicit">
          <div className="grid grid--health">
            {overviewFixture.layers.map((layer) => (
              <div className="health-card" key={layer.id}>
                <div className="health-card__head">
                  <div>
                    <div className="health-card__layer">{layer.id}</div>
                    <strong>{layer.label}</strong>
                  </div>
                  <StatusChip status={layer.status} />
                </div>
              </div>
            ))}
          </div>
          {degradedLayers.length === 0 ? (
            <EmptyState title="All layers healthy" description="No degraded layers are present in this sample snapshot." icon="check" />
          ) : null}
        </Panel>

        <Panel title="Signal watchlist" hint="Safe sample data">
          {overviewFixture.alerts.map((alert) => (
            <div className="health-row" key={alert.code}>
              <div className="health-row__main">
                <div className="health-row__label">{alert.message}</div>
                <div className="health-row__summary">{alert.source ?? 'console'} · {alert.code}</div>
              </div>
              <span className={`chip ${alert.severity === 'warning' ? 'chip--degraded' : 'chip--info'}`}>
                <span className="chip__dot" aria-hidden="true" />
                {alert.severity}
              </span>
            </div>
          ))}
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
      setSnapshot(memoryExplorerFixture);
      setError('The backend memory adapter is unavailable; showing explicit fixture fallback data.');
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

  const activeSnapshot = snapshot ?? memoryExplorerFixture;
  const visibleWorkspaces = filterWorkspaces(activeSnapshot.workspaces, filter);
  const visiblePeers = filterPeers(activeSnapshot.peers, filter);
  const visibleCardEntries = filterPeerCard(activeSnapshot.peerCard.entries, filter);
  const visibleSessions = filterSessions(activeSnapshot.sessions, filter);
  const visibleMessages = filterMessages(activeSnapshot.messages, filter);
  const visibleConclusions = filterConclusions(activeSnapshot.conclusions, filter);

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
            Source: {activeSnapshot.source === 'live' ? 'backend /api/memory' : 'fixture fallback'} · Loaded{' '}
            {absoluteTime(activeSnapshot.loadedAt)}
          </div>
          <div className="memory-toolbar__summary">
            {activeSnapshot.workspaces.length} workspaces · {activeSnapshot.peers.length} peers · {activeSnapshot.sessions.length}{' '}
            sessions · {activeSnapshot.messages.length} messages · {activeSnapshot.conclusions.length} conclusions
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
        <Metric label="Workspaces" value={compactNumber(activeSnapshot.workspaces.length)} detail={activeSnapshot.selectedWorkspaceId ?? 'No workspace selected'} icon="memory" />
        <Metric label="Peers" value={compactNumber(activeSnapshot.peers.length)} detail={activeSnapshot.selectedPeerId ? 'Selected peer active' : 'No peer selected'} icon="agents" />
        <Metric label="Queue pending" value={compactNumber(activeSnapshot.queue?.pendingWorkUnits ?? 0)} detail={`${compactNumber(activeSnapshot.queue?.completedWorkUnits ?? 0)} completed`} icon="health" />
        <Metric label="Messages" value={compactNumber(activeSnapshot.messages.length)} detail="Sensitive message content hidden by default" icon="shield" />
      </section>

      <section className="grid grid--2 memory-grid">
        <Panel title="Workspace explorer" hint="Live workspace metadata">
          <WorkspaceExplorerTable workspaces={visibleWorkspaces} selectedWorkspaceId={activeSnapshot.selectedWorkspaceId} />
        </Panel>

        <Panel title="Peers" hint="Peer metadata and configuration keys">
          <PeersTable peers={visiblePeers} selectedPeerId={activeSnapshot.selectedPeerId} />
        </Panel>

        <Panel title="Peer card" hint={`${activeSnapshot.peerCard.total} entries reported`}>
          <PeerCardList entries={visibleCardEntries} />
        </Panel>

        <Panel title="Representation" hint="Explicit disclosure required">
          <PeerDisclosure
            label="representation"
            revealed={peerContextRevealed}
            onReveal={() => setPeerContextRevealed((current) => !current)}
            text={activeSnapshot.representation.representation}
            sensitive={activeSnapshot.representation.sensitive}
          />
        </Panel>

        <Panel title="Context" hint="Peer-to-target context">
          <PeerContextDisclosure
            contextEntries={activeSnapshot.context.peerCard}
            peerContextRevealed={peerContextRevealed}
            representation={activeSnapshot.context.representation}
            sensitive={activeSnapshot.context.sensitive}
          />
        </Panel>

        <Panel title="Sessions" hint="Metadata only">
          <SessionsTable sessions={visibleSessions} selectedSessionId={activeSnapshot.selectedSessionId} />
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

  const activeSnapshot = snapshot ?? healthSnapshotFixture;
  const grouped = groupHealthChecks(activeSnapshot.checks);
  const totals = healthTotals(activeSnapshot.checks);

  return (
    <section className="health-cockpit" aria-label="Health checks by API, Deriver, Storage, Network, LLM, Update, and Host">
      <div className="health-cockpit__toolbar">
        <div>
          <div className="health-cockpit__meta">
            Source: {activeSnapshot.source === 'live' ? 'backend /api/health/services' : 'fixture fallback'} · Last checked{' '}
            {absoluteTime(activeSnapshot.generatedAt)}
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
  return (
    <section className="grid grid--2">
      {telemetryFixture.map((series) => (
        <Panel key={series.label} title={series.label} hint={`${series.delta >= 0 ? '+' : ''}${series.delta} ${series.unit}`}>
          <Sparkline points={series.points} />
          <div className="metric__value">
            {compactNumber(series.current)} <small>{series.unit}</small>
          </div>
        </Panel>
      ))}
      <Skeleton rows={3} title="Telemetry adapter loading preview" />
    </section>
  );
}

function Sparkline({ points }: { points: number[] }) {
  const path = sparklinePath(points, 220, 48);
  return (
    <svg className="spark" viewBox="0 0 220 48" role="img" aria-label="Telemetry sparkline">
      <path className="spark__area" d={path.area} />
      <path d={path.line} />
    </svg>
  );
}

function AuditPage() {
  return (
    <section className="grid grid--2">
      <Panel title="Event trail" hint="Operator-visible outcomes">
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
              {auditFixture.map((event) => (
                <tr key={event.id}>
                  <td>{relativeTime(event.at)}</td>
                  <td>{event.actor}</td>
                  <td>{event.action}</td>
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
      </Panel>
      <Panel title="Exception state" hint="Accessible failure copy">
        <ErrorState
          title="Audit adapter unavailable"
          description="The shell keeps the operator in context and offers a safe retry without dumping internal payloads."
        />
      </Panel>
    </section>
  );
}

function SettingsPage() {
  return (
    <section className="grid grid--2">
      <Panel title="Provider posture" hint="Configured flags only">
        {providersFixture.map((provider) => (
          <div className="health-row" key={provider.id}>
            <div className="health-row__main">
              <div className="health-row__label">{provider.label}</div>
              <div className="health-row__summary">{provider.scope}</div>
            </div>
            <span className={`chip ${provider.configured ? 'chip--healthy' : 'chip--unknown'}`}>
              <span className="chip__dot" aria-hidden="true" />
              {provider.configured ? 'Configured' : 'Not configured'}
            </span>
          </div>
        ))}
      </Panel>
      <Panel title="Console preferences" hint="Persisted in browser storage">
        <EmptyState
          title="Theme is tokenized"
          description="Dark and light modes share the same semantic color system, focus ring, spacing rhythm, and state surfaces."
          icon="settings"
        />
      </Panel>
    </section>
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
