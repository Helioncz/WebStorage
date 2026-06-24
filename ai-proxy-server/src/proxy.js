import { config } from "./config.js";

export async function proxyAnthropicMessages(body) {
  if (!config.anthropicApiKey) {
    return {
      status: 503,
      text: JSON.stringify({ error: "ANTHROPIC_API_KEY is not configured" }),
    };
  }

  const res = await fetch(`${config.anthropicBaseUrl}/v1/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": config.anthropicApiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  return { status: res.status, text: await res.text() };
}

export async function proxyOpenAiChatCompletions(body) {
  if (!config.openAiApiKey) {
    return {
      status: 503,
      text: JSON.stringify({ error: "OPENAI_API_KEY is not configured" }),
    };
  }

  const res = await fetch(`${config.openAiBaseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${config.openAiApiKey}`,
    },
    body: JSON.stringify(body),
  });

  return { status: res.status, text: await res.text() };
}
