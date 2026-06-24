import crypto from "node:crypto";

export function verifyGithubSignature(rawBody, signatureHeader, secret) {
  if (!secret || !signatureHeader) return false;

  const expected =
    "sha256=" + crypto.createHmac("sha256", secret).update(rawBody).digest("hex");

  const actual = Buffer.from(signatureHeader);
  const expectedBuffer = Buffer.from(expected);

  if (actual.length !== expectedBuffer.length) return false;
  return crypto.timingSafeEqual(actual, expectedBuffer);
}

export function parsePushEvent(payload) {
  const [owner, repo] = (payload.repository?.full_name || "/").split("/");
  const branch = payload.ref?.startsWith("refs/heads/")
    ? payload.ref.slice("refs/heads/".length)
    : payload.ref || null;

  return {
    owner,
    repo,
    branch,
    beforeSha: payload.before || null,
    afterSha: payload.after || null,
    pusher: payload.pusher?.name || payload.sender?.login || null,
    commitCount: Array.isArray(payload.commits) ? payload.commits.length : 0,
  };
}
