import { useEffect, useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { api, Row } from "../lib/api";
import { confirmDialog, Modal } from "./Modal";
import AiPanel from "./AiPanel";
import Workspace from "./Workspace";
import { useStore } from "../store/useStore";

export default function Sites() {
  const { openNewProject, pendingSiteRel, consumePendingSite } = useStore();
  const [root, setRoot] = useState("");
  const [sites, setSites] = useState<Row[]>([]);
  const [templates, setTemplates] = useState<Row[]>([]);
  const [active, setActive] = useState<{ rel: string; isTemplate: boolean } | null>(null);
  const [editing, setEditing] = useState<Row | null>(null);

  const loadRoot = () => api.getSitesRoot().then((c) => setRoot(c.root));
  const loadAll = () => {
    api.listSites().then(setSites).catch(console.error);
    api.listSiteTemplates().then(setTemplates).catch(console.error);
  };

  useEffect(() => {
    loadRoot();
    loadAll();
  }, []);

  // Po vytvoření projektu otevři jeho web v editoru.
  useEffect(() => {
    if (pendingSiteRel) {
      setActive({ rel: pendingSiteRel, isTemplate: false });
      consumePendingSite();
      loadAll();
    }
  }, [pendingSiteRel]);

  const changeRoot = async () => {
    const picked = await open({ directory: true, multiple: false });
    if (!picked || Array.isArray(picked)) return;
    await api.setSitesRoot(picked);
    await loadRoot();
    loadAll();
    setActive(null);
  };

  const addTemplate = async () => {
    const picked = await open({ directory: true, multiple: false, title: "Vyber složku webu jako šablonu" });
    if (!picked || Array.isArray(picked)) return;
    const base = picked.split("/").pop() || "sablona";
    try {
      await api.importTemplate(picked, base);
      loadAll();
    } catch (e) {
      await confirmDialog({ title: "Import selhal", message: String(e), confirmLabel: "OK", danger: false });
    }
  };

  const deleteSite = async (e: React.MouseEvent, s: Row) => {
    e.stopPropagation();
    const ok = await confirmDialog({
      title: "Smazat web?",
      message: `Složka „${s.slug}" a všechny její soubory budou nenávratně smazány.`,
      confirmLabel: "Smazat web",
      danger: true,
    });
    if (!ok) return;
    await api.deleteSite(s.rel);
    loadAll();
  };

  if (active && !active.isTemplate) {
    return <Workspace rel={active.rel} onBack={() => { setActive(null); loadAll(); }} />;
  }
  if (active) {
    return <SiteDetail rel={active.rel} isTemplate={active.isTemplate} onBack={() => { setActive(null); loadAll(); }} onUse={(rel) => openNewProject(rel)} />;
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

      <div className="section-title">Moje weby</div>
      {sites.length === 0 ? (
        <div className="card empty">
          <div>Zatím žádný web.</div>
          <div className="muted" style={{ marginTop: 8, fontSize: 13 }}>
            Klikni <strong>+ Nový projekt</strong> (vlevo dole) — vyber šablonu nebo prázdný web. Vznikne tu pracovní web.
          </div>
        </div>
      ) : (
        <div className="site-grid">
          {sites.map((s) => (
            <div key={s.rel} className="site-card has-del" onClick={() => setActive({ rel: s.rel, isTemplate: false })}>
              <div className="site-thumb">
                {s.icon ? <img src={s.icon} alt="" className="site-icon-img" /> : (s.has_index ? "🌐" : "📁")}
              </div>
              <div className="site-meta">
                <div className="site-name">{s.name || s.slug}</div>
                <div className="muted" style={{ fontSize: 12 }}>{s.slug} · {s.file_count} souborů</div>
              </div>
              <div className="site-actions">
                <button className="site-act" title="Upravit" onClick={(e) => { e.stopPropagation(); setEditing(s); }}>✎</button>
                <button className="site-act danger" title="Smazat web" onClick={(e) => deleteSite(e, s)}>✕</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="row between" style={{ marginTop: 18 }}>
        <div className="section-title" style={{ margin: 0 }}>Šablony webů</div>
        <button className="ghost" onClick={addTemplate}>+ Přidat šablonu</button>
      </div>
      <div className="muted" style={{ fontSize: 13, margin: "6px 0 10px" }}>
        Posuň vodorovně. „Použít" → otevře Nový projekt s touto šablonou.
      </div>
      <div className="tpl-scroll">
        {templates.map((t) => (
          <div key={t.rel} className="tpl-slide">
            <button className="tpl-slide-main" onClick={() => setActive({ rel: t.rel, isTemplate: true })}>
              <div className="tpl-slide-thumb">✦</div>
              <div className="tpl-slide-name">{t.title || t.slug}</div>
              <div className="muted" style={{ fontSize: 12 }}>{t.slug}</div>
            </button>
            <button className="mini-use" onClick={() => openNewProject(t.rel)}>Použít</button>
          </div>
        ))}
        {templates.length === 0 && <div className="muted" style={{ padding: 10 }}>Žádné šablony. Přidej přes „+ Přidat šablonu".</div>}
      </div>

      {editing && (
        <EditSiteModal site={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); loadAll(); }} />
      )}
    </div>
  );
}

function EditSiteModal({ site, onClose, onSaved }: { site: Row; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(site.name || site.slug || "");
  const [icon, setIcon] = useState<string>(site.icon || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const pickIcon = async () => {
    const picked = await open({ multiple: false, filters: [{ name: "Obrázek", extensions: ["png", "jpg", "jpeg", "gif", "webp", "svg"] }] });
    if (!picked || Array.isArray(picked)) return;
    try {
      const dataUrl = await api.readFileBase64(picked);
      // zmenši na 128px (kromě SVG) → malá ikona
      if (dataUrl.startsWith("data:image/svg")) { setIcon(dataUrl); return; }
      const img = new Image();
      img.onload = () => {
        const size = 128;
        const c = document.createElement("canvas");
        c.width = size; c.height = size;
        const ctx = c.getContext("2d")!;
        const scale = Math.max(size / img.width, size / img.height);
        const w = img.width * scale, h = img.height * scale;
        ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
        setIcon(c.toDataURL("image/png"));
      };
      img.src = dataUrl;
    } catch (e: any) { setErr(String(e?.message || e)); }
  };

  const submit = async () => {
    setBusy(true); setErr("");
    try {
      await api.setSiteName(site.rel, name.trim());
      await api.setSiteIcon(site.rel, icon);
      onSaved();
    } catch (e: any) { setErr(String(e?.message || e)); setBusy(false); }
  };

  return (
    <Modal title="Upravit web" onClose={onClose}
      footer={<>
        <button className="ghost" onClick={onClose}>Zrušit</button>
        <button className="primary" onClick={submit} disabled={busy || !name.trim()}>{busy ? "Ukládám…" : "Uložit"}</button>
      </>}>
      <div className="field">
        <label>Název projektu</label>
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
      </div>
      <div className="field">
        <label>Ikona webu</label>
        <div className="row" style={{ gap: 12, alignItems: "center" }}>
          <div className="site-thumb" style={{ width: 56, height: 56 }}>
            {icon ? <img src={icon} alt="" className="site-icon-img" /> : "🌐"}
          </div>
          <button className="ghost" onClick={pickIcon}>Nahrát obrázek…</button>
          {icon && <button className="ghost danger" onClick={() => setIcon("")}>Odebrat</button>}
        </div>
        <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>PNG/JPG/SVG — zmenší se na 128 px.</div>
      </div>
      {err && <div className="error">{err}</div>}
    </Modal>
  );
}

function SiteDetail({ rel, isTemplate, onBack, onUse }: { rel: string; isTemplate: boolean; onBack: () => void; onUse: (rel: string) => void }) {
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
            ? <button className="primary" onClick={() => onUse(rel)}>Použít šablonu</button>
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
