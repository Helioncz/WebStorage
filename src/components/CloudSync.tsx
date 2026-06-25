import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useStore } from "../store/useStore";

// Cloud sync přes Supabase — E2E šifrovaný snapshot celého trezoru.
// Server vidí jen ciphertext; klíč se odvozuje z master hesla.

export default function CloudSync({ onClose }: { onClose: () => void }) {
  const [status, setStatus] = useState<Awaited<ReturnType<typeof api.cloudStatus>> | null>(null);
  const [remote, setRemote] = useState<Awaited<ReturnType<typeof api.cloudRemoteInfo>> | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  // Form
  const [url, setUrl] = useState("");
  const [anonKey, setAnonKey] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [bucket, setBucket] = useState("vaults");

  const loadStatus = async () => {
    const s = await api.cloudStatus();
    setStatus(s);
    setEditing(!s.configured);
    if (s.url) setUrl(s.url);
    if (s.email) setEmail(s.email);
    if (s.bucket) setBucket(s.bucket);
  };

  useEffect(() => {
    loadStatus().catch((e) => setMsg({ kind: "err", text: String(e) }));
  }, []);

  const saveConfig = async () => {
    setBusy("save");
    setMsg(null);
    try {
      await api.cloudSetConfig({ url, anonKey, email, password, bucket });
      const res = await api.cloudTest();
      setMsg({ kind: "ok", text: res });
      setEditing(false);
      await loadStatus();
    } catch (e) {
      setMsg({ kind: "err", text: String(e) });
    } finally {
      setBusy("");
    }
  };

  const refreshRemote = async () => {
    setBusy("remote");
    setMsg(null);
    try {
      setRemote(await api.cloudRemoteInfo());
    } catch (e) {
      setMsg({ kind: "err", text: String(e) });
    } finally {
      setBusy("");
    }
  };

  const push = async () => {
    if (!confirm("Nahrát aktuální stav trezoru do cloudu? Přepíše předchozí snapshot.")) return;
    setBusy("push");
    setMsg(null);
    try {
      const r = await api.cloudPush();
      setMsg({ kind: "ok", text: `Nahráno (${(r.size / 1024 / 1024).toFixed(2)} MB).` });
      await loadStatus();
      await refreshRemote();
    } catch (e) {
      setMsg({ kind: "err", text: String(e) });
    } finally {
      setBusy("");
    }
  };

  const pull = async () => {
    if (
      !confirm(
        "Stáhnout trezor z cloudu a PŘEPSAT lokální data? Tuto akci nelze vrátit. " +
          "Po dokončení se trezor zamkne a přihlásíš se znovu."
      )
    )
      return;
    setBusy("pull");
    setMsg(null);
    try {
      await api.cloudPull();
      // Po pullu je trezor zamčený (nová sůl) — vrátíme se na odemčení.
      useStore.getState().setUnlocked(false);
    } catch (e) {
      setMsg({ kind: "err", text: String(e) });
      setBusy("");
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="row between">
          <strong>☁ Cloud sync (Supabase)</strong>
          <button className="ghost" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="muted" style={{ fontSize: 12, margin: "6px 0 12px" }}>
          Celý trezor se nahrává <strong>end-to-end šifrovaný</strong> — Supabase nikdy nevidí
          tvá hesla ani data. Klíč se odvozuje z master hesla.
        </div>

        {msg && (
          <div
            style={{
              fontSize: 13,
              marginBottom: 10,
              color: msg.kind === "ok" ? "var(--ok, #3ecf8e)" : "var(--danger, #e44)",
            }}
          >
            {msg.kind === "ok" ? "✅ " : "⚠️ "}
            {msg.text}
          </div>
        )}

        {editing ? (
          <>
            <div className="field">
              <label>Supabase Project URL</label>
              <input
                placeholder="https://xxxx.supabase.co"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </div>
            <div className="field">
              <label>Anon (public) key</label>
              <input value={anonKey} onChange={(e) => setAnonKey(e.target.value)} />
            </div>
            <div className="field">
              <label>E-mail (Supabase účet)</label>
              <input value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="field">
              <label>Heslo (Supabase účet)</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="field">
              <label>Bucket</label>
              <input value={bucket} onChange={(e) => setBucket(e.target.value)} />
            </div>
            <div className="row">
              <button className="primary" disabled={busy === "save"} onClick={saveConfig}>
                {busy === "save" ? "Ověřuji…" : "Uložit a otestovat"}
              </button>
              {status?.configured && (
                <button className="ghost" onClick={() => setEditing(false)}>
                  Zpět
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="list-item">
              <span>🔗</span>
              <div>
                <div>{status?.email}</div>
                <div className="muted" style={{ fontSize: 12 }}>
                  {status?.url} · bucket {status?.bucket}
                </div>
              </div>
              <span className="spacer" />
              <button className="ghost" onClick={() => setEditing(true)}>
                Upravit
              </button>
            </div>

            <div className="muted" style={{ fontSize: 12, margin: "10px 0 4px" }}>
              Poslední nahrání:{" "}
              {status?.last_synced
                ? status.last_synced.replace("T", " ").slice(0, 16)
                : "zatím nikdy"}
            </div>

            {remote && (
              <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
                {remote.exists
                  ? `V cloudu: ${remote.updated_at?.replace("T", " ").slice(0, 16)} · ${
                      remote.device
                    } · ${((remote.size || 0) / 1024 / 1024).toFixed(2)} MB`
                  : "V cloudu zatím není žádný snapshot."}
              </div>
            )}

            <div className="row" style={{ marginTop: 10, flexWrap: "wrap" }}>
              <button className="primary" disabled={busy === "push"} onClick={push}>
                {busy === "push" ? "Nahrávám…" : "⬆ Nahrát do cloudu"}
              </button>
              <button className="ghost" disabled={busy === "pull"} onClick={pull}>
                {busy === "pull" ? "Stahuji…" : "⬇ Stáhnout z cloudu"}
              </button>
              <button className="ghost" disabled={busy === "remote"} onClick={refreshRemote}>
                {busy === "remote" ? "…" : "Zjistit stav cloudu"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
