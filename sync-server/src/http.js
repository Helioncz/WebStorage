export async function readRawBody(req, limitBytes = 5 * 1024 * 1024) {
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

  return Buffer.concat(chunks);
}

export function sendJson(res, status, data) {
  const body = Buffer.from(JSON.stringify(data, null, 2));
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

export function requireBearer(req, token) {
  if (!token) return false;
  const header = req.headers.authorization || "";
  return header === `Bearer ${token}`;
}
