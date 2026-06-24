// Základní soubory nového webového projektu (dle specifikace).
export const BASE_FILES: { path: string; content: string }[] = [
  {
    path: "index.html",
    content: `<!DOCTYPE html>
<html lang="cs">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Nový web</title>
  <link rel="stylesheet" href="./style.css" />
</head>
<body>
  <main>
    <h1>Můj nový web</h1>
    <p>Projekt byl vytvořen automaticky v aplikaci.</p>
    <button id="demoBtn">Klikni</button>
  </main>

  <script src="./script.js"></script>
</body>
</html>
`,
  },
  {
    path: "style.css",
    content: `body {
  margin: 0;
  font-family: system-ui, sans-serif;
  background: #f4f4f5;
  color: #111827;
}

main {
  max-width: 900px;
  margin: 80px auto;
  padding: 32px;
  background: white;
  border-radius: 16px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.08);
}

button {
  padding: 12px 18px;
  border: 0;
  border-radius: 10px;
  cursor: pointer;
}
`,
  },
  {
    path: "script.js",
    content: `document.getElementById("demoBtn")?.addEventListener("click", () => {
  alert("Projekt funguje.");
});
`,
  },
  {
    path: "README.md",
    content: `# Nový web

Projekt vytvořený v aplikaci Hangar.

## Soubory
- \`index.html\` — struktura webu
- \`style.css\` — styly
- \`script.js\` — interaktivita
- \`assets/\` — obrázky a další soubory
`,
  },
  // assets/ vytvoříme přes prázdný .gitkeep, aby složka existovala v gitu.
  { path: "assets/.gitkeep", content: "" },
];

// Vyrobí slug z názvu (ASCII, pomlčky).
export function toSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // odstranit kombinující diakritiku
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
