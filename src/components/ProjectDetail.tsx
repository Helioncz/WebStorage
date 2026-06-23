import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { api, Project, Row } from "../lib/api";
import { useStore } from "../store/useStore";
import { STATUS_COLOR } from "./Sidebar";
import { Modal, confirmDialog } from "./Modal";

const TABS = ["Přehled", "Soubory", "Poznámky", "Odkazy", "Přístupy", "Úkoly", "Historie"] as const;
type Tab = (typeof TABS)[number];

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
  );
}

// ----------------------------- Soubory -----------------------------------

function Files({ projectId }: { projectId: string }) {
  const [files, setFiles] = useState<Row[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
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
      <div className="row between" style={{ marginBottom: 10 }}>
        <strong>Soubory</strong>
        <button className="primary" onClick={pickFiles} disabled={busy}>
          {busy ? "Importuji…" : "+ Importovat soubory"}
        </button>
      </div>

      <div className={"dropzone" + (dragOver ? " over" : "")}>
        {dragOver ? "Pusť soubory sem…" : "Přetáhni soubory z Finderu sem (drag & drop)"}
      </div>

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
              ✕
            </button>
          </div>
        ))
      )}
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
            <button
              className="ghost danger"
              onClick={async () => {
                const ok = await confirmDialog({ title: "Smazat poznámku?", message: n.title, confirmLabel: "Smazat", danger: true });
                if (ok) { await api.deleteNote(n.id); load(); }
              }}
            >
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
  const load = () => api.listLinks(projectId).then(setLinks);
  useEffect(() => {
    load();
  }, [projectId]);

  return (
    <div className="card">
      <div className="row between" style={{ marginBottom: 10 }}>
        <strong>Odkazy</strong>
        <button className="primary" onClick={() => setEditing({})}>
          + Přidat odkaz
        </button>
      </div>
      {links.length === 0 ? (
        <div className="muted">Žádné odkazy.</div>
      ) : (
        links.map((l) => (
          <div key={l.id} className="list-item">
            <span>🔗</span>
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
  const load = () => api.listCredentials(projectId).then(setCreds);
  useEffect(() => {
    load();
    setRevealed({});
  }, [projectId]);

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
        <button className="primary" onClick={() => setEditing({})}>
          + Přidat přístup
        </button>
      </div>
      <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
        Hesla jsou uložená v šifrované databázi (SQLCipher). Zobrazí se až po vyžádání.
      </div>
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
const TASK_PRIORITY = [
  ["low", "nízká"],
  ["normal", "běžná"],
  ["high", "vysoká"],
  ["urgent", "urgentní"],
] as const;

function Tasks({ projectId }: { projectId: string }) {
  const [tasks, setTasks] = useState<Row[]>([]);
  const [editing, setEditing] = useState<Row | null>(null);
  const load = () => api.listTasks(projectId).then(setTasks);
  useEffect(() => {
    load();
  }, [projectId]);

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

  const overdue = (t: Row) =>
    t.due_date && t.status !== "done" && t.status !== "cancelled" && t.due_date.slice(0, 10) < new Date().toISOString().slice(0, 10);

  return (
    <div className="card">
      <div className="row between" style={{ marginBottom: 10 }}>
        <strong>Úkoly</strong>
        <button className="primary" onClick={() => setEditing({})}>
          + Nový úkol
        </button>
      </div>
      {tasks.length === 0 ? (
        <div className="muted">Žádné úkoly.</div>
      ) : (
        tasks.map((t) => (
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
              {t.title}
            </span>
            {t.priority === "high" && <span className="badge">⬆ vysoká</span>}
            {t.priority === "urgent" && <span className="badge" style={{ color: "var(--danger)" }}>⚠ urgentní</span>}
            <span className="spacer" />
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
