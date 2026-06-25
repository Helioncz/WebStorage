import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useStore } from "../store/useStore";

const START_CHECKS = [
  {
    key: "projects",
    title: "Založ první webový projekt",
    text: "Projekt automaticky dostane soubory, checklist spuštění, odkazy na nástroje a může se nahrát na GitHub.",
  },
  {
    key: "github",
    title: "Připoj GitHub token",
    text: "Bez GitHubu nejde pohodlně zakládat repozitáře a otevírat práci v GitHub Desktopu.",
  },
  {
    key: "ai",
    title: "Nastav AI asistenta",
    text: "AI pak může číst soubory webu, navrhovat úpravy a pomáhat s texty nebo strukturou.",
  },
  {
    key: "netlify",
    title: "Připrav deploy",
    text: "Netlify/Vercel/Cloudflare Pages jsou cesta k rychlému veřejnému náhledu pro klienta.",
  },
] as const;

export default function Dashboard() {
  const { openProject, openSites, gotoSettings, openHelp } = useStore();
  const [data, setData] = useState<any>(null);
  const [setup, setSetup] = useState<any>(null);

  useEffect(() => {
    api.dashboard().then(setData).catch(console.error);
    Promise.all([
      api.githubHasToken().catch(() => false),
      api.netlifyHasToken().catch(() => false),
      api.getAiConfig().catch(() => null),
      api.listSites().catch(() => []),
    ]).then(([github, netlify, ai, sites]) => {
      setSetup({
        github,
        netlify,
        ai: !!ai?.apiKey,
        sites: sites.length,
      });
    });
  }, []);

  if (!data) return <div className="content muted">Načítání…</div>;

  const setupState = {
    projects: data.projects > 0 || (setup?.sites || 0) > 0,
    github: !!setup?.github,
    ai: !!setup?.ai,
    netlify: !!setup?.netlify,
  };
  const doneCount = START_CHECKS.filter((c) => setupState[c.key]).length;
  const setupPct = Math.round((doneCount / START_CHECKS.length) * 100);

  return (
    <div className="content">
      <div className="dashboard-hero">
        <div>
          <div className="h1">Přehled</div>
          <p className="muted">
            Rychlé centrum pro webové zakázky: vytvoření projektu, práce se soubory, GitHub, AI a checklist spuštění.
          </p>
        </div>
        <div className="row">
          <button className="primary" onClick={openSites}>Otevřít weby</button>
        </div>
      </div>

      <div className="command-grid">
        <button className="command-card" onClick={openSites}>
          <span className="command-icon">🌐</span>
          <strong>Editor a live preview</strong>
          <small>Otevři web, uprav soubory, stáhni ZIP nebo nasazuj.</small>
        </button>
        <button className="command-card" onClick={gotoSettings}>
          <span className="command-icon">⚙</span>
          <strong>Nastavení nástrojů</strong>
          <small>GitHub token, AI klíč, Netlify a pracovní složka.</small>
        </button>
        <button className="command-card" onClick={openHelp}>
          <span className="command-icon">?</span>
          <strong>Jak aplikaci používat</strong>
          <small>Postup od vytvoření webu až po předání klientovi.</small>
        </button>
      </div>

      <div className="setup-panel">
        <div className="row between">
          <div>
            <div className="section-title" style={{ margin: 0 }}>Připravenost workspace</div>
            <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>Co musí být hotové, aby se s aplikací dalo pohodlně vydělávat na webech.</div>
          </div>
          <div className={"launch-score " + (setupPct >= 80 ? "ok" : setupPct >= 50 ? "warn" : "bad")}>{setupPct}%</div>
        </div>
        <div className="launch-progress"><span style={{ width: `${setupPct}%` }} /></div>
        <div className="setup-list">
          {START_CHECKS.map((item) => {
            const ok = setupState[item.key];
            return (
              <div key={item.key} className={"setup-item " + (ok ? "ok" : "")}>
                <span className="setup-dot">{ok ? "✓" : "!"}</span>
                <div>
                  <strong>{item.title}</strong>
                  <small>{item.text}</small>
                </div>
              </div>
            );
          })}
        </div>
      </div>

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
          <div className="num">{setup?.sites ?? "…"}</div>
          <div className="muted">Pracovních webů</div>
        </div>
      </div>

      <div className="section-title">Naposledy otevřené</div>
      <div className="card">
        {data.recent.length === 0 ? (
          <div className="empty-state compact">
            <strong>Zatím nic otevřeného.</strong>
            <span>Začni novým webovým projektem nebo otevři záložku Weby.</span>
            <div className="row">
              <button className="primary" onClick={openSites}>Zobrazit weby</button>
            </div>
          </div>
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
          <div className="muted">Žádné úkoly po termínu.</div>
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
