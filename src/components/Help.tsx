import { useEffect, useState } from "react";
import { api } from "../lib/api";

export default function Help() {
  const [version, setVersion] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(() => { api.appVersion().then(setVersion); }, []);

  const copyDiag = async () => {
    const root = await api.getSitesRoot().catch(() => ({ root: "?" }));
    const txt = [
      `Project Hangar v${version}`,
      `Platforma: ${navigator.platform}`,
      `Složka s weby: ${(root as any).root}`,
      `Datum: ${new Date().toISOString()}`,
    ].join("\n");
    await navigator.clipboard.writeText(txt);
    setCopied(true); setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="content">
      <div className="h1">Nápověda</div>

      <div className="section-title">Rychlý start</div>
      <div className="card">
        <ol style={{ paddingLeft: 18, lineHeight: 1.8, margin: 0 }}>
          <li><strong>+ Nový projekt</strong> (vlevo dole) → vyber šablonu nebo prázdný web + název.</li>
          <li>Volitelně zapni <strong>GitHub repozitář</strong> a appku, ve které se otevře.</li>
          <li>Otevře se <strong>editor</strong>: vlevo soubory, uprostřed kód, vpravo náhled / AI.</li>
          <li>Piš kód (Cmd+S uloží), <strong>🖼 nahraj obrázky</strong> (nebo přetáhni do editoru).</li>
          <li><strong>⎇ GitHub</strong> → Commit &amp; Push / Pull. <strong>🚀 Publikovat</strong> → živá adresa.</li>
          <li>Předání klientovi: <strong>⬇ ZIP</strong> zdrojáků + odkaz na repo + živá URL.</li>
        </ol>
      </div>

      <div className="section-title">Tipy</div>
      <div className="card">
        <ul className="muted" style={{ paddingLeft: 18, lineHeight: 1.8, margin: 0, fontSize: 14 }}>
          <li>Web jde upravovat i mimo appku (VS Code / GitHub Desktop) — pak v editoru <strong>⟳ Z disku</strong> nebo <strong>⎇ GitHub → Pull</strong>.</li>
          <li>AI asistent (💬) edituje soubory a náhled se sám obnoví. Vyžaduje vlastní API klíč (Nastavení).</li>
          <li>Motiv přepneš dole vlevo (◐) nebo v Nastavení — 4 barevné mody.</li>
          <li>Trezor (hesla/tokeny) je šifrovaný. Pravidelně ho zálohuj (Nastavení → Zálohovat).</li>
        </ul>
      </div>

      <div className="section-title">Trezor a obnova</div>
      <div className="card">
        <p className="muted" style={{ fontSize: 14 }}>
          Data trezoru jsou v <code className="kbd">~/Library/Application Support/cz.helion.projecthangar/vault/</code>.
          Zálohu (Nastavení → Zálohovat) rozbal zpět do této složky pro obnovu.
        </p>
      </div>

      <div className="section-title">Podpora</div>
      <div className="card">
        <div className="row" style={{ gap: 8 }}>
          <button className="primary" onClick={copyDiag}>{copied ? "Zkopírováno ✓" : "Kopírovat diagnostiku"}</button>
          <button className="ghost" onClick={() => api.openExternalUrl("mailto:krutis@helion.cz")}>Napsat podporu</button>
        </div>
        <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>Diagnostiku (verze, platforma, cesty) přilož při hlášení problému.</div>
      </div>
    </div>
  );
}
