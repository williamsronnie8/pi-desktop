import {
  Activity,
  ArrowDownUp,
  Coins,
  Database,
  FolderOpen,
  Gauge,
  Timer,
  Zap,
} from "lucide-react";
import type { ReactNode } from "react";
import type { PiSessionState, SessionStats } from "../../shared/types";
import { desktopApi } from "../lib/desktop-api";
import { formatCost, formatTokenCount } from "../lib/format";

export interface ResponsePerformance {
  durationMs: number;
  tokensPerSecond?: number;
  active: boolean;
}

interface SessionBarProps {
  cwd: string;
  executable?: string;
  state?: PiSessionState;
  stats?: SessionStats;
  performance?: ResponsePerformance;
}

export function SessionBar({ cwd, executable, state, stats, performance }: SessionBarProps) {
  const contextPercent = stats?.contextUsage?.percent;
  const contextLabel = contextPercent === null || contextPercent === undefined ? "—" : `${Math.round(contextPercent)}%`;
  const runtimeDetails = [
    `Pi: ${executable ?? "—"}`,
    `Working directory: ${cwd}`,
    `Session: ${state?.sessionId ?? "—"}`,
    `Auto compact: ${state?.autoCompactionEnabled ? "On" : "Off"}`,
  ].join("\n");

  return (
    <section className="session-bar no-drag" aria-label="Session overview">
      <div className="session-bar-context">
        <div className="session-bar-context-copy">
          <span><Gauge size={13} /> Context</span>
          <strong>{contextLabel}</strong>
        </div>
        <div className="session-bar-meter"><span style={{ width: `${Math.min(100, contextPercent ?? 0)}%` }} /></div>
        <small>{formatTokenCount(stats?.contextUsage?.tokens)} / {formatTokenCount(stats?.contextUsage?.contextWindow)}</small>
      </div>

      <div className="session-bar-metrics">
        <Metric icon={<Coins size={13} />} label="Cost" value={formatCost(stats?.cost)} />
        <Metric icon={<Activity size={13} />} label="Tokens" value={formatTokenCount(stats?.tokens.total)} />
        <Metric
          icon={<Zap size={13} />}
          label="Speed"
          value={performance?.tokensPerSecond === undefined ? (performance?.active ? "Measuring" : "—") : `${performance.tokensPerSecond.toFixed(1)}/s`}
          title="Output tokens per second for the latest model response"
        />
        <Metric
          icon={<Timer size={13} />}
          label="Duration"
          value={performance ? formatDuration(performance.durationMs) : "—"}
          title="Duration of the latest model response"
        />
        <Metric
          icon={<ArrowDownUp size={13} />}
          label="Input / output"
          value={`${formatTokenCount(stats?.tokens.input)} / ${formatTokenCount(stats?.tokens.output)}`}
          title="Session input tokens / output tokens"
        />
        <Metric
          icon={<Database size={13} />}
          label="Cache R / W"
          value={`${formatTokenCount(stats?.tokens.cacheRead)} / ${formatTokenCount(stats?.tokens.cacheWrite)}`}
          title="Session cache-read tokens / cache-write tokens"
        />
      </div>

      <span className={`session-bar-compact ${state?.autoCompactionEnabled ? "enabled" : ""}`} title={runtimeDetails}>
        <span /> Auto compact {state?.autoCompactionEnabled ? "on" : "off"}
      </span>

      {state?.sessionFile && (
        <button
          className="session-bar-reveal"
          onClick={() => void desktopApi().revealPath(state.sessionFile!)}
          title={`Reveal session file\n${runtimeDetails}`}
          aria-label="Reveal session file"
        >
          <FolderOpen size={14} />
        </button>
      )}
    </section>
  );
}

function Metric({ icon, label, value, title }: { icon: ReactNode; label: string; value: string; title?: string }) {
  return (
    <div className="session-bar-metric" title={title}>
      {icon}
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function formatDuration(milliseconds: number): string {
  if (milliseconds < 1_000) return `${Math.round(milliseconds)}ms`;
  if (milliseconds < 10_000) return `${(milliseconds / 1_000).toFixed(1)}s`;
  return `${Math.round(milliseconds / 1_000)}s`;
}
