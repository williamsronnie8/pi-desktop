import { Check, CheckCircle2, ChevronDown, CircleAlert, Copy, FileTerminal, LoaderCircle, Wrench } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { AgentMessage, ImageContent, MessageContent } from "../../shared/types";
import { desktopApi } from "../lib/desktop-api";
import { messageText, resultText } from "../lib/messages";

interface ConversationProps {
  messages: AgentMessage[];
  streamingText: string;
  streamingThinking: string;
  isStreaming: boolean;
  sessionName?: string;
  onStarter?: (prompt: string) => void;
}

export function Conversation({ messages, streamingText, streamingThinking, isStreaming, sessionName, onStarter }: ConversationProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const followOutput = useRef(true);
  const finishedToolIds = useMemo(
    () => new Set(messages.filter((message) => message.role === "toolResult" && message.toolCallId).map((message) => message.toolCallId!)),
    [messages],
  );

  useEffect(() => {
    if (!followOutput.current) return;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: streamingText ? "auto" : "smooth" });
  }, [messages, streamingText, streamingThinking]);

  return (
    <main
      className="conversation-scroll scrollable"
      ref={scrollRef}
      onScroll={(event) => {
        const element = event.currentTarget;
        followOutput.current = element.scrollHeight - element.scrollTop - element.clientHeight < 140;
      }}
    >
      <div className="conversation-inner">
        {messages.length > 0 && (
          <div className="conversation-intro">
            <span>{sessionName ?? "Conversation"}</span>
            <small>{messages.length} messages</small>
          </div>
        )}

        {messages.map((message, index) => (
          <MessageView key={`${message.timestamp ?? index}-${index}`} message={message} finishedToolIds={finishedToolIds} />
        ))}

        {(streamingText || streamingThinking) && (
          <article className="message assistant-message streaming-message">
            <MessageAvatar role="assistant" />
            <div className="message-column">
              <div className="message-label">
                Pi
                <span className="live-label">
                  <span /> live
                </span>
              </div>
              {streamingThinking && <ThinkingBlock text={streamingThinking} streaming />}
              {streamingText && <MarkdownContent text={streamingText} />}
              {!streamingText && isStreaming && (
                <div className="thinking-placeholder">
                  <LoaderCircle size={14} className="spin" />
                  Working through it
                </div>
              )}
            </div>
          </article>
        )}

        {messages.length === 0 && !isStreaming && <EmptyConversation onStarter={onStarter} />}
        <div className="conversation-bottom-space" />
      </div>
    </main>
  );
}

function MessageView({ message, finishedToolIds }: { message: AgentMessage; finishedToolIds: ReadonlySet<string> }) {
  if (message.role === "custom" && message.display === false) return null;

  if (message.role === "user") {
    return (
      <article className="message user-message">
        <MessageAvatar role="user" />
        <div className="message-column">
          <div className="message-label">You</div>
          <ContentBlocks content={message.content} />
        </div>
      </article>
    );
  }

  if (message.role === "assistant") {
    return (
      <article className={`message assistant-message ${message.stopReason === "error" ? "error-message" : ""}`}>
        <MessageAvatar role="assistant" />
        <div className="message-column">
          <div className="message-label">
            Pi
            {message.model && <span className="message-model">{message.model}</span>}
            <CopyMessageButton text={messageText(message)} />
          </div>
          <ContentBlocks content={message.content} finishedToolIds={finishedToolIds} />
          {message.errorMessage && <div className="message-error"><CircleAlert size={15} />{message.errorMessage}</div>}
        </div>
      </article>
    );
  }

  if (message.role === "toolResult") {
    return <ToolResultMessage message={message} />;
  }

  if (message.role === "bashExecution") {
    return (
      <article className="system-card bash-card">
        <div className="system-card-title">
          <FileTerminal size={15} />
          <code>{message.command}</code>
          <span className={message.exitCode === 0 ? "success-text" : "error-text"}>exit {message.exitCode ?? "—"}</span>
        </div>
        <pre>{message.output}</pre>
      </article>
    );
  }

  if (message.role === "compactionSummary" || message.role === "branchSummary") {
    return (
      <article className="system-card summary-card">
        <div className="system-card-title">
          <CheckCircle2 size={15} />
          {message.role === "compactionSummary" ? "Earlier context compacted" : "Branch context"}
        </div>
        <MarkdownContent text={message.summary ?? messageText(message)} />
      </article>
    );
  }

  return (
    <article className="system-card custom-card">
      <div className="system-card-title">{message.customType ?? "Extension"}</div>
      <ContentBlocks content={message.content} />
    </article>
  );
}

function ContentBlocks({ content, finishedToolIds = new Set<string>() }: { content?: string | MessageContent[]; finishedToolIds?: ReadonlySet<string> }) {
  if (typeof content === "string") return <MarkdownContent text={content} />;
  if (!Array.isArray(content)) return null;

  return (
    <>
      {content.map((block, index) => {
        if (block.type === "text") return <MarkdownContent key={index} text={block.text} />;
        if (block.type === "thinking") return <ThinkingBlock key={index} text={block.thinking} />;
        if (block.type === "image") return <MessageImage key={index} image={block} />;
        if (block.type === "toolCall") {
          return (
            <div className="inline-tool-call" key={block.id}>
              <Wrench size={14} />
              <span>{block.name}</span>
              <code>{summarizeArguments(block.arguments)}</code>
              {finishedToolIds.has(block.id)
                ? <Check size={13} className="tool-complete-icon" />
                : <LoaderCircle size={13} className="spin tool-pending-icon" />}
            </div>
          );
        }
        return null;
      })}
    </>
  );
}

function MarkdownContent({ text }: { text: string }) {
  return (
    <div className="markdown-content">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a
              href={href}
              onClick={(event: MouseEvent<HTMLAnchorElement>) => {
                event.preventDefault();
                if (href) void desktopApi().openExternal(href);
              }}
            >
              {children}
            </a>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

function ThinkingBlock({ text, streaming = false }: { text: string; streaming?: boolean }) {
  return (
    <details className="thinking-block" open={streaming}>
      <summary>
        <span className="thinking-orbit">◌</span>
        {streaming ? "Thinking" : "Thought process"}
        {streaming && <LoaderCircle size={12} className="spin" />}
        <ChevronDown size={13} className="details-chevron" />
      </summary>
      <div>{text}</div>
    </details>
  );
}

function ToolResultMessage({ message }: { message: AgentMessage }) {
  const [expanded, setExpanded] = useState(false);
  const text = resultText(message);
  const preview = text.length > 180 ? `${text.slice(0, 180)}…` : text;
  return (
    <article className={`inline-tool-result ${message.isError ? "failed" : ""}`}>
      <button onClick={() => setExpanded((value) => !value)}>
        {message.isError ? <CircleAlert size={14} /> : <Check size={14} />}
        <strong>{message.toolName ?? "Tool"}</strong>
        <span>{expanded ? "Hide result" : preview || "Completed"}</span>
        <ChevronDown size={13} className={expanded ? "rotate" : ""} />
      </button>
      {expanded && <pre>{text || JSON.stringify(message.details, null, 2)}</pre>}
    </article>
  );
}

function MessageImage({ image }: { image: ImageContent }) {
  return <img className="message-image" src={`data:${image.mimeType};base64,${image.data}`} alt="Attached content" />;
}

function MessageAvatar({ role }: { role: "user" | "assistant" }) {
  return <div className={`message-avatar ${role}`}>{role === "assistant" ? "π" : "R"}</div>;
}

function CopyMessageButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  if (!text) return null;
  return (
    <button
      className="copy-message-button"
      title="Copy message"
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1_500);
        });
      }}
    >
      {copied ? <Check size={13} /> : <Copy size={13} />}
    </button>
  );
}

function EmptyConversation({ onStarter }: { onStarter?: (prompt: string) => void }) {
  const starters = [
    "Inspect this project and explain how it works",
    "Find and fix the most important bug",
    "Review my current changes before I commit",
  ];
  return (
    <div className="empty-conversation">
      <div className="empty-orbit">
        <span>π</span>
      </div>
      <h1>What should we build?</h1>
      <p>Pi can read your project, run commands, edit files, search the web, and use every tool already configured in your Pi installation.</p>
      <div className="starter-grid">
        {starters.map((starter) => <button key={starter} onClick={() => onStarter?.(starter)}>{starter}</button>)}
      </div>
    </div>
  );
}

function summarizeArguments(args: Record<string, unknown>): string {
  const preferred = args.path ?? args.command ?? args.query ?? args.url;
  if (typeof preferred === "string") return preferred.length > 90 ? `${preferred.slice(0, 90)}…` : preferred;
  const keys = Object.keys(args);
  return keys.length ? keys.slice(0, 3).join(", ") : "";
}
