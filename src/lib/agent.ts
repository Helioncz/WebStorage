import { api, AiConfig } from "./api";

// Provider-agnosticky agentni "vibe coding" asistent.
// Bezi ve frontendu, HTTP jde pres Rust proxy (api.aiHttpPost) — obejde CORS.
// Podporuje Anthropic Messages API i OpenAI-compatible (OpenAI, OpenRouter, Ollama, LM Studio...).

const SYSTEM_PROMPT = `Jsi zkušený webový vývojář pracující uvnitř desktopové aplikace.
Edituješ statický web složený z čistého HTML, CSS a JavaScriptu (žádný framework, žádný build).
Web leží ve složce; používej nástroje k výpisu, čtení a zápisu souborů.

Pravidla:
- Před úpravou souboru ho VŽDY nejdřív přečti (read_file).
- Zachovávej existující strukturu a styl webu.
- write_file zapisuje CELÝ nový obsah souboru (ne diff). Buď přesný a kompletní.
- Cesty jsou relativní ke kořeni webu (např. "index.html", "styles.css", "script.js").
- Drž web responzivní a přístupný. Pokud je web česky, piš texty česky.
- Po dokončení napiš krátké shrnutí toho, co jsi změnil.`;

// Neutralni definice nastroju (mapuji se na format providera).
const TOOLS = [
  { name: "list_files", description: "Vypíše všechny soubory webu.", schema: { type: "object", properties: {}, required: [] as string[] } },
  { name: "read_file", description: "Přečte obsah souboru.", schema: { type: "object", properties: { path: { type: "string", description: "Relativní cesta, např. index.html" } }, required: ["path"] } },
  { name: "write_file", description: "Vytvoří nebo přepíše soubor novým obsahem (celý soubor).", schema: { type: "object", properties: { path: { type: "string" }, content: { type: "string" } }, required: ["path", "content"] } },
];

export type AgentCallbacks = {
  onAssistant: (text: string) => void;
  onTool: (name: string, info: string) => void;
  onFileWritten: (path: string) => void;
  onError: (msg: string) => void;
};

type ToolCall = { id: string; name: string; input: any };

function joinUrl(base: string, path: string) {
  return base.replace(/\/+$/, "") + path;
}

export class WebAgent {
  private cfg: AiConfig;
  private rel: string;
  private messages: any[] = []; // provider-native historie konverzace

  constructor(cfg: AiConfig, rel: string) {
    this.cfg = cfg;
    this.rel = rel;
  }

  private isAnthropic() {
    return this.cfg.provider === "anthropic";
  }

  private async callModel(): Promise<{ text: string; toolCalls: ToolCall[]; rawAssistant: any }> {
    const { baseUrl, model, apiKey } = this.cfg;

    if (this.isAnthropic()) {
      const body = {
        model,
        max_tokens: 8000,
        system: SYSTEM_PROMPT,
        tools: TOOLS.map((t) => ({ name: t.name, description: t.description, input_schema: t.schema })),
        messages: this.messages,
      };
      const headers = {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      };
      const res = await api.aiHttpPost(joinUrl(baseUrl, "/v1/messages"), headers, JSON.stringify(body));
      const data = JSON.parse(res.body);
      if (res.status >= 400) throw new Error(data?.error?.message || res.body);

      const content = data.content || [];
      const text = content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
      const toolCalls: ToolCall[] = content
        .filter((b: any) => b.type === "tool_use")
        .map((b: any) => ({ id: b.id, name: b.name, input: b.input }));
      return { text, toolCalls, rawAssistant: { role: "assistant", content } };
    }

    // OpenAI-compatible
    const body = {
      model,
      max_tokens: 8000,
      messages: this.messages.length && this.messages[0].role === "system"
        ? this.messages
        : [{ role: "system", content: SYSTEM_PROMPT }, ...this.messages],
      tools: TOOLS.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.schema } })),
    };
    const headers = { Authorization: `Bearer ${apiKey}`, "content-type": "application/json" };
    const res = await api.aiHttpPost(joinUrl(baseUrl, "/v1/chat/completions"), headers, JSON.stringify(body));
    const data = JSON.parse(res.body);
    if (res.status >= 400) throw new Error(data?.error?.message || res.body);

    const msg = data.choices?.[0]?.message || {};
    const text = msg.content || "";
    const toolCalls: ToolCall[] = (msg.tool_calls || []).map((tc: any) => ({
      id: tc.id,
      name: tc.function?.name,
      input: safeJson(tc.function?.arguments),
    }));
    return { text, toolCalls, rawAssistant: msg };
  }

  private async execTool(call: ToolCall, cb: AgentCallbacks): Promise<string> {
    try {
      if (call.name === "list_files") {
        const files = await api.listSiteFiles(this.rel);
        cb.onTool("list_files", `${files.length} souborů`);
        return files.join("\n") || "(žádné soubory)";
      }
      if (call.name === "read_file") {
        cb.onTool("read_file", call.input.path);
        return await api.readSiteFile(this.rel, call.input.path);
      }
      if (call.name === "write_file") {
        await api.writeSiteFile(this.rel, call.input.path, call.input.content);
        cb.onTool("write_file", call.input.path);
        cb.onFileWritten(call.input.path);
        return `OK, zapsáno: ${call.input.path}`;
      }
      return `Neznámý nástroj: ${call.name}`;
    } catch (e: any) {
      return `CHYBA: ${String(e)}`;
    }
  }

  private appendToolResults(calls: ToolCall[], results: string[]) {
    if (this.isAnthropic()) {
      this.messages.push({
        role: "user",
        content: calls.map((c, i) => ({ type: "tool_result", tool_use_id: c.id, content: results[i] })),
      });
    } else {
      for (let i = 0; i < calls.length; i++) {
        this.messages.push({ role: "tool", tool_call_id: calls[i].id, content: results[i] });
      }
    }
  }

  async send(userText: string, cb: AgentCallbacks) {
    this.messages.push({ role: "user", content: userText });
    try {
      for (let iter = 0; iter < 14; iter++) {
        const { text, toolCalls, rawAssistant } = await this.callModel();
        this.messages.push(rawAssistant);
        if (text.trim()) cb.onAssistant(text);
        if (toolCalls.length === 0) return;
        const results: string[] = [];
        for (const call of toolCalls) results.push(await this.execTool(call, cb));
        this.appendToolResults(toolCalls, results);
      }
      cb.onError("Dosažen limit kroků (14). Zkus to upřesnit menším krokem.");
    } catch (e: any) {
      cb.onError(String(e?.message || e));
    }
  }
}

function safeJson(s: string) {
  try {
    return JSON.parse(s || "{}");
  } catch {
    return {};
  }
}
