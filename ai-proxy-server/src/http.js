export async function readJson(req, limitBytes = 20 * 1024 * 1024) {
  const chunks = [];
  let total = 0;

  for await (const chunk of req) {
    total += chunk.length;
    if (total > limitBytes) {
      const err = new Error("Request body too large");
      err.statusCode = 413;
      throw err;
    }
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) return {};
  return JSON.parse(raw);
}

export function sendJson(res, status, data) {
  const body = Buffer.from(JSON.stringify(data, null, 2));
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": body.length,
  });
  res.end(body);
}

export function sendRawJson(res, status, text) {
  const body = Buffer.from(text || "{}");
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": body.length,
  });
  res.end(body);
}

export function sendText(res, status, text) {
  const body = Buffer.from(text);
  res.writeHead(status, {
    "content-type": "text/plain; charset=utf-8",
    "content-length": body.length,
  });
  res.end(body);
}

export function hasProxyAuth(req, proxyToken) {
  if (!proxyToken) return false;

  const auth = req.headers.authorization || "";
  const xKey = req.headers["x-api-key"] || "";

  return auth === `Bearer ${proxyToken}` || xKey === proxyToken;
}
