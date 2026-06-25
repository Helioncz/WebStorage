import { useEffect, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { api, Row } from "../lib/api";
import { useStore } from "../store/useStore";
import { Modal } from "./Modal";
import { BASE_FILES, toSlug } from "../lib/baseTemplate";
import * as gh from "../lib/github";

// Jednotná tvorba: projekt + web (šablona/prázdný) + automaticky GitHub repozitář.
const BLANK: Row = { key: "blank", rel: "", name: "Prázdný web", icon: "📄" };

const DEFAULT_WEB_TASKS = [
  ["Doména koupena / převedena", "high"],
  ["DNS nastavené na hosting / deploy platformu", "high"],
  ["Hosting nebo deploy platforma připravená", "high"],
  ["GitHub repozitář založený a propojený", "high"],
  ["Produkční URL uložená v projektu", "normal"],
  ["SSL certifikát a HTTPS funkční", "urgent"],
  ["Kontrola responzivity mobil / tablet / desktop", "high"],
  ["Kontrola formulářů a odesílání e-mailů", "urgent"],
  ["SEO základ: title, description, OG image", "normal"],
  ["Favicon, ikony a název v prohlížeči", "normal"],
  ["Sitemap.xml a robots.txt", "normal"],
  ["Napojení analytiky / měření", "low"],
  ["GDPR / cookies / právní texty", "normal"],
  ["PageSpeed kontrola a základní optimalizace", "normal"],
  ["Záloha zdrojových souborů a přístupů", "high"],
  ["Finální kontrola po nasazení", "urgent"],
] as const;

const DEFAULT_WEB_LINKS = [
  ["GitHub", "https://github.com", "git", "Repozitáře a verzování"],
  ["Netlify", "https://app.netlify.com", "hosting", "Deploy statických webů"],
  ["Vercel", "https://vercel.com/dashboard", "hosting", "Deploy webů a frameworků"],
  ["Cloudflare", "https://dash.cloudflare.com", "hosting", "DNS, domény, CDN"],
  ["Google Search Console", "https://search.google.com/search-console", "monitoring", "Indexace a SEO kontrola"],
  ["PageSpeed Insights", "https://pagespeed.web.dev", "monitoring", "Rychlost a Core Web Vitals"],
  ["Google Analytics", "https://analytics.google.com", "monitoring", "Analytika návštěvnosti"],
] as const;

export default function NewProjectModal() {
  const { newProjectOpen, newProjectTemplate, closeNewProject, refresh, openSiteInWorkspace } = useStore();
  const [templates, setTemplates] = useState<Row[]>([]);
  const [tplKey, setTplKey] = useState("blank");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [createdRel, setCreatedRel] = useState<string | null>(null);

  // GitHub
  const [ghLogin, setGhLogin] = useState<string | null>(null);
  const [ghToken, setGhToken] = useState("");
  const [changeTok, setChangeTok] = useState(false);
  const [makeRepo, setMakeRepo] = useState(true);
  const [isPrivate, setIsPrivate] = useState(true);
  const [apps, setApps] = useState<{ name: string; path: string }[]>([]);
  const [openApp, setOpenApp] = useState("");
  const templateStageRef = useRef<HTMLDivElement | null>(null);
  const all: Row[] = [BLANK, ...templates];
  const selectedIndex = Math.max(0, all.findIndex((t) => t.key === tplKey || t.rel === tplKey));

  useEffect(() => {
    if (!newProjectOpen) return;
    api.listSiteTemplates().then(setTemplates).catch(console.error);
    setTplKey(newProjectTemplate || "blank");
    setName(""); setErr(""); setCreatedRel(null); setBusy(""); setChangeTok(false); setGhToken("");
    gh.githubLogin().then(setGhLogin);
    api.detectApps().then(async (list) => {
      setApps(list);
      const saved = await api.getOpenApp();
      if (saved) setOpenApp(saved);
      else { const ghd = list.find((a) => a.name === "GitHub Desktop"); setOpenApp(ghd ? ghd.path : ""); }
    });
  }, [newProjectOpen, newProjectTemplate]);

  useEffect(() => {
    if (!newProjectOpen || !templateStageRef.current) return;
    templateStageRef.current.scrollTo({
      left: Math.max(0, selectedIndex * 200 - 16),
      behavior: "smooth",
    });
  }, [newProjectOpen, selectedIndex]);

  const chooseApp = async (val: string) => {
    if (val === "__pick__") {
      const picked = await open({ directory: true, multiple: false, defaultPath: "/Applications" });
      if (picked && !Array.isArray(picked)) { setOpenApp(picked); api.setOpenApp(picked); }
      return;
    }
    setOpenApp(val);
    api.setOpenApp(val);
  };

  if (!newProjectOpen) return null;

  const selected = all.find((t) => t.key === tplKey || t.rel === tplKey);
  const slug = toSlug(name);

  const openWs = (rel: string) => { closeNewProject(); openSiteInWorkspace(rel); };

  const submit = async () => {
    if (!slug || busy) return;
    setErr("");

    // Pokud chce repo a není připojeno (nebo mění token), nejdřív ulož token.
    if (makeRepo && (!ghLogin || changeTok)) {
      if (!ghToken.trim()) { setErr("Vlož GitHub token, nebo odškrtni vytvoření repozitáře."); return; }
      setBusy("connect");
      try {
        await api.setGithubToken(ghToken.trim());
        const login = await gh.githubLogin();
        if (!login) throw new Error("Token nefunguje — zkontroluj scope (Contents + Administration: Read and write).");
        setGhLogin(login); setChangeTok(false);
      } catch (e: any) { setErr(String(e?.message || e)); setBusy(""); return; }
    }

    // 1) lokální web
    setBusy("create");
    let webRel: string;
    try {
      const rel = `sites/${slug}`;
      const existing = await api.listSiteFiles(rel).catch(() => []);
      if (existing.length > 0) { setErr("Projekt s tímto názvem už existuje."); setBusy(""); return; }
      const projectId = await api.createProject(name.trim(), undefined, "web");
      for (const [title, priority] of DEFAULT_WEB_TASKS) {
        await api.saveTask({ projectId, title, status: "new", priority });
      }
      for (const [title, url, type, description] of DEFAULT_WEB_LINKS) {
        await api.saveLink(projectId, title, url, type, description);
      }
      if (selected && selected.key !== "blank" && selected.rel) {
        webRel = await api.useSiteTemplate(selected.rel, name.trim());
      } else {
        for (const f of BASE_FILES) await api.writeSiteFile(rel, f.path, f.content);
        webRel = rel;
      }
      await api.setSiteName(webRel, name.trim()); // web nese jméno projektu
      refresh();
    } catch (e: any) { setErr(String(e?.message || e)); setBusy(""); return; }

    // 2) GitHub repozitář + push
    if (makeRepo) {
      setBusy("github");
      try {
        const repoName = webRel.split("/").pop()!;
        await gh.createRepoAndPush(webRel, repoName, isPrivate);
        // otevři ve zvolené aplikaci (neblokující — chyba jen zaloguje)
        try { await gh.linkLocalAndOpen(webRel, openApp); } catch (e2) { console.warn("Otevření aplikace:", e2); }
      } catch (e: any) {
        // Web je vytvořený lokálně — nech uživatele pokračovat do editoru.
        setCreatedRel(webRel);
        setErr(`Web vytvořen, ale GitHub selhal: ${String(e?.message || e)}. Dokonči přes ⎇ GitHub v editoru.`);
        setBusy("");
        return;
      }
    }

    openWs(webRel);
  };

  const summary = (t?: any) => {
    if (!t || t.key === "blank") return "Základní soubory: index.html, style.css, script.js, README.md, assets/";
    return "hotová grafika · kód webu";
  };
  const prevTemplate = () => {
    const next = all[(selectedIndex - 1 + all.length) % all.length];
    setTplKey(next.key || next.rel);
  };
  const nextTemplate = () => {
    const next = all[(selectedIndex + 1) % all.length];
    setTplKey(next.key || next.rel);
  };

  return (
    <Modal
      title="Nový projekt"
      width={560}
      onClose={closeNewProject}
      footer={
        createdRel ? (
          <button className="primary" onClick={() => openWs(createdRel)}>Otevřít editor</button>
        ) : (
          <>
            <button className="ghost" onClick={closeNewProject}>Zrušit</button>
            <button className="primary" onClick={submit} disabled={!slug || !!busy}>
              {busy === "connect" ? "Připojuji GitHub…" : busy === "github" ? "Zakládám repozitář…" : busy === "create" ? "Vytvářím…" : "Vytvořit"}
            </button>
          </>
        )
      }
    >
      <div className="field">
        <label>Šablona webu</label>
        <div className="template-picker">
          <button className="template-arrow" type="button" onClick={prevTemplate} title="Předchozí šablona">‹</button>
          <div className="template-stage" ref={templateStageRef}>
            <div className="template-ribbon">
              {all.map((t) => {
                const active = t.key === tplKey || t.rel === tplKey;
                return (
                  <button
                    key={t.key || t.rel}
                    type="button"
                    className={"template-option" + (active ? " active" : "")}
                    onClick={() => setTplKey(t.key || t.rel)}
                  >
                    <span className="template-icon">{t.icon || "✦"}</span>
                    <span className="template-copy">
                      <strong>{t.title || t.name}</strong>
                      <small>{t.key === "blank" ? "Čistý start" : (t.slug || "hotová šablona")}</small>
                    </span>
                    {active && <span className="template-check">✓</span>}
                  </button>
                );
              })}
            </div>
          </div>
          <button className="template-arrow" type="button" onClick={nextTemplate} title="Další šablona">›</button>
        </div>
        {selected && (
          <div className="template-detail">
            <div className="template-detail-icon">{selected.icon || "✦"}</div>
            <div>
              <div className="template-detail-title">{selected.title || selected.name}</div>
              <div>{selected.description || "Čistý web připravený k úpravám."}</div>
              <div className="muted" style={{ marginTop: 4 }}>Obsahuje: <strong>{summary(selected)}</strong></div>
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
          placeholder="Např. Kavárna U Lípy"
        />
        {slug && <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Složka i repo: <code className="kbd">{slug}</code></div>}
      </div>

      {/* GitHub */}
      <div className="field" style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
        <label className="row" style={{ gap: 8 }}>
          <input type="checkbox" style={{ width: "auto" }} checked={makeRepo} onChange={(e) => setMakeRepo(e.target.checked)} />
          <span>Založit GitHub repozitář a nahrát soubory</span>
        </label>
      </div>
      {makeRepo && (
        ghLogin && !changeTok ? (
          <div className="row" style={{ gap: 14, marginTop: -4 }}>
            <span className="muted" style={{ fontSize: 13 }}>Připojeno: <strong>{ghLogin}</strong></span>
            <button className="ghost" style={{ padding: "2px 8px", fontSize: 12 }} onClick={() => { setChangeTok(true); setGhToken(""); }}>Změnit token</button>
            <label className="row" style={{ gap: 6 }}>
              <input type="checkbox" style={{ width: "auto" }} checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} />
              <span style={{ fontSize: 13 }}>Soukromý</span>
            </label>
          </div>
        ) : (
          <div className="field">
            <label>{changeTok ? "Nový GitHub token" : "GitHub token (jednorázově)"}</label>
            <input type="password" autoFocus={changeTok} value={ghToken} onChange={(e) => setGhToken(e.target.value)} placeholder="github_pat_… / ghp_…" />
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              Fine-grained PAT s <code className="kbd">Contents</code> + <code className="kbd">Administration: Read and write</code>.
              Uloží se šifrovaně v trezoru. <a href="#" onClick={(e) => { e.preventDefault(); api.openExternalUrl("https://github.com/settings/tokens?type=beta"); }}>Vytvořit token</a>
              {changeTok && ghLogin && <> · <a href="#" onClick={(e) => { e.preventDefault(); setChangeTok(false); }}>zrušit změnu</a></>}
            </div>
          </div>
        )
      )}

      {makeRepo && (
        <div className="field" style={{ marginTop: 8 }}>
          <label>Po vytvoření otevřít v aplikaci</label>
          <select value={openApp} onChange={(e) => chooseApp(e.target.value)}>
            <option value="">Neotevírat</option>
            {apps.map((a) => <option key={a.path} value={a.path}>{a.name}</option>)}
            {openApp && !apps.find((a) => a.path === openApp) && (
              <option value={openApp}>{openApp.split("/").pop()?.replace(/\.app$/, "")}</option>
            )}
            <option value="__pick__">Jiná aplikace…</option>
          </select>
          {apps.length === 0 && <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Žádná známá aplikace nenalezena — vyber „Jiná aplikace…".</div>}
        </div>
      )}

      {err && <div className="error" style={{ marginTop: 8 }}>{err}</div>}
    </Modal>
  );
}
