import { useEffect, useState } from "react";
import { api, Project, Row } from "../lib/api";
import { useStore } from "../store/useStore";
import { Modal } from "./Modal";

export const STATUS_COLOR: Record<string, string> = {
  lead: "#9aa3b2",
  active: "#3ecf8e",
  waiting: "#f0b429",
  done: "#4f8cff",
  archived: "#5a6473",
};

export default function Sidebar() {
  const { selectedProjectId, openProject, openDashboard, openSites, refresh, refreshKey } = useStore();
  const [projects, setProjects] = useState<Project[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Row[] | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    api.listProjects().then(setProjects).catch(console.error);
  }, [refreshKey]);

  useEffect(() => {
    if (!query.trim()) {
      setResults(null);
      return;
    }
    const t = setTimeout(() => api.search(query).then(setResults).catch(console.error), 200);
    return () => clearTimeout(t);
  }, [query]);

  const handleCreated = (id: string) => {
    setCreating(false);
    refresh();
    openProject(id);
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <span className="brand">▣ Hangar</span>
        <span className="spacer" />
        <button className="ghost" title="Dashboard" onClick={openDashboard}>
          ⌂
        </button>
        <button className="ghost" title="Weby" onClick={openSites}>
          🌐
        </button>
      </div>

      <div className="search-box">
        <input
          placeholder="Hledat… (projekty, poznámky, soubory)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="proj-list">
        {results !== null ? (
          results.length === 0 ? (
            <div className="muted" style={{ padding: 10 }}>
              Nic nenalezeno.
            </div>
          ) : (
            results.map((r, i) => (
              <div
                key={i}
                className="proj-item"
                onClick={() => {
                  openProject(r.project_id);
                  setQuery("");
                }}
              >
                <span className="badge">{r.entity_type}</span>
                <span className="name">{r.title || "(bez názvu)"}</span>
              </div>
            ))
          )
        ) : (
          projects.map((p) => (
            <div
              key={p.id}
              className={"proj-item" + (p.id === selectedProjectId ? " active" : "")}
              onClick={() => openProject(p.id)}
            >
              <span
                className="dot"
                style={{ background: STATUS_COLOR[p.status] || "#888" }}
              />
              <span className="name">
                {p.is_favorite ? "★ " : ""}
                {p.name}
              </span>
            </div>
          ))
        )}
      </div>

      {creating && <NewProjectModal onClose={() => setCreating(false)} onCreated={handleCreated} />}

      <div className="sidebar-foot">
        <button className="primary" style={{ flex: 1 }} onClick={() => setCreating(true)}>
          + Nový projekt
        </button>
        <button className="ghost" title="Přepnout motiv" onClick={useStore.getState().toggleTheme}>
          ◐
        </button>
        <button
          className="ghost"
          title="Zamknout"
          onClick={async () => {
            await api.lock();
            useStore.getState().setUnlocked(false);
          }}
        >
          🔒
        </button>
      </div>
    </aside>
  );
}

function NewProjectModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [templates, setTemplates] = useState<Row[]>([]);
  const [tplKey, setTplKey] = useState<string>("web");
  const [name, setName] = useState("");
  const [client, setClient] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.listTemplates().then(setTemplates).catch(console.error);
  }, []);

  const selected = templates.find((t) => t.key === tplKey);

  const submit = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      const id =
        tplKey === "blank"
          ? await api.createProject(name.trim(), client.trim() || undefined)
          : await api.createProjectFromTemplate(tplKey, name.trim(), client.trim() || undefined);
      onCreated(id);
    } catch (e) {
      console.error(e);
      setBusy(false);
    }
  };

  const summary = (t?: Row) => {
    if (!t) return null;
    const c = t.counts || {};
    const parts: string[] = [];
    if (c.tasks) parts.push(`${c.tasks} úkolů`);
    if (c.links) parts.push(`${c.links} odkazů`);
    if (c.creds) parts.push(`${c.creds} přístupů`);
    if (c.files) parts.push(`startovací kód webu`);
    return parts.length ? parts.join(" · ") : "Bez předvyplněné struktury";
  };

  return (
    <Modal
      title="Nový projekt"
      width={560}
      onClose={onClose}
      footer={
        <>
          <button className="ghost" onClick={onClose}>
            Zrušit
          </button>
          <button className="primary" onClick={submit} disabled={!name.trim() || busy}>
            {busy ? "Zakládám…" : "Vytvořit"}
          </button>
        </>
      }
    >
      <div className="field">
        <label>Šablona</label>
        <div className="tpl-grid">
          {templates.map((t) => (
            <button
              key={t.key}
              type="button"
              className={"tpl-card" + (t.key === tplKey ? " active" : "")}
              onClick={() => setTplKey(t.key)}
            >
              <span className="tpl-ico">{t.icon}</span>
              <span className="tpl-name">{t.name}</span>
            </button>
          ))}
        </div>
        {selected && (
          <div className="tpl-desc">
            <div>{selected.description}</div>
            <div className="muted" style={{ marginTop: 4 }}>
              Předvyplní: <strong>{summary(selected)}</strong>
            </div>
          </div>
        )}
      </div>

      <div className="field">
        <label>Název projektu *</label>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Např. Web Kavárna U Lípy"
        />
      </div>
      <div className="field">
        <label>Klient / firma</label>
        <input value={client} onChange={(e) => setClient(e.target.value)} />
      </div>
    </Modal>
  );
}
