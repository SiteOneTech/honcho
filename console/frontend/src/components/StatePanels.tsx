import { Icon, type IconName } from './Icon';

interface SkeletonProps {
  rows?: number;
  title?: string;
}

interface StatePanelProps {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: IconName;
}

function ActionButton({ label, onAction }: { label: string; onAction?: () => void }) {
  return (
    <button className="button" type="button" onClick={onAction}>
      <Icon name="refresh" size={16} />
      {label}
    </button>
  );
}

export function Skeleton({ rows = 4, title = 'Loading console data' }: SkeletonProps) {
  return (
    <div className="panel" role="status" aria-live="polite" aria-label={title}>
      <div className="panel__header">
        <div>
          <div className="skeleton skeleton-line" style={{ width: 164 }} />
          <div className="skeleton skeleton-line" style={{ width: 92 }} />
        </div>
        <div className="skeleton skeleton-line" style={{ width: 72 }} />
      </div>
      <div className="panel__body">
        {Array.from({ length: rows }).map((_, index) => (
          <div
            className="skeleton skeleton-block"
            key={`skeleton-${index}`}
            style={{ marginBottom: index === rows - 1 ? 0 : 12 }}
          />
        ))}
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
  icon = 'inbox',
}: StatePanelProps) {
  return (
    <div className="state" role="status" aria-live="polite">
      <div className="state__icon" aria-hidden="true">
        <Icon name={icon} size={24} />
      </div>
      <div className="state__title">{title}</div>
      <div className="state__desc">{description}</div>
      {actionLabel ? <ActionButton label={actionLabel} onAction={onAction} /> : null}
    </div>
  );
}

export function ErrorState({
  title,
  description,
  actionLabel = 'Retry safe refresh',
  onAction,
}: StatePanelProps) {
  return (
    <div className="state state--error" role="alert" aria-live="assertive">
      <div className="state__icon" aria-hidden="true">
        <Icon name="alert" size={24} />
      </div>
      <div className="state__title">{title}</div>
      <div className="state__desc">{description}</div>
      <ActionButton label={actionLabel} onAction={onAction} />
    </div>
  );
}
