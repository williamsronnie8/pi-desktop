import {
  Archive,
  Check,
  ChevronDown,
  Command,
  Image,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Search,
  Settings2,
  Sparkles,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import anthropicLogo from "@lobehub/icons-static-svg/icons/anthropic.svg?url";
import cohereLogo from "@lobehub/icons-static-svg/icons/cohere-color.svg?url";
import deepseekLogo from "@lobehub/icons-static-svg/icons/deepseek-color.svg?url";
import geminiLogo from "@lobehub/icons-static-svg/icons/gemini-color.svg?url";
import kimiLogo from "@lobehub/icons-static-svg/icons/kimi-color.svg?url";
import microsoftLogo from "@lobehub/icons-static-svg/icons/microsoft-color.svg?url";
import minimaxLogo from "@lobehub/icons-static-svg/icons/minimax-color.svg?url";
import mistralLogo from "@lobehub/icons-static-svg/icons/mistral-color.svg?url";
import nvidiaLogo from "@lobehub/icons-static-svg/icons/nvidia-color.svg?url";
import ollamaLogo from "@lobehub/icons-static-svg/icons/ollama.svg?url";
import openaiLogo from "@lobehub/icons-static-svg/icons/openai.svg?url";
import openrouterLogo from "@lobehub/icons-static-svg/icons/openrouter-color.svg?url";
import poolsideLogo from "@lobehub/icons-static-svg/icons/poolside-color.svg?url";
import qwenLogo from "@lobehub/icons-static-svg/icons/qwen-color.svg?url";
import xaiLogo from "@lobehub/icons-static-svg/icons/xai.svg?url";
import zaiLogo from "@lobehub/icons-static-svg/icons/zai.svg?url";
import type { PiModel, PiSessionState, ThinkingLevel } from "../../shared/types";
import { basename } from "../lib/format";

function providerLabel(provider: string) {
  return provider
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .replace("Openai", "OpenAI")
    .replace("Ollama Cloud", "Ollama Cloud");
}

function providerClass(provider: string) {
  if (provider.includes("ollama")) return "ollama";
  if (provider.includes("openai") || provider.includes("codex")) return "openai";
  if (provider.includes("anthropic")) return "anthropic";
  if (provider.includes("google") || provider.includes("gemini")) return "google";
  return "local";
}

function formatContext(tokens: number) {
  if (tokens >= 1_000_000) return `${Number((tokens / 1_000_000).toFixed(1))}M ctx`;
  if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}K ctx`;
  return `${tokens} ctx`;
}

const labLogos = [
  { pattern: /deepseek/, name: "DeepSeek", src: deepseekLogo },
  { pattern: /(?:^|[\s/_-])(?:qwen|qwq)(?:$|[\s/_:.-])/, name: "Qwen", src: qwenLogo },
  { pattern: /(?:kimi|moonshot)/, name: "Moonshot AI", src: kimiLogo },
  { pattern: /(?:claude|anthropic)/, name: "Anthropic", src: anthropicLogo },
  { pattern: /(?:gemini|gemma|google)/, name: "Google", src: geminiLogo },
  { pattern: /(?:mistral|mixtral|codestral)/, name: "Mistral AI", src: mistralLogo },
  { pattern: /laguna/, name: "Poolside", src: poolsideLogo },
  { pattern: /(?:nemotron|nvidia)/, name: "NVIDIA", src: nvidiaLogo },
  { pattern: /(?:grok|xai|x\.ai)/, name: "xAI", src: xaiLogo },
  { pattern: /(?:glm|zhipu|z\.ai|chatglm)/, name: "Z.ai", src: zaiLogo },
  { pattern: /minimax/, name: "MiniMax", src: minimaxLogo },
  { pattern: /(?:cohere|command-r)/, name: "Cohere", src: cohereLogo },
  { pattern: /(?:phi(?:-|\d)|microsoft|azure)/, name: "Microsoft", src: microsoftLogo },
  { pattern: /(?:gpt|openai|codex|(?:^|[\s/_-])o[134](?:$|[\s/_-]))/, name: "OpenAI", src: openaiLogo },
  { pattern: /openrouter/, name: "OpenRouter", src: openrouterLogo },
  { pattern: /ollama/, name: "Ollama", src: ollamaLogo },
];

function ModelLabLogo({ model }: { model?: PiModel }) {
  const identity = `${model?.name ?? ""} ${model?.id ?? ""} ${model?.provider ?? ""}`.toLowerCase();
  const lab = labLogos.find(({ pattern }) => pattern.test(identity));

  return (
    <span className="model-provider-mark" title={lab?.name ?? providerLabel(model?.provider ?? "Model provider")}>
      {lab ? <img src={lab.src} alt="" /> : (model?.name || model?.id || "M").charAt(0).toUpperCase()}
    </span>
  );
}

interface ModelPickerProps {
  models: PiModel[];
  selected?: PiModel;
  onChange: (provider: string, modelId: string) => void;
}

const thinkingDetails: Record<ThinkingLevel, { label: string; description: string }> = {
  off: { label: "Thinking off", description: "Fastest responses" },
  minimal: { label: "Minimal", description: "A quick internal pass" },
  low: { label: "Low", description: "Light reasoning" },
  medium: { label: "Medium", description: "Balanced depth and speed" },
  high: { label: "High", description: "Deeper problem solving" },
  xhigh: { label: "Extra high", description: "Maximum practical depth" },
  max: { label: "Maximum", description: "Use the full reasoning budget" },
};

export function ModelPicker({ models, selected, onChange }: ModelPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const selectedValue = selected ? `${selected.provider}/${selected.id}` : "";

  const groups = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const filtered = normalizedQuery
      ? models.filter((model) => `${model.name} ${model.id} ${model.provider}`.toLowerCase().includes(normalizedQuery))
      : models;
    const byProvider = new Map<string, PiModel[]>();
    for (const model of filtered) {
      const group = byProvider.get(model.provider) ?? [];
      group.push(model);
      byProvider.set(model.provider, group);
    }
    return [...byProvider.entries()];
  }, [models, query]);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    requestAnimationFrame(() => searchRef.current?.focus());
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const chooseModel = (model: PiModel) => {
    onChange(model.provider, model.id);
    setOpen(false);
    setQuery("");
  };

  return (
    <div className={`model-picker ${open ? "open" : ""}`} ref={rootRef}>
      <button
        className="model-picker-trigger"
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Choose model"
        onClick={() => setOpen((value) => !value)}
      >
        <ModelLabLogo model={selected} />
        <span className="model-trigger-copy">
          <span>{selected?.name || selected?.id || "Choose model"}</span>
          {selected && <small>{providerLabel(selected.provider)}</small>}
        </span>
        <ChevronDown className="model-picker-chevron" size={14} />
      </button>

      {open && (
        <div className="model-menu" role="dialog" aria-label="Choose a model">
          <div className="model-menu-header">
            <div>
              <strong>Choose a model</strong>
              <span>{models.length} available</span>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close model picker"><X size={15} /></button>
          </div>
          <label className="model-search">
            <Search size={14} />
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search models or providers"
            />
            {query && <button type="button" onClick={() => setQuery("")} aria-label="Clear search"><X size={13} /></button>}
          </label>
          <div className="model-list scrollable" role="listbox" aria-activedescendant={selectedValue}>
            {groups.map(([provider, providerModels]) => (
              <section className="model-group" key={provider}>
                <div className="model-group-heading">
                  <span className={`provider-dot ${providerClass(provider)}`} />
                  <strong>{providerLabel(provider)}</strong>
                  <span>{providerModels.length}</span>
                </div>
                {providerModels.map((model) => {
                  const value = `${model.provider}/${model.id}`;
                  const active = value === selectedValue;
                  return (
                    <button
                      id={value}
                      className={`model-option ${active ? "active" : ""}`}
                      type="button"
                      role="option"
                      aria-selected={active}
                      key={value}
                      onClick={() => chooseModel(model)}
                    >
                      <ModelLabLogo model={model} />
                      <span className="model-option-copy">
                        <strong>{model.name || model.id}</strong>
                        <small>{model.id}</small>
                      </span>
                      <span className="model-capabilities">
                        {model.reasoning && <span title="Reasoning model"><Sparkles size={11} /> Reasoning</span>}
                        {model.input.includes("image") && <span title="Accepts images"><Image size={11} /> Vision</span>}
                        <span>{formatContext(model.contextWindow)}</span>
                      </span>
                      <span className="model-check">{active && <Check size={15} />}</span>
                    </button>
                  );
                })}
              </section>
            ))}
            {groups.length === 0 && (
              <div className="model-empty"><Search size={19} /><strong>No models found</strong><span>Try a model name or provider.</span></div>
            )}
          </div>
          <div className="model-menu-footer"><span>Pi uses your configured providers</span><kbd>esc</kbd><span>to close</span></div>
        </div>
      )}
    </div>
  );
}

interface ThinkingPickerProps {
  levels: ThinkingLevel[];
  selected: ThinkingLevel;
  onChange: (level: ThinkingLevel) => void;
}

export function ThinkingPicker({ levels, selected, onChange }: ThinkingPickerProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const current = thinkingDetails[selected];

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const chooseLevel = (level: ThinkingLevel) => {
    onChange(level);
    setOpen(false);
  };

  return (
    <div className={`thinking-picker ${open ? "open" : ""}`} ref={rootRef}>
      <button
        className="thinking-picker-trigger"
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Choose thinking level"
        onClick={() => setOpen((value) => !value)}
      >
        <span className={`thinking-mark ${selected === "off" ? "off" : ""}`}><Sparkles size={13} /></span>
        <span className="thinking-trigger-copy">
          <span>{current.label}</span>
          <small>{current.description}</small>
        </span>
        <ChevronDown className="thinking-picker-chevron" size={14} />
      </button>

      {open && (
        <div className="thinking-menu" role="listbox" aria-label="Choose thinking level">
          <div className="thinking-menu-heading">
            <div><strong>Thinking level</strong><span>Control reasoning depth</span></div>
            <span className="thinking-menu-icon"><Sparkles size={15} /></span>
          </div>
          <div className="thinking-options">
            {levels.map((level) => {
              const detail = thinkingDetails[level];
              const active = level === selected;
              return (
                <button
                  className={`thinking-option ${active ? "active" : ""}`}
                  type="button"
                  role="option"
                  aria-selected={active}
                  key={level}
                  onClick={() => chooseLevel(level)}
                >
                  <span className={`thinking-level-glyph level-${level}`}><span /></span>
                  <span className="thinking-option-copy"><strong>{detail.label}</strong><small>{detail.description}</small></span>
                  <span className="thinking-option-check">{active && <Check size={15} />}</span>
                </button>
              );
            })}
          </div>
          <div className="thinking-menu-footer">Higher levels trade speed for more deliberate reasoning.</div>
        </div>
      )}
    </div>
  );
}

interface TopBarProps {
  cwd: string;
  state?: PiSessionState;
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  onToggleLeft: () => void;
  onToggleRight: () => void;
  onCommands: () => void;
  onCompact: () => void;
  onSettings: () => void;
}

export function TopBar({
  cwd,
  state,
  leftCollapsed,
  rightCollapsed,
  onToggleLeft,
  onToggleRight,
  onCommands,
  onCompact,
  onSettings,
}: TopBarProps) {
  return (
    <header className="top-bar window-drag">
      <div className="top-bar-left no-drag">
        <button className="icon-button" onClick={onToggleLeft} title={leftCollapsed ? "Show sidebar" : "Hide sidebar"}>
          {leftCollapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
        </button>
        <div className="breadcrumb" title={cwd}>
          <span>{basename(cwd)}</span>
          <span className="breadcrumb-separator">/</span>
          <strong>{state?.sessionName ?? "New session"}</strong>
        </div>
      </div>

      <div className="top-bar-controls no-drag">
        <span className={`runtime-status ${state?.isStreaming ? "working" : ""}`}>
          <span />
          {state?.isStreaming ? "Working" : "Ready"}
        </span>
        <span className="toolbar-divider" />
        <button className="icon-button" onClick={onCommands} title="Command palette (⌘K)">
          <Command size={17} />
        </button>
        <button className="icon-button" onClick={onCompact} title="Compact context">
          <Archive size={17} />
        </button>
        <button className="icon-button" onClick={onSettings} title="Session settings">
          <Settings2 size={17} />
        </button>
        <button className="icon-button" onClick={onToggleRight} title={rightCollapsed ? "Show activity" : "Hide activity"}>
          {rightCollapsed ? <PanelRightOpen size={17} /> : <PanelRightClose size={17} />}
        </button>
      </div>
    </header>
  );
}
