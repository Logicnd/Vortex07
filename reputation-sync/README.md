# Vortex07 Reputation Sync API

Community reputation counts for the Vortex07 Chrome extension (RoPro-style).

## Deploy on Vercel

1. Import this folder as a Vercel project.
2. Add **Vercel KV** to the project (Storage tab).
3. Deploy.
4. In Vortex07 popup, set **Rep sync API** to:
   `https://YOUR-PROJECT.vercel.app/api`

## Endpoints

- `GET /api/reputation?userId=123&voterId=abc` → `{ count, hasVoted }`
- `POST /api/reputation` body `{ userId, voterId }` → `{ count, hasVoted, added }`

Without Vercel KV, votes use in-memory storage (resets on cold start — dev only).
