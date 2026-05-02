# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the app locally

```bash
# Start the local dev server (reads ANTHROPIC_API_KEY from .env.local or .env)
/opt/homebrew/bin/node dev-server.js
```

The server runs on port 8888 and handles both static file serving (`public/`) and the Claude API proxy at `/.netlify/functions/analyze`. There is no build step — files are served directly.

**Note:** `netlify-cli` is installed as a dev dependency but is incompatible with Node 25 (buffer-equal-constant-time crash). Always use `node dev-server.js` for local dev, not `npm run dev`.

The phone test URL is `http://192.168.0.88:8888` (local WiFi).

## Environment

- `ANTHROPIC_API_KEY` — required. Put in `.env.local` (loaded first) or `.env`.
- Both files are gitignored.

## Deploying

The app targets Vercel (preferred, user already has account) but `netlify.toml` is present for Netlify fallback. The function lives at `netlify/functions/analyze.js` — for Vercel this would move to `api/analyze.js` with a Vercel handler signature.

## Architecture

**No framework, no build step.** Everything in `public/` is served as-is. JS files are plain scripts loaded via `<script src>` tags in a fixed order on each page.

### Script load order (every HTML page)
```
settings.js → projects.js → [page-specific js]
```
`settings.js` and `projects.js` expose globals used by all pages. `estimate.js` is only loaded on `estimate.html`.

### Data layer — `public/js/projects.js`
All state lives in `localStorage`. Key schema:

| localStorage key | Type | Contents |
|---|---|---|
| `gc_projects` | JSON array | All projects, rooms, and photos |
| `gc_materials_db` | JSON array | Custom material price list (Pro) |
| `gc_tier` | string | `'free'` or `'paid'` |
| `gc_labor_rate` | number | $/hr |
| `gc_markup_pct` | number | Material markup % |
| `gc_contractor_name` | string | Company name |

**Project data shape:**
```
project { id, name, createdAt, gallery[], rooms[] }
  room   { id, name, createdAt, photos[], roomEstimate? }
    photo  { id, label, notes, thumbnailDataUrl, fullBase64, mimeType, analyzed, estimate? }
gallery photo { id, thumbnailDataUrl, fullBase64, mimeType, capturedAt }
```

`saveProjects()` returns `false` on `QuotaExceededError` — callers must check. Photo imports use `addGalleryPhoto()` (singular) in a loop so partial saves succeed.

Photos are stored at 1024px / 0.82 JPEG quality to stay within localStorage's ~5MB limit. Thumbnails are 200px / 0.7.

### Backend — `netlify/functions/analyze.js` and `dev-server.js`
Single endpoint `POST /.netlify/functions/analyze` with two modes:

- `action: 'single'` — one image, returns structured JSON estimate
- `action: 'batch'` — array of `{ base64, mimeType, label }` images for a room, returns one unified estimate (Claude sees all images together)

Both files contain identical logic. **Keep them in sync** when changing the Claude prompt, schema, or custom materials handling.

Claude model: `claude-sonnet-4-6`, `max_tokens: 4096`. Response is raw JSON (no markdown fences) — there's a regex fallback if Claude wraps it anyway.

### Page navigation
Multi-page app, each page is a standalone HTML file:

```
index.html     → jobs list
project.html   → job detail: Photos tab (gallery) + Rooms tab
room.html      → room detail: unanalyzed photo grid + "Analyze All" CTA
estimate.html  → unified estimate viewer (photo / room / project / project-breakdown)
materials.html → custom material price list (Pro only)
settings.html  → rates, tier toggle
```

URL params carry context: `project.html?id=proj_123`, `room.html?projectId=...&roomId=...`, `estimate.html?type=room&projectId=...&roomId=...`

### Free vs Pro tier
`isPaid()` in `projects.js` gates:
- Itemized materials/labor tables in `estimate.js`
- `materials.html` (locked nav item for free tier)
- Custom material prices sent to Claude in `analyze` calls

No payment integration — toggled manually in Settings. The gate is purely client-side via `localStorage`.

## Design tokens

All CSS uses custom properties defined in `public/css/app.css`:

| Token | Value | Use |
|---|---|---|
| `--bg` | `#F5F3EE` | Page background (warm off-white) |
| `--ink` | `#0F0F0E` | Primary text + header bg |
| `--accent` | `#FF6A00` | Safety orange — CTAs, FAB, active states |
| `--surface` | `#FFFFFF` | Card background |
| `--font-ui` | Inter Tight | All UI text |
| `--font-mono` | JetBrains Mono | Numbers, IDs, labels, nav |

Google Fonts are loaded in each HTML `<head>`. Dollar amounts and mono labels must use `font-family: var(--font-mono)`.

## Service worker

`public/sw.js` caches the app shell. Cache version is `gc-estimator-v2` — bump this string when deploying breaking CSS/JS changes so users get the new version. The SW never intercepts `/.netlify/functions/` calls.

When testing in the preview browser, clear the SW with:
```js
(async()=>{for(const r of await navigator.serviceWorker.getRegistrations()) await r.unregister(); for(const k of await caches.keys()) await caches.delete(k)})()
```
