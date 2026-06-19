/**
 * Single coherent icon family for the console.
 *
 * All glyphs share one grid (24×24), stroke geometry, and weight so the UI
 * reads as one system rather than mixed icon sets. Stroke uses `currentColor`
 * so icons inherit semantic token colors from their context.
 */

export type IconName =
  | 'overview'
  | 'agents'
  | 'memory'
  | 'health'
  | 'telemetry'
  | 'audit'
  | 'settings'
  | 'search'
  | 'sun'
  | 'moon'
  | 'menu'
  | 'alert'
  | 'check'
  | 'refresh'
  | 'pulse'
  | 'inbox'
  | 'shield'
  | 'spark';

interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
}

const PATHS: Record<IconName, JSX.Element> = {
  overview: (
    <>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </>
  ),
  agents: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M4 20c0-2.8 2.2-5 5-5s5 2.2 5 5" />
      <circle cx="17.5" cy="9.5" r="2.2" />
      <path d="M15 20c.2-2.3 1.6-3.7 3.6-4" />
    </>
  ),
  memory: (
    <>
      <ellipse cx="12" cy="6" rx="7" ry="3" />
      <path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6" />
      <path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" />
    </>
  ),
  health: (
    <path d="M3 12h3l2-5 3 11 3-8 2 2h5" />
  ),
  telemetry: (
    <>
      <path d="M4 19V5" />
      <path d="M4 19h16" />
      <path d="M8 16l3-4 3 2 4-6" />
    </>
  ),
  audit: (
    <>
      <path d="M5 4h9l5 5v11a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z" />
      <path d="M14 4v5h5" />
      <path d="M8 13h7M8 16h5" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5v2.2M12 19.3v2.2M21.5 12h-2.2M4.7 12H2.5M18.4 5.6l-1.6 1.6M7.2 16.8l-1.6 1.6M18.4 18.4l-1.6-1.6M7.2 7.2 5.6 5.6" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6" />
      <path d="M20 20l-3.5-3.5" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M22 12h-2M4 12H2M19 5l-1.5 1.5M6.5 17.5 5 19M19 19l-1.5-1.5M6.5 6.5 5 5" />
    </>
  ),
  moon: <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  alert: (
    <>
      <path d="M12 3 2.5 20h19z" />
      <path d="M12 10v4M12 17h.01" />
    </>
  ),
  check: <path d="M5 12.5 10 17 19 7" />,
  refresh: (
    <>
      <path d="M20 11a8 8 0 0 0-14-4.5L3 9" />
      <path d="M4 13a8 8 0 0 0 14 4.5L21 15" />
      <path d="M3 5v4h4M21 19v-4h-4" />
    </>
  ),
  pulse: <path d="M3 12h4l2-6 4 12 2-6h6" />,
  inbox: (
    <>
      <path d="M4 13l2-8h12l2 8" />
      <path d="M4 13v5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5" />
      <path d="M4 13h4l1.5 2.5h5L16 13h4" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3 5 6v5c0 4.4 3 8 7 9 4-1 7-4.6 7-9V6z" />
      <path d="M9.5 12l1.8 1.8L15 10" />
    </>
  ),
  spark: <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" />,
};

export function Icon({ name, size = 18, className }: IconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
