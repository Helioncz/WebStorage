import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { api, Row } from "../lib/api";
import { useStore } from "../store/useStore";

// Website Import & Redesign Assistant — načte zdroj, zanalyzuje a založí nový
// projekt webu (scaffolding + PROMPT_PRO_CLAUDE.md). Cílem je redesign, ne kopie.

const MODES = [
  { key: "static", label: "Statický HTML/CSS/JS", hint: "okamžitý live preview" },
  { key: "react", label: "React / Vite", hint: "interaktivní web" },
  { key: "analyze", label: "Pouze analyzovat", hint: "bez scaffoldingu" },
  { key: "prompt", label: "Jen prompt", hint: "pro Claude Code" },
] as const;

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40);
}

export default function Redesign() {
  const { refresh, openProject, openSiteInWorkspace } = useStore();

  const [sourceType, setSourceType] = useState<"url" | "folder">("url");
  const [url, setUrl] = useState("");
  const [folder, setFolder] = useState("");
  const [targetDir, setTargetDir] = useState("");
  const [slug, setSlug] = useState("");
  const [mode, setMode] = useState<string>("static");
  const [templates, setTemplates] = useState<Row[]>([]);
  const [templateNote, setTemplateNote] = useState("");

  // Akce po vytvoření
  const [addToProjects, setAddToProjects] = useState(true);
  const [initGit, setInitGit] = useState(true);
  const [makeGithub, setMakeGithub] = useState(false);
  const [openClaude, setOpenClaude] = useState(true);
  const [openApp, setOpenApp] = useState("");

  const [analysis, setAnalysis] = useState<Row | null>(null);
  const [result, setResult] = useState<{ project_dir: string; files: string[]; log: string[]; site_rel?: string } | null>(null);
  const [busy, setBusy] = useState("");
  const [log, setLog] = useState<string[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    api.listSiteTemplates?.().then(setTemplates).catch(() => {});
  }, []);

  const addLog = (m: string) => setLog((l) => [...l, m]);
  const pickFolder = async (setter: (v: string) => void, title: string) => {
    const dir = await open({ directory: true, title });
    if (typeof dir === "string") setter(dir);
  };

  const analyze = async () => {
    setError("");
    setResult(null);
    const src = sourceType === "url" ? url.trim() : folder.trim();
    if (!src) {
      setError(sourceType === "url" ? "Zadej URL." : "Vyber složku.");
      return;
    }
    setBusy("analyze");
    addLog(`Analyzuji ${src}…`);
    try {
      const a = await api.redesignAnalyze(src, sourceType);
      setAnalysis(a);
      if (!slug) setSlug(slugify(a.title || src) || "redesign");
      addLog(`Hotovo: ${a.headings?.length || 0} nadpisů, ${a.images?.length || 0} obrázků, ${a.colors?.length || 0} barev.`);
    } catch (e) {
      setError(String(e));
      addLog(`Chyba: ${e}`);
    } finally {
      setBusy("");
    }
  };

  const create = async () => {
    if (!analysis) return;
    setError("");
    setBusy("create");
    const effSlug = slug || "redesign";
    addLog(`Vytvářím projekt „${effSlug}“ (režim ${mode})…`);
    try {
      const opts: Row = { mode, slug: effSlug, template_note: templateNote || undefined, init_git: initGit };
      const r = await api.redesignCreate(analysis, opts, targetDir || undefined);
      setResult(r);
      r.log.forEach(addLog);
      addLog(`✅ Soubory: ${r.project_dir}`);

      // GitHub repozitář
      if (makeGithub) {
        addLog("Zakládám GitHub repozitář…");
        try {
          const repoUrl = await api.redesignGithub(r.project_dir, effSlug);
          addLog(`GitHub: ${repoUrl}`);
        } catch (e) {
          addLog(`GitHub se nepodařil: ${e}`);
        }
      }

      // Přidat jako Projekt do trezoru
      let projectId: string | null = null;
      if (addToProjects) {
        projectId = await api.createProject(analysis.title || effSlug, undefined, "web");
        await api.saveLink(projectId, "Zdroj redesignu", analysis.source, sourceType === "url" ? "web" : "doc");
        // Propojení projekt ↔ web (kvůli společnému mazání).
        if (r.site_rel) await api.saveLink(projectId, r.site_rel, r.site_rel, "site");
        addLog("Přidáno do Projektů.");
      }

      // Otevřít v Claude Code / editoru
      if (openClaude) {
        try {
          const m = await api.redesignOpenClaude(r.project_dir);
          addLog(m);
        } catch (e) {
          addLog(`Otevření se nepodařilo: ${e}`);
        }
      } else if (openApp) {
        await api.redesignOpen(r.project_dir, openApp);
        addLog(`Otevřeno v: ${openApp}`);
      }

      refresh();
      // Navigace: do Projektů (pokud vznikl projekt), jinak na live preview.
      if (projectId) openProject(projectId);
      else if (r.site_rel && mode === "static") openSiteInWorkspace(r.site_rel);
    } catch (e) {
      setError(String(e));
      addLog(`Chyba: ${e}`);
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="content rd">
      <div className="rd-hero">
        <div className="rd-hero-badge">🪄 Website Import &amp; Redesign</div>
        <h1 className="rd-hero-title">Ze starého webu nový, moderní projekt</h1>
        <p className="rd-hero-sub">
          Zadej URL nebo složku, appka web zanalyzuje a založí čistý projekt s promptem pro Claude Code.
        </p>
      </div>

      <div className="rd-warn">
        <strong>⚠️ Používej jen pro weby, které vlastníš nebo máš povolení zpracovat.</strong>
        <span>Aplikace neobchází přihlášení, paywally ani CAPTCHA. Převzatý obsah je označen „ke kontrole“.</span>
      </div>

      {/* Krok 1 — zdroj */}
      <section className="rd-step">
        <div className="rd-step-head"><span className="rd-num">1</span><h3>Zdroj</h3></div>
        <div className="rd-segment">
          {(["url", "folder"] as const).map((t) => (
            <button key={t} className={"rd-seg" + (sourceType === t ? " on" : "")} onClick={() => setSourceType(t)}>
              {t === "url" ? "🌐 Z URL" : "📁 Z lokální složky"}
            </button>
          ))}
        </div>
        {sourceType === "url" ? (
          <div className="field">
            <label>URL webu</label>
            <input value={url} placeholder="https://www.muj-web.cz" onChange={(e) => setUrl(e.target.value)} />
          </div>
        ) : (
          <div className="field">
            <label>Složka s webem</label>
            <div className="row">
              <input value={folder} placeholder="Vyber složku…" onChange={(e) => setFolder(e.target.value)} style={{ flex: 1 }} />
              <button className="ghost" onClick={() => pickFolder(setFolder, "Vyber složku webu")}>Procházet…</button>
            </div>
          </div>
        )}
        <button className="primary rd-cta" onClick={analyze} disabled={busy === "analyze"}>
          {busy === "analyze" ? "Analyzuji…" : "Analyzovat web"}
        </button>
      </section>

      {/* Krok 2 — analýza */}
      {analysis && (
        <section className="rd-step">
          <div className="rd-step-head"><span className="rd-num">2</span><h3>Analýza</h3></div>
          <div className="rd-stats">
            <div className="rd-stat"><b>{analysis.headings?.length || 0}</b><span>nadpisů</span></div>
            <div className="rd-stat"><b>{analysis.texts?.length || 0}</b><span>textů</span></div>
            <div className="rd-stat"><b>{analysis.images?.length || 0}</b><span>obrázků</span></div>
            <div className="rd-stat"><b>{analysis.links?.length || 0}</b><span>odkazů</span></div>
            <div className="rd-stat"><b>{analysis.sections?.length || 0}</b><span>sekcí</span></div>
          </div>
          <div className="rd-meta">
            <div><span className="muted">Název:</span> {analysis.title || "—"}</div>
            <div><span className="muted">Jazyk:</span> {analysis.lang || "—"}</div>
          </div>
          {analysis.colors?.length > 0 && (
            <div className="rd-colors">
              {analysis.colors.map((c: string) => (
                <span key={c} title={c} className="rd-swatch" style={{ background: c }} />
              ))}
            </div>
          )}
          {(analysis.emails?.length > 0 || analysis.phones?.length > 0) && (
            <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
              Kontakty (veřejné): {[...(analysis.emails || []), ...(analysis.phones || [])].join(" · ")}
            </div>
          )}
        </section>
      )}

      {/* Krok 3 — nový projekt */}
      {analysis && (
        <section className="rd-step">
          <div className="rd-step-head"><span className="rd-num">3</span><h3>Nový projekt</h3></div>

          <div className="rd-modes">
            {MODES.map((m) => (
              <button key={m.key} className={"rd-mode" + (mode === m.key ? " on" : "")} onClick={() => setMode(m.key)}>
                <b>{m.label}</b>
                <span>{m.hint}</span>
              </button>
            ))}
          </div>

          <div className="grid2">
            <div className="field">
              <label>Název složky projektu</label>
              <input value={slug} onChange={(e) => setSlug(slugify(e.target.value))} />
            </div>
            <div className="field">
              <label>Cílová složka (volitelné)</label>
              <div className="row">
                <input value={targetDir} placeholder="výchozí: sites/" onChange={(e) => setTargetDir(e.target.value)} style={{ flex: 1 }} />
                <button className="ghost" onClick={() => pickFolder(setTargetDir, "Cílová složka")}>…</button>
              </div>
            </div>
          </div>

          {templates.length > 0 && (
            <div className="field">
              <label>Šablona / cílový styl (do promptu)</label>
              <select value={templateNote} onChange={(e) => setTemplateNote(e.target.value)}>
                <option value="">— bez konkrétní šablony —</option>
                {templates.map((t: Row, i) => (
                  <option key={i} value={t.name || t.rel}>{t.name || t.rel}</option>
                ))}
              </select>
            </div>
          )}

          <div className="rd-checks">
            <label><input type="checkbox" checked={addToProjects} onChange={(e) => setAddToProjects(e.target.checked)} /> Přidat do Projektů</label>
            <label><input type="checkbox" checked={initGit} onChange={(e) => setInitGit(e.target.checked)} /> Git repozitář (lokálně)</label>
            <label><input type="checkbox" checked={makeGithub} onChange={(e) => setMakeGithub(e.target.checked)} /> Založit GitHub repozitář</label>
            <label><input type="checkbox" checked={openClaude} onChange={(e) => setOpenClaude(e.target.checked)} /> Otevřít v Claude + VS Code (prompt do schránky)</label>
          </div>
          {!openClaude && (
            <div className="field">
              <label>Otevřít v jiném editoru (volitelné)</label>
              <input value={openApp} placeholder="Visual Studio Code, Cursor…" onChange={(e) => setOpenApp(e.target.value)} />
            </div>
          )}

          <button className="primary rd-cta" onClick={create} disabled={busy === "create"}>
            {busy === "create" ? "Vytvářím…" : "🚀 Vytvořit nový projekt"}
          </button>
        </section>
      )}

      {result && (
        <section className="rd-step rd-done">
          <div className="rd-step-head"><span className="rd-num ok">✓</span><h3>Hotovo</h3></div>
          <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>{result.project_dir}</div>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            {result.site_rel && (
              <button className="primary" onClick={() => openSiteInWorkspace(result.site_rel!)}>Otevřít náhled (Weby)</button>
            )}
            <button className="ghost" onClick={() => api.redesignOpenClaude(result.project_dir).catch(() => {})}>Otevřít v Claude Code</button>
            <button className="ghost" onClick={() => api.redesignOpen(result.project_dir)}>Otevřít složku</button>
          </div>
        </section>
      )}

      {error && <div className="error">{error}</div>}

      {log.length > 0 && (
        <section className="rd-step">
          <div className="rd-step-head"><h3>Log</h3></div>
          <pre className="rd-log">{log.join("\n")}</pre>
        </section>
      )}
    </div>
  );
}
