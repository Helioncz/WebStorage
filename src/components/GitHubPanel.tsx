import { useEffect, useState } from "react";
import { api } from "../lib/api";
import * as gh from "../lib/github";
import { Modal } from "./Modal";

// GitHub modal pro jeden web: připojení, vytvoření repa, commit & push, pull.
export default function GitHubPanel({
  rel,
  slug,
  onClose,
  onPulled,
}: {
  rel: string;
  slug: string;
  onClose: () => void;
  onPulled: () => void;
}) {
  const [login, setLogin] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [link, setLink] = useState<gh.RepoLink | null>(null);
  const [busy, setBusy] = useState<string>("");
  const [msg, setMsg] = useState("Update z Hangaru");
  const [status, setStatus] = useState<string>("");
  const [err, setErr] = useState<string>("");
  const [syncUrl, setSyncUrl] = useState("");
  const [syncToken, setSyncToken] = useState("");
  const [syncHasToken, setSyncHasToken] = useState(false);
  const [syncEditing, setSyncEditing] = useState(false);

  // připojení / změna tokenu
  const [token, setToken] = useState("");
  const [changing, setChanging] = useState(false);
  // vytvoření repa
  const [repoName, setRepoName] = useState(slug);
  const [isPrivate, setIsPrivate] = useState(true);

  const refresh = async () => {
    setLoading(true);
    setLogin(await gh.githubLogin());
    setLink(await gh.loadRepoLink(rel));
    const sync = await api.getSyncConfig();
    setSyncUrl(sync.url);
    setSyncHasToken(sync.has_token);
    setLoading(false);
  };
  useEffect(() => { refresh(); }, [rel]);

  const flash = (m: string) => { setStatus(m); setErr(""); };
  const fail = (e: any) => { setErr(String(e?.message || e)); setStatus(""); };

  const connect = async () => {
    if (!token.trim()) return;
    setBusy("connect");
    try {
      await api.setGithubToken(token.trim());
      const l = await gh.githubLogin();
      if (!l) throw new Error("Token nefunguje — zkontroluj scope (repo).");
      setLogin(l); setToken(""); setChanging(false); flash(`Připojeno jako ${l} ✓`);
    } catch (e) { fail(e); } finally { setBusy(""); }
  };

  const createRepo = async () => {
    setBusy("create");
    try {
      const l = await gh.createRepo(repoName.trim(), isPrivate, `Web ${slug} z Hangaru`);
      await gh.saveRepoLink(rel, l);
      setLink(l);
      // hned nahraj soubory
      await gh.commitAndPush(rel, l, "Initial commit z Hangaru");
      flash(`Repozitář vytvořen a soubory nahrány ✓`);
    } catch (e) { fail(e); } finally { setBusy(""); }
  };

  const push = async () => {
    if (!link) return;
    setBusy("push");
    try {
      const sha = await gh.commitAndPush(rel, link, msg.trim() || "Update z Hangaru");
      flash(`Pushnuto ✓ (${sha.slice(0, 7)})`);
    } catch (e) { fail(e); } finally { setBusy(""); }
  };

  const pull = async () => {
    if (!link) return;
    setBusy("pull");
    try {
      const n = await gh.pull(rel, link);
      flash(n < 0 ? "Staženo z GitHubu ✓" : `Staženo ${n} souborů ✓`);
      onPulled();
    } catch (e) { fail(e); } finally { setBusy(""); }
  };

  const openDesktop = async () => {
    setBusy("desktop");
    try {
      await gh.linkLocalAndOpen(rel, "GitHub Desktop");
      flash("Otevřeno v GitHub Desktop ✓");
    } catch (e) { fail(e); } finally { setBusy(""); }
  };

  const saveSync = async () => {
    setBusy("sync-save");
    try {
      await api.setSyncConfig(syncUrl.trim(), syncToken.trim() || undefined);
      setSyncToken("");
      setSyncEditing(false);
      const sync = await api.getSyncConfig();
      setSyncUrl(sync.url);
      setSyncHasToken(sync.has_token);
      flash("Sync server uložen ✓");
    } catch (e) { fail(e); } finally { setBusy(""); }
  };

  const checkSync = async () => {
    if (!link) return;
    setBusy("sync-check");
    try {
      const result = await api.syncCheckLatest(rel);
      if (!result.latest) {
        flash("Sync server zatím nemá žádné webhook události pro toto repo.");
        return;
      }
      if (!result.changed) {
        flash(`Žádné nové změny. Poslední event #${result.latest_id}.`);
        return;
      }
      await gh.pull(rel, link);
      await api.syncMarkSeen(rel, result.latest_id);
      flash(`Nový commit ze sync serveru stažen ✓ (${result.latest?.after_sha?.slice?.(0, 7) || "commit"})`);
      onPulled();
    } catch (e) { fail(e); } finally { setBusy(""); }
  };

  return (
    <Modal title="GitHub" width={520} onClose={onClose}
      footer={<button className="ghost" onClick={onClose}>Zavřít</button>}>
      {loading ? (
        <div className="muted">Načítání…</div>
      ) : !login || changing ? (
        <>
          <div className="field">
            <label>{changing ? "Změnit GitHub token" : "Připojit GitHub (osobní token)"}</label>
            <input type="password" autoFocus value={token} onChange={(e) => setToken(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && connect()} placeholder="ghp_… / github_pat_…" />
          </div>
          <div className="muted" style={{ fontSize: 13 }}>
            Vytvoř <strong>fine-grained PAT</strong> na github.com → Settings → Developer settings →
            Personal access tokens, s oprávněním <code className="kbd">Contents: Read and write</code> a
            <code className="kbd">Administration: Read and write</code> (pro tvorbu repa). Uloží se šifrovaně v trezoru.
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            <button className="primary" onClick={connect} disabled={!token.trim() || busy === "connect"}>
              {busy === "connect" ? "Ověřuji…" : changing ? "Uložit token" : "Připojit"}
            </button>
            <button className="ghost" onClick={() => api.openExternalUrl("https://github.com/settings/tokens?type=beta")}>
              Otevřít GitHub
            </button>
            {changing && <button className="ghost" onClick={() => { setChanging(false); setToken(""); }}>Zrušit</button>}
          </div>
        </>
      ) : !link ? (
        <>
          <div className="row between" style={{ marginBottom: 12 }}>
            <span className="muted">Připojeno jako <strong>{login}</strong>.</span>
            <button className="ghost" onClick={() => setChanging(true)}>Změnit token</button>
          </div>
          <div className="field">
            <label>Název repozitáře</label>
            <input value={repoName} onChange={(e) => setRepoName(e.target.value)} />
          </div>
          <label className="row" style={{ gap: 8, marginBottom: 12 }}>
            <input type="checkbox" style={{ width: "auto" }} checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} />
            <span>Soukromý repozitář</span>
          </label>
          <button className="primary" onClick={createRepo} disabled={!repoName.trim() || busy === "create"}>
            {busy === "create" ? "Vytvářím a nahrávám…" : "Vytvořit repozitář + nahrát soubory"}
          </button>
        </>
      ) : (
        <>
          <div className="muted" style={{ marginBottom: 10 }}>
            Připojeno jako <strong>{login}</strong> · repo{" "}
            <a href="#" onClick={(e) => { e.preventDefault(); api.openExternalUrl(link.url); }}>{link.owner}/{link.repo}</a>
          </div>
          <div className="field">
            <label>Commit zpráva</label>
            <input value={msg} onChange={(e) => setMsg(e.target.value)} />
          </div>
          <div className="row" style={{ flexWrap: "wrap" }}>
            <button className="primary" onClick={push} disabled={!!busy}>
              {busy === "push" ? "Pushuji…" : "⬆ Commit & Push"}
            </button>
            <button className="ghost" onClick={pull} disabled={!!busy}>
              {busy === "pull" ? "Stahuji…" : "⬇ Pull z GitHubu"}
            </button>
            <button className="ghost" onClick={() => api.openExternalUrl(link.url)}>Otevřít repo</button>
            <button className="ghost" onClick={openDesktop} disabled={!!busy}>
              {busy === "desktop" ? "Otevírám…" : "⊞ GitHub Desktop"}
            </button>
            <button className="ghost" onClick={() => setChanging(true)}>Změnit token</button>
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>
            Tip: web můžeš upravovat i mimo appku (Claude Code/VS Code), pushnout, pak zde dát <strong>Pull</strong> —
            změny se načtou zpět i do náhledu.
          </div>

          <div className="card" style={{ marginTop: 14, marginBottom: 0 }}>
            <div className="row between" style={{ marginBottom: 8 }}>
              <div>
                <strong>Sync server</strong>
                <div className="muted" style={{ fontSize: 12 }}>
                  Přijímá GitHub webhooky a řekne Hangaru, kdy má stáhnout nové změny.
                </div>
              </div>
              {!syncEditing && (
                <button className="ghost" onClick={() => setSyncEditing(true)}>
                  {syncUrl && syncHasToken ? "Upravit" : "Nastavit"}
                </button>
              )}
            </div>

            {syncEditing || !syncUrl || !syncHasToken ? (
              <>
                <div className="field">
                  <label>Sync server URL</label>
                  <input value={syncUrl} onChange={(e) => setSyncUrl(e.target.value)} placeholder="https://hangar-sync.example.com" />
                </div>
                <div className="field">
                  <label>Sync token</label>
                  <input
                    type="password"
                    value={syncToken}
                    onChange={(e) => setSyncToken(e.target.value)}
                    placeholder={syncHasToken ? "Nech prázdné pro zachování tokenu" : "SYNC_API_TOKEN"}
                  />
                </div>
                <div className="row">
                  <button className="primary" onClick={saveSync} disabled={!syncUrl.trim() || busy === "sync-save"}>
                    {busy === "sync-save" ? "Ukládám…" : "Uložit sync"}
                  </button>
                  {syncEditing && <button className="ghost" onClick={() => { setSyncEditing(false); setSyncToken(""); }}>Zrušit</button>}
                </div>
              </>
            ) : (
              <>
                <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
                  Nastaveno: <code className="kbd">{syncUrl}</code>
                </div>
                <button className="ghost" onClick={checkSync} disabled={!!busy}>
                  {busy === "sync-check" ? "Kontroluji…" : "⟳ Zkontrolovat změny ze sync serveru"}
                </button>
              </>
            )}
          </div>
        </>
      )}

      {status && <div style={{ color: "var(--ok)", marginTop: 12 }}>{status}</div>}
      {err && <div className="error" style={{ marginTop: 12 }}>{err}</div>}
    </Modal>
  );
}
