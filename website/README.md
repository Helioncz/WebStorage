# SignalPlus — zkušební web

Statická jednostránka (one-page) pro smyšlenou firmu **SignalPlus** (mobilní sítě a příslušenství).
Grafika inspirovaná předlohou [mobilie.cz](https://www.mobilie.cz/cs/teambuilding/) — T‑Mobile magenta (#E20074) na bílém pozadí, čistý layout, mřížková galerie, vícesloupcový footer.

## Spuštění

Žádný build. Stačí otevřít `index.html` v prohlížeči:

```bash
open website/index.html          # macOS
# nebo lehký server (kvůli čistým cestám):
cd website && python3 -m http.server 5500   # → http://localhost:5500
```

## Struktura

```
website/
  index.html   markup všech sekcí
  styles.css   kompletní design (proměnné v :root, responzivní)
  script.js    mobilní menu, odeslání formuláře, scroll animace
  assets/      (prostor pro obrázky/loga)
```

## Sekce (shora dolů)

1. **Header** — logo, navigace, social ikony, CTA „Nezávazná poptávka"
2. **Hero** — nadpis, lead text, tlačítka, čísla důvěry, animovaný vizuál signálu
3. **Strip** — pruh se sítěmi (O2 / T‑Mobile / Vodafone / 5G / LTE)
4. **Služby** — 4 karty (měření, zesilovače, antény, instalace)
5. **Produkty** — galerie 8 dlaždic s ikonami a popisky (hover zoom)
6. **O nás** — text + checklist + statistiky
7. **Reference** — 3 citace klientů
8. **CTA pruh** — magenta výzva k akci
9. **Kontakt** — info + funkční (frontend) formulář
10. **Footer** — 4 sloupce + spodní lišta

## Přizpůsobení

- **Barvy:** uprav proměnné v `:root` v `styles.css` (`--magenta`, `--ink`…).
- **Texty/název firmy:** vše je přímo v `index.html`, snadno přepsat.
- **Obrázky:** dlaždice galerie teď používají CSS gradient + emoji ikonu.
  Pro reálné fotky vlož soubory do `assets/` a nahraď `.tile` obsah `<img>`.

> Poznámka: web je čistě frontend (formulář jen potvrdí odeslání, neposílá data na server).
> Pro ostrý provoz dopojit odeslání e‑mailu / API.
