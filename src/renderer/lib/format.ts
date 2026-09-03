export function formatRelativeTime(timestamp: number): string {
  const difference = Date.now() - timestamp;
  const minutes = Math.floor(difference / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(timestamp);
}

export function formatTokenCount(value?: number | null): string {
  if (value === undefined || value === null) return "—";
  if (value < 1_000) return String(value);
  if (value < 1_000_000) return `${(value / 1_000).toFixed(value < 10_000 ? 1 : 0)}k`;
  return `${(value / 1_000_000).toFixed(1)}m`;
}

export function formatCost(value?: number): string {
  if (value === undefined) return "$0.00";
  if (value > 0 && value < 0.01) return "<$0.01";
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(value);
}

export function formatBytes(value: number): string {
  if (value < 1_024) return `${value} B`;
  if (value < 1_048_576) return `${Math.round(value / 1_024)} KB`;
  return `${(value / 1_048_576).toFixed(1)} MB`;
}

export function basename(path: string): string {
  const normalized = path.replace(/\/$/, "");
  return normalized.slice(normalized.lastIndexOf("/") + 1) || path;
}

export function joinPath(cwd: string, path: string): string {
  if (path.startsWith("/")) return path;
  return `${cwd.replace(/\/$/, "")}/${path.replace(/^\.\//, "")}`;
}
