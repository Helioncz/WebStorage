import http from "node:http";
import { URL } from "node:url";
import { config, requireConfig } from "./config.js";
import { hasProxyAuth, readJson, sendJson, sendRawJson, sendText } from "./http.js";
import { proxyAnthropicMessages, proxyOpenAiChatCompletions } from "./proxy.js";

requireConfig();

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

    if (req.method === "GET" && url.pathname === "/health") {
      return sendJson(res, 200, {
        ok: true,
        service: "hangar-ai-proxy-server",
        providers: {
          anthropic: Boolean(config.anthropicApiKey),
          openai: Boolean(config.openAiApiKey),
        },
      });
    }

    if (req.method === "GET" && url.pathname === "/providers") {
      if (!hasProxyAuth(req, config.proxyToken)) {
        return sendJson(res, 401, { error: "Missing or invalid proxy token" });
      }
      return sendJson(res, 200, {
        anthropic: Boolean(config.anthropicApiKey),
        openai: Boolean(config.openAiApiKey),
      });
    }

    if (req.method === "POST" && url.pathname === "/v1/messages") {
      if (!hasProxyAuth(req, config.proxyToken)) {
        return sendJson(res, 401, { error: "Missing or invalid proxy token" });
      }
      const body = await readJson(req);
      const out = await proxyAnthropicMessages(body);
      return sendRawJson(res, out.status, out.text);
    }

    if (req.method === "POST" && url.pathname === "/v1/chat/completions") {
      if (!hasProxyAuth(req, config.proxyToken)) {
        return sendJson(res, 401, { error: "Missing or invalid proxy token" });
      }
      const body = await readJson(req);
      const out = await proxyOpenAiChatCompletions(body);
      return sendRawJson(res, out.status, out.text);
    }

    return sendText(res, 404, "Not found");
  } catch (error) {
    return sendJson(res, error.statusCode || 500, {
      error: error.message || "Internal server error",
    });
  }
});

server.listen(config.port, () => {
  console.log(`Hangar AI proxy listening on http://localhost:${config.port}`);
});
