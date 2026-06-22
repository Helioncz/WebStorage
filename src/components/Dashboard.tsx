import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useStore } from "../store/useStore";

export default function Dashboard() {
  const openProject = useStore((s) => s.openProject);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    api.dashboard().then(setData).catch(console.error);
  }, []);

  if (!data) return <div className="content muted">Načítání…</div>;

  return (
    <div className="content">
      <div className="h1">Přehled</div>
      <div className="stat-grid">
        <div className="stat">
          <div className="num">{data.projects}</div>
          <div className="muted">Projektů celkem</div>
        </div>
        <div className="stat">
          <div className="num">{data.active}</div>
          <div className="muted">Aktivních</div>
        </div>
        <div className="stat">
          <div className="num">{data.overdue.length}</div>
          <div className="muted">Úkolů po termínu</div>
        </div>
        <div className="stat">
          <div className="num">{data.recent.length}</div>
          <div className="muted">Naposledy otevřené</div>
        </div>
      </div>

      <div className="section-title">Naposledy otevřené</div>
      <div className="card">
        {data.recent.length === 0 ? (
          <div className="muted">Zatím nic. Otevři nějaký projekt.</div>
        ) : (
          data.recent.map((p: any) => (
            <div key={p.id} className="list-item" style={{ cursor: "pointer" }} onClick={() => openProject(p.id)}>
              <span className="name">{p.name}</span>
              <span className="spacer" />
              <span className="muted">{p.client || ""}</span>
              <span className="badge">{p.status}</span>
            </div>
          ))
        )}
      </div>

      <div className="section-title">Úkoly po termínu</div>
      <div className="card">
        {data.overdue.length === 0 ? (
          <div className="muted">Žádné úkoly po termínu. 🎉</div>
        ) : (
          data.overdue.map((t: any) => (
            <div key={t.id} className="list-item">
              <span style={{ color: "var(--danger)" }}>●</span>
              <span>{t.title}</span>
              <span className="spacer" />
              <span className="muted">{t.project}</span>
              <span className="badge">{(t.due_date || "").slice(0, 10)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
