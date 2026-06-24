import { useEffect, useState } from "react";
import { api, Row } from "../lib/api";
import { useStore } from "../store/useStore";
import { Modal } from "./Modal";
import { BASE_FILES, toSlug } from "../lib/baseTemplate";

// Jednotná tvorba: vytvoří projekt + web (z šablony nebo prázdný), web naskočí ve Webech.
const BLANK = { key: "blank", rel: "", name: "Prázdný web", icon: "📄" };

export default function NewProjectModal() {
  const { newProjectOpen, newProjectTemplate, closeNewProject, refresh, openSiteInWorkspace } = useStore();
  const [templates, setTemplates] = useState<Row[]>([]);
  const [tplKey, setTplKey] = useState("blank");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!newProjectOpen) return;
    api.listSiteTemplates().then(setTemplates).catch(console.error);
    setTplKey(newProjectTemplate || "blank");
    setName("");
    setErr("");
  }, [newProjectOpen, newProjectTemplate]);

  if (!newProjectOpen) return null;

  const all = [BLANK, ...templates];
  const selected = all.find((t) => t.key === tplKey || t.rel === tplKey);
  const slug = toSlug(name);

  const submit = async () => {
    if (!slug || busy) return;
    setBusy(true);
    setErr("");
    try {
      // web nesmí kolidovat s existující složkou
      const rel = `sites/${slug}`;
      const existing = await api.listSiteFiles(rel).catch(() => []);
      if (existing.length > 0) {
        setErr("Projekt s tímto názvem už existuje.");
        setBusy(false);
        return;
      }
      // 1) projekt do trezoru (objeví se v levém panelu, nese jméno)
      await api.createProject(name.trim(), undefined, "web");
      // 2) web na disk (z šablony nebo prázdný)
      let webRel = rel;
      if (selected && selected.key !== "blank" && selected.rel) {
        webRel = await api.useSiteTemplate(selected.rel, name.trim());
      } else {
        for (const f of BASE_FILES) await api.writeSiteFile(rel, f.path, f.content);
      }
      refresh();
      closeNewProject();
      openSiteInWorkspace(webRel);
    } catch (e: any) {
      setErr(String(e?.message || e));
      setBusy(false);
    }
  };

  const summary = (t?: any) => {
    if (!t || t.key === "blank") return "Základní soubory: index.html, style.css, script.js, README.md, assets/";
    const c = t.counts || {};
    const parts: string[] = ["hotová grafika"];
    if (c.files) parts.push("kód webu");
    return parts.join(" · ");
  };

  return (
    <Modal
      title="Nový projekt"
      width={560}
      onClose={closeNewProject}
      footer={
        <>
          <button className="ghost" onClick={closeNewProject}>Zrušit</button>
          <button className="primary" onClick={submit} disabled={!slug || busy}>
            {busy ? "Vytvářím…" : "Vytvořit"}
          </button>
        </>
      }
    >
      <div className="field">
        <label>Šablona webu</label>
        <div className="tpl-grid">
          {all.map((t) => (
            <button
              key={t.key || t.rel}
              type="button"
              className={"tpl-card" + ((t.key === tplKey || t.rel === tplKey) ? " active" : "")}
              onClick={() => setTplKey(t.key || t.rel)}
            >
              <span className="tpl-ico">{t.icon || "✦"}</span>
              <span className="tpl-name">{t.title || t.name}</span>
            </button>
          ))}
        </div>
        {selected && (
          <div className="tpl-desc">
            <div>{selected.description || "Čistý web připravený k úpravám."}</div>
            <div className="muted" style={{ marginTop: 4 }}>Obsahuje: <strong>{summary(selected)}</strong></div>
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
        {slug && <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Složka webu: <code className="kbd">sites/{slug}</code></div>}
      </div>

      {err && <div className="error">{err}</div>}
    </Modal>
  );
}
