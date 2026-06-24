import http from "node:http";
import { URL } from "node:url";
import { config, requireConfig } from "./config.js";
import { insertGithubEvent, latestEvent, listEvents } from "./db.js";
import { parsePushEvent, verifyGithubSignature } from "./github.js";
import { readRawBody, requireBearer, sendJson, sendText } from "./http.js";

requireConfig();

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

    if (req.method === "GET" && url.pathname === "/health") {
      return sendJson(res, 200, { ok: true, service: "hangar-sync-server" });
    }

    if (req.method === "POST" && url.pathname === "/github/webhook") {
      const rawBody = await readRawBody(req);
      const eventType = req.headers["x-github-event"];
      const deliveryId = req.headers["x-github-delivery"];
      const signature = req.headers["x-hub-signature-256"];

      if (!verifyGithubSignature(rawBody, signature, config.webhookSecret)) {
        return sendJson(res, 401, { error: "Invalid GitHub webhook signature" });
      }

      if (!deliveryId || typeof deliveryId !== "string") {
        return sendJson(res, 400, { error: "Missing X-GitHub-Delivery header" });
      }

      const payload = JSON.parse(rawBody.toString("utf8"));

      if (eventType !== "push") {
        return sendJson(res, 202, { ok: true, ignored: true, event: eventType });
      }

      const push = parsePushEvent(payload);
      if (!push.owner || !push.repo) {
        return sendJson(res, 400, { error: "Push payload missing repository full_name" });
      }

      insertGithubEvent({
        eventType,
        deliveryId,
        payload,
        ...push,
      });

      return sendJson(res, 202, {
        ok: true,
        owner: push.owner,
        repo: push.repo,
        branch: push.branch,
        afterSha: push.afterSha,
      });
    }

    if (req.method === "GET" && url.pathname === "/sync/events") {
      if (!requireBearer(req, config.syncApiToken)) {
        return sendJson(res, 401, { error: "Missing or invalid sync token" });
      }

      const owner = url.searchParams.get("owner");
      const repo = url.searchParams.get("repo");
      if (!owner || !repo) {
        return sendJson(res, 400, { error: "Missing owner or repo query parameter" });
      }

      const sinceId = Number(url.searchParams.get("since_id") || 0);
      const limit = Number(url.searchParams.get("limit") || 50);
      return sendJson(res, 200, { events: listEvents({ owner, repo, sinceId, limit }) });
    }

    if (req.method === "GET" && url.pathname === "/sync/latest") {
      if (!requireBearer(req, config.syncApiToken)) {
        return sendJson(res, 401, { error: "Missing or invalid sync token" });
      }

      const owner = url.searchParams.get("owner");
      const repo = url.searchParams.get("repo");
      if (!owner || !repo) {
        return sendJson(res, 400, { error: "Missing owner or repo query parameter" });
      }

      return sendJson(res, 200, { latest: latestEvent({ owner, repo }) });
    }

    return sendText(res, 404, "Not found");
  } catch (error) {
    const status = error.statusCode || 500;
    return sendJson(res, status, {
      error: error.message || "Internal server error",
    });
  }
});

server.listen(config.port, () => {
  console.log(`Hangar sync server listening on http://localhost:${config.port}`);
});
