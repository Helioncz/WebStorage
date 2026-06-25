import { useEffect, useState } from "react";
<<<<<<< Updated upstream
import { open } from "@tauri-apps/plugin-dialog";
import { getCurrentWebview } from "@tauri-apps/api/webview";
=======
import { open, save } from "@tauri-apps/plugin-dialog";
>>>>>>> Stashed changes
import { api, Project, Row } from "../lib/api";
import { useStore } from "../store/useStore";
import { STATUS_COLOR } from "./Sidebar";
import { Modal, confirmDialog } from "./Modal";

const TABS = ["Přehled", "Soubory", "Poznámky", "Odkazy", "Přístupy", "Úkoly", "Monitoring", "Export", "Historie"] as const;
type Tab = (typeof TABS)[number];

const LAUNCH_CHECKLIST = [
  { title: "Doména koupena / převedena", priority: "high" },
  { title: "DNS nastavené na hosting / deploy platformu", priority: "high" },
  { title: "Hosting nebo deploy platforma připravená", priority: "high" },
  { title: "GitHub repozitář založený a propojený", priority: "high" },
  { title: "Produkční URL uložená v projektu", priority: "normal" },
  { title: "SSL certifikát a HTTPS funkční", priority: "urgent" },
  { title: "Kontrola responzivity mobil / tablet / desktop", priority: "high" },
  { title: "Kontrola formulářů a odesílání e-mailů", priority: "urgent" },
  { title: "SEO základ: title, description, OG image", priority: "normal" },
  { title: "Favicon, ikony a název v prohlížeči", priority: "normal" },
  { title: "Sitemap.xml a robots.txt", priority: "normal" },
  { title: "Napojení analytiky / měření", priority: "low" },
  { title: "GDPR / cookies / právní texty", priority: "normal" },
  { title: "PageSpeed kontrola a základní optimalizace", priority: "normal" },
  { title: "Záloha zdrojových souborů a přístupů", priority: "high" },
  { title: "Finální kontrola po nasazení", priority: "urgent" },
];

const QUICK_WEB_LINKS = [
  { title: "GitHub", url: "https://github.com", type: "git", description: "Repozitáře a verzování" },
  { title: "Netlify", url: "https://app.netlify.com", type: "hosting", description: "Deploy statických webů" },
  { title: "Vercel", url: "https://vercel.com/dashboard", type: "hosting", description: "Deploy webů a frameworků" },
  { title: "Cloudflare", url: "https://dash.cloudflare.com", type: "hosting", description: "DNS, domény, CDN" },
  { title: "Google Search Console", url: "https://search.google.com/search-console", type: "monitoring", description: "Indexace a SEO kontrola" },
  { title: "PageSpeed Insights", url: "https://pagespeed.web.dev", type: "monitoring", description: "Rychlost a Core Web Vitals" },
  { title: "Google Analytics", url: "https://analytics.google.com", type: "monitoring", description: "Analytika návštěvnosti" },
];

function isLaunchTask(title: string) {
  return LAUNCH_CHECKLIST.some((item) => title.toLowerCase().includes(item.title.toLowerCase().slice(0, 14)));
}

export default function ProjectDetail({ projectId }: { projectId: string }) {
  const [tab, setTab] = useState<Tab>("Přehled");
  const [project, setProject] = useState<Project | null>(null);
  const refresh = useStore((s) => s.refresh);

  const reload = () => api.getProject(projectId).then(setProject).catch(console.error);

  useEffect(() => {
    setTab("Přehled");
    reload();
    api.touchOpened(projectId);
  }, [projectId]);

  if (!project) return <div className="content muted">Načítání…</div>;

  return (
    <div>
      <div className="content" style={{ paddingBottom: 8 }}>
        <div className="row between">
          <div>
            <div className="h1">{project.name}</div>
            <div className="muted">{project.client || "—"}</div>
          </div>
          <div className="row">
            <button
              className="ghost"
              title="Oblíbené"
              onClick={async () => {
                await api.updateProject(projectId, { is_favorite: project.is_favorite ? 0 : 1 });
                reload();
                refresh();
              }}
            >
              {project.is_favorite ? "★" : "☆"}
            </button>
            <button
              className="danger"
              onClick={async () => {
                const ok = await confirmDialog({
                  title: "Smazat projekt?",
                  message: `Projekt „${project.name}" a veškerý jeho obsah (soubory, poznámky, přístupy, úkoly) budou nenávratně smazány.`,
                  confirmLabel: "Smazat projekt",
                  danger: true,
                });
                if (ok) {
                  await api.deleteProject(projectId);
                  useStore.getState().openDashboard();
                  refresh();
                }
              }}
            >
              Smazat
            </button>
          </div>
        </div>
      </div>

      <div className="tabs">
        {TABS.map((t) => (
          <div key={t} className={"tab" + (t === tab ? " active" : "")} onClick={() => setTab(t)}>
            {t}
          </div>
        ))}
      </div>

      <div className="content">
        {tab === "Přehled" && <Overview project={project} onSaved={reload} />}
        {tab === "Soubory" && <Files projectId={projectId} />}
        {tab === "Poznámky" && <Notes projectId={projectId} />}
        {tab === "Odkazy" && <Links projectId={projectId} />}
        {tab === "Přístupy" && <Credentials projectId={projectId} />}
        {tab === "Úkoly" && <Tasks projectId={projectId} />}
        {tab === "Monitoring" && <Monitoring projectId={projectId} />}
        {tab === "Export" && <ExportTab project={project} />}
        {tab === "Historie" && <History projectId={projectId} />}
      </div>
    </div>
  );
}

// ----------------------------- Přehled -----------------------------------

function Overview({ project, onSaved }: { project: Project; onSaved: () => void }) {
  const refresh = useStore((s) => s.refresh);
  const [f, setF] = useState(project);
  useEffect(() => setF(project), [project.id]);

  const save = async () => {
    await api.updateProject(project.id, {
      name: f.name,
      client: f.client,
      type: f.type,
      status: f.status,
      priority: f.priority,
      tags: f.tags,
      description: f.description,
      main_note: f.main_note,
    });
    onSaved();
    refresh();
  };

  const set = (k: string, v: any) => setF({ ...f, [k]: v });

  return (
    <>
    {(project.type === "web" || project.type === "eshop" || !project.type) && (
      <WebReadiness projectId={project.id} />
    )}
    <div className="card">
      <div className="grid2">
        <div className="field">
          <label>Název</label>
          <input value={f.name || ""} onChange={(e) => set("name", e.target.value)} />
        </div>
        <div className="field">
          <label>Klient / firma</label>
          <input value={f.client || ""} onChange={(e) => set("client", e.target.value)} />
        </div>
        <div className="field">
          <label>Typ</label>
          <select value={f.type || ""} onChange={(e) => set("type", e.target.value)}>
            <option value="">—</option>
            <option value="web">Web</option>
            <option value="eshop">E-shop</option>
            <option value="app">Aplikace</option>
            <option value="service">Servis</option>
            <option value="docs">Dokumentace</option>
            <option value="campaign">Kampaň</option>
          </select>
        </div>
        <div className="field">
          <label>Stav</label>
          <select value={f.status || "active"} onChange={(e) => set("status", e.target.value)}>
            {Object.keys(STATUS_COLOR).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Priorita</label>
          <select value={f.priority || "normal"} onChange={(e) => set("priority", e.target.value)}>
            <option value="low">nízká</option>
            <option value="normal">běžná</option>
            <option value="high">vysoká</option>
            <option value="urgent">urgentní</option>
          </select>
        </div>
        <div className="field">
          <label>Štítky (oddělené čárkou)</label>
          <input value={f.tags || ""} onChange={(e) => set("tags", e.target.value)} />
        </div>
      </div>
      <div className="field">
        <label>Krátký popis</label>
        <textarea value={f.description || ""} onChange={(e) => set("description", e.target.value)} />
      </div>
      <div className="field">
        <label>Hlavní poznámka</label>
        <textarea value={f.main_note || ""} onChange={(e) => set("main_note", e.target.value)} />
      </div>
      <button className="primary" onClick={save}>
        Uložit
      </button>
    </div>
    </>
  );
}

function WebReadiness({ projectId }: { projectId: string }) {
  const [tasks, setTasks] = useState<Row[]>([]);
  const [links, setLinks] = useState<Row[]>([]);
  const [creds, setCreds] = useState<Row[]>([]);

  useEffect(() => {
    Promise.all([
      api.listTasks(projectId),
      api.listLinks(projectId),
      api.listCredentials(projectId),
    ]).then(([t, l, c]) => {
      setTasks(t); setLinks(l); setCreds(c);
    }).catch(console.error);
  }, [projectId]);

  const taskDone = (needle: string) =>
    tasks.some((t) => (t.title || "").toLowerCase().includes(needle.toLowerCase()) && t.status === "done");
  const hasLink = (type: string) => links.some((l) => l.type === type || (l.title || "").toLowerCase().includes(type));
  const hasCred = (type: string) => creds.some((c) => c.type === type || (c.title || "").toLowerCase().includes(type));
  const launchTasks = tasks.filter((t) => isLaunchTask(t.title || ""));
  const done = launchTasks.filter((t) => t.status === "done").length;
  const total = launchTasks.length || LAUNCH_CHECKLIST.length;
  const pct = Math.round((done / total) * 100);

  const checks = [
    { label: "Checklist založený", ok: launchTasks.length >= 6, hint: "Úkoly → Vložit checklist spuštění" },
    { label: "Doména/DNS", ok: taskDone("doména") || hasLink("domain"), hint: "doména, DNS, nameservery" },
    { label: "Hosting/deploy", ok: taskDone("hosting") || hasLink("hosting"), hint: "Netlify/Vercel/hosting" },
    { label: "GitHub repo", ok: hasLink("git"), hint: "repo a verzování" },
    { label: "SSL/HTTPS", ok: taskDone("ssl") || taskDone("https"), hint: "certifikát a HTTPS" },
    { label: "Formuláře", ok: taskDone("formulář") || taskDone("formuláře"), hint: "odesílání a validace" },
    { label: "SEO základ", ok: taskDone("seo"), hint: "title, description, sitemap" },
    { label: "Přístupy", ok: hasCred("hosting") || hasCred("admin") || hasCred("domain"), hint: "hosting/admin/doména" },
  ];

  return (
    <div className="card launch-card">
      <div className="row between">
        <div>
          <strong>Spouštěcí stav webu</strong>
          <div className="muted" style={{ fontSize: 12 }}>Rychlý přehled, co ještě chybí před ostrým spuštěním.</div>
        </div>
        <div className={"launch-score " + (pct >= 80 ? "ok" : pct >= 45 ? "warn" : "bad")}>{pct}%</div>
      </div>
      <div className="launch-progress"><span style={{ width: `${pct}%` }} /></div>
      <div className="launch-grid">
        {checks.map((c) => (
          <div key={c.label} className={"launch-check " + (c.ok ? "ok" : "todo")}>
            <span className="lamp" />
            <div>
              <div>{c.label}</div>
              <small>{c.ok ? "OK" : c.hint}</small>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ----------------------------- Soubory -----------------------------------

function Files({ projectId }: { projectId: string }) {
  const [files, setFiles] = useState<Row[]>([]);
<<<<<<< Updated upstream
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
=======
  const [versionsOf, setVersionsOf] = useState<Row | null>(null);
>>>>>>> Stashed changes
  const load = () => api.listFiles(projectId).then(setFiles);
  useEffect(() => {
    load();
  }, [projectId]);

  const importPaths = async (paths: string[]) => {
    if (!paths.length) return;
    setBusy(true);
    try {
      for (const p of paths) await api.importFile(projectId, p);
      await load();
    } finally {
      setBusy(false);
    }
  };

  // Nativni drag & drop souboru z Finderu (Tauri webview event).
  useEffect(() => {
    const unlistenP = getCurrentWebview().onDragDropEvent((event) => {
      const t = event.payload.type;
      if (t === "over" || t === "enter") setDragOver(true);
      else if (t === "leave") setDragOver(false);
      else if (t === "drop") {
        setDragOver(false);
        importPaths(event.payload.paths);
      }
    });
    return () => {
      unlistenP.then((f) => f());
    };
  }, [projectId]);

  const pickFiles = async () => {
    const selected = await open({ multiple: true });
    if (!selected) return;
    const paths = Array.isArray(selected) ? selected : [selected];
    importPaths(paths as string[]);
  };

  return (
    <div className="card">
      {versionsOf && (
        <FileVersions file={versionsOf} onClose={() => setVersionsOf(null)} onChanged={load} />
      )}
      <div className="row between" style={{ marginBottom: 10 }}>
        <strong>Soubory</strong>
        <button className="primary" onClick={pickFiles} disabled={busy}>
          {busy ? "Importuji…" : "+ Importovat soubory"}
        </button>
      </div>
<<<<<<< Updated upstream

      <div className={"dropzone" + (dragOver ? " over" : "")}>
        {dragOver ? "Pusť soubory sem…" : "Přetáhni soubory z Finderu sem (drag & drop)"}
      </div>

=======
      <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
        Import souboru stejného názvu vytvoří novou verzi — starší zůstanou v historii.
      </div>
>>>>>>> Stashed changes
      {files.length === 0 ? (
        <div className="muted">Zatím žádné soubory.</div>
      ) : (
        files.map((f) => (
          <div key={f.id} className="list-item">
            <span>📄</span>
            <span className="name" style={{ cursor: "pointer" }} onClick={() => api.openFile(f.id)}>
              {f.name}
            </span>
            <span className="spacer" />
            <span className="muted">{(f.size / 1024).toFixed(0)} kB</span>
<<<<<<< Updated upstream
            <button
              className="ghost danger"
              onClick={async () => {
                const ok = await confirmDialog({
                  title: "Smazat soubor?",
                  message: f.name,
                  confirmLabel: "Smazat",
                  danger: true,
                });
                if (ok) {
                  await api.deleteFile(f.id);
                  load();
                }
              }}
            >
=======
            <button className="ghost" title="Verze" onClick={() => setVersionsOf(f)}>
              🕓 Verze
            </button>
            <button className="ghost danger" onClick={async () => { if (confirm(`Smazat soubor „${f.name}“?`)) { await api.deleteFile(f.id); load(); } }}>
>>>>>>> Stashed changes
              ✕
            </button>
          </div>
        ))
      )}
    </div>
  );
}

function FileVersions({
  file,
  onClose,
  onChanged,
}: {
  file: Row;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [versions, setVersions] = useState<Row[]>([]);
  const load = () => api.listFileVersions(file.id).then(setVersions);
  useEffect(() => {
    load();
  }, [file.id]);

  const restore = async (vid: string) => {
    if (!confirm("Obnovit tuto verzi? Aktuální obsah se uloží jako nová verze.")) return;
    await api.restoreFileVersion(vid);
    await load();
    onChanged();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="row between">
          <strong>Verze: {file.name}</strong>
          <button className="ghost" onClick={onClose}>
            ✕
          </button>
        </div>
        {versions.length === 0 ? (
          <div className="muted" style={{ marginTop: 10 }}>
            Žádné starší verze. Naimportuj soubor stejného názvu a vytvoříš novou verzi.
          </div>
        ) : (
          <div style={{ marginTop: 10 }}>
            {versions.map((v) => (
              <div key={v.id} className="list-item">
                <span>🕓</span>
                <span className="muted">{(v.created_at || "").replace("T", " ").slice(0, 16)}</span>
                <span className="spacer" />
                <span className="muted">{(v.size / 1024).toFixed(0)} kB</span>
                <button className="ghost" onClick={() => restore(v.id)}>
                  Obnovit
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ----------------------------- Poznámky ----------------------------------

function Notes({ projectId }: { projectId: string }) {
  const [notes, setNotes] = useState<Row[]>([]);
  const [active, setActive] = useState<Row | null>(null);
  const load = () => api.listNotes(projectId).then(setNotes);
  useEffect(() => {
    load();
    setActive(null);
  }, [projectId]);

  const save = async () => {
    if (!active) return;
    await api.saveNote(projectId, active.title || "Bez názvu", active.body_md || "", active.id);
    setActive(null);
    load();
  };

  if (active) {
    return (
      <div className="card">
        <div className="field">
          <input
            placeholder="Název poznámky"
            value={active.title || ""}
            onChange={(e) => setActive({ ...active, title: e.target.value })}
          />
        </div>
        <div className="field">
          <textarea
            style={{ minHeight: 320 }}
            placeholder="Markdown…"
            value={active.body_md || ""}
            onChange={(e) => setActive({ ...active, body_md: e.target.value })}
          />
        </div>
        <div className="row">
          <button className="primary" onClick={save}>
            Uložit
          </button>
          <button className="ghost" onClick={() => setActive(null)}>
            Zpět
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="row between" style={{ marginBottom: 10 }}>
        <strong>Poznámky</strong>
        <button className="primary" onClick={() => setActive({ title: "", body_md: "" })}>
          + Nová poznámka
        </button>
      </div>
      {notes.length === 0 ? (
        <div className="muted">Žádné poznámky.</div>
      ) : (
        notes.map((n) => (
          <div key={n.id} className="list-item">
            <span className="name" style={{ cursor: "pointer" }} onClick={() => setActive(n)}>
              📝 {n.title}
            </span>
            <span className="spacer" />
            <span className="muted">{(n.updated_at || "").slice(0, 10)}</span>
<<<<<<< Updated upstream
            <button
              className="ghost danger"
              onClick={async () => {
                const ok = await confirmDialog({ title: "Smazat poznámku?", message: n.title, confirmLabel: "Smazat", danger: true });
                if (ok) { await api.deleteNote(n.id); load(); }
              }}
            >
=======
            <button className="ghost danger" onClick={async () => { if (confirm(`Smazat poznámku „${n.title}“?`)) { await api.deleteNote(n.id); load(); } }}>
>>>>>>> Stashed changes
              ✕
            </button>
          </div>
        ))
      )}
    </div>
  );
}

// ----------------------------- Odkazy ------------------------------------

const LINK_TYPES = [
  ["", "—"],
  ["web", "Web"],
  ["admin", "Administrace"],
  ["staging", "Testovací / staging"],
  ["git", "Git repozitář"],
  ["hosting", "Hosting"],
  ["ftp", "FTP"],
  ["cloud", "Cloud složka"],
  ["api", "API dokumentace"],
  ["monitoring", "Monitoring"],
] as const;

function Links({ projectId }: { projectId: string }) {
  const [links, setLinks] = useState<Row[]>([]);
  const [editing, setEditing] = useState<Row | null>(null);
<<<<<<< Updated upstream
=======
  const [error, setError] = useState("");
>>>>>>> Stashed changes
  const load = () => api.listLinks(projectId).then(setLinks);
  useEffect(() => {
    load();
    setEditing(null);
  }, [projectId]);

<<<<<<< Updated upstream
  const seedWebLinks = async () => {
    const existing = new Set(links.map((l) => (l.title || "").toLowerCase()));
    for (const l of QUICK_WEB_LINKS) {
      if (existing.has(l.title.toLowerCase())) continue;
      await api.saveLink(projectId, l.title, l.url, l.type, l.description);
    }
=======
  const saveLink = async () => {
    if (!editing) return;
    setError("");
    const title = String(editing.title || "").trim();
    const url = String(editing.url || "").trim();
    if (!title || !url) {
      setError("Vyplň název i URL.");
      return;
    }
    if (!/^https?:\/\//i.test(url)) {
      setError("URL musí začínat http:// nebo https://.");
      return;
    }
    await api.saveLink(projectId, title, url, editing.type || undefined, editing.description || undefined, editing.id);
    setEditing(null);
>>>>>>> Stashed changes
    load();
  };

  return (
    <div className="card">
      <div className="row between" style={{ marginBottom: 10 }}>
        <strong>Odkazy</strong>
<<<<<<< Updated upstream
        <div className="row">
          <button className="ghost" onClick={seedWebLinks}>Vložit web nástroje</button>
          <button className="primary" onClick={() => setEditing({})}>
            + Přidat odkaz
          </button>
        </div>
=======
        <button className="primary" onClick={() => setEditing({ title: "", url: "", type: "", description: "" })}>
          + Přidat odkaz
        </button>
>>>>>>> Stashed changes
      </div>
      {editing && (
        <div className="inline-form">
          <div className="grid2">
            <div className="field">
              <label>Název</label>
              <input autoFocus value={editing.title || ""} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
            </div>
            <div className="field">
              <label>Typ</label>
              <input value={editing.type || ""} onChange={(e) => setEditing({ ...editing, type: e.target.value })} placeholder="web, admin, hosting…" />
            </div>
          </div>
          <div className="field">
            <label>URL</label>
            <input value={editing.url || ""} onChange={(e) => setEditing({ ...editing, url: e.target.value })} placeholder="https://…" />
          </div>
          <div className="field">
            <label>Popis</label>
            <input value={editing.description || ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
          </div>
          <div className="row">
            <button className="primary" onClick={saveLink}>Uložit odkaz</button>
            <button className="ghost" onClick={() => { setEditing(null); setError(""); }}>Zrušit</button>
          </div>
          {error && <div className="error">{error}</div>}
        </div>
      )}
      {links.length === 0 ? (
        <div className="muted">Žádné odkazy.</div>
      ) : (
        links.map((l) => (
          <div key={l.id} className="list-item">
            <span>🔗</span>
<<<<<<< Updated upstream
            <div style={{ minWidth: 0 }}>
              <div className="row" style={{ gap: 6 }}>
                <span>{l.title}</span>
                {l.type && <span className="badge">{l.type}</span>}
              </div>
              <a href={l.url} target="_blank" rel="noreferrer" className="muted">
                {l.url}
              </a>
            </div>
            <span className="spacer" />
            <button className="ghost" onClick={() => setEditing(l)}>
              Upravit
            </button>
            <button
              className="ghost danger"
              onClick={async () => {
                const ok = await confirmDialog({ title: "Smazat odkaz?", message: l.title, confirmLabel: "Smazat", danger: true });
                if (ok) { await api.deleteLink(l.id); load(); }
              }}
            >
=======
            <div>
              <div>{l.title}</div>
              <button className="link-button muted" onClick={() => api.openExternalUrl(l.url)}>{l.url}</button>
            </div>
            <span className="spacer" />
            <button className="ghost" onClick={() => setEditing(l)}>Upravit</button>
            <button className="ghost danger" onClick={async () => { if (confirm(`Smazat odkaz „${l.title}“?`)) { await api.deleteLink(l.id); load(); } }}>
>>>>>>> Stashed changes
              ✕
            </button>
          </div>
        ))
      )}
      {editing && (
        <LinkModal
          projectId={projectId}
          link={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
}

function LinkModal({
  projectId,
  link,
  onClose,
  onSaved,
}: {
  projectId: string;
  link: Row;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(link.title || "");
  const [url, setUrl] = useState(link.url || "");
  const [ltype, setLtype] = useState(link.type || "");
  const [description, setDescription] = useState(link.description || "");

  const save = async () => {
    if (!title.trim() || !url.trim()) return;
    await api.saveLink(projectId, title.trim(), url.trim(), ltype || undefined, description || undefined, link.id);
    onSaved();
  };

  return (
    <Modal
      title={link.id ? "Upravit odkaz" : "Nový odkaz"}
      onClose={onClose}
      footer={
        <>
          <button className="ghost" onClick={onClose}>Zrušit</button>
          <button className="primary" onClick={save} disabled={!title.trim() || !url.trim()}>Uložit</button>
        </>
      }
    >
      <div className="field">
        <label>Název *</label>
        <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Např. Produkční web" />
      </div>
      <div className="field">
        <label>URL *</label>
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
      </div>
      <div className="field">
        <label>Typ</label>
        <select value={ltype} onChange={(e) => setLtype(e.target.value)}>
          {LINK_TYPES.map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>Popis</label>
        <input value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
    </Modal>
  );
}

// ----------------------------- Přístupy ----------------------------------

const CRED_TYPES = [
  ["", "—"],
  ["admin", "Administrace / CMS"],
  ["hosting", "Hosting"],
  ["ftp", "FTP / SFTP"],
  ["db", "Databáze"],
  ["email", "E-mail"],
  ["domain", "Doména / registrátor"],
  ["api", "API klíč"],
  ["server", "Server / SSH"],
] as const;

function Credentials({ projectId }: { projectId: string }) {
  const [creds, setCreds] = useState<Row[]>([]);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<Row | null>(null);
<<<<<<< Updated upstream
=======
  const [error, setError] = useState("");
>>>>>>> Stashed changes
  const load = () => api.listCredentials(projectId).then(setCreds);
  useEffect(() => {
    load();
    setRevealed({});
    setEditing(null);
  }, [projectId]);

<<<<<<< Updated upstream
=======
  const saveCredential = async () => {
    if (!editing) return;
    setError("");
    const title = String(editing.title || "").trim();
    if (!title) {
      setError("Vyplň název přístupu.");
      return;
    }
    const secret = editing.secret === "" && editing.id ? undefined : editing.secret;
    await api.saveCredential({
      id: editing.id,
      projectId,
      title,
      ctype: editing.type || undefined,
      username: editing.username || undefined,
      secret,
      url: editing.url || undefined,
      note: editing.note || undefined,
    });
    setEditing(null);
    load();
  };

>>>>>>> Stashed changes
  const reveal = async (id: string) => {
    if (revealed[id] !== undefined) {
      const next = { ...revealed };
      delete next[id];
      setRevealed(next);
    } else {
      const secret = await api.revealCredential(id);
      setRevealed({ ...revealed, [id]: secret });
    }
  };

  const copy = async (id: string) => {
    const secret = await api.revealCredential(id);
    await navigator.clipboard.writeText(secret);
    setTimeout(() => navigator.clipboard.writeText(""), 25000); // auto-clear za 25 s
  };

  return (
    <div className="card">
      <div className="row between" style={{ marginBottom: 10 }}>
        <strong>Přístupy a hesla</strong>
<<<<<<< Updated upstream
        <button className="primary" onClick={() => setEditing({})}>
=======
        <button className="primary" onClick={() => setEditing({ title: "", type: "", username: "", secret: "", url: "", note: "" })}>
>>>>>>> Stashed changes
          + Přidat přístup
        </button>
      </div>
      <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
        Hesla jsou uložená v šifrované databázi (SQLCipher). Zobrazí se až po vyžádání.
      </div>
      {editing && (
        <div className="inline-form">
          <div className="grid2">
            <div className="field">
              <label>Název</label>
              <input autoFocus value={editing.title || ""} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
            </div>
            <div className="field">
              <label>Typ</label>
              <input value={editing.type || ""} onChange={(e) => setEditing({ ...editing, type: e.target.value })} placeholder="admin, ftp, hosting…" />
            </div>
            <div className="field">
              <label>Login</label>
              <input value={editing.username || ""} onChange={(e) => setEditing({ ...editing, username: e.target.value })} />
            </div>
            <div className="field">
              <label>Heslo {editing.id && <span className="muted">(prázdné = beze změny)</span>}</label>
              <input type="password" value={editing.secret || ""} onChange={(e) => setEditing({ ...editing, secret: e.target.value })} />
            </div>
          </div>
          <div className="field">
            <label>URL</label>
            <input value={editing.url || ""} onChange={(e) => setEditing({ ...editing, url: e.target.value })} placeholder="https://…" />
          </div>
          <div className="field">
            <label>Poznámka</label>
            <input value={editing.note || ""} onChange={(e) => setEditing({ ...editing, note: e.target.value })} />
          </div>
          <div className="row">
            <button className="primary" onClick={saveCredential}>Uložit přístup</button>
            <button className="ghost" onClick={() => { setEditing(null); setError(""); }}>Zrušit</button>
          </div>
          {error && <div className="error">{error}</div>}
        </div>
      )}
      {creds.length === 0 ? (
        <div className="muted">Žádné přístupy.</div>
      ) : (
        creds.map((c) => (
          <div key={c.id} className="list-item">
            <span>🔑</span>
            <div style={{ minWidth: 0 }}>
              <div className="row" style={{ gap: 6 }}>
                <span>{c.title}</span>
                {c.type && <span className="badge">{c.type}</span>}
              </div>
              <div className="muted">
                {c.username} {c.url ? "· " + c.url : ""}
              </div>
              {revealed[c.id] !== undefined && (
                <code className="kbd">{revealed[c.id] || "(prázdné)"}</code>
              )}
            </div>
            <span className="spacer" />
            <button className="ghost" onClick={() => reveal(c.id)}>
              {revealed[c.id] !== undefined ? "Skrýt" : "Zobrazit"}
            </button>
            <button className="ghost" onClick={() => copy(c.id)}>
              Kopírovat
            </button>
<<<<<<< Updated upstream
            <button className="ghost" onClick={() => setEditing(c)}>
              Upravit
            </button>
            <button
              className="ghost danger"
              onClick={async () => {
                const ok = await confirmDialog({ title: "Smazat přístup?", message: c.title, confirmLabel: "Smazat", danger: true });
                if (ok) { await api.deleteCredential(c.id); load(); }
              }}
            >
=======
            <button className="ghost" onClick={() => setEditing({ ...c, secret: "" })}>Upravit</button>
            <button className="ghost danger" onClick={async () => { if (confirm(`Smazat přístup „${c.title}“?`)) { await api.deleteCredential(c.id); load(); } }}>
>>>>>>> Stashed changes
              ✕
            </button>
          </div>
        ))
      )}
      {editing && (
        <CredentialModal
          projectId={projectId}
          cred={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
}

function CredentialModal({
  projectId,
  cred,
  onClose,
  onSaved,
}: {
  projectId: string;
  cred: Row;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!cred.id;
  const [title, setTitle] = useState(cred.title || "");
  const [ctype, setCtype] = useState(cred.type || "");
  const [username, setUsername] = useState(cred.username || "");
  const [secret, setSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [url, setUrl] = useState(cred.url || "");
  const [note, setNote] = useState(cred.note || "");

  const save = async () => {
    if (!title.trim()) return;
    await api.saveCredential({
      id: cred.id,
      projectId,
      title: title.trim(),
      ctype: ctype || undefined,
      username: username || undefined,
      // Pri editaci prazdne heslo = ponechat puvodni (backend to tak resi).
      secret: isEdit ? (secret ? secret : undefined) : secret || undefined,
      url: url || undefined,
      note: note || undefined,
    });
    onSaved();
  };

  return (
    <Modal
      title={isEdit ? "Upravit přístup" : "Nový přístup"}
      onClose={onClose}
      footer={
        <>
          <button className="ghost" onClick={onClose}>Zrušit</button>
          <button className="primary" onClick={save} disabled={!title.trim()}>Uložit</button>
        </>
      }
    >
      <div className="field">
        <label>Název *</label>
        <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Např. WordPress admin" />
      </div>
      <div className="field">
        <label>Typ</label>
        <select value={ctype} onChange={(e) => setCtype(e.target.value)}>
          {CRED_TYPES.map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>Login</label>
        <input value={username} onChange={(e) => setUsername(e.target.value)} />
      </div>
      <div className="field">
        <label>Heslo {isEdit && <span className="muted">(prázdné = beze změny)</span>}</label>
        <div className="row" style={{ gap: 6 }}>
          <input
            type={showSecret ? "text" : "password"}
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder={isEdit ? "••••••• (ponech prázdné)" : ""}
          />
          <button className="ghost" type="button" onClick={() => setShowSecret((s) => !s)}>
            {showSecret ? "Skrýt" : "Zobrazit"}
          </button>
        </div>
      </div>
      <div className="field">
        <label>URL</label>
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
      </div>
      <div className="field">
        <label>Poznámka</label>
        <input value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
    </Modal>
  );
}

// ----------------------------- Úkoly -------------------------------------

const TASK_STATUS = ["new", "in_progress", "waiting", "done", "cancelled"];
const TASK_STATUS_LABEL: Record<string, string> = {
  new: "nové",
  in_progress: "rozpracované",
  waiting: "čeká",
  done: "hotovo",
  cancelled: "zrušeno",
};
<<<<<<< Updated upstream
const TASK_PRIORITY = [
  ["low", "nízká"],
  ["normal", "běžná"],
  ["high", "vysoká"],
  ["urgent", "urgentní"],
] as const;
=======
>>>>>>> Stashed changes

function Tasks({ projectId }: { projectId: string }) {
  const [tasks, setTasks] = useState<Row[]>([]);
  const [editing, setEditing] = useState<Row | null>(null);
<<<<<<< Updated upstream
=======
  const [error, setError] = useState("");
>>>>>>> Stashed changes
  const load = () => api.listTasks(projectId).then(setTasks);
  useEffect(() => {
    load();
    setEditing(null);
  }, [projectId]);

<<<<<<< Updated upstream
=======
  const saveTask = async () => {
    if (!editing) return;
    setError("");
    const title = String(editing.title || "").trim();
    if (!title) {
      setError("Vyplň název úkolu.");
      return;
    }
    await api.saveTask({
      id: editing.id,
      projectId,
      title,
      status: editing.status || "new",
      priority: editing.priority || "normal",
      dueDate: editing.due_date || undefined,
    });
    setEditing(null);
    load();
  };

>>>>>>> Stashed changes
  const cycle = async (t: Row) => {
    const idx = TASK_STATUS.indexOf(t.status);
    const next = TASK_STATUS[(idx + 1) % TASK_STATUS.length];
    await api.saveTask({
      id: t.id,
      projectId,
      title: t.title,
      status: next,
      priority: t.priority,
      dueDate: t.due_date || undefined,
    });
    load();
  };

<<<<<<< Updated upstream
  const overdue = (t: Row) =>
    t.due_date && t.status !== "done" && t.status !== "cancelled" && t.due_date.slice(0, 10) < new Date().toISOString().slice(0, 10);

  const seedLaunchChecklist = async () => {
    const existing = new Set(tasks.map((t) => (t.title || "").toLowerCase()));
    for (const item of LAUNCH_CHECKLIST) {
      if (existing.has(item.title.toLowerCase())) continue;
      await api.saveTask({
        projectId,
        title: item.title,
        status: "new",
        priority: item.priority,
      });
    }
    load();
  };

  const launchTasks = tasks.filter((t) => isLaunchTask(t.title || ""));
  const doneLaunch = launchTasks.filter((t) => t.status === "done").length;
  const launchPct = launchTasks.length ? Math.round((doneLaunch / launchTasks.length) * 100) : 0;

=======
  const toggleDone = async (t: Row) => {
    await api.saveTask({
      id: t.id,
      projectId,
      title: t.title,
      status: t.status === "done" ? "new" : "done",
      priority: t.priority,
      dueDate: t.due_date || undefined,
    });
    load();
  };

>>>>>>> Stashed changes
  return (
    <div className="card">
      <div className="row between" style={{ marginBottom: 10 }}>
        <strong>Úkoly</strong>
<<<<<<< Updated upstream
        <div className="row">
          <button className="ghost" onClick={seedLaunchChecklist}>Vložit checklist spuštění</button>
          <button className="primary" onClick={() => setEditing({})}>
            + Nový úkol
          </button>
        </div>
      </div>
      {launchTasks.length > 0 && (
        <div className="mini-launch">
          <div className="row between">
            <span>Checklist spuštění webu</span>
            <strong>{doneLaunch}/{launchTasks.length} hotovo · {launchPct}%</strong>
          </div>
          <div className="launch-progress"><span style={{ width: `${launchPct}%` }} /></div>
=======
        <button className="primary" onClick={() => setEditing({ title: "", status: "new", priority: "normal", due_date: "" })}>
          + Nový úkol
        </button>
      </div>
      {editing && (
        <div className="inline-form">
          <div className="field">
            <label>Název úkolu</label>
            <input autoFocus value={editing.title || ""} onChange={(e) => setEditing({ ...editing, title: e.target.value })} onKeyDown={(e) => e.key === "Enter" && saveTask()} />
          </div>
          <div className="grid2">
            <div className="field">
              <label>Stav</label>
              <select value={editing.status || "new"} onChange={(e) => setEditing({ ...editing, status: e.target.value })}>
                {TASK_STATUS.map((s) => <option key={s} value={s}>{TASK_STATUS_LABEL[s]}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Priorita</label>
              <select value={editing.priority || "normal"} onChange={(e) => setEditing({ ...editing, priority: e.target.value })}>
                <option value="low">nízká</option>
                <option value="normal">běžná</option>
                <option value="high">vysoká</option>
                <option value="urgent">urgentní</option>
              </select>
            </div>
          </div>
          <div className="field">
            <label>Termín</label>
            <input type="date" value={(editing.due_date || "").slice(0, 10)} onChange={(e) => setEditing({ ...editing, due_date: e.target.value })} />
          </div>
          <div className="row">
            <button className="primary" onClick={saveTask}>Uložit úkol</button>
            <button className="ghost" onClick={() => { setEditing(null); setError(""); }}>Zrušit</button>
          </div>
          {error && <div className="error">{error}</div>}
>>>>>>> Stashed changes
        </div>
      )}
      {tasks.length === 0 ? (
        <div className="empty">
          <div>Žádné úkoly.</div>
          <div className="muted" style={{ marginTop: 8, fontSize: 13 }}>
            Pro web začni tlačítkem <strong>Vložit checklist spuštění</strong> — dostaneš kroky pro doménu, hosting, SSL, SEO, formuláře i předání.
          </div>
        </div>
      ) : (
        tasks.map((t) => (
<<<<<<< Updated upstream
          <div key={t.id} className="list-item">
            <button className="badge" title="Klikni pro změnu stavu" onClick={() => cycle(t)}>
              {TASK_STATUS_LABEL[t.status] || t.status}
            </button>
            <span
              style={{
                textDecoration: t.status === "done" ? "line-through" : "none",
                opacity: t.status === "cancelled" ? 0.5 : 1,
                cursor: "pointer",
              }}
              onClick={() => setEditing(t)}
            >
=======
          <div key={t.id} className={"list-item task-row " + (t.status === "done" ? "done" : "")}>
            <button className="task-check" aria-pressed={t.status === "done"} onClick={() => toggleDone(t)}>
              {t.status === "done" ? "✓" : ""}
            </button>
            <button className="badge" title="Klikni pro další stav" onClick={() => cycle(t)}>
              {TASK_STATUS_LABEL[t.status] || t.status}
            </button>
            <span style={{ textDecoration: t.status === "done" ? "line-through" : "none", cursor: "pointer" }} onClick={() => setEditing(t)}>
>>>>>>> Stashed changes
              {t.title}
            </span>
            {t.priority === "high" && <span className="badge">⬆ vysoká</span>}
            {t.priority === "urgent" && <span className="badge" style={{ color: "var(--danger)" }}>⚠ urgentní</span>}
            <span className="spacer" />
<<<<<<< Updated upstream
            {t.due_date && (
              <span className="muted" style={{ color: overdue(t) ? "var(--danger)" : undefined }}>
                {t.due_date.slice(0, 10)}
              </span>
            )}
            <button
              className="ghost danger"
              onClick={async () => {
                const ok = await confirmDialog({ title: "Smazat úkol?", message: t.title, confirmLabel: "Smazat", danger: true });
                if (ok) { await api.deleteTask(t.id); load(); }
              }}
            >
=======
            {t.due_date && <span className="muted">{t.due_date.slice(0, 10)}</span>}
            <button className="ghost danger" onClick={async () => { if (confirm(`Smazat úkol „${t.title}“?`)) { await api.deleteTask(t.id); load(); } }}>
>>>>>>> Stashed changes
              ✕
            </button>
          </div>
        ))
      )}
      {editing && (
        <TaskModal
          projectId={projectId}
          task={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
}

<<<<<<< Updated upstream
function TaskModal({
  projectId,
  task,
  onClose,
  onSaved,
}: {
  projectId: string;
  task: Row;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(task.title || "");
  const [status, setStatus] = useState(task.status || "new");
  const [priority, setPriority] = useState(task.priority || "normal");
  const [dueDate, setDueDate] = useState((task.due_date || "").slice(0, 10));

  const save = async () => {
    if (!title.trim()) return;
    await api.saveTask({
      id: task.id,
      projectId,
      title: title.trim(),
      status,
      priority,
      dueDate: dueDate || undefined,
    });
    onSaved();
  };

  return (
    <Modal
      title={task.id ? "Upravit úkol" : "Nový úkol"}
      onClose={onClose}
      footer={
        <>
          <button className="ghost" onClick={onClose}>Zrušit</button>
          <button className="primary" onClick={save} disabled={!title.trim()}>Uložit</button>
        </>
      }
    >
      <div className="field">
        <label>Název úkolu *</label>
        <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} />
      </div>
      <div className="grid2">
        <div className="field">
          <label>Stav</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            {TASK_STATUS.map((s) => (
              <option key={s} value={s}>{TASK_STATUS_LABEL[s]}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Priorita</label>
          <select value={priority} onChange={(e) => setPriority(e.target.value)}>
            {TASK_PRIORITY.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="field">
        <label>Termín</label>
        <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
      </div>
    </Modal>
=======
// ----------------------------- Monitoring ---------------------------------

function sslDaysLeft(iso?: string | null): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  return Math.floor(ms / 86400000);
}

function Monitoring({ projectId }: { projectId: string }) {
  const [monitors, setMonitors] = useState<Row[]>([]);
  const [checking, setChecking] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<Row | null>(null);
  const [error, setError] = useState("");
  const load = () => api.listMonitors(projectId).then(setMonitors);
  useEffect(() => {
    load();
    setEditing(null);
  }, [projectId]);

  const saveMonitor = async () => {
    if (!editing) return;
    setError("");
    const label = String(editing.label || "").trim();
    const url = String(editing.url || "").trim();
    if (!label || !url) {
      setError("Vyplň popis i URL.");
      return;
    }
    if (!/^https?:\/\//i.test(url)) {
      setError("URL musí začínat http:// nebo https://.");
      return;
    }
    await api.saveMonitor(projectId, label, url, editing.id);
    setEditing(null);
    load();
  };

  const check = async (id: string) => {
    setChecking((c) => ({ ...c, [id]: true }));
    try {
      const updated = await api.checkMonitor(id);
      setMonitors((ms) => ms.map((m) => (m.id === id ? updated : m)));
    } catch (e) {
      console.error(e);
    } finally {
      setChecking((c) => ({ ...c, [id]: false }));
    }
  };

  const checkAll = async () => {
    for (const m of monitors) await check(m.id);
  };

  return (
    <div className="card">
      <div className="row between" style={{ marginBottom: 10 }}>
        <strong>Monitoring webů</strong>
        <div className="row">
          {monitors.length > 0 && (
            <button className="ghost" onClick={checkAll}>
              Zkontrolovat vše
            </button>
          )}
          <button className="primary" onClick={() => setEditing({ label: "", url: "" })}>
            + Přidat web
          </button>
        </div>
      </div>
      <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
        Kontrola dostupnosti (HTTP status + latence) a expirace SSL certifikátu. Spouští se ručně.
      </div>
      {editing && (
        <div className="inline-form">
          <div className="grid2">
            <div className="field">
              <label>Popis</label>
              <input autoFocus value={editing.label || ""} onChange={(e) => setEditing({ ...editing, label: e.target.value })} placeholder="Produkční web" />
            </div>
            <div className="field">
              <label>URL</label>
              <input value={editing.url || ""} onChange={(e) => setEditing({ ...editing, url: e.target.value })} placeholder="https://www.klient.cz" />
            </div>
          </div>
          <div className="row">
            <button className="primary" onClick={saveMonitor}>Uložit monitoring</button>
            <button className="ghost" onClick={() => { setEditing(null); setError(""); }}>Zrušit</button>
          </div>
          {error && <div className="error">{error}</div>}
        </div>
      )}
      {monitors.length === 0 ? (
        <div className="muted">Žádné weby. Přidej web tlačítkem nahoře.</div>
      ) : (
        monitors.map((m) => {
          const days = sslDaysLeft(m.ssl_expires_at);
          const ok = m.last_ok === 1;
          return (
            <div key={m.id} className="list-item" style={{ alignItems: "flex-start" }}>
              <span title={m.last_checked_at ? (ok ? "Dostupné" : "Nedostupné") : "Nezkontrolováno"}>
                {m.last_checked_at ? (ok ? "🟢" : "🔴") : "⚪"}
              </span>
              <div>
                <div>{m.label}</div>
                <div className="muted" style={{ fontSize: 12 }}>
                  {m.url}
                </div>
                {m.last_checked_at && (
                  <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                    {m.last_status ? `HTTP ${m.last_status}` : "nedostupné"}
                    {m.last_latency_ms != null ? ` · ${m.last_latency_ms} ms` : ""}
                    {m.last_error ? ` · ${m.last_error}` : ""}
                    {days != null && (
                      <>
                        {" · "}
                        <span style={{ color: days < 14 ? "var(--danger, #e44)" : "inherit" }}>
                          SSL {days >= 0 ? `vyprší za ${days} dní` : `vypršel před ${-days} dny`}
                        </span>
                      </>
                    )}
                  </div>
                )}
              </div>
              <span className="spacer" />
              <button className="ghost" disabled={checking[m.id]} onClick={() => check(m.id)}>
                {checking[m.id] ? "…" : "Zkontrolovat"}
              </button>
              <button className="ghost" onClick={() => setEditing(m)}>Upravit</button>
              <button
                className="ghost danger"
                onClick={async () => {
                  if (confirm(`Odebrat monitoring „${m.label}“?`)) {
                    await api.deleteMonitor(m.id);
                    load();
                  }
                }}
              >
                ✕
              </button>
            </div>
          );
        })
      )}
    </div>
  );
}

// ----------------------------- Export -------------------------------------

function ExportTab({ project }: { project: Project }) {
  const [srcDir, setSrcDir] = useState<string>("");
  const [baseUrl, setBaseUrl] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ files: number; bytes: number; zipPath: string } | null>(null);
  const [error, setError] = useState<string>("");

  const pickFolder = async () => {
    const dir = await open({ directory: true, title: "Vyber složku webu k exportu" });
    if (typeof dir === "string") setSrcDir(dir);
  };

  const slug = (project.name || "web")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  const doExport = async () => {
    setError("");
    setResult(null);
    if (!srcDir) {
      setError("Nejdřív vyber složku webu.");
      return;
    }
    const destZip = await save({
      title: "Uložit ZIP pro zákazníka",
      defaultPath: `${slug || "web"}-export.zip`,
      filters: [{ name: "ZIP archiv", extensions: ["zip"] }],
    });
    if (!destZip) return;
    setBusy(true);
    try {
      const r = await api.exportSite({
        srcDir,
        destZip,
        projectName: project.name || "Web",
        client: project.client || undefined,
        baseUrl: baseUrl || undefined,
        projectId: project.id,
      });
      setResult(r);
    } catch (e: any) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <strong>Export webu pro zákazníka</strong>
      <div className="muted" style={{ fontSize: 12, margin: "6px 0 14px" }}>
        Vybranou složku zabalí do ZIPu připraveného k předání — vyhodí{" "}
        <code className="kbd">node_modules</code>, <code className="kbd">.git</code>, build složky
        a citlivé soubory (<code className="kbd">.env</code>) a přidá <code className="kbd">HANDOFF.md</code>{" "}
        s pokyny pro nasazení.
      </div>

      <div className="field">
        <label>Složka webu</label>
        <div className="row">
          <input
            value={srcDir}
            placeholder="Vyber složku se zdrojem webu…"
            onChange={(e) => setSrcDir(e.target.value)}
            style={{ flex: 1 }}
          />
          <button className="ghost" onClick={pickFolder}>
            Procházet…
          </button>
        </div>
      </div>

      <div className="field">
        <label>Cílová adresa / doména (volitelné)</label>
        <input
          value={baseUrl}
          placeholder="např. https://www.klient.cz"
          onChange={(e) => setBaseUrl(e.target.value)}
        />
      </div>

      <button className="primary" disabled={busy} onClick={doExport}>
        {busy ? "Balím…" : "📦 Vytvořit ZIP pro zákazníka"}
      </button>

      {error && (
        <div className="muted" style={{ color: "var(--danger, #e44)", marginTop: 12 }}>
          {error}
        </div>
      )}
      {result && (
        <div style={{ marginTop: 14 }}>
          <div>✅ Hotovo — {result.files} souborů, {(result.bytes / 1024 / 1024).toFixed(2)} MB.</div>
          <code className="kbd" style={{ display: "inline-block", marginTop: 6 }}>
            {result.zipPath}
          </code>
        </div>
      )}
    </div>
>>>>>>> Stashed changes
  );
}

// ----------------------------- Historie ----------------------------------

function History({ projectId }: { projectId: string }) {
  const [events, setEvents] = useState<Row[]>([]);
  useEffect(() => {
    api.listEvents(projectId).then(setEvents);
  }, [projectId]);

  return (
    <div className="card">
      <strong>Historie projektu</strong>
      <div style={{ marginTop: 10 }}>
        {events.length === 0 ? (
          <div className="muted">Zatím žádné události.</div>
        ) : (
          events.map((e) => (
            <div key={e.id} className="list-item">
              <span className="badge">{e.type}</span>
              <span>{e.title}</span>
              <span className="spacer" />
              <span className="muted">{(e.created_at || "").replace("T", " ").slice(0, 16)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
