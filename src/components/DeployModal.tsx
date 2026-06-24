import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Modal } from "./Modal";

// Publikace webu na Netlify (one-click) přes osobní token.
export default function DeployModal({ rel, onClose, onDeployed }: { rel: string; onClose: () => void; onDeployed: (url: string) => void }) {
  const [hasToken, setHasToken] = useState<boolean | null>(null);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState("");
  const [liveUrl, setLiveUrl] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    api.netlifyHasToken().then(setHasToken);
    api.getDeployUrl(rel).then((u) => setLiveUrl(u || ""));
  }, [rel]);

  const connect = async () => {
    if (!token.trim()) return;
    setBusy("connect"); setErr("");
    try {
      await api.setNetlifyToken(token.trim());
      setHasToken(true); setToken("");
    } catch (e: any) { setErr(String(e?.message || e)); } finally { setBusy(""); }
  };

  const deploy = async () => {
    setBusy("deploy"); setErr("");
    try {
      const url = await api.netlifyDeploy(rel);
      setLiveUrl(url);
      onDeployed(url);
    } catch (e: any) { setErr(String(e?.message || e)); } finally { setBusy(""); }
  };

  return (
    <Modal title="Publikovat web" width={500} onClose={onClose}
      footer={<button className="ghost" onClick={onClose}>Zavřít</button>}>
      {hasToken === null ? (
        <div className="muted">Načítání…</div>
      ) : !hasToken ? (
        <>
          <div className="field">
            <label>Netlify token (jednorázově)</label>
            <input type="password" autoFocus value={token} onChange={(e) => setToken(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && connect()} placeholder="nfp_…" />
          </div>
          <div className="muted" style={{ fontSize: 12 }}>
            Vytvoř na <a href="#" onClick={(e) => { e.preventDefault(); api.openExternalUrl("https://app.netlify.com/user/applications#personal-access-tokens"); }}>
            app.netlify.com → User settings → Applications → Personal access tokens</a>. Uloží se šifrovaně v trezoru.
          </div>
          <button className="primary" style={{ marginTop: 12 }} onClick={connect} disabled={!token.trim() || busy === "connect"}>
            {busy === "connect" ? "Ukládám…" : "Připojit Netlify"}
          </button>
        </>
      ) : (
        <>
          <p className="muted">Web se zazipuje a nahraje na Netlify. První deploy vytvoří novou stránku, další ji aktualizují.</p>
          {liveUrl && (
            <div className="card" style={{ marginBottom: 12 }}>
              <div className="muted" style={{ fontSize: 12 }}>Živá adresa</div>
              <a href="#" onClick={(e) => { e.preventDefault(); api.openExternalUrl(liveUrl); }}>{liveUrl}</a>
            </div>
          )}
          <div className="row">
            <button className="primary" onClick={deploy} disabled={!!busy}>
              {busy === "deploy" ? "Publikuji…" : liveUrl ? "🚀 Znovu publikovat" : "🚀 Publikovat na Netlify"}
            </button>
            {liveUrl && <button className="ghost" onClick={() => api.openExternalUrl(liveUrl)}>Otevřít</button>}
            {liveUrl && <button className="ghost" onClick={() => navigator.clipboard.writeText(liveUrl)}>Kopírovat odkaz</button>}
          </div>
        </>
      )}
      {err && <div className="error" style={{ marginTop: 10 }}>{err}</div>}
    </Modal>
  );
}
