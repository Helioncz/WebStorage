# Hangar Sync Server

Malý cloud server pro variantu **B**: Hangar zůstává desktopová appka, server řeší jen GitHub webhooky a jednoduchý event log.

Server nehostuje editor, preview ani soubory webů. Pouze:

- přijme GitHub webhook `push`,
- ověří podpis přes webhook secret,
- uloží informaci o novém commitu,
- nabídne Hangaru endpoint, zda pro konkrétní repo existují nové změny.

## Endpointy

```txt
GET  /health
POST /github/webhook
GET  /sync/events?owner=<owner>&repo=<repo>&since_id=<id>
GET  /sync/latest?owner=<owner>&repo=<repo>
```

`/sync/*` endpointy vyžadují:

```txt
Authorization: Bearer <SYNC_API_TOKEN>
```

## Lokální spuštění

```bash
cd sync-server
cp .env.example .env
# uprav .env
npm run dev
```

Server používá vestavěné `node:sqlite`, takže vyžaduje Node 22+.

## GitHub webhook

V GitHub repozitáři nebo GitHub App nastav webhook:

```txt
Payload URL: https://tvuj-server.cz/github/webhook
Content type: application/json
Secret: stejné jako GITHUB_WEBHOOK_SECRET
Events: push
```

## Deploy poznámka

Pro MVP stačí Railway / Render / Fly.io / malý VPS. Server je extrémně lehký: neprovádí buildy, preview ani AI inference.
