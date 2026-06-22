import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useStore } from "../store/useStore";

export default function Unlock() {
  const setUnlocked = useStore((s) => s.setUnlocked);
  const [initialized, setInitialized] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.vaultStatus().then((s) => setInitialized(s.initialized));
  }, []);

  const submit = async () => {
    setError("");
    if (!initialized && password !== confirm) {
      setError("Hesla se neshodují.");
      return;
    }
    setBusy(true);
    try {
      if (initialized) await api.unlock(password);
      else await api.initialize(password);
      setUnlocked(true);
    } catch (e: any) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  if (initialized === null) return <div className="unlock-wrap muted">Načítání…</div>;

  return (
    <div className="unlock-wrap">
      <div className="unlock-card">
        <div className="h1">Project Hangar</div>
        <p className="muted">
          {initialized
            ? "Zadej master heslo pro odemčení trezoru."
            : "Vytvoř master heslo. Šifruje celý trezor — bez něj data nepřečteš."}
        </p>
        <div className="field">
          <label>Master heslo</label>
          <input
            type="password"
            value={password}
            autoFocus
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && initialized && submit()}
          />
        </div>
        {!initialized && (
          <div className="field">
            <label>Heslo znovu</label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
          </div>
        )}
        <button className="primary" style={{ width: "100%" }} onClick={submit} disabled={busy}>
          {busy ? "…" : initialized ? "Odemknout" : "Vytvořit trezor"}
        </button>
        {error && <div className="error">{error}</div>}
      </div>
    </div>
  );
}
