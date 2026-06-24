import { useEffect, useRef, useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import Editor from "@monaco-editor/react";
import { api } from "../lib/api";
import { languageFor } from "../lib/monaco";
import { Modal, confirmDialog } from "./Modal";
import AiPanel from "./AiPanel";
import GitHubPanel from "./GitHubPanel";
import { useStore } from "../store/useStore";

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

  return (
    <div className="ws">
      <div className="ws-bar">
        <button className="ghost" onClick={onBack}>← Weby</button>
        <strong className="ws-title">{slug}{dirty ? " •" : ""}</strong>
        <span className="spacer" />
        <button className="ghost" onClick={() => setNewFile(true)}>+ Soubor</button>
        <button className="primary" onClick={saveFile} disabled={!dirty}>💾 Uložit</button>
        <button className="ghost" onClick={refreshFromDisk} title="Načíst z disku (po externí změně)">⟳ Z disku</button>
        <div className="seg">
          <button className={right === "preview" ? "active" : ""} onClick={() => setRight("preview")}>👁 Náhled</button>
          <button className={right === "ai" ? "active" : ""} onClick={() => setRight("ai")}>💬 AI</button>
        </div>
        <button className="ghost" onClick={() => setGithub(true)} title="GitHub">⎇ GitHub</button>
        <button className="ghost" onClick={() => api.openSiteFolder(rel)}>Složka</button>
        <button className="ghost" onClick={downloadZip}>⬇ ZIP</button>
        <button className="primary" onClick={openLive}>🌍 Živý web</button>
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

        <div className="ws-editor">
          {active ? (
            <Editor
              height="100%"
              path={active}
              language={languageFor(active)}
              value={content}
              theme={theme === "dark" ? "vs-dark" : "light"}
              onChange={(v) => { contentRef.current = v ?? ""; setContent(v ?? ""); setDirty(true); }}
              options={{ minimap: { enabled: false }, fontSize: 13, tabSize: 2, wordWrap: "on", scrollBeyondLastLine: false, automaticLayout: true }}
            />
          ) : (
            <div className="muted" style={{ padding: 20 }}>Vyber soubor vlevo.</div>
          )}
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
