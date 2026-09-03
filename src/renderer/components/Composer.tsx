import { ArrowUp, Image as ImageIcon, Paperclip, Square, TerminalSquare, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ImageAttachment, PiModel, SlashCommand, ThinkingLevel } from "../../shared/types";
import { ModelPicker, ThinkingPicker } from "./TopBar";

interface ComposerProps {
  draft: string;
  commands: SlashCommand[];
  models: PiModel[];
  selectedModel?: PiModel;
  thinkingLevels: ThinkingLevel[];
  thinkingLevel: ThinkingLevel;
  isStreaming: boolean;
  pendingSteering: string[];
  pendingFollowUp: string[];
  widgets: Array<{ key: string; lines: string[]; placement?: "aboveEditor" | "belowEditor" }>;
  focusToken: number;
  onDraftChange: (value: string) => void;
  onModelChange: (provider: string, modelId: string) => void;
  onThinkingChange: (level: ThinkingLevel) => void;
  onSubmit: (text: string, attachments: ImageAttachment[], behavior?: "steer" | "followUp") => Promise<void>;
  onAbort: () => void;
}

export function Composer({
  draft,
  commands,
  models,
  selectedModel,
  thinkingLevels,
  thinkingLevel,
  isStreaming,
  pendingSteering,
  pendingFollowUp,
  widgets,
  focusToken,
  onDraftChange,
  onModelChange,
  onThinkingChange,
  onSubmit,
  onAbort,
}: ComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachments, setAttachments] = useState<ImageAttachment[]>([]);
  const [behavior, setBehavior] = useState<"steer" | "followUp">("steer");
  const [sending, setSending] = useState(false);

  const addImageFiles = (files: File[]): void => {
    const images = files.filter((file) => file.type.startsWith("image/"));
    if (images.length === 0) return;
    void Promise.all(images.map(fileToAttachment)).then((items) => {
      setAttachments((current) => [...current, ...items]);
      textareaRef.current?.focus();
    });
  };

  const suggestions = useMemo(() => {
    if (!draft.startsWith("/") || draft.includes(" ")) return [];
    const query = draft.slice(1).toLowerCase();
    return commands.filter((command) => command.name.toLowerCase().includes(query)).slice(0, 7);
  }, [commands, draft]);

  useEffect(() => {
    textareaRef.current?.focus();
  }, [focusToken]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(180, Math.max(28, textarea.scrollHeight))}px`;
  }, [draft]);

  const submit = async (): Promise<void> => {
    const text = draft.trim();
    if ((!text && attachments.length === 0) || sending) return;
    setSending(true);
    onDraftChange("");
    const currentAttachments = attachments;
    setAttachments([]);
    try {
      await onSubmit(text, currentAttachments, isStreaming ? behavior : undefined);
      currentAttachments.forEach((attachment) => URL.revokeObjectURL(attachment.previewUrl));
    } catch {
      onDraftChange(text);
      setAttachments(currentAttachments);
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  };

  const aboveWidgets = widgets.filter((widget) => widget.placement !== "belowEditor");
  const belowWidgets = widgets.filter((widget) => widget.placement === "belowEditor");

  return (
    <div className="composer-dock">
      {(pendingSteering.length > 0 || pendingFollowUp.length > 0) && (
        <div className="queue-strip">
          {pendingSteering.length > 0 && <span><i className="steer-dot" />{pendingSteering.length} steering</span>}
          {pendingFollowUp.length > 0 && <span><i className="follow-dot" />{pendingFollowUp.length} follow-up</span>}
          <small>queued behind the current turn</small>
        </div>
      )}

      {aboveWidgets.map((widget) => (
        <div className="extension-widget" key={widget.key}>
          {widget.lines.map((line, index) => <div key={index}>{line}</div>)}
        </div>
      ))}

      <div
        className={`composer-shell ${isStreaming ? "streaming" : ""}`}
        onPaste={(event) => {
          const files = [...event.clipboardData.items]
            .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
            .flatMap((item) => item.getAsFile() ?? []);
          if (files.length === 0) return;
          event.preventDefault();
          addImageFiles(files);
        }}
      >
        {attachments.length > 0 && (
          <div className="attachment-strip">
            {attachments.map((attachment) => (
              <div className="attachment-chip" key={attachment.id}>
                <img src={attachment.previewUrl} alt={attachment.name} />
                <span>{attachment.name}</span>
                <button
                  aria-label={`Remove ${attachment.name}`}
                  onClick={() => setAttachments((items) => {
                    URL.revokeObjectURL(attachment.previewUrl);
                    return items.filter((item) => item.id !== attachment.id);
                  })}
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        {suggestions.length > 0 && (
          <div className="command-suggestions surface-popover">
            <div className="popover-label">Commands</div>
            {suggestions.map((command) => (
              <button key={`${command.source}:${command.name}`} onClick={() => onDraftChange(`/${command.name} `)}>
                <span className="command-slash">/</span>
                <span><strong>{command.name}</strong><small>{command.description ?? command.source}</small></span>
                <em>{command.source}</em>
              </button>
            ))}
          </div>
        )}

        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void submit();
            }
            if (event.key === "Escape" && isStreaming) onAbort();
          }}
          placeholder={isStreaming ? "Steer Pi, or queue a follow-up…" : "Ask Pi anything about this project…"}
          rows={1}
        />

        <div className="composer-toolbar">
          <div className="composer-tools">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              multiple
              hidden
              onChange={(event) => {
                addImageFiles([...(event.target.files ?? [])]);
                event.target.value = "";
              }}
            />
            <button onClick={() => fileInputRef.current?.click()} title="Attach images">
              <Paperclip size={16} />
            </button>
            <span className="composer-mode-hint">
              {draft.startsWith("!") ? <><TerminalSquare size={13} /> shell command</> : <><ImageIcon size={13} /> paste or attach images</>}
            </span>
          </div>

          <div className="composer-actions">
            <div className="composer-model-controls">
              <ModelPicker models={models} selected={selectedModel} onChange={onModelChange} />
              <ThinkingPicker levels={thinkingLevels} selected={thinkingLevel} onChange={onThinkingChange} />
            </div>
            {isStreaming && (
              <div className="queue-mode-toggle">
                <button className={behavior === "steer" ? "active" : ""} onClick={() => setBehavior("steer")}>Steer</button>
                <button className={behavior === "followUp" ? "active" : ""} onClick={() => setBehavior("followUp")}>Follow up</button>
              </div>
            )}
            {isStreaming && (
              <button className="stop-button" onClick={onAbort} title="Stop Pi">
                <Square size={11} fill="currentColor" />
              </button>
            )}
            <button
              className="send-button"
              disabled={sending || (!draft.trim() && attachments.length === 0)}
              onClick={() => void submit()}
              title={isStreaming ? `Queue as ${behavior}` : "Send"}
            >
              <ArrowUp size={17} />
            </button>
          </div>
        </div>
      </div>

      {belowWidgets.map((widget) => (
        <div className="extension-widget below" key={widget.key}>
          {widget.lines.map((line, index) => <div key={index}>{line}</div>)}
        </div>
      ))}
      <div className="composer-caption">Enter to send · Shift+Enter for a new line · <code>!</code> runs a shell command</div>
    </div>
  );
}

async function fileToAttachment(file: File): Promise<ImageAttachment> {
  const previewUrl = URL.createObjectURL(file);
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read image"));
    reader.readAsDataURL(file);
  });
  return {
    id: crypto.randomUUID(),
    name: file.name,
    mimeType: file.type,
    data: dataUrl.slice(dataUrl.indexOf(",") + 1),
    previewUrl,
  };
}
