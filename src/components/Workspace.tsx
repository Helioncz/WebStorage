import { useEffect, useRef, useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import Editor from "@monaco-editor/react";
import { api } from "../lib/api";
import { languageFor } from "../lib/monaco";
import { Modal, confirmDialog } from "./Modal";
import AiPanel from "./AiPanel";
import GitHubPanel from "./GitHubPanel";
import DeployModal from "./DeployModal";
import { useStore } from "../store/useStore";

const IMAGE_EXT = ["png", "jpg", "jpeg", "gif", "webp", "svg", "ico", "avif"];
const isImage = (p: string) => IMAGE_EXT.includes((p.split(".").pop() || "").toLowerCase());

// Pracovní workspace pro web v sites/: strom souborů + Monaco editor + náhled/AI.
export default function Workspace({ rel, onBack }: { rel: string; onBack: () => void }) {
  const slug = rel.split("/").pop() || rel;
  const theme = useStore((s) => s.theme);

  const [files, setFiles] = useState<string[]>([]);
  const [active, setActive] = useState<string>("");
  const [content, setContent] = useState<string>("");
  const [dirty, setDirty] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [right, setRight] = useState<"preview" | "ai">("preview");
  const [status, setStatus] = useState<string | null>(null);
  const [newFile, setNewFile] = useState(false);
  const [deployUrl, setDeployUrl] = useState("");
  const [editingDeploy, setEditingDeploy] = useState(false);
  const [github, setGithub] = useState(false);
  const [deploy, setDeploy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const contentRef = useRef("");

  const flash = (m: string) => { setStatus(m); setTimeout(() => setStatus(null), 2500); };

  const loadFiles = () => api.listSiteFiles(rel).then(setFiles);

  useEffect(() => {
    api.sitePreviewUrl(rel).then(setPreviewUrl);
    api.getDeployUrl(rel).then((u) => setDeployUrl(u || ""));
    loadFiles().then(() => openFile("index.html"));
  }, [rel]);

  const openFile = async (path: string) => {
    if (dirty && !(await confirmDiscard())) return;
    try {
      const c = await api.readSiteFile(rel, path);
      setActive(path);
      setContent(c);
      contentRef.current = c;
      setDirty(false);
    } catch {
      // Pokud index.html neexistuje, vyber první soubor.
      const list = await api.listSiteFiles(rel);
      if (list[0] && list[0] !== path) openFile(list[0]);
    }
  };

  const confirmDiscard = async () =>
    confirmDialog({ title: "Neuložené změny", message: `Soubor ${active} má neuložené změny. Zahodit je?`, confirmLabel: "Zahodit", danger: true });

  const saveFile = async () => {
    if (!active || !dirty) return;
    await api.writeSiteFile(rel, active, contentRef.current);
    setDirty(false);
    setReloadKey((k) => k + 1); // obnov náhled
    flash("Uloženo ✓");
  };

  const refreshFromDisk = async () => {
    await loadFiles();
    if (active) {
      const c = await api.readSiteFile(rel, active).catch(() => "");
      setContent(c);
      contentRef.current = c;
      setDirty(false);
    }
    setReloadKey((k) => k + 1);
  };

  const createFile = async (path: string) => {
    const clean = path.trim().replace(/^\/+/, "");
    if (!clean) return;
    await api.writeSiteFile(rel, clean, "");
    setNewFile(false);
    await loadFiles();
    openFile(clean);
  };

  const deleteFile = async (path: string) => {
    const ok = await confirmDialog({ title: "Smazat soubor?", message: path, confirmLabel: "Smazat", danger: true });
    if (!ok) return;
    await api.deleteSiteFile(rel, path);
    if (active === path) { setActive(""); setContent(""); contentRef.current = ""; setDirty(false); }
    flash("Smazáno ✓");
    await loadFiles();
    setReloadKey((k) => k + 1);
  };

  // Nahrání obrázků/médií (do assets/) — binárně bezpečné, přidá se do gitu při push.
  const importPaths = async (paths: string[]) => {
    let last = "";
    for (const p of paths) {
      try { last = await api.importAsset(rel, p); } catch (e) { console.error(e); }
    }
    await loadFiles();
    setReloadKey((k) => k + 1);
    if (last) { openFile(last); flash(`Nahráno: ${last}`); }
  };

  const uploadImage = async () => {
    const picked = await open({ multiple: true, filters: [{ name: "Obrázek / média", extensions: IMAGE_EXT.concat(["mp4", "webm", "pdf", "woff2", "woff"]) }] });
    if (!picked) return;
    importPaths(Array.isArray(picked) ? picked : [picked]);
  };

  // Drag & drop souborů z Finderu do editoru
  useEffect(() => {
    const un = getCurrentWebview().onDragDropEvent((event) => {
      const t = event.payload.type;
      if (t === "over" || t === "enter") setDragOver(true);
      else if (t === "leave") setDragOver(false);
      else if (t === "drop") { setDragOver(false); importPaths(event.payload.paths); }
    });
    return () => { un.then((f) => f()); };
  }, [rel]);

  const downloadZip = async () => {
    const dest = await save({ defaultPath: `${slug}.zip`, filters: [{ name: "ZIP", extensions: ["zip"] }] });
    if (!dest) return;
    await api.exportSiteZip(rel, dest);
    flash("ZIP uložen ✓");
  };

  const openLive = async () => {
    if (!deployUrl.trim()) { setEditingDeploy(true); return; }
    await api.openExternalUrl(deployUrl.trim());
  };

  // Cmd/Ctrl+S
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveFile();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  // Autosave: po 1,2 s nečinnosti ulož a obnov náhled.
  useEffect(() => {
    if (!dirty || !active || isImage(active)) return;
    const t = setTimeout(async () => {
      await api.writeSiteFile(rel, active, contentRef.current);
      setDirty(false);
      setReloadKey((k) => k + 1);
      flash("Auto-uloženo ✓");
    }, 1200);
    return () => clearTimeout(t);
  }, [content, dirty, active, rel]);

  return (
    <div className="ws">
      <div className="ws-bar">
        <button className="ghost" onClick={onBack}>← Weby</button>
        <strong className="ws-title">{slug}{dirty ? " •" : ""}</strong>
        <span className="spacer" />
        <button className="ghost" onClick={() => setNewFile(true)}>+ Soubor</button>
        <button className="ghost" onClick={uploadImage} title="Nahrát obrázek/médium do assets/">🖼 Obrázek</button>
        <button className="primary" onClick={saveFile} disabled={!dirty}>💾 Uložit</button>
        <button className="ghost" onClick={refreshFromDisk} title="Načíst z disku (po externí změně)">⟳ Z disku</button>
        <div className="seg">
          <button className={right === "preview" ? "active" : ""} onClick={() => setRight("preview")}>👁 Náhled</button>
          <button className={right === "ai" ? "active" : ""} onClick={() => setRight("ai")}>💬 AI</button>
        </div>
        <button className="ghost" onClick={() => setGithub(true)} title="GitHub">⎇ GitHub</button>
        <button className="ghost" onClick={() => api.openSiteFolder(rel)}>Složka</button>
        <button className="ghost" onClick={downloadZip}>⬇ ZIP</button>
        <button className="primary" onClick={() => setDeploy(true)}>🚀 Publikovat</button>
        <button className="ghost" onClick={openLive} title="Otevřít živou adresu">🌍</button>
      </div>

      {status && <div className="ws-status">{status}</div>}
      {editingDeploy && (
        <div className="ws-deploy">
          <input autoFocus value={deployUrl} onChange={(e) => setDeployUrl(e.target.value)} placeholder="https://muj-web.netlify.app" />
          <button className="primary" onClick={async () => { await api.setDeployUrl(rel, deployUrl.trim()); setEditingDeploy(false); flash("Adresa uložena ✓"); }}>Uložit</button>
          <button className="ghost" onClick={() => setEditingDeploy(false)}>Zrušit</button>
        </div>
      )}

      <div className="ws-grid">
        <div className="ws-files">
          <div className="ws-files-head">Soubory</div>
          {files.map((f) => (
            <div key={f} className={"ws-file" + (f === active ? " active" : "")}>
              <span className="ws-file-name" onClick={() => openFile(f)}>{fileIcon(f)} {f}</span>
              <button className="ws-file-del" title="Smazat" onClick={() => deleteFile(f)}>✕</button>
            </div>
          ))}
          {files.length === 0 && <div className="muted" style={{ padding: 10, fontSize: 13 }}>Žádné soubory.</div>}
        </div>

        <div className={"ws-editor" + (dragOver ? " dragover" : "")}>
          {active && isImage(active) ? (
            <div className="ws-img-view">
              <img src={`${previewUrl}${active}?v=${reloadKey}`} alt={active} />
              <div className="ws-img-meta">
                <code className="kbd">{active}</code>
                <button className="ghost" onClick={() => { navigator.clipboard.writeText(active); flash("Cesta zkopírována"); }}>Kopírovat cestu</button>
              </div>
            </div>
          ) : active ? (
            <Editor
              height="100%"
              path={active}
              language={languageFor(active)}
              value={content}
              theme={theme === "light" ? "light" : "vs-dark"}
              onChange={(v) => { contentRef.current = v ?? ""; setContent(v ?? ""); setDirty(true); }}
              options={{ minimap: { enabled: false }, fontSize: 13, tabSize: 2, wordWrap: "on", scrollBeyondLastLine: false, automaticLayout: true }}
            />
          ) : (
            <div className="muted" style={{ padding: 20 }}>Vyber soubor vlevo, nebo přetáhni obrázek sem.</div>
          )}
          {dragOver && <div className="ws-drop-hint">Pusť soubory — nahrají se do assets/</div>}
        </div>

        <div className="ws-right">
          {right === "ai" ? (
            <AiPanel rel={rel} onFileWritten={() => refreshFromDisk()} />
          ) : (
            <div className="ws-preview-wrap">
              <div className="ws-preview-bar">
                <div className="seg">
                  <button className={device === "desktop" ? "active" : ""} onClick={() => setDevice("desktop")}>🖥</button>
                  <button className={device === "mobile" ? "active" : ""} onClick={() => setDevice("mobile")}>📱</button>
                </div>
                <span className="spacer" />
                <button className="ghost" onClick={() => setReloadKey((k) => k + 1)}>⟳</button>
              </div>
              <div className={"ws-frame " + device}>
                {previewUrl && <iframe key={reloadKey} src={previewUrl} title={slug} sandbox="allow-scripts allow-same-origin" />}
              </div>
            </div>
          )}
        </div>
      </div>

      {github && (
        <GitHubPanel rel={rel} slug={slug} onClose={() => setGithub(false)} onPulled={() => refreshFromDisk()} />
      )}

      {deploy && (
        <DeployModal rel={rel} onClose={() => setDeploy(false)} onDeployed={(url) => { setDeployUrl(url); flash("Publikováno ✓"); }} />
      )}

      {newFile && (
        <Modal title="Nový soubor" onClose={() => setNewFile(false)}
          footer={<>
            <button className="ghost" onClick={() => setNewFile(false)}>Zrušit</button>
          </>}>
          <NewFileForm onCreate={createFile} />
        </Modal>
      )}
    </div>
  );
}

function NewFileForm({ onCreate }: { onCreate: (path: string) => void }) {
  const [path, setPath] = useState("");
  return (
    <div className="field">
      <label>Cesta souboru (relativní)</label>
      <input autoFocus value={path} onChange={(e) => setPath(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onCreate(path)} placeholder="např. about.html nebo assets/logo.svg" />
      <div className="row" style={{ marginTop: 10 }}>
        <button className="primary" onClick={() => onCreate(path)} disabled={!path.trim()}>Vytvořit</button>
      </div>
    </div>
  );
}

function fileIcon(f: string) {
  if (f.endsWith(".html")) return "📄";
  if (f.endsWith(".css")) return "🎨";
  if (f.endsWith(".js")) return "⚙️";
  if (f.endsWith(".md")) return "📝";
  if (f.match(/\.(png|jpg|jpeg|svg|gif|webp)$/)) return "🖼";
  return "📃";
}
