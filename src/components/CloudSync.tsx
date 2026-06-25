import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useStore } from "../store/useStore";
import { Modal, confirmDialog } from "./Modal";

// Cloud účet (Supabase) — E2E šifrovaná synchronizace trezoru.
// Hostuje majitel appky; uživatel je přihlášený přes Unlock obrazovku.

export default function CloudSync({ onClose }: { onClose: () => void }) {
  const [status, setStatus] = useState<Awaited<ReturnType<typeof api.cloudStatus>> | null>(null);
  const [remote, setRemote] = useState<Awaited<ReturnType<typeof api.cloudRemoteInfo>> | null>(null);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const refresh = useStore((s) => s.refresh);

  const load = async () => {
    setStatus(await api.cloudStatus());
  };
  useEffect(() => {
    load().catch((e) => setMsg({ kind: "err", text: String(e) }));
  }, []);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setMsg(null);
    try {
      await fn();
    } catch (e) {
      setMsg({ kind: "err", text: String(e) });
    } finally {
      setBusy("");
    }
  };

  const push = () =>
    run("push", async () => {
      const r = await api.cloudPush();
      setMsg({ kind: "ok", text: `Nahráno (${(r.size / 1024 / 1024).toFixed(2)} MB).` });
      await load();
    });

  const pull = () =>
    run("pull", async () => {
      const ok = await confirmDialog({
        title: "Stáhnout z cloudu?",
        message: "Přepíše lokální data verzí z cloudu. Tuto akci nelze vrátit.",
        confirmLabel: "Stáhnout",
        danger: true,
      });
      if (!ok) return;
      await api.cloudPull();
      setMsg({ kind: "ok", text: "Trezor stažen z cloudu." });
      refresh();
    });

  const remoteInfo = () =>
    run("remote", async () => {
      setRemote(await api.cloudRemoteInfo());
    });

  const logout = async () => {
    const ok = await confirmDialog({
      title: "Odhlásit se?",
      message: "Trezor se uzavře a budeš se muset znovu přihlásit.",
      confirmLabel: "Odhlásit",
    });
    if (!ok) return;
    localStorage.removeItem("hangar_remember");
    await api.cloudLogout();
    useStore.getState().setUnlocked(false);
  };

  return (
    <Modal title="☁ Cloud účet" onClose={onClose}>
      <div className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
        Tvůj trezor se nahrává <strong>end-to-end šifrovaný</strong> — server ani provozovatel
        tvá data nevidí. Klíč se odvozuje z tvého hesla.
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

      <div className="list-item">
        <span>👤</span>
        <div>
          <div>{status?.email || "—"}</div>
          <div className="muted" style={{ fontSize: 12 }}>
            {status?.signed_in ? "Přihlášen" : "Nepřihlášen"}
          </div>
        </div>
        <span className="spacer" />
        <button className="ghost danger" onClick={logout}>
          Odhlásit
        </button>
      </div>

      <div className="muted" style={{ fontSize: 12, margin: "10px 0 4px" }}>
        Poslední nahrání:{" "}
        {status?.last_synced ? status.last_synced.replace("T", " ").slice(0, 16) : "zatím nikdy"}
      </div>
      {remote && (
        <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
          {remote.exists
            ? `V cloudu: ${remote.updated_at?.replace("T", " ").slice(0, 16)} · ${remote.device} · ${(
                (remote.size || 0) /
                1024 /
                1024
              ).toFixed(2)} MB`
            : "V cloudu zatím není žádný snapshot."}
        </div>
      )}

      <div className="row" style={{ marginTop: 12, flexWrap: "wrap" }}>
        <button className="primary" disabled={busy === "push"} onClick={push}>
          {busy === "push" ? "Nahrávám…" : "⬆ Nahrát do cloudu"}
        </button>
        <button className="ghost" disabled={busy === "pull"} onClick={pull}>
          {busy === "pull" ? "Stahuji…" : "⬇ Stáhnout z cloudu"}
        </button>
        <button className="ghost" disabled={busy === "remote"} onClick={remoteInfo}>
          {busy === "remote" ? "…" : "Stav cloudu"}
        </button>
      </div>
    </Modal>
  );
}
