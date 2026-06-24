export const config = {
  port: Number(process.env.PORT || 8787),
  dbPath: process.env.DB_PATH || "./data/sync.sqlite",
  webhookSecret: process.env.GITHUB_WEBHOOK_SECRET || "",
  syncApiToken: process.env.SYNC_API_TOKEN || "",
};

export function requireConfig() {
  const missing = [];
  if (!config.webhookSecret) missing.push("GITHUB_WEBHOOK_SECRET");
  if (!config.syncApiToken) missing.push("SYNC_API_TOKEN");
  if (missing.length) {
    throw new Error(`Missing required env var(s): ${missing.join(", ")}`);
  }
}
