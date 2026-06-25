import { useEffect, useState } from "react";
import { api, Project, Row } from "../lib/api";
import { useStore } from "../store/useStore";
import CloudSync from "./CloudSync";

export const STATUS_COLOR: Record<string, string> = {
  lead: "#9aa3b2",
  active: "#3ecf8e",
  waiting: "#f0b429",
  done: "#4f8cff",
  archived: "#5a6473",
};

export default function Sidebar() {
  const { selectedProjectId, openProject, openDashboard, openSites, openNewProject, gotoSettings, openHelp, refreshKey, theme, toggleTheme } = useStore();
  const THEME_LABEL: Record<string, string> = { dark: "Tmavý", light: "Světlý", ocean: "Oceán", rose: "Růžová" };
  const [projects, setProjects] = useState<Project[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Row[] | null>(null);
<<<<<<< Updated upstream
  const [displayName, setDisplayName] = useState(localStorage.getItem("displayName") || "Lokální uživatel");
=======
  const [creating, setCreating] = useState(false);
  const [cloudOpen, setCloudOpen] = useState(false);
>>>>>>> Stashed changes

  useEffect(() => {
    api.listProjects().then(setProjects).catch(console.error);
    setDisplayName(localStorage.getItem("displayName") || "Lokální uživatel");
  }, [refreshKey]);

  useEffect(() => {
    if (!query.trim()) {
      setResults(null);
      return;
    }
    const t = setTimeout(() => api.search(query).then(setResults).catch(console.error), 200);
    return () => clearTimeout(t);
  }, [query]);

  return (
    <aside className="sidebar">
      {creating && (
        <NewProjectModal
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            refresh();
            openProject(id);
          }}
        />
      )}
      {cloudOpen && <CloudSync onClose={() => setCloudOpen(false)} />}
      <div className="sidebar-head">
        <div className="brand-block">
          <span className="brand">▣ Hangar</span>
          <button className="user-pill" title="Otevřít nastavení profilu" onClick={gotoSettings}>👤 {displayName}</button>
        </div>
        <span className="spacer" />
        <button className="ghost" title="Dashboard" onClick={openDashboard}>
          ⌂
        </button>
        <button className="ghost" title="Weby" onClick={openSites}>
          🌐
        </button>
        <button className="ghost" title="Nastavení" onClick={gotoSettings}>
          ⚙
        </button>
        <button className="ghost" title="Nápověda" onClick={openHelp}>
          ?
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

      <div className="sidebar-foot">
<<<<<<< Updated upstream
        <button className="primary" style={{ flex: 1 }} onClick={() => openNewProject()}>
          + Nový projekt
        </button>
        <button className="ghost" title={`Motiv: ${THEME_LABEL[theme] || theme} (klikni pro další)`} onClick={toggleTheme}>
=======
        <button className="primary" style={{ flex: 1 }} onClick={() => setCreating(true)}>
          + Nový projekt
        </button>
        <button className="ghost" title="Cloud sync" onClick={() => setCloudOpen(true)}>
          ☁
        </button>
        <button className="ghost" title="Přepnout motiv" onClick={useStore.getState().toggleTheme}>
>>>>>>> Stashed changes
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

// ----------------------------- Nový projekt / šablony --------------------

function NewProjectModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [client, setClient] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [templates, setTemplates] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.listTemplates().then(setTemplates).catch(console.error);
  }, []);

  const submit = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const id = templateId
        ? await api.createProjectFromTemplate(templateId, name.trim(), client || undefined)
        : await api.createProject(name.trim(), client || undefined);
      onCreated(id);
    } catch (e) {
      console.error(e);
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <strong>Nový projekt</strong>
        <div className="field" style={{ marginTop: 10 }}>
          <label>Název</label>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label>Klient / firma (volitelné)</label>
          <input value={client} onChange={(e) => setClient(e.target.value)} />
        </div>
        <div className="field">
          <label>Šablona</label>
          <select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            <option value="">Prázdný projekt</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.is_builtin ? "" : " (vlastní)"}
              </option>
            ))}
          </select>
          {templateId && (
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              {templates.find((t) => t.id === templateId)?.description}
            </div>
          )}
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <button className="primary" disabled={busy || !name.trim()} onClick={submit}>
            {busy ? "Zakládám…" : "Vytvořit"}
          </button>
          <button className="ghost" onClick={onClose}>
            Zrušit
          </button>
        </div>
      </div>
    </div>
  );
}
