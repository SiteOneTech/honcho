import { useMemo, useState } from 'react';

import { Icon, type IconName } from './components/Icon';
import { AgentsView } from './components/AgentsView';
import { EmptyState, ErrorState, Skeleton } from './components/StatePanels';
import {
  FIXTURE_META,
  auditFixture,
  healthChecksFixture,
  overviewFixture,
  providersFixture,
  telemetryFixture,
  workspacesFixture,
} from './lib/fixtures';
import { compactNumber, relativeTime, sparklinePath, statusLabel } from './lib/format';
import { navigate, type RouteId, useRoute } from './lib/router';
import { applyTheme, readInitialTheme, type ThemeMode } from './lib/theme';
import type { HealthCheck, HealthLayer, HealthStatus } from './lib/types';

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
    title: 'Workspace and conclusion inventory',
    description:
      'Summary-first navigation for workspaces and peers; full message content stays behind later explicit controls.',
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

const LAYER_LABELS: Record<HealthLayer, string> = {
  service: 'Service plane',
  storage: 'Storage plane',
  resource: 'Host resources',
  network: 'Network',
  config: 'Configuration',
  update: 'Update loop',
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

          <div className="fixture-banner">
            <Icon name="alert" size={17} />
            <span>
              <strong>Fixture-only shell.</strong> {FIXTURE_META.note} Backend integration lands in the next
              increments.
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
  return (
    <section className="grid grid--2">
      <Panel title="Workspace inventory" hint="Summary-first memory view">
        <div className="table-wrap">
          <table className="data">
            <caption className="sr-only">Workspace memory summary</caption>
            <thead>
              <tr>
                <th scope="col">Workspace</th>
                <th scope="col" className="num">Peers</th>
                <th scope="col" className="num">Sessions</th>
                <th scope="col" className="num">Conclusions</th>
                <th scope="col">Last activity</th>
              </tr>
            </thead>
            <tbody>
              {workspacesFixture.map((workspace) => (
                <WorkspaceRow key={workspace.workspace} workspace={workspace} />
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <Panel title="Content controls" hint="Protected-by-default UX">
        <EmptyState
          title="No message body opened"
          description="The shell starts with counts, peer summaries, and conclusion metadata. Full text inspection is a later explicit action with clear visual labeling."
          icon="shield"
        />
      </Panel>
    </section>
  );
}

function WorkspaceRow({ workspace }: { workspace: (typeof workspacesFixture)[number] }) {
  return (
    <tr>
      <td className="cell-primary">{workspace.workspace}</td>
      <td className="num">{compactNumber(workspace.peers)}</td>
      <td className="num">{compactNumber(workspace.sessions)}</td>
      <td className="num">{compactNumber(workspace.conclusions)}</td>
      <td>{relativeTime(workspace.lastActivityAt)}</td>
    </tr>
  );
}

function HealthPage() {
  const grouped = useMemo(() => groupByLayer(healthChecksFixture), []);
  return (
    <section className="grid grid--health" aria-label="Health checks by layer">
      {Object.entries(grouped).map(([layer, checks]) => (
        <div className="health-card" key={layer}>
          <div className="health-card__head">
            <div>
              <div className="health-card__layer">{layer}</div>
              <strong>{LAYER_LABELS[layer as HealthLayer] ?? layer}</strong>
            </div>
            <StatusChip status={worstStatus(checks)} />
          </div>
          {checks.map((check) => (
            <HealthRow check={check} key={check.id} />
          ))}
        </div>
      ))}
    </section>
  );
}

function groupByLayer(checks: HealthCheck[]): Partial<Record<HealthLayer, HealthCheck[]>> {
  return checks.reduce<Partial<Record<HealthLayer, HealthCheck[]>>>((acc, check) => {
    const layerChecks = acc[check.layer] ?? [];
    layerChecks.push(check);
    acc[check.layer] = layerChecks;
    return acc;
  }, {});
}

function worstStatus(checks: HealthCheck[]): HealthStatus {
  if (checks.some((check) => check.status === 'down')) return 'down';
  if (checks.some((check) => check.status === 'degraded')) return 'degraded';
  if (checks.some((check) => check.status === 'unknown')) return 'unknown';
  return 'healthy';
}

function HealthRow({ check }: { check: HealthCheck }) {
  return (
    <div className="health-row">
      <div className="health-row__main">
        <div className="health-row__label">{check.label}</div>
        <div className="health-row__summary">{check.summary}</div>
      </div>
      <StatusChip status={check.status} label={check.latencyMs === null ? statusLabel(check.status) : `${statusLabel(check.status)} · ${check.latencyMs}ms`} />
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
