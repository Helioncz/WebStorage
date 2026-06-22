import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { api, Project, Row } from "../lib/api";
import { useStore } from "../store/useStore";
import { STATUS_COLOR } from "./Sidebar";

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
                if (confirm("Smazat projekt včetně všeho obsahu?")) {
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
  const load = () => api.listFiles(projectId).then(setFiles);
  useEffect(() => {
    load();
  }, [projectId]);

  const importFiles = async () => {
    const selected = await open({ multiple: true });
    if (!selected) return;
    const paths = Array.isArray(selected) ? selected : [selected];
    for (const p of paths) await api.importFile(projectId, p as string);
    load();
  };

  return (
    <div className="card">
      <div className="row between" style={{ marginBottom: 10 }}>
        <strong>Soubory</strong>
        <button className="primary" onClick={importFiles}>
          + Importovat soubory
        </button>
      </div>
      {files.length === 0 ? (
        <div className="muted">Žádné soubory. Importuj přes tlačítko nahoře.</div>
      ) : (
        files.map((f) => (
          <div key={f.id} className="list-item">
            <span>📄</span>
            <span className="name" style={{ cursor: "pointer" }} onClick={() => api.openFile(f.id)}>
              {f.name}
            </span>
            <span className="spacer" />
            <span className="muted">{(f.size / 1024).toFixed(0)} kB</span>
            <button className="ghost danger" onClick={async () => { await api.deleteFile(f.id); load(); }}>
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
            <button className="ghost danger" onClick={async () => { await api.deleteNote(n.id); load(); }}>
              ✕
            </button>
          </div>
        ))
      )}
    </div>
  );
}

// ----------------------------- Odkazy ------------------------------------

function Links({ projectId }: { projectId: string }) {
  const [links, setLinks] = useState<Row[]>([]);
  const load = () => api.listLinks(projectId).then(setLinks);
  useEffect(() => {
    load();
  }, [projectId]);

  const add = async () => {
    const title = prompt("Název odkazu:");
    if (!title) return;
    const url = prompt("URL:");
    if (!url) return;
    await api.saveLink(projectId, title, url);
    load();
  };

  return (
    <div className="card">
      <div className="row between" style={{ marginBottom: 10 }}>
        <strong>Odkazy</strong>
        <button className="primary" onClick={add}>
          + Přidat odkaz
        </button>
      </div>
      {links.length === 0 ? (
        <div className="muted">Žádné odkazy.</div>
      ) : (
        links.map((l) => (
          <div key={l.id} className="list-item">
            <span>🔗</span>
            <div>
              <div>{l.title}</div>
              <a href={l.url} target="_blank" rel="noreferrer" className="muted">
                {l.url}
              </a>
            </div>
            <span className="spacer" />
            <button className="ghost danger" onClick={async () => { await api.deleteLink(l.id); load(); }}>
              ✕
            </button>
          </div>
        ))
      )}
    </div>
  );
}

// ----------------------------- Přístupy ----------------------------------

function Credentials({ projectId }: { projectId: string }) {
  const [creds, setCreds] = useState<Row[]>([]);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const load = () => api.listCredentials(projectId).then(setCreds);
  useEffect(() => {
    load();
    setRevealed({});
  }, [projectId]);

  const add = async () => {
    const title = prompt("Název přístupu (např. WordPress admin):");
    if (!title) return;
    const username = prompt("Login:") || "";
    const secret = prompt("Heslo:") || "";
    const url = prompt("URL (volitelné):") || "";
    await api.saveCredential({ projectId, title, username, secret, url });
    load();
  };

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
        <button className="primary" onClick={add}>
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
            <div>
              <div>{c.title}</div>
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
            <button className="ghost danger" onClick={async () => { await api.deleteCredential(c.id); load(); }}>
              ✕
            </button>
          </div>
        ))
      )}
    </div>
  );
}

// ----------------------------- Úkoly -------------------------------------

const TASK_STATUS = ["new", "in_progress", "waiting", "done", "cancelled"];

function Tasks({ projectId }: { projectId: string }) {
  const [tasks, setTasks] = useState<Row[]>([]);
  const load = () => api.listTasks(projectId).then(setTasks);
  useEffect(() => {
    load();
  }, [projectId]);

  const add = async () => {
    const title = prompt("Název úkolu:");
    if (!title) return;
    await api.saveTask({ projectId, title, status: "new", priority: "normal" });
    load();
  };

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

  return (
    <div className="card">
      <div className="row between" style={{ marginBottom: 10 }}>
        <strong>Úkoly</strong>
        <button className="primary" onClick={add}>
          + Nový úkol
        </button>
      </div>
      {tasks.length === 0 ? (
        <div className="muted">Žádné úkoly.</div>
      ) : (
        tasks.map((t) => (
          <div key={t.id} className="list-item">
            <button className="badge" onClick={() => cycle(t)}>
              {t.status}
            </button>
            <span style={{ textDecoration: t.status === "done" ? "line-through" : "none" }}>
              {t.title}
            </span>
            <span className="spacer" />
            {t.due_date && <span className="muted">{t.due_date.slice(0, 10)}</span>}
            <button className="ghost danger" onClick={async () => { await api.deleteTask(t.id); load(); }}>
              ✕
            </button>
          </div>
        ))
      )}
    </div>
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
