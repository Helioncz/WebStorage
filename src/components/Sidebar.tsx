import { useEffect, useState } from "react";
import { api, Project, Row } from "../lib/api";
import { useStore } from "../store/useStore";

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
  const [displayName, setDisplayName] = useState(localStorage.getItem("displayName") || "Lokální uživatel");

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
        <button className="primary" style={{ flex: 1 }} onClick={() => openNewProject()}>
          + Nový projekt
        </button>
        <button className="ghost" title={`Motiv: ${THEME_LABEL[theme] || theme} (klikni pro další)`} onClick={toggleTheme}>
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
