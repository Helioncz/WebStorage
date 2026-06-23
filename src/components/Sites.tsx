import { useEffect, useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { api, Row } from "../lib/api";
import { Modal } from "./Modal";
import AiPanel from "./AiPanel";

export default function Sites() {
  const [root, setRoot] = useState("");
  const [sites, setSites] = useState<Row[]>([]);
  const [templates, setTemplates] = useState<Row[]>([]);
  const [active, setActive] = useState<{ rel: string; isTemplate: boolean } | null>(null);
  const [useTpl, setUseTpl] = useState<Row | null>(null);

  const loadRoot = () => api.getSitesRoot().then((c) => setRoot(c.root));
  const loadAll = () => {
    api.listSites().then(setSites).catch(console.error);
    api.listSiteTemplates().then(setTemplates).catch(console.error);
  };

  useEffect(() => {
    loadRoot();
    loadAll();
  }, []);

  const changeRoot = async () => {
    const picked = await open({ directory: true, multiple: false });
    if (!picked || Array.isArray(picked)) return;
    await api.setSitesRoot(picked);
    await loadRoot();
    loadAll();
    setActive(null);
  };

  if (active) {
    return <SiteDetail rel={active.rel} isTemplate={active.isTemplate} onBack={() => { setActive(null); loadAll(); }} onUse={(t) => setUseTpl(t)} />;
  }

  return (
    <div className="content">
      <div className="row between">
        <div className="h1">Weby</div>
        <button className="ghost" onClick={loadAll} title="Načíst znovu">⟳ Obnovit</button>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="row between">
          <div style={{ minWidth: 0 }}>
            <div className="muted" style={{ fontSize: 12 }}>Pracovní složka</div>
            <code className="kbd" style={{ wordBreak: "break-all" }}>{root || "(nenastaveno)"}</code>
          </div>
          <button className="ghost" onClick={changeRoot}>Změnit…</button>
        </div>
      </div>

      <div className="section-title">Moje weby (working / git)</div>
      {sites.length === 0 ? (
        <div className="card empty">
          <div>Zatím žádný pracovní web.</div>
          <div className="muted" style={{ marginTop: 8, fontSize: 13 }}>
            Vyber šablonu níže a klikni <strong>Použít šablonu</strong> — vytvoří se kopie v <code className="kbd">sites/</code>, kterou edituješ a deployuješ.
          </div>
        </div>
      ) : (
        <div className="site-grid">
          {sites.map((s) => (
            <button key={s.rel} className="site-card" onClick={() => setActive({ rel: s.rel, isTemplate: false })}>
              <div className="site-thumb">{s.has_index ? "🌐" : "📁"}</div>
              <div className="site-meta">
                <div className="site-name">{s.title || s.slug}</div>
                <div className="muted" style={{ fontSize: 12 }}>{s.slug} · {s.file_count} souborů</div>
              </div>
            </button>
          ))}
        </div>
      )}

      <div className="section-title">Šablony webů</div>
      <div className="muted" style={{ fontSize: 13, marginBottom: 10 }}>
        Nahlédni do náhledu, stáhni jako ZIP, nebo „Použít" → vznikne tvůj editovatelný web.
      </div>
      <div className="site-grid">
        {templates.map((t) => (
          <div key={t.rel} className="site-card tpl">
            <button className="site-card-main" onClick={() => setActive({ rel: t.rel, isTemplate: true })}>
              <div className="site-thumb tpl-thumb">✦</div>
              <div className="site-meta">
                <div className="site-name">{t.title || t.slug}</div>
                <div className="muted" style={{ fontSize: 12 }}>{t.slug}</div>
              </div>
            </button>
            <button className="mini-use" onClick={() => setUseTpl(t)}>Použít</button>
          </div>
        ))}
      </div>

      {useTpl && (
        <UseTemplateModal
          template={useTpl}
          onClose={() => setUseTpl(null)}
          onCreated={(rel) => { setUseTpl(null); loadAll(); setActive({ rel, isTemplate: false }); }}
        />
      )}
    </div>
  );
}

function UseTemplateModal({ template, onClose, onCreated }: { template: Row; onClose: () => void; onCreated: (rel: string) => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    if (!name.trim() || busy) return;
    setBusy(true); setErr("");
    try {
      const rel = await api.useSiteTemplate(template.rel, name.trim());
      onCreated(rel);
    } catch (e: any) {
      setErr(String(e)); setBusy(false);
    }
  };

  return (
    <Modal
      title={`Použít šablonu: ${template.title || template.slug}`}
      onClose={onClose}
      footer={<>
        <button className="ghost" onClick={onClose}>Zrušit</button>
        <button className="primary" onClick={submit} disabled={!name.trim() || busy}>{busy ? "Vytvářím…" : "Vytvořit web"}</button>
      </>}
    >
      <div className="field">
        <label>Název nového webu (slug složky)</label>
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="napr. kavarna-u-lipy" />
      </div>
      <div className="muted" style={{ fontSize: 13 }}>
        Vytvoří kopii do <code className="kbd">sites/{(name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")) || "…"}</code>, kterou pak edituješ a pushneš na GitHub.
      </div>
      {err && <div className="error" style={{ marginTop: 8 }}>{err}</div>}
    </Modal>
  );
}

function SiteDetail({ rel, isTemplate, onBack, onUse }: { rel: string; isTemplate: boolean; onBack: () => void; onUse: (t: Row) => void }) {
  const slug = rel.split("/").pop() || rel;
  const [url, setUrl] = useState("");
  const [files, setFiles] = useState<string[]>([]);
  const [reloadKey, setReloadKey] = useState(0);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [status, setStatus] = useState<string | null>(null);
  const [deployUrl, setDeployUrl] = useState("");
  const [editingDeploy, setEditingDeploy] = useState(false);
  const [rightMode, setRightMode] = useState<"info" | "ai">("info");

  useEffect(() => {
    api.sitePreviewUrl(rel).then(setUrl);
    api.listSiteFiles(rel).then(setFiles);
    if (!isTemplate) api.getDeployUrl(rel).then((u) => setDeployUrl(u || ""));
  }, [rel]);

  const flash = (m: string) => { setStatus(m); setTimeout(() => setStatus(null), 3000); };

  const downloadZip = async () => {
    const dest = await save({ defaultPath: `${slug}.zip`, filters: [{ name: "ZIP", extensions: ["zip"] }] });
    if (!dest) return;
    await api.exportSiteZip(rel, dest);
    flash("Uloženo jako ZIP ✓");
  };

  const saveDeploy = async () => {
    await api.setDeployUrl(rel, deployUrl.trim());
    setEditingDeploy(false);
    flash("Živá adresa uložena ✓");
  };

  const openLive = async () => {
    if (!deployUrl.trim()) { setEditingDeploy(true); return; }
    await api.openExternalUrl(deployUrl.trim());
  };

  return (
    <div className="content" style={{ maxWidth: "none" }}>
      <div className="row between">
        <div className="row" style={{ gap: 10 }}>
          <button className="ghost" onClick={onBack}>← Weby</button>
          <div className="h1" style={{ margin: 0 }}>{slug}</div>
          {isTemplate && <span className="badge">šablona</span>}
        </div>
        <div className="row">
          <div className="seg">
            <button className={device === "desktop" ? "active" : ""} onClick={() => setDevice("desktop")}>🖥 Desktop</button>
            <button className={device === "mobile" ? "active" : ""} onClick={() => setDevice("mobile")}>📱 Mobil</button>
          </div>
          <button className="ghost" onClick={() => setReloadKey((k) => k + 1)}>⟳ Obnovit</button>
          <button className="ghost" onClick={() => api.openSiteFolder(rel)}>Složka</button>
          <button className="ghost" onClick={downloadZip}>⬇ ZIP</button>
          {!isTemplate && (
            <button className={rightMode === "ai" ? "primary" : "ghost"} onClick={() => setRightMode((m) => (m === "ai" ? "info" : "ai"))}>
              💬 AI
            </button>
          )}
          {isTemplate
            ? <button className="primary" onClick={() => onUse({ rel, slug, title: undefined } as any)}>Použít šablonu</button>
            : <button className="primary" onClick={openLive}>🌍 Otevřít živý web</button>}
        </div>
      </div>

      {status && <div className="card" style={{ marginTop: 10, color: "var(--ok)" }}>{status}</div>}

      {!isTemplate && editingDeploy && (
        <div className="card" style={{ marginTop: 10 }}>
          <div className="field" style={{ marginBottom: 8 }}>
            <label>Živá adresa webu (po deployi na Netlify/Vercel)</label>
            <input autoFocus value={deployUrl} onChange={(e) => setDeployUrl(e.target.value)} placeholder="https://muj-web.netlify.app" />
          </div>
          <div className="row">
            <button className="primary" onClick={saveDeploy}>Uložit</button>
            <button className="ghost" onClick={() => setEditingDeploy(false)}>Zrušit</button>
          </div>
        </div>
      )}

      <div className="preview-wrap" style={{ marginTop: 12 }}>
        <div className={"preview-frame " + device}>
          {url && <iframe key={reloadKey} src={url} title={slug} style={{ width: "100%", height: "100%", border: "none", background: "#fff" }} />}
        </div>

        <div className="preview-side">
          {!isTemplate && rightMode === "ai" ? (
            <AiPanel rel={rel} onFileWritten={() => { setReloadKey((k) => k + 1); api.listSiteFiles(rel).then(setFiles); }} />
          ) : isTemplate ? (
            <div className="card">
              <strong>Šablona</strong>
              <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
                Tohle je jen náhled. Klikni <strong>Použít šablonu</strong> a vznikne tvoje kopie v <code className="kbd">sites/</code>, kterou můžeš editovat a nasadit.
              </p>
            </div>
          ) : (
            <div className="card">
              <strong>Živý web</strong>
              <div className="muted" style={{ fontSize: 13, marginTop: 8 }}>
                {deployUrl ? <a href="#" onClick={(e) => { e.preventDefault(); api.openExternalUrl(deployUrl); }}>{deployUrl}</a> : "Zatím bez adresy."}
              </div>
              <button className="ghost" style={{ marginTop: 8 }} onClick={() => setEditingDeploy(true)}>
                {deployUrl ? "Změnit adresu" : "Nastavit adresu"}
              </button>
            </div>
          )}

          <div className="card">
            <strong>Soubory ({files.length})</strong>
            <div style={{ marginTop: 8 }}>
              {files.map((f) => <div key={f} className="muted" style={{ fontSize: 13, padding: "2px 0" }}>📄 {f}</div>)}
            </div>
          </div>

          {!isTemplate && (
            <div className="card">
              <strong>Deploy</strong>
              <ol className="muted" style={{ fontSize: 13, paddingLeft: 18, marginTop: 8, lineHeight: 1.7 }}>
                <li>Edituj soubory (Claude Code / Složka).</li>
                <li><code className="kbd">git commit</code> &amp; push na tvůj GitHub.</li>
                <li>Netlify/Vercel: base &amp; publish = <code className="kbd">{rel}</code>.</li>
                <li>Vlož výslednou URL do „Nastavit adresu".</li>
              </ol>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
