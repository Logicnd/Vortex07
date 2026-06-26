# Vortex07 Reputation Sync API

Community reputation counts for the Vortex07 Chrome extension (RoPro-style).

## Deploy on Vercel

1. Import the repo with **Root Directory** set to `reputation-sync`.
2. In the Vercel project, open **Storage** → connect **Upstash Redis**.
3. On the connect screen, leave **Production** + **Preview** checked, then click **Connect**.
4. Deploy (or redeploy after connecting storage).

The API auto-detects these environment variable pairs (first match wins):

| Provider | URL var | Token var |
|----------|---------|-----------|
| Upstash (default) | `UPSTASH_REDIS_REST_URL` | `UPSTASH_REDIS_REST_TOKEN` |
| Vercel KV | `KV_REST_API_URL` | `KV_REST_API_TOKEN` |
| Custom prefix `STORAGE` | `STORAGE_URL` | `STORAGE_TOKEN` |

Responses include `"persistent": true` when Redis is connected, or `false` when using in-memory fallback (dev only — resets on cold start).

## Endpoints

- `GET /api/reputation?userId=123&voterId=abc` → `{ count, hasVoted, persistent }`
- `GET /api/reputation?ids=1,2,3&voterId=abc` → `{ results, persistent }`
- `POST /api/reputation` body `{ userId, voterId }` → `{ count, hasVoted, added, persistent }`

## Extension setup

In the Vortex07 popup, set **Custom rep API** to:

```
https://YOUR-PROJECT.vercel.app/api
```

Or update `COMMUNITY_REPUTATION_API` in `content.js` if you want that URL baked in as the default.
