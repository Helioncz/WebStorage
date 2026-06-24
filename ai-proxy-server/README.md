# Hangar AI Proxy Server

Malý vlastní AI server mimo desktop aplikaci. Hangar pak nevolá Claude/OpenAI přímo, ale tento server.

## Proč

- skutečný `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` zůstane jen na serveru,
- do Hangaru dáváš jen vlastní `HANGAR_AI_PROXY_TOKEN`,
- server je kompatibilní s aktuálním AI nastavením v Hangaru.

## Endpointy

```txt
GET  /health
GET  /providers
POST /v1/messages              # Anthropic-compatible
POST /v1/chat/completions      # OpenAI-compatible
```

Autorizace:

```txt
Authorization: Bearer <HANGAR_AI_PROXY_TOKEN>
```

Anthropic-compatible endpoint podporuje i:

```txt
x-api-key: <HANGAR_AI_PROXY_TOKEN>
```

To znamená, že v Hangaru můžeš nastavit provider **Anthropic** a použít proxy token jako API key.

## Lokální spuštění

```bash
cd ai-proxy-server
cp .env.example .env
# uprav .env
npm run dev
```

## Nastavení v Hangaru pro Claude

V AI nastavení v Hangaru:

```txt
Provider: Anthropic
Base URL: http://localhost:8790
Model: claude-opus-4-8
API key: hodnota HANGAR_AI_PROXY_TOKEN
```

Hangar zavolá:

```txt
POST http://localhost:8790/v1/messages
```

Server pak použije skutečný `ANTHROPIC_API_KEY` z `.env`.

## Nastavení v Hangaru pro OpenAI-compatible

```txt
Provider: OpenAI-compatible
Base URL: http://localhost:8790
Model: gpt-4.1 / jiný model
API key: hodnota HANGAR_AI_PROXY_TOKEN
```

## Deploy

Stačí malý server: Railway, Render, Fly.io, VPS. Server nedělá inference, jen přeposílá requesty na providera.

Pro produkci použij HTTPS a dlouhý náhodný `HANGAR_AI_PROXY_TOKEN`.
