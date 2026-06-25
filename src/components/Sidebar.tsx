import { useEffect, useState } from "react";
import { api, Project, Row } from "../lib/api";
import { useStore } from "../store/useStore";
import Logo from "./Logo";
import CloudSync from "./CloudSync";

export const STATUS_COLOR: Record<string, string> = {
  lead: "#9aa3b2",
  active: "#3ecf8e",
  waiting: "#f0b429",
  done: "#4f8cff",
  archived: "#5a6473",
};

export default function Sidebar() {
  const { selectedProjectId, view, openProject, openDashboard, openSites, openNewProject, gotoSettings, openHelp, openRedesign, refreshKey, theme, toggleTheme } = useStore();
  const [projects, setProjects] = useState<Project[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Row[] | null>(null);
  const [displayName, setDisplayName] = useState(localStorage.getItem("displayName") || "Lokální uživatel");
  const [cloudOpen, setCloudOpen] = useState(false);

  useEffect(() => {
    api.listProjects().then(setProjects).catch(console.error);
    setDisplayName(localStorage.getItem("displayName") || "Lokální uživatel");
  }, [refreshKey]);

  useEffect(() => {
    if (!query.trim()) { setResults(null); return; }
    const t = setTimeout(() => api.search(query).then(setResults).catch(console.error), 200);
    return () => clearTimeout(t);
  }, [query]);

  const NAV: { key: string; label: string; icon: string; onClick: () => void }[] = [
    { key: "dashboard", label: "Přehled", icon: "⌂", onClick: openDashboard },
    { key: "sites", label: "Weby", icon: "🌐", onClick: openSites },
    { key: "redesign", label: "Import & Redesign", icon: "🪄", onClick: openRedesign },
    { key: "settings", label: "Nastavení", icon: "⚙", onClick: gotoSettings },
    { key: "help", label: "Nápověda", icon: "?", onClick: openHelp },
  ];

  const THEME_LABEL: Record<string, string> = { dark: "Tmavý", light: "Světlý", ocean: "Oceán", rose: "Růžová" };

  return (
    <aside className="sidebar">
      {cloudOpen && <CloudSync onClose={() => setCloudOpen(false)} />}
      <div className="sidebar-head">
        <span className="brand"><Logo size={26} /> <span className="brand-text">Project Hangar</span></span>
      </div>

      <div className="search-box">
        <input
          placeholder="Hledat…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <nav className="sidebar-nav">
        {NAV.map((n) => (
          <button
            key={n.key}
            className={"nav-item" + (view === n.key ? " active" : "")}
            onClick={n.onClick}
          >
            <span className="nav-ico">{n.icon}</span>
            <span className="nav-label">{n.label}</span>
          </button>
        ))}
      </nav>

      <div className="proj-list-head">Projekty</div>
      <div className="proj-list">
        {results !== null ? (
          results.length === 0 ? (
            <div className="muted" style={{ padding: 10 }}>Nic nenalezeno.</div>
          ) : (
            results.map((r, i) => (
              <div key={i} className="proj-item" onClick={() => { openProject(r.project_id); setQuery(""); }}>
                <span className="badge">{r.entity_type}</span>
                <span className="name">{r.title || "(bez názvu)"}</span>
              </div>
            ))
          )
        ) : projects.length === 0 ? (
          <div className="muted" style={{ padding: 10, fontSize: 13 }}>Zatím žádné projekty.</div>
        ) : (
          projects.map((p) => (
            <div
              key={p.id}
              className={"proj-item" + (p.id === selectedProjectId ? " active" : "")}
              onClick={() => openProject(p.id)}
            >
              <span className="dot" style={{ background: STATUS_COLOR[p.status] || "#888" }} />
              <span className="name">{p.is_favorite ? "★ " : ""}{p.name}</span>
            </div>
          ))
        )}
      </div>

      <div className="sidebar-foot">
        <button className="primary new-project-btn" onClick={() => openNewProject()}>+ Nový projekt</button>
      </div>
      <div className="sidebar-account">
        <button className="user-pill" title="Profil a nastavení" onClick={gotoSettings}>
          <span className="user-avatar">👤</span>
          <span className="user-name">{displayName}</span>
        </button>
        <span className="spacer" />
        <button className="ghost icon-btn" title="Cloud sync" onClick={() => setCloudOpen(true)}>☁</button>
        <button className="ghost icon-btn" title={`Motiv: ${THEME_LABEL[theme] || theme}`} onClick={toggleTheme}>◐</button>
        <button className="ghost icon-btn" title="Zamknout" onClick={async () => { await api.lock(); useStore.getState().setUnlocked(false); }}>🔒</button>
      </div>
    </aside>
  );
}
