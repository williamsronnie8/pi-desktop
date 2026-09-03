import {
  Activity,
  Check,
  ChevronDown,
  CircleAlert,
  FileCode2,
  FolderOpen,
  LoaderCircle,
  Wrench,
} from "lucide-react";
import { useMemo, useState } from "react";
import { desktopApi } from "../lib/desktop-api";
import { joinPath } from "../lib/format";
import { changedFiles, resultText, type ToolActivity } from "../lib/messages";

interface ActivityPanelProps {
  tools: ToolActivity[];
  cwd: string;
  statuses: Record<string, string>;
  collapsed: boolean;
}

type ActivityTab = "activity" | "changes";

export function ActivityPanel({ tools, cwd, statuses, collapsed }: ActivityPanelProps) {
  const [tab, setTab] = useState<ActivityTab>("activity");
  const files = useMemo(() => changedFiles(tools), [tools]);
  const activeTools = tools.filter((tool) => tool.status === "running").length;

  if (collapsed) return null;

  return (
    <aside className="activity-panel">
      <div className="activity-tabs">
        <button className={tab === "activity" ? "active" : ""} onClick={() => setTab("activity")}>
          <Activity size={14} />
          Activity
          {activeTools > 0 && <span className="live-count">{activeTools}</span>}
        </button>
        <button className={tab === "changes" ? "active" : ""} onClick={() => setTab("changes")}>
          <FileCode2 size={14} />
          Changes
          {files.length > 0 && <span>{files.length}</span>}
        </button>
      </div>

      <div className="activity-content scrollable">
        {tab === "activity" && (
          <>
            {Object.keys(statuses).length > 0 && (
              <section className="extension-statuses">
                <div className="panel-section-title">Extension status</div>
                {Object.entries(statuses).map(([key, value]) => {
                  const displayValue = stripAnsi(value);
                  return (
                    <div key={key}>
                      <span>{key}</span>
                      <strong title={displayValue}>{displayValue}</strong>
                    </div>
                  );
                })}
              </section>
            )}
            <div className="panel-section-title">
              Tool timeline
              <span>{tools.length}</span>
            </div>
            <div className="tool-timeline">
              {[...tools].reverse().map((tool) => <ToolCard key={tool.id} tool={tool} />)}
              {tools.length === 0 && (
                <div className="panel-empty">
                  <div className="panel-empty-icon"><Wrench size={19} /></div>
                  <strong>No tool activity yet</strong>
                  <span>Reads, edits, shell commands, and extension tools will appear here.</span>
                </div>
              )}
            </div>
          </>
        )}

        {tab === "changes" && (
          <>
            <div className="panel-section-title">Files changed by Pi <span>{files.length}</span></div>
            <div className="changed-file-list">
              {files.map((file) => (
                <button key={file} onClick={() => void desktopApi().openPath(joinPath(cwd, file))} title={joinPath(cwd, file)}>
                  <span className="file-type-icon">{file.split(".").pop()?.slice(0, 3) ?? "file"}</span>
                  <span><strong>{file.split("/").pop()}</strong><small>{file}</small></span>
                  <FolderOpen size={14} />
                </button>
              ))}
              {files.length === 0 && (
                <div className="panel-empty">
                  <div className="panel-empty-icon"><FileCode2 size={19} /></div>
                  <strong>No changed files</strong>
                  <span>Files written or edited by Pi will be tracked here.</span>
                </div>
              )}
            </div>
          </>
        )}

      </div>
    </aside>
  );
}

function ToolCard({ tool }: { tool: ToolActivity }) {
  const [expanded, setExpanded] = useState(tool.status === "running");
  const argument = summarizeTool(tool);
  const output = tool.partial ? resultText(tool.partial) : resultText(tool.result);

  return (
    <div className={`tool-card ${tool.status}`}>
      <button className="tool-card-head" onClick={() => setExpanded((value) => !value)}>
        <span className="tool-state-icon">
          {tool.status === "running" ? <LoaderCircle size={13} className="spin" /> : tool.status === "error" ? <CircleAlert size={13} /> : <Check size={13} />}
        </span>
        <span className="tool-card-copy">
          <strong>{tool.name}</strong>
          <small>{argument}</small>
        </span>
        <ChevronDown size={13} className={expanded ? "rotate" : ""} />
      </button>
      {expanded && (
        <div className="tool-card-details">
          {Object.keys(tool.args).length > 0 && <pre>{JSON.stringify(tool.args, null, 2)}</pre>}
          {output && <pre className="tool-output">{output}</pre>}
        </div>
      )}
    </div>
  );
}

function stripAnsi(value: string): string {
  return value.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");
}

function summarizeTool(tool: ToolActivity): string {
  const candidate = tool.args.path ?? tool.args.command ?? tool.args.query ?? tool.args.url;
  if (typeof candidate === "string") return candidate;
  const keys = Object.keys(tool.args);
  return keys.length ? keys.join(", ") : tool.status === "running" ? "Running" : "Completed";
}
