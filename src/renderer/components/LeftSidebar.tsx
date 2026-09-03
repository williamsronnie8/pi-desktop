import { ChevronDown, Folder, FolderPlus, MessageSquarePlus, Search, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import type { DesktopProject, DesktopSessionSummary } from "../../shared/types";
import { basename, formatRelativeTime } from "../lib/format";

interface LeftSidebarProps {
  projects: DesktopProject[];
  sessions: DesktopSessionSummary[];
  activeCwd: string;
  activeSessionPath?: string;
  collapsed: boolean;
  onProjectSelect: (path: string) => void;
  onSessionSelect: (session: DesktopSessionSummary) => void;
  onNewSession: () => void;
  onAddProject: () => void;
}

export function LeftSidebar({
  projects,
  sessions,
  activeCwd,
  activeSessionPath,
  collapsed,
  onProjectSelect,
  onSessionSelect,
  onNewSession,
  onAddProject,
}: LeftSidebarProps) {
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [query, setQuery] = useState("");
  const activeProject = projects.find((project) => project.path === activeCwd);
  const projectSessions = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return sessions.filter((session) => {
      if (session.cwd !== activeCwd) return false;
      if (!needle) return true;
      return `${session.name ?? ""} ${session.firstMessage} ${session.lastMessage ?? ""}`.toLowerCase().includes(needle);
    });
  }, [activeCwd, query, sessions]);

  if (collapsed) {
    return (
      <aside className="left-sidebar collapsed-sidebar">
        <div className="brand-mark" aria-label="Pi Desktop">
          π
        </div>
        <button className="icon-button strong" onClick={onNewSession} title="New session">
          <MessageSquarePlus size={18} />
        </button>
        <div className="collapsed-project-avatar" title={activeProject?.name ?? basename(activeCwd)}>
          {(activeProject?.name ?? basename(activeCwd)).slice(0, 1).toUpperCase()}
        </div>
      </aside>
    );
  }

  return (
    <aside className="left-sidebar">
      <div className="sidebar-brand window-drag">
        <div className="brand-mark">π</div>
        <div>
          <div className="brand-name">Pi</div>
          <div className="brand-subtitle">Desktop</div>
        </div>
      </div>

      <div className="project-picker-wrap">
        <button className="project-picker no-drag" onClick={() => setProjectMenuOpen((open) => !open)} title={activeCwd}>
          <span className="project-icon">
            <Folder size={15} />
          </span>
          <span className="project-picker-copy">
            <span className="project-picker-label">Project</span>
            <strong>{activeProject?.name ?? basename(activeCwd)}</strong>
          </span>
          <ChevronDown size={14} className={projectMenuOpen ? "rotate" : ""} />
        </button>

        {projectMenuOpen && (
          <div className="project-menu surface-popover">
            <div className="popover-label">Projects</div>
            {projects.map((project) => (
              <button
                key={project.path}
                className={`project-option ${project.path === activeCwd ? "active" : ""}`}
                onClick={() => {
                  setProjectMenuOpen(false);
                  onProjectSelect(project.path);
                }}
                title={project.path}
              >
                <span className="project-avatar">{project.name.slice(0, 1).toUpperCase()}</span>
                <span>
                  <strong>{project.name}</strong>
                  <small>{project.sessionCount} sessions</small>
                </span>
              </button>
            ))}
            <button
              className="project-option add-project-option"
              onClick={() => {
                setProjectMenuOpen(false);
                onAddProject();
              }}
            >
              <span className="project-avatar subtle">
                <FolderPlus size={14} />
              </span>
              <span>
                <strong>Add project</strong>
                <small>Choose a working folder</small>
              </span>
            </button>
          </div>
        )}
      </div>

      <button className="new-session-button" onClick={onNewSession}>
        <MessageSquarePlus size={16} />
        New session
        <span className="shortcut">⌘N</span>
      </button>

      <div className="sidebar-section-heading">
        <span>Sessions</span>
        <span className="count-badge">{projectSessions.length}</span>
      </div>
      <label className="session-search">
        <Search size={14} />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search sessions" />
        {query && (
          <button type="button" onClick={() => setQuery("")} aria-label="Clear search">
            ×
          </button>
        )}
      </label>

      <div className="session-list scrollable">
        {projectSessions.map((session) => (
          <button
            key={session.path}
            className={`session-row ${session.path === activeSessionPath ? "active" : ""}`}
            onClick={() => onSessionSelect(session)}
            title={session.name ?? session.firstMessage}
          >
            <span className="session-active-rail" />
            <span className="session-row-content">
              <span className="session-row-title">{session.name ?? session.firstMessage}</span>
              <span className="session-row-preview">{session.lastMessage ?? session.firstMessage}</span>
            </span>
            <span className="session-time">{formatRelativeTime(session.updatedAt)}</span>
          </button>
        ))}

        {projectSessions.length === 0 && (
          <div className="sidebar-empty">
            <Sparkles size={20} />
            <strong>{query ? "No matching sessions" : "Start something new"}</strong>
            <span>{query ? "Try a different search." : "Your sessions for this project will appear here."}</span>
          </div>
        )}
      </div>

      <div className="sidebar-footer">
        <span className="connection-dot" />
        <span>Local Pi runtime</span>
      </div>
    </aside>
  );
}
