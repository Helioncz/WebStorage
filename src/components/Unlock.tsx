import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useStore } from "../store/useStore";

const EMAIL_KEY = "hangar_email";
const REMEMBER_KEY = "hangar_remember"; // { email, password } — pro "zůstat přihlášen"

export default function Unlock() {
  const setUnlocked = useStore((s) => s.setUnlocked);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [email, setEmail] = useState(localStorage.getItem(EMAIL_KEY) || "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      let conf = false;
      try {
        conf = (await api.cloudStatus()).configured;
      } catch {
        /* offline — zkusíme přesto auto-login z cache */
      }
      setConfigured(conf);
      // Auto-přihlášení, pokud je zapamatováno.
      const raw = localStorage.getItem(REMEMBER_KEY);
      if (raw) {
        try {
          const { email: e, password: p } = JSON.parse(raw);
          if (e && p) {
            await api.cloudLogin(e, p);
            setUnlocked(true);
            return;
          }
        } catch {
          localStorage.removeItem(REMEMBER_KEY);
        }
      }
    })();
  }, []);

  const persist = (e: string, p: string) => {
    localStorage.setItem(EMAIL_KEY, e);
    if (remember) localStorage.setItem(REMEMBER_KEY, JSON.stringify({ email: e, password: p }));
    else localStorage.removeItem(REMEMBER_KEY);
  };

  const submit = async () => {
    setError("");
    if (!email.trim() || !/.+@.+\..+/.test(email)) {
      setError("Zadej platný e-mail.");
      return;
    }
    if (!password) {
      setError("Zadej heslo.");
      return;
    }
    if (mode === "register") {
      if (password.length < 8) {
        setError("Heslo musí mít alespoň 8 znaků.");
        return;
      }
      if (password !== confirm) {
        setError("Hesla se neshodují.");
        return;
      }
    }
    setBusy(true);
    try {
      if (mode === "register") await api.cloudRegister(email.trim(), password);
      else await api.cloudLogin(email.trim(), password);
      persist(email.trim(), password);
      setUnlocked(true);
    } catch (e: any) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  if (configured === null) return <div className="unlock-wrap muted">Načítání…</div>;

  return (
    <div className="unlock-wrap">
      <div className="unlock-card">
        <div className="h1">Project Hangar</div>
        <p className="muted">
          {mode === "login"
            ? "Přihlas se ke svému účtu."
            : "Vytvoř si účet. Heslo šifruje tvá data — nikdo jiný je nepřečte."}
        </p>

        {!configured && (
          <div className="error" style={{ marginBottom: 12 }}>
            ⚠️ Cloud zatím není nakonfigurovaný (majitel appky musí doplnit Supabase údaje do
            <code className="kbd"> cloud_config.rs</code>).
          </div>
        )}

        <div className="field">
          <label>E-mail</label>
          <input
            type="email"
            value={email}
            autoFocus
            autoComplete="email"
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="field">
          <label>Heslo</label>
          <input
            type="password"
            value={password}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && mode === "login" && submit()}
          />
        </div>
        {mode === "register" && (
          <div className="field">
            <label>Heslo znovu</label>
            <input
              type="password"
              value={confirm}
              autoComplete="new-password"
              onChange={(e) => setConfirm(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
          </div>
        )}

        <label className="row" style={{ gap: 8, margin: "4px 0 12px" }}>
          <input
            type="checkbox"
            style={{ width: "auto" }}
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
          />
          <span style={{ fontSize: 14 }}>Zůstat přihlášen na tomto zařízení</span>
        </label>

        <button
          className="primary"
          style={{ width: "100%", marginTop: 6 }}
          onClick={submit}
          disabled={busy || !configured}
        >
          {busy ? "…" : mode === "login" ? "Přihlásit" : "Vytvořit účet"}
        </button>
        {error && <div className="error">{error}</div>}

        <div style={{ marginTop: 16, textAlign: "center", fontSize: 13 }}>
          {mode === "login" ? (
            <span className="muted">
              Nemáš účet?{" "}
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  setMode("register");
                  setError("");
                }}
              >
                Zaregistruj se
              </a>
            </span>
          ) : (
            <span className="muted">
              Už máš účet?{" "}
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  setMode("login");
                  setError("");
                }}
              >
                Přihlas se
              </a>
            </span>
          )}
        </div>
        <p className="muted" style={{ fontSize: 11, marginTop: 14, textAlign: "center" }}>
          Tvá data jsou end-to-end šifrovaná. Při zapomenutí hesla je nelze obnovit.
        </p>
      </div>
    </div>
  );
}
