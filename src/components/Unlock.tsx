import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useStore } from "../store/useStore";
import { confirmDialog } from "./Modal";

const REMEMBER_KEY = "hangar_remember";
const VALID_USER = "tadeas";

export default function Unlock() {
  const setUnlocked = useStore((s) => s.setUnlocked);
  const [initialized, setInitialized] = useState<boolean | null>(null);
  const [username, setUsername] = useState("Tadeas");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const status = await api.vaultStatus();
      setInitialized(status.initialized);
      // auto-odemčení, pokud je zapamatováno
      if (status.initialized) {
        const raw = localStorage.getItem(REMEMBER_KEY);
        if (raw) {
          try {
            const { u, p } = JSON.parse(raw);
            setUsername(u || "Tadeas");
            await api.unlock(p);
            setUnlocked(true);
            return;
          } catch {
            localStorage.removeItem(REMEMBER_KEY); // špatné/staré heslo
          }
        }
      }
    })();
  }, []);

  const finish = (u: string, p: string) => {
    if (remember) localStorage.setItem(REMEMBER_KEY, JSON.stringify({ u, p }));
    else localStorage.removeItem(REMEMBER_KEY);
    setUnlocked(true);
  };

  const submit = async () => {
    setError("");
    if (username.trim().toLowerCase() !== VALID_USER) {
      setError("Neplatné uživatelské jméno.");
      return;
    }
    if (!initialized && password !== confirm) {
      setError("Hesla se neshodují.");
      return;
    }
    if (!password) {
      setError("Zadej heslo.");
      return;
    }
    setBusy(true);
    try {
      if (initialized) await api.unlock(password);
      else await api.initialize(password);
      finish(username.trim(), password);
    } catch (e: any) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    const ok = await confirmDialog({
      title: "Resetovat trezor?",
      message: "Smaže uložené tokeny a nastavení (GitHub, AI klíč). Tvoje weby ve složce sites/ zůstanou. Pak vytvoříš nové heslo.",
      confirmLabel: "Resetovat",
      danger: true,
    });
    if (!ok) return;
    await api.resetVault();
    localStorage.removeItem(REMEMBER_KEY);
    setInitialized(false);
    setPassword("");
    setConfirm("");
    setError("");
  };

  if (initialized === null) return <div className="unlock-wrap muted">Načítání…</div>;

  return (
    <div className="unlock-wrap">
      <div className="unlock-card">
        <div className="h1">Project Hangar</div>
        <p className="muted">
          {initialized ? "Přihlas se ke svému trezoru." : "Vytvoř přihlášení. Heslo šifruje celý trezor."}
        </p>

        <div className="field">
          <label>Uživatelské jméno</label>
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
        </div>
        <div className="field">
          <label>Heslo</label>
          <input
            type="password"
            value={password}
            autoFocus
            autoComplete="current-password"
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

        <label className="row" style={{ gap: 8, margin: "4px 0 14px" }}>
          <input type="checkbox" style={{ width: "auto" }} checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          <span style={{ fontSize: 14 }}>Pamatovat si mě na tomto zařízení</span>
        </label>

        <button className="primary" style={{ width: "100%" }} onClick={submit} disabled={busy}>
          {busy ? "…" : initialized ? "Přihlásit" : "Vytvořit"}
        </button>
        {error && <div className="error">{error}</div>}

        {initialized && (
          <div style={{ marginTop: 14, textAlign: "center" }}>
            <a href="#" className="muted" style={{ fontSize: 12 }} onClick={(e) => { e.preventDefault(); reset(); }}>
              Zapomenuté heslo / začít znovu
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
