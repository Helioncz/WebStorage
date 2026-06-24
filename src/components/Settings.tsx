import { useEffect, useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { api, AiConfig } from "../lib/api";
import * as gh from "../lib/github";
import { useStore, THEMES } from "../store/useStore";
import { confirmDialog } from "./Modal";

const THEME_LABEL: Record<string, string> = { dark: "Tmavý", light: "Světlý", ocean: "Oceán", rose: "Růžová" };

export default function Settings() {
  const { theme, setTheme } = useStore();
  const [root, setRoot] = useState("");
  const [ghLogin, setGhLogin] = useState<string | null>(null);
  const [ghToken, setGhToken] = useState("");
  const [netlify, setNetlify] = useState(false);
  const [nfToken, setNfToken] = useState("");
  const [ai, setAi] = useState<AiConfig | null>(null);
  const [version, setVersion] = useState("");
  const [msg, setMsg] = useState("");
  const [displayName, setDisplayName] = useState(localStorage.getItem("displayName") || "Lokální uživatel");

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(""), 2500); };

  const load = () => {
    api.getSitesRoot().then((c) => setRoot(c.root));
    gh.githubLogin().then(setGhLogin);
    api.netlifyHasToken().then(setNetlify);
    api.getAiConfig().then(setAi);
    api.appVersion().then(setVersion);
    setDisplayName(localStorage.getItem("displayName") || "Lokální uživatel");
  };
  useEffect(load, []);

  const changeRoot = async () => {
    const p = await open({ directory: true, multiple: false });
    if (!p || Array.isArray(p)) return;
    await api.setSitesRoot(p); setRoot(p); flash("Složka uložena ✓");
  };
  const connectGh = async () => {
    if (!ghToken.trim()) return;
    await api.setGithubToken(ghToken.trim());
    const l = await gh.githubLogin();
    setGhLogin(l); setGhToken("");
    flash(l ? `GitHub připojen jako ${l} ✓` : "Token nefunguje");
  };
  const connectNf = async () => {
    if (!nfToken.trim()) return;
    await api.setNetlifyToken(nfToken.trim()); setNfToken(""); setNetlify(true); flash("Netlify připojeno ✓");
  };
  const saveAi = async () => { if (ai) { await api.setAiConfig(ai); flash("AI uloženo ✓"); } };
  const backup = async () => {
    const dest = await save({ defaultPath: "hangar-zaloha.zip", filters: [{ name: "ZIP", extensions: ["zip"] }] });
    if (!dest) return;
    await api.backupVault(dest); flash("Záloha trezoru uložena ✓");
  };
  const reset = async () => {
    const ok = await confirmDialog({ title: "Resetovat trezor?", message: "Smaže tokeny a nastavení (weby v sites/ zůstanou). Appka se odhlásí.", confirmLabel: "Resetovat", danger: true });
    if (!ok) return;
    await api.resetVault();
    localStorage.removeItem("hangar_remember");
    useStore.getState().setUnlocked(false);
  };

  const setAiField = (k: keyof AiConfig, v: string) => setAi((a) => (a ? { ...a, [k]: v } : a));
  const saveProfile = () => {
    localStorage.setItem("displayName", displayName.trim() || "Lokální uživatel");
    useStore.getState().refresh();
    flash("Profil uložen ✓");
  };

  return (
    <div className="content">
      <div className="h1">Nastavení</div>
      {msg && <div className="card" style={{ color: "var(--ok)" }}>{msg}</div>}

      <div className="section-title">Profil</div>
      <div className="card">
        <div className="grid2">
          <div className="field">
            <label>Zobrazované jméno</label>
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveProfile()} />
          </div>
          <div className="field">
            <label>Režim účtu</label>
            <input disabled value="Lokální trezor (cloud profily zatím vypnuté)" />
          </div>
        </div>
        <div className="row">
          <button className="primary" onClick={saveProfile}>Uložit profil</button>
          <button className="ghost" onClick={async () => { await api.lock(); useStore.getState().setUnlocked(false); }}>Odhlásit / zamknout</button>
        </div>
      </div>

      <div className="section-title">Vzhled</div>
      <div className="card">
        <div className="theme-palette">
          {THEMES.map((t) => (
            <button key={t} className={"theme-chip theme-" + t + (t === theme ? " active" : "")} onClick={() => setTheme(t)}>
              <span />
              {THEME_LABEL[t] || t}
            </button>
          ))}
        </div>
      </div>

      <div className="section-title">Složka s weby</div>
      <div className="card">
        <div className="row between">
          <code className="kbd" style={{ wordBreak: "break-all" }}>{root || "—"}</code>
          <button className="ghost" onClick={changeRoot}>Změnit…</button>
        </div>
      </div>

      <div className="section-title">GitHub</div>
      <div className="card">
        {ghLogin ? (
          <div className="row between"><span className="muted">Připojeno jako <strong>{ghLogin}</strong></span>
            <button className="ghost" onClick={() => setGhLogin(null)}>Změnit token</button></div>
        ) : (
          <div className="row" style={{ gap: 8 }}>
            <input type="password" value={ghToken} onChange={(e) => setGhToken(e.target.value)} placeholder="github_pat_… / ghp_…" />
            <button className="primary" onClick={connectGh} disabled={!ghToken.trim()}>Připojit</button>
          </div>
        )}
      </div>

      <div className="section-title">Netlify (deploy)</div>
      <div className="card">
        {netlify ? (
          <div className="row between"><span className="muted">Připojeno ✓</span>
            <button className="ghost" onClick={() => setNetlify(false)}>Změnit token</button></div>
        ) : (
          <div className="row" style={{ gap: 8 }}>
            <input type="password" value={nfToken} onChange={(e) => setNfToken(e.target.value)} placeholder="nfp_…" />
            <button className="primary" onClick={connectNf} disabled={!nfToken.trim()}>Připojit</button>
          </div>
        )}
      </div>

      <div className="section-title">AI asistent</div>
      <div className="card">
        {ai && (
          <>
            <div className="grid2">
              <div className="field"><label>Provider</label>
                <select value={ai.provider} onChange={(e) => setAiField("provider", e.target.value)}>
                  <option value="anthropic">Anthropic (Claude)</option>
                  <option value="openai">OpenAI-compatible</option>
                </select>
              </div>
              <div className="field"><label>Model</label>
                <input value={ai.model} onChange={(e) => setAiField("model", e.target.value)} placeholder="claude-opus-4-8" />
              </div>
            </div>
            <div className="field"><label>Base URL</label>
              <input value={ai.baseUrl} onChange={(e) => setAiField("baseUrl", e.target.value)} /></div>
            <div className="field"><label>API klíč</label>
              <input type="password" value={ai.apiKey} onChange={(e) => setAiField("apiKey", e.target.value)} placeholder="sk-…" /></div>
            <button className="primary" onClick={saveAi}>Uložit AI</button>
          </>
        )}
      </div>

      <div className="section-title">Záloha a obnova</div>
      <div className="card">
        <p className="muted" style={{ fontSize: 13, marginBottom: 10 }}>Trezor obsahuje tokeny, AI klíč a nastavení. Zálohu ulož na bezpečné místo.</p>
        <button className="primary" onClick={backup}>💾 Zálohovat trezor</button>
        <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>Obnova: zazipované soubory rozbal zpět do složky trezoru (cesta v Nápovědě).</div>
      </div>

      <div className="section-title">O aplikaci</div>
      <div className="card">
        <div className="muted">Project Hangar — verze <strong>{version || "…"}</strong></div>
        <button className="ghost danger" style={{ marginTop: 10 }} onClick={reset}>Resetovat trezor / odhlásit</button>
      </div>
    </div>
  );
}
