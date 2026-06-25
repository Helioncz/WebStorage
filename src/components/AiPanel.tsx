import { useEffect, useRef, useState } from "react";
import { api, AiConfig } from "../lib/api";
import { WebAgent, AgentCallbacks } from "../lib/agent";
import { Modal } from "./Modal";

type ChatItem = { role: "user" | "assistant" | "tool" | "error"; text: string };

const PRESETS: { label: string; cfg: Partial<AiConfig> }[] = [
  { label: "Anthropic (Claude)", cfg: { provider: "anthropic", baseUrl: "https://api.anthropic.com", model: "claude-opus-4-8" } },
  { label: "OpenAI", cfg: { provider: "openai", baseUrl: "https://api.openai.com", model: "gpt-4o" } },
  { label: "OpenRouter", cfg: { provider: "openai", baseUrl: "https://openrouter.ai/api", model: "anthropic/claude-opus-4-8" } },
  { label: "Ollama (lokální)", cfg: { provider: "openai", baseUrl: "http://localhost:11434", model: "llama3.1" } },
];

export default function AiPanel({ rel, onFileWritten }: { rel: string; onFileWritten: () => void }) {
  const [cfg, setCfg] = useState<AiConfig | null>(null);
  const [settings, setSettings] = useState(false);
  const [chat, setChat] = useState<ChatItem[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const agentRef = useRef<WebAgent | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.getAiConfig().then(setCfg).catch(console.error);
  }, []);

  // Novy agent pri zmene webu nebo konfigurace.
  useEffect(() => {
    if (cfg) agentRef.current = new WebAgent(cfg, rel);
    setChat([]);
  }, [rel, cfg]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [chat]);

  const push = (item: ChatItem) => setChat((c) => [...c, item]);

  const send = async () => {
    const text = input.trim();
    if (!text || busy || !agentRef.current) return;
    if (!cfg?.apiKey) { setSettings(true); return; }
    setInput("");
    push({ role: "user", text });
    setBusy(true);
    const cbs: AgentCallbacks = {
      onAssistant: (t) => push({ role: "assistant", text: t }),
      onTool: (name, info) => push({ role: "tool", text: `${iconFor(name)} ${labelFor(name)}: ${info}` }),
      onFileWritten: () => onFileWritten(),
      onError: (m) => push({ role: "error", text: m }),
    };
    await agentRef.current.send(text, cbs);
    setBusy(false);
  };

  return (
    <div className="ai-panel">
      <div className="ai-head">
        <strong>💬 AI asistent</strong>
        <span className="spacer" />
        <span className="muted" style={{ fontSize: 12 }}>{cfg ? cfg.model : "…"}</span>
        <button className="ghost" title="Nastavení AI" onClick={() => setSettings(true)}>⚙</button>
      </div>

      <div className="ai-msgs" ref={scrollRef}>
        {chat.length === 0 && (
          <div className="muted" style={{ fontSize: 13, padding: 8 }}>
            {cfg?.apiKey
              ? `Napiš, co na webu změnit — např. „změň hlavní barvu na zelenou" nebo „přidej sekci s ceníkem". Já přečtu a upravím soubory, náhled se sám obnoví.`
              : `Nejdřív nastav AI (tlačítko ⚙): vyber providera a vlož API klíč.`}
          </div>
        )}
        {chat.map((m, i) => (
          <div key={i} className={"ai-msg ai-" + m.role}>
            {m.role === "user" && <span className="ai-role">Ty</span>}
            {m.role === "assistant" && <span className="ai-role">AI</span>}
            <div className="ai-text">{m.text}</div>
          </div>
        ))}
        {busy && <div className="ai-msg ai-tool"><div className="ai-text">⏳ pracuji…</div></div>}
      </div>

      <div className="ai-input">
        <textarea
          rows={2}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send(); }}
          placeholder="Co změnit na webu? (Cmd/Ctrl+Enter odešle)"
          disabled={busy}
        />
        <button className="primary" onClick={send} disabled={busy || !input.trim()}>
          {busy ? "…" : "Odeslat"}
        </button>
      </div>

      {settings && cfg && (
        <AiSettings
          cfg={cfg}
          onClose={() => setSettings(false)}
          onSaved={(c) => { setCfg(c); setSettings(false); }}
        />
      )}
    </div>
  );
}

function AiSettings({ cfg, onClose, onSaved }: { cfg: AiConfig; onClose: () => void; onSaved: (c: AiConfig) => void }) {
  const [provider, setProvider] = useState(cfg.provider || "anthropic");
  const [baseUrl, setBaseUrl] = useState(cfg.baseUrl);
  const [model, setModel] = useState(cfg.model);
  const [apiKey, setApiKey] = useState(cfg.apiKey);
  const [showKey, setShowKey] = useState(false);

  const applyPreset = (p: typeof PRESETS[number]) => {
    setProvider(p.cfg.provider!);
    setBaseUrl(p.cfg.baseUrl!);
    setModel(p.cfg.model!);
  };

  const save = async () => {
    const c: AiConfig = { provider, baseUrl: baseUrl.trim(), model: model.trim(), apiKey: apiKey.trim() };
    await api.setAiConfig(c);
    onSaved(c);
  };

  return (
    <Modal
      title="Nastavení AI asistenta"
      width={520}
      onClose={onClose}
      footer={<>
        <button className="ghost" onClick={onClose}>Zrušit</button>
        <button className="primary" onClick={save}>Uložit</button>
      </>}
    >
      <div className="field">
        <label>Předvolby</label>
        <div className="preset-grid">
          {PRESETS.map((p) => (
            <button key={p.label} type="button" className="preset-card" onClick={() => applyPreset(p)}>
              <span>{p.label}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <label>Provider</label>
        <select value={provider} onChange={(e) => setProvider(e.target.value)}>
          <option value="anthropic">Anthropic (Messages API)</option>
          <option value="openai">OpenAI-compatible (OpenAI, OpenRouter, Ollama, LM Studio…)</option>
        </select>
      </div>
      <div className="field">
        <label>Base URL</label>
        <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.anthropic.com" />
      </div>
      <div className="field">
        <label>Model</label>
        <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="claude-opus-4-8" />
      </div>
      <div className="field">
        <label>API klíč <span className="muted">(uloží se šifrovaně v trezoru)</span></label>
        <div className="row" style={{ gap: 6 }}>
          <input type={showKey ? "text" : "password"} value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-…" />
          <button className="ghost" type="button" onClick={() => setShowKey((s) => !s)}>{showKey ? "Skrýt" : "Zobrazit"}</button>
        </div>
      </div>
      <div className="muted" style={{ fontSize: 12 }}>
        Anthropic klíč získáš na console.anthropic.com. Platí se per použití přes tvůj účet u providera.
      </div>
    </Modal>
  );
}

function iconFor(name: string) {
  return name === "write_file" ? "✏️" : name === "read_file" ? "📖" : "📁";
}
function labelFor(name: string) {
  return name === "write_file" ? "zápis" : name === "read_file" ? "čtení" : "výpis";
}
