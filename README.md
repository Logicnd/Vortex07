# Vortex07

A Chrome extension that restyles [playvortex.io](https://playvortex.io) with a **2006–2008 Roblox / Windows XP Luna** look — compact navigation, classic footer, retro buttons, player search, a local termed-user archive, and global extension reputation.

**Version:** 1.6.0

## Features

- **2007 UI shell** — 960px centered layout, lavender header, equal-width nav tabs, open section layout (less boxy than the native site)
- **Smart player search** — live results from the Vortex API plus local archive matches
- **Termed player archive** — snapshots users as you browse so termed/banned accounts stay searchable offline
- **Global reputation** — RoPro-style thumbs-up on profiles, search rows, and friend cards; synced across all Vortex07 users via a shared API
- **Online status styling** — consistent green/grey indicators on profiles and friend tiles
- **XP-style popup** — toggle features, optional custom rep API URL, archive stats

## Install

1. Clone this repo.
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode**.
4. Click **Load unpacked** and select this folder.
5. Visit [playvortex.io](https://playvortex.io) — the extension runs automatically.

## Settings

Click the Vortex07 toolbar icon to open the settings popup:

| Setting | Description |
|--------|-------------|
| Enable Vortex07 | Master on/off switch |
| Classic navigation tabs | Roblox-style equal-width nav row |
| Classic footer legalese | 2007 copyright footer |
| Windows XP style buttons | Inset/outset button chrome |
| Smart player search | Dropdown player lookup in the header |
| Termed player archive | Save local snapshots while browsing |
| Global Vortex07 Reputation | Show rep counts and allow voting |
| Custom rep API (optional) | Override the default community sync URL |
| Debug logs | Console logging for troubleshooting |

## Reputation sync

By default, reputation uses the community API at `https://vortex07-reputation.vercel.app/api`. Votes and counts are shared between everyone running Vortex07.

To host your own sync server, deploy the [`reputation-sync/`](reputation-sync/) folder to Vercel (see [`reputation-sync/README.md`](reputation-sync/README.md)), then paste your API base URL into the popup.

**Endpoints:**

- `GET /api/reputation?userId=123&voterId=abc` — single user count
- `GET /api/reputation?ids=1,2,3&voterId=abc` — bulk counts for search/friends
- `POST /api/reputation` — `{ userId, voterId }` to give rep

If sync is unreachable, votes are queued locally and retried on the next page load.

## Project structure

```
vortex07/
├── manifest.json       # Extension manifest (MV3)
├── content.js          # Layout shell, search, archive, reputation
├── styles.css          # Full 2007 theme
├── popup.html/css/js   # Settings UI
├── Assets/             # Icons and logo
├── reputation-sync/    # Deployable Vercel API for global rep
└── scripts/            # Optional Discord publish helper
```

## Development

Load the extension unpacked after any change — no build step required.

Optional Discord publish script (requires a `.env` with `DISCORD_WEBHOOK_URL`):

```bash
npm install
npm run publish -- "Updated search UI | Fixed profile layout"
```

## Permissions

- **storage** — settings, ban archive, reputation cache
- **playvortex.io** — content script injection
- **vercel.app** — reputation sync API requests

## Disclaimer

Vortex07 is a fan-made browser extension. It is not affiliated with or endorsed by Vortex / playvortex.io. The classic footer text is cosmetic nostalgia only.
