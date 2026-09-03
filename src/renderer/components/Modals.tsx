import {
  Archive,
  Check,
  Command,
  CopyPlus,
  Download,
  GitFork,
  MessageSquarePlus,
  Search,
  Settings2,
  Tag,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { ExtensionUIRequest, PiSessionState, SlashCommand } from "../../shared/types";

export type LocalCommand = "new" | "rename" | "fork" | "clone" | "compact" | "export" | "settings";

interface ModalProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
  className?: string;
}

function Modal({ title, subtitle, children, onClose, className = "" }: ModalProps) {
  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className={`modal-card ${className}`} role="dialog" aria-modal="true" aria-label={title}>
        <header>
          <div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
          <button className="icon-button" onClick={onClose}><X size={17} /></button>
        </header>
        {children}
      </section>
    </div>
  );
}

interface CommandPaletteProps {
  commands: SlashCommand[];
  onClose: () => void;
  onLocalCommand: (command: LocalCommand) => void;
  onSlashCommand: (command: SlashCommand) => void;
}

const localCommands: Array<{ id: LocalCommand; title: string; description: string; icon: ReactNode; shortcut?: string }> = [
  { id: "new", title: "New session", description: "Start with a clean context", icon: <MessageSquarePlus size={16} />, shortcut: "⌘N" },
  { id: "rename", title: "Rename session", description: "Give this conversation a useful name", icon: <Tag size={16} /> },
  { id: "fork", title: "Fork from an earlier prompt", description: "Create a new session from a previous turn", icon: <GitFork size={16} /> },
  { id: "clone", title: "Clone current branch", description: "Duplicate the active branch into a new session", icon: <CopyPlus size={16} /> },
  { id: "compact", title: "Compact context", description: "Summarize older context and keep working", icon: <Archive size={16} /> },
  { id: "export", title: "Export as HTML", description: "Open a shareable local session export", icon: <Download size={16} /> },
  { id: "settings", title: "Session settings", description: "Queue, retry, and compaction controls", icon: <Settings2 size={16} /> },
];

export function CommandPalette({ commands, onClose, onLocalCommand, onSlashCommand }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => inputRef.current?.focus(), []);
  const normalized = query.toLowerCase();
  const filteredLocal = localCommands.filter((item) => `${item.title} ${item.description}`.toLowerCase().includes(normalized));
  const filteredSlash = commands.filter((item) => `${item.name} ${item.description ?? ""} ${item.source}`.toLowerCase().includes(normalized));

  return (
    <Modal title="Commands" subtitle="Run Pi features without memorizing slash commands" onClose={onClose} className="command-modal">
      <label className="modal-search"><Search size={16} /><input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search commands…" /></label>
      <div className="command-list scrollable">
        {filteredLocal.length > 0 && <div className="popover-label">Pi Desktop</div>}
        {filteredLocal.map((item) => (
          <button key={item.id} onClick={() => onLocalCommand(item.id)}>
            <span className="command-icon">{item.icon}</span>
            <span><strong>{item.title}</strong><small>{item.description}</small></span>
            {item.shortcut && <kbd>{item.shortcut}</kbd>}
          </button>
        ))}
        {filteredSlash.length > 0 && <div className="popover-label">Extensions, prompts, and skills</div>}
        {filteredSlash.map((item) => (
          <button key={`${item.source}:${item.name}`} onClick={() => onSlashCommand(item)}>
            <span className="command-icon slash"><Command size={15} /></span>
            <span><strong>/{item.name}</strong><small>{item.description ?? `Run ${item.source} command`}</small></span>
            <em>{item.source}</em>
          </button>
        ))}
        {filteredLocal.length === 0 && filteredSlash.length === 0 && <div className="modal-empty">No commands match “{query}”.</div>}
      </div>
    </Modal>
  );
}

interface SettingsModalProps {
  state: PiSessionState;
  retryEnabled: boolean;
  onClose: () => void;
  onChange: (setting: "autoCompaction" | "autoRetry" | "steeringMode" | "followUpMode", value: boolean | string) => void;
}

export function SettingsModal({ state, retryEnabled, onClose, onChange }: SettingsModalProps) {
  return (
    <Modal title="Session settings" subtitle="These controls apply to the active Pi runtime" onClose={onClose} className="settings-modal">
      <div className="settings-groups">
        <section>
          <div className="settings-section-title">Context and recovery</div>
          <SettingToggle
            title="Automatic compaction"
            description="Summarize older context before the model reaches its limit."
            checked={state.autoCompactionEnabled}
            onChange={(value) => onChange("autoCompaction", value)}
          />
          <SettingToggle
            title="Automatic retry"
            description="Retry transient rate limits, overloads, and server errors."
            checked={retryEnabled}
            onChange={(value) => onChange("autoRetry", value)}
          />
        </section>
        <section>
          <div className="settings-section-title">Queued messages</div>
          <SettingSelect
            title="Steering delivery"
            description="How mid-run steering messages enter the current task."
            value={state.steeringMode}
            onChange={(value) => onChange("steeringMode", value)}
          />
          <SettingSelect
            title="Follow-up delivery"
            description="How queued follow-ups run after Pi finishes."
            value={state.followUpMode}
            onChange={(value) => onChange("followUpMode", value)}
          />
        </section>
      </div>
    </Modal>
  );
}

function SettingToggle({ title, description, checked, onChange }: { title: string; description: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="setting-row">
      <span><strong>{title}</strong><small>{description}</small></span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <i className="toggle-control"><span /></i>
    </label>
  );
}

function SettingSelect({ title, description, value, onChange }: { title: string; description: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="setting-row select-setting">
      <span><strong>{title}</strong><small>{description}</small></span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="one-at-a-time">One at a time</option>
        <option value="all">All at once</option>
      </select>
    </label>
  );
}

interface ExtensionDialogProps {
  request: ExtensionUIRequest;
  onRespond: (response: Record<string, unknown>) => void;
}

export function ExtensionDialog({ request, onRespond }: ExtensionDialogProps) {
  const [value, setValue] = useState(request.prefill ?? "");
  const cancel = (): void => onRespond({ type: "extension_ui_response", id: request.id, cancelled: true });

  useEffect(() => {
    if (!request.timeout) return;
    const timer = window.setTimeout(cancel, request.timeout);
    return () => window.clearTimeout(timer);
  }, [request.id, request.timeout]);

  if (request.method === "select") {
    return (
      <Modal title={request.title ?? "Choose an option"} onClose={cancel} className="extension-modal">
        <div className="extension-options">
          {(request.options ?? []).map((option) => (
            <button key={option} onClick={() => onRespond({ type: "extension_ui_response", id: request.id, value: option })}>
              <span>{option}</span><Check size={14} />
            </button>
          ))}
        </div>
      </Modal>
    );
  }

  if (request.method === "confirm") {
    return (
      <Modal title={request.title ?? "Confirm"} subtitle={request.message} onClose={cancel} className="extension-modal">
        <div className="modal-actions">
          <button className="secondary-button" onClick={cancel}>Cancel</button>
          <button className="primary-button" onClick={() => onRespond({ type: "extension_ui_response", id: request.id, confirmed: true })}>Confirm</button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={request.title ?? (request.method === "editor" ? "Edit text" : "Enter a value")} onClose={cancel} className="extension-modal">
      {request.method === "editor" ? (
        <textarea className="modal-editor" autoFocus value={value} onChange={(event) => setValue(event.target.value)} />
      ) : (
        <input className="modal-input" autoFocus value={value} placeholder={request.placeholder} onChange={(event) => setValue(event.target.value)} onKeyDown={(event) => event.key === "Enter" && onRespond({ type: "extension_ui_response", id: request.id, value })} />
      )}
      <div className="modal-actions">
        <button className="secondary-button" onClick={cancel}>Cancel</button>
        <button className="primary-button" onClick={() => onRespond({ type: "extension_ui_response", id: request.id, value })}>Submit</button>
      </div>
    </Modal>
  );
}

interface ForkDialogProps {
  messages: Array<{ entryId: string; text: string }>;
  onClose: () => void;
  onFork: (entryId: string) => void;
}

export function ForkDialog({ messages, onClose, onFork }: ForkDialogProps) {
  return (
    <Modal title="Fork from an earlier prompt" subtitle="Pi will create a separate session and put the selected prompt back in the composer." onClose={onClose} className="fork-modal">
      <div className="fork-list scrollable">
        {[...messages].reverse().map((message, index) => (
          <button key={message.entryId} onClick={() => onFork(message.entryId)}>
            <span>{messages.length - index}</span>
            <p>{message.text}</p>
            <GitFork size={15} />
          </button>
        ))}
        {messages.length === 0 && <div className="modal-empty">This session doesn't have any prompts to fork yet.</div>}
      </div>
    </Modal>
  );
}

export function NameDialog({ currentName, onClose, onSave }: { currentName?: string; onClose: () => void; onSave: (name: string) => void }) {
  const [name, setName] = useState(currentName ?? "");
  return (
    <Modal title="Rename session" subtitle="A clear name makes this easier to find later." onClose={onClose} className="name-modal">
      <input className="modal-input" autoFocus value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => event.key === "Enter" && name.trim() && onSave(name.trim())} placeholder="Session name" />
      <div className="modal-actions">
        <button className="secondary-button" onClick={onClose}>Cancel</button>
        <button className="primary-button" disabled={!name.trim()} onClick={() => onSave(name.trim())}>Save name</button>
      </div>
    </Modal>
  );
}

export interface ToastItem {
  id: string;
  message: string;
  type: "info" | "warning" | "error";
}

export function Toasts({ items, onDismiss }: { items: ToastItem[]; onDismiss: (id: string) => void }) {
  return (
    <div className="toast-stack">
      {items.map((item) => (
        <button key={item.id} className={`toast ${item.type}`} onClick={() => onDismiss(item.id)}>
          <span>{item.type === "error" ? "×" : item.type === "warning" ? "!" : "i"}</span>
          {item.message}
        </button>
      ))}
    </div>
  );
}
