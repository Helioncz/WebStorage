// Monaco editor + lokálně bundlované workery (žádné CDN — funguje offline v Tauri).
import * as monaco from "monaco-editor";
import { loader } from "@monaco-editor/react";

import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import htmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker";
import cssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker";
import jsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";

// @ts-ignore — MonacoEnvironment není v typu window
self.MonacoEnvironment = {
  getWorker(_: unknown, label: string) {
    if (label === "html" || label === "handlebars" || label === "razor") return new htmlWorker();
    if (label === "css" || label === "scss" || label === "less") return new cssWorker();
    if (label === "json") return new jsonWorker();
    if (label === "typescript" || label === "javascript") return new tsWorker();
    return new editorWorker();
  },
};

// Použij lokální monaco místo CDN loaderu.
loader.config({ monaco });

export function languageFor(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "html": case "htm": return "html";
    case "css": return "css";
    case "js": case "mjs": return "javascript";
    case "ts": return "typescript";
    case "json": return "json";
    case "md": return "markdown";
    case "xml": case "svg": return "xml";
    default: return "plaintext";
  }
}
