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

  // připojení tokenu
  const [token, setToken] = useState("");
  // vytvoření repa
  const [repoName, setRepoName] = useState(slug);
  const [isPrivate, setIsPrivate] = useState(true);

  const refresh = async () => {
    setLoading(true);
    setLogin(await gh.githubLogin());
    setLink(await gh.loadRepoLink(rel));
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
      setLogin(l); setToken(""); flash(`Připojeno jako ${l} ✓`);
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
      flash(`Staženo ${n} souborů ✓`);
      onPulled();
    } catch (e) { fail(e); } finally { setBusy(""); }
  };

  return (
    <Modal title="GitHub" width={520} onClose={onClose}
      footer={<button className="ghost" onClick={onClose}>Zavřít</button>}>
      {loading ? (
        <div className="muted">Načítání…</div>
      ) : !login ? (
        <>
          <div className="field">
            <label>Připojit GitHub (osobní token)</label>
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
              {busy === "connect" ? "Ověřuji…" : "Připojit"}
            </button>
            <button className="ghost" onClick={() => api.openExternalUrl("https://github.com/settings/tokens?type=beta")}>
              Otevřít GitHub
            </button>
          </div>
        </>
      ) : !link ? (
        <>
          <div className="muted" style={{ marginBottom: 12 }}>Připojeno jako <strong>{login}</strong>.</div>
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
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>
            Tip: web můžeš upravovat i mimo appku (Claude Code/VS Code), pushnout, pak zde dát <strong>Pull</strong> —
            změny se načtou zpět i do náhledu.
          </div>
        </>
      )}

      {status && <div style={{ color: "var(--ok)", marginTop: 12 }}>{status}</div>}
      {err && <div className="error" style={{ marginTop: 12 }}>{err}</div>}
    </Modal>
  );
}
