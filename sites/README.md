# sites/ — tvoje pracovní weby

Sem patří **working copie** webů, které editují, verzuješ gitem a deployuješ.
Vznikají z knihovny šablon: v Hangaru panel **Weby → Šablony → Použít** (zkopíruje
šablonu z `../site-templates/` sem jako `sites/<slug>/`).

```
sites/
  <muj-web>/          ← tvoje kopie (edituješ, pushneš, deployuješ)
    index.html
    styles.css
    script.js
  serve.mjs           ← jen lokální náhled, nenahrává se
```

## Tok: úprava → GitHub → živý web
1. Edituj soubory zde (Claude Code nebo přímo).
2. `git add sites/ && git commit -m "..." && git push` na **tvůj GitHub**.
3. Netlify/Vercel: napoj repo, *Base & Publish directory* = `sites/<muj-web>`,
   build command prázdný (statické). Každý push = nový deploy.
4. Výslednou URL vlož v Hangaru do tlačítka **Otevřít živý web → Nastavit adresu**.

Šablony k nahlédnutí jsou v [`../site-templates/`](../site-templates/).
