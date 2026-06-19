import type {
  ConclusionSummary,
  MemoryExplorerSnapshot,
  MemoryPageEnvelope,
  MemoryPeer,
  MemoryQueueSummary,
  MemorySession,
  MemoryWorkspace,
  MessageSummary,
  PeerCard,
  PeerCardEntry,
  PeerContext,
  PeerRepresentation,
  QueueWorkUnitSummary,
} from './types';

type Fetcher = typeof fetch;

type JsonRecord = Record<string, unknown>;

interface BackendEnvelope {
  items?: unknown;
  total?: unknown;
  page?: unknown;
  size?: unknown;
  pages?: unknown;
}

interface BackendWorkspace {
  id?: unknown;
  metadata?: unknown;
  configuration_keys?: unknown;
  created_at?: unknown;
}

interface BackendPeer extends BackendWorkspace {
  workspace_id?: unknown;
}

interface BackendQueueSummary {
  total_work_units?: unknown;
  completed_work_units?: unknown;
  in_progress_work_units?: unknown;
  pending_work_units?: unknown;
  sessions?: unknown;
}

interface BackendPeerCardEntry {
  index?: unknown;
  text?: unknown;
  sensitive?: unknown;
}

interface BackendPeerCard {
  total?: unknown;
  entries?: unknown;
}

interface BackendRepresentation {
  representation?: unknown;
  sensitive?: unknown;
}

interface BackendContext extends BackendRepresentation {
  peer_id?: unknown;
  target_id?: unknown;
  peer_card?: unknown;
}

interface BackendSession extends BackendPeer {
  is_active?: unknown;
}

interface BackendMessage {
  id?: unknown;
  workspace_id?: unknown;
  session_id?: unknown;
  peer_id?: unknown;
  metadata?: unknown;
  created_at?: unknown;
  token_count?: unknown;
  content_hidden?: unknown;
  content_preview?: unknown;
  sensitive?: unknown;
}

interface BackendConclusion {
  id?: unknown;
  observer_id?: unknown;
  observed_id?: unknown;
  session_id?: unknown;
  created_at?: unknown;
  content_preview?: unknown;
  sensitive?: unknown;
}

export async function fetchMemoryExplorerSnapshot(fetcher: Fetcher = fetch): Promise<MemoryExplorerSnapshot> {
  const workspaces = await fetchWorkspaces(fetcher);
  const selectedWorkspaceId = workspaces.items[0]?.id ?? null;

  if (selectedWorkspaceId === null) {
    return emptySnapshot(workspaces.items, 'live');
  }

  const [queue, peers, sessions, conclusions] = await Promise.all([
    fetchQueue(selectedWorkspaceId, fetcher),
    fetchPeers(selectedWorkspaceId, fetcher),
    fetchSessions(selectedWorkspaceId, fetcher),
    fetchConclusions(selectedWorkspaceId, fetcher),
  ]);

  const selectedPeerId = peers.items[0]?.id ?? null;
  const selectedSessionId = sessions.items[0]?.id ?? null;

  const [peerCard, representation, context, messages] = await Promise.all([
    selectedPeerId ? fetchPeerCard(selectedWorkspaceId, selectedPeerId, fetcher) : Promise.resolve(emptyPeerCard()),
    selectedPeerId ? fetchRepresentation(selectedWorkspaceId, selectedPeerId, fetcher) : Promise.resolve(emptyRepresentation()),
    selectedPeerId ? fetchPeerContext(selectedWorkspaceId, selectedPeerId, fetcher) : Promise.resolve(emptyContext()),
    selectedSessionId ? fetchSessionMessages(selectedWorkspaceId, selectedSessionId, fetcher) : Promise.resolve(emptyEnvelope<MessageSummary>()),
  ]);

  return {
    source: 'live',
    loadedAt: new Date().toISOString(),
    selectedWorkspaceId,
    selectedPeerId,
    selectedSessionId,
    workspaces: workspaces.items,
    queue,
    peers: peers.items,
    peerCard,
    representation,
    context,
    sessions: sessions.items,
    messages: messages.items,
    conclusions: conclusions.items,
  };
}

export async function fetchWorkspaces(fetcher: Fetcher = fetch): Promise<MemoryPageEnvelope<MemoryWorkspace>> {
  const payload = await fetchJson('/api/memory/workspaces', fetcher);
  return normalizeEnvelope(payload, normalizeWorkspace);
}

export async function fetchQueue(workspaceIdInput: string, fetcher: Fetcher = fetch): Promise<MemoryQueueSummary> {
  const workspaceId = encodeSegment(workspaceIdInput);
  const payload = await fetchJson(`/api/memory/workspaces/${workspaceId}/queue`, fetcher);
  return normalizeQueue(payload as BackendQueueSummary);
}

export async function fetchPeers(workspaceIdInput: string, fetcher: Fetcher = fetch): Promise<MemoryPageEnvelope<MemoryPeer>> {
  const workspaceId = encodeSegment(workspaceIdInput);
  const payload = await fetchJson(`/api/memory/workspaces/${workspaceId}/peers`, fetcher);
  return normalizeEnvelope(payload, normalizePeer);
}

export async function fetchPeerCard(
  workspaceIdInput: string,
  peerIdInput: string,
  fetcher: Fetcher = fetch,
): Promise<PeerCard> {
  const workspaceId = encodeSegment(workspaceIdInput);
  const peerId = encodeSegment(peerIdInput);
  const payload = await fetchJson(`/api/memory/workspaces/${workspaceId}/peers/${peerId}/card`, fetcher);
  return normalizePeerCard(payload as BackendPeerCard);
}

export async function fetchRepresentation(
  workspaceIdInput: string,
  peerIdInput: string,
  fetcher: Fetcher = fetch,
): Promise<PeerRepresentation> {
  const workspaceId = encodeSegment(workspaceIdInput);
  const peerId = encodeSegment(peerIdInput);
  const payload = await fetchJson(`/api/memory/workspaces/${workspaceId}/peers/${peerId}/representation`, fetcher);
  return normalizeRepresentation(payload as BackendRepresentation);
}

export async function fetchPeerContext(
  workspaceIdInput: string,
  peerIdInput: string,
  fetcher: Fetcher = fetch,
): Promise<PeerContext> {
  const workspaceId = encodeSegment(workspaceIdInput);
  const peerId = encodeSegment(peerIdInput);
  const payload = await fetchJson(`/api/memory/workspaces/${workspaceId}/peers/${peerId}/context`, fetcher);
  return normalizeContext(payload as BackendContext);
}

export async function fetchSessions(
  workspaceIdInput: string,
  fetcher: Fetcher = fetch,
): Promise<MemoryPageEnvelope<MemorySession>> {
  const workspaceId = encodeSegment(workspaceIdInput);
  const payload = await fetchJson(`/api/memory/workspaces/${workspaceId}/sessions`, fetcher);
  return normalizeEnvelope(payload, normalizeSession);
}

export async function fetchSessionMessages(
  workspaceIdInput: string,
  sessionIdInput: string,
  fetcher: Fetcher = fetch,
): Promise<MemoryPageEnvelope<MessageSummary>> {
  const workspaceId = encodeSegment(workspaceIdInput);
  const sessionId = encodeSegment(sessionIdInput);
  const payload = await fetchJson(`/api/memory/workspaces/${workspaceId}/sessions/${sessionId}/messages`, fetcher);
  return normalizeEnvelope(payload, normalizeMessageSummary);
}

export async function fetchConclusions(
  workspaceIdInput: string,
  fetcher: Fetcher = fetch,
): Promise<MemoryPageEnvelope<ConclusionSummary>> {
  const workspaceId = encodeSegment(workspaceIdInput);
  const payload = await fetchJson(`/api/memory/workspaces/${workspaceId}/conclusions`, fetcher);
  return normalizeEnvelope(payload, normalizeConclusion);
}

export function normalizeMessageSummary(raw: unknown): MessageSummary {
  const item = asRecord(raw) as BackendMessage;
  return {
    id: asString(item.id, 'unknown-message'),
    workspaceId: asNullableString(item.workspace_id),
    sessionId: asNullableString(item.session_id),
    peerId: asNullableString(item.peer_id),
    metadata: asRecord(item.metadata),
    createdAt: asNullableString(item.created_at),
    tokenCount: asNullableNumber(item.token_count),
    contentHidden: item.content_hidden === false ? false : true,
    contentPreview: asNullableString(item.content_preview),
    sensitive: item.sensitive === false ? false : true,
  };
}

async function fetchJson(path: string, fetcher: Fetcher): Promise<unknown> {
  const response = await fetcher(path, {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`memory_${response.status}`);
  }
  return response.json();
}

function normalizeEnvelope<T>(payload: unknown, mapItem: (item: unknown) => T): MemoryPageEnvelope<T> {
  const envelope = asRecord(payload) as BackendEnvelope;
  const items = Array.isArray(envelope.items) ? envelope.items : [];
  return {
    items: items.map(mapItem),
    total: asNumber(envelope.total, items.length),
    page: asNumber(envelope.page, 1),
    size: asNumber(envelope.size, items.length || 50),
    pages: asNumber(envelope.pages, 1),
  };
}

function normalizeWorkspace(raw: unknown): MemoryWorkspace {
  const item = asRecord(raw) as BackendWorkspace;
  return {
    id: asString(item.id, 'unknown-workspace'),
    metadata: asRecord(item.metadata),
    configurationKeys: asStringArray(item.configuration_keys),
    createdAt: asNullableString(item.created_at),
  };
}

function normalizePeer(raw: unknown): MemoryPeer {
  const item = asRecord(raw) as BackendPeer;
  return {
    id: asString(item.id, 'unknown-peer'),
    workspaceId: asNullableString(item.workspace_id),
    metadata: asRecord(item.metadata),
    configurationKeys: asStringArray(item.configuration_keys),
    createdAt: asNullableString(item.created_at),
  };
}

function normalizeQueue(raw: BackendQueueSummary): MemoryQueueSummary {
  const sessions = asRecord(raw.sessions);
  const normalizedSessions = Object.entries(sessions).reduce<Record<string, QueueWorkUnitSummary>>((acc, [key, value]) => {
    acc[key] = normalizeQueueUnit(value as BackendQueueSummary);
    return acc;
  }, {});
  return { ...normalizeQueueUnit(raw), sessions: normalizedSessions };
}

function normalizeQueueUnit(raw: BackendQueueSummary): QueueWorkUnitSummary {
  return {
    totalWorkUnits: asNumber(raw.total_work_units, 0),
    completedWorkUnits: asNumber(raw.completed_work_units, 0),
    inProgressWorkUnits: asNumber(raw.in_progress_work_units, 0),
    pendingWorkUnits: asNumber(raw.pending_work_units, 0),
  };
}

function normalizePeerCard(raw: BackendPeerCard): PeerCard {
  const entries = Array.isArray(raw.entries) ? raw.entries : [];
  return {
    total: asNumber(raw.total, entries.length),
    entries: entries.map(normalizePeerCardEntry),
  };
}

function normalizePeerCardEntry(raw: unknown): PeerCardEntry {
  const item = asRecord(raw) as BackendPeerCardEntry;
  return {
    index: asNumber(item.index, 0),
    text: asString(item.text, 'No peer-card text reported.'),
    sensitive: item.sensitive === true,
  };
}

function normalizeRepresentation(raw: BackendRepresentation): PeerRepresentation {
  return {
    representation: asNullableString(raw.representation),
    sensitive: raw.sensitive === true,
  };
}

function normalizeContext(raw: BackendContext): PeerContext {
  const card = Array.isArray(raw.peer_card) ? raw.peer_card : [];
  return {
    peerId: asNullableString(raw.peer_id),
    targetId: asNullableString(raw.target_id),
    representation: asNullableString(raw.representation),
    peerCard: card.map(normalizePeerCardEntry),
    sensitive: raw.sensitive === true,
  };
}

function normalizeSession(raw: unknown): MemorySession {
  const item = asRecord(raw) as BackendSession;
  return {
    id: asString(item.id, 'unknown-session'),
    workspaceId: asNullableString(item.workspace_id),
    isActive: typeof item.is_active === 'boolean' ? item.is_active : null,
    metadata: asRecord(item.metadata),
    configurationKeys: asStringArray(item.configuration_keys),
    createdAt: asNullableString(item.created_at),
  };
}

function normalizeConclusion(raw: unknown): ConclusionSummary {
  const item = asRecord(raw) as BackendConclusion;
  return {
    id: asString(item.id, 'unknown-conclusion'),
    observerId: asNullableString(item.observer_id),
    observedId: asNullableString(item.observed_id),
    sessionId: asNullableString(item.session_id),
    createdAt: asNullableString(item.created_at),
    contentPreview: asNullableString(item.content_preview),
    sensitive: item.sensitive === true,
  };
}

function emptySnapshot(workspaces: MemoryWorkspace[], source: MemoryExplorerSnapshot['source']): MemoryExplorerSnapshot {
  return {
    source,
    loadedAt: new Date().toISOString(),
    selectedWorkspaceId: workspaces[0]?.id ?? null,
    selectedPeerId: null,
    selectedSessionId: null,
    workspaces,
    queue: null,
    peers: [],
    peerCard: emptyPeerCard(),
    representation: emptyRepresentation(),
    context: emptyContext(),
    sessions: [],
    messages: [],
    conclusions: [],
  };
}

function emptyEnvelope<T>(): MemoryPageEnvelope<T> {
  return { items: [], total: 0, page: 1, size: 50, pages: 1 };
}

function emptyPeerCard(): PeerCard {
  return { total: 0, entries: [] };
}

function emptyRepresentation(): PeerRepresentation {
  return { representation: null, sensitive: false };
}

function emptyContext(): PeerContext {
  return { peerId: null, targetId: null, representation: null, peerCard: [], sensitive: false };
}

function encodeSegment(value: string): string {
  return encodeURIComponent(value);
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

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}
