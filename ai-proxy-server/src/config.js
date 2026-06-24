export const config = {
  port: Number(process.env.PORT || 8790),
  proxyToken: process.env.HANGAR_AI_PROXY_TOKEN || "",
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || "",
  openAiApiKey: process.env.OPENAI_API_KEY || "",
  anthropicBaseUrl: (process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com").replace(/\/+$/, ""),
  openAiBaseUrl: (process.env.OPENAI_BASE_URL || "https://api.openai.com").replace(/\/+$/, ""),
};

export function requireConfig() {
  const missing = [];
  if (!config.proxyToken) missing.push("HANGAR_AI_PROXY_TOKEN");
  if (!config.anthropicApiKey && !config.openAiApiKey) {
    missing.push("ANTHROPIC_API_KEY or OPENAI_API_KEY");
  }
  if (missing.length) {
    throw new Error(`Missing required env var(s): ${missing.join(", ")}`);
  }
}
