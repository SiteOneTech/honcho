import { useEffect, useState } from 'react';

export type RouteId = 'overview' | 'agents' | 'memory' | 'health' | 'telemetry' | 'audit' | 'settings';

const ROUTES: readonly RouteId[] = ['overview', 'agents', 'memory', 'health', 'telemetry', 'audit', 'settings'];

function readRoute(): RouteId {
  if (typeof window === 'undefined') return 'overview';
  const value = window.location.hash.replace(/^#\/?/, '');
  return ROUTES.includes(value as RouteId) ? (value as RouteId) : 'overview';
}

export function navigate(route: RouteId): void {
  if (typeof window === 'undefined') return;
  const next = `#/${route}`;
  if (window.location.hash === next) return;
  window.location.hash = next;
}

export function useRoute(): RouteId {
  const [route, setRoute] = useState<RouteId>(readRoute);

  useEffect(() => {
    const onHashChange = () => setRoute(readRoute());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  return route;
}
