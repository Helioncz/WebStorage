import { useEffect, useState } from "react";
import { api } from "../lib/api";
import * as gh from "../lib/github";
import { useStore } from "../store/useStore";

// Stavová lišta dole: uživatel, připojení, verze, probíhající akce.
export default function StatusBar() {
  const { refreshKey, statusMsg, view } = useStore();
  const [ghLogin, setGhLogin] = useState<string | null>(null);
  const [netlify, setNetlify] = useState(false);
  const [version, setVersion] = useState("");

  useEffect(() => {
    gh.githubLogin().then(setGhLogin).catch(() => setGhLogin(null));
    api.netlifyHasToken().then(setNetlify).catch(() => setNetlify(false));
    api.appVersion().then(setVersion).catch(() => {});
  }, [refreshKey]);

  const VIEW_LABEL: Record<string, string> = {
    dashboard: "Přehled", project: "Projekt", sites: "Weby", settings: "Nastavení", help: "Nápověda", redesign: "Import & Redesign",
  };

  return (
    <div className="statusbar">
      <span className="sb-item" title="GitHub připojení">
        <span className={"sb-dot " + (ghLogin ? "on" : "off")} /> GitHub: {ghLogin || "—"}
      </span>
      <span className="sb-sep">·</span>
      <span className="sb-item" title="Netlify připojení">
        <span className={"sb-dot " + (netlify ? "on" : "off")} /> Netlify: {netlify ? "připojeno" : "—"}
      </span>
      <span className="spacer" />
      {statusMsg && <span className="sb-item sb-action">{statusMsg}</span>}
      <span className="sb-sep">·</span>
      <span className="sb-item muted">{VIEW_LABEL[view] || view}</span>
      <span className="sb-sep">·</span>
      <span className="sb-item muted">Hangar v{version || "…"}</span>
    </div>
  );
}
