# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.
**Read this fully before making any changes — it documents every feature built so far.**

## Running locally

```bash
/opt/homebrew/bin/node dev-server.js
```
Server runs on port 8888. Phone access: `http://192.168.0.88:8888`
Reads `ANTHROPIC_API_KEY`, `WHOP_API_KEY`, `LICENSE_SECRET`, `ADMIN_KEY` from `.env.local`.

## Deploying

```bash
git add -A && git commit -m "message" && git push
```
GitHub → Vercel auto-deploys. Live URL: `https://fieldestimator.vercel.app`

## Environment variables (required in Vercel + .env.local)

| Key | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Claude API for photo analysis |
| `WHOP_API_KEY` | Whop license validation |
| `LICENSE_SECRET` | Legacy HMAC (kept for fallback) |
| `ADMIN_KEY` | Admin bypass key for testing Pro |

## Architecture

**No framework, no build step.** Pure HTML/CSS/JS in `public/`. Two Vercel functions in `api/`.

### Script load order (every page)
```
settings.js → projects.js → [page-specific js]
```

### Key files

| File | Purpose |
|---|---|
| `api/analyze.js` | Vercel function — Claude photo analysis |
| `api/validate-license.js` | Vercel function — Whop license validation + admin bypass |
| `netlify/functions/analyze.js` | Netlify mirror of api/analyze.js — keep in sync |
| `netlify/functions/validate-license.js` | Netlify mirror of api/validate-license.js — keep in sync |
| `dev-server.js` | Local dev server — mirrors both API functions |
| `public/js/projects.js` | All localStorage CRUD, tier/license functions |
| `public/js/estimate.js` | Estimate rendering, scope editing, labor editing, exports |
| `public/css/app.css` | All styles — design tokens at top |
| `public/index.html` | Jobs list |
| `public/project.html` | Job detail: Photos tab + Rooms tab |
| `public/room.html` | Room detail + Analyze All |
| `public/estimate.html` | Estimate viewer |
| `public/settings.html` | Rates, Pro unlock, company name |
| `public/materials.html` | Custom material prices (Pro only) |
| `public/sw.js` | Service worker — bump CACHE version on every deploy that changes JS/CSS |

## Service worker cache

Current version: `field-estimate-v6`
**Always bump this when deploying JS or CSS changes** or users get stale cached files.

## Features built — DO NOT overwrite these

### 1. Pro license gate (settings.html + api/validate-license.js)
- Free toggle replaced with Whop license key validation
- Settings shows: "💳 Buy Pro — $19.99" button → `https://whop.com/checkout/plan_hic0qAZvIdo4O`
- Below that: license key input field + "Unlock Pro" button
- On submit: POSTs `{ license_key }` to `/.netlify/functions/validate-license`
- Backend checks `ADMIN_KEY` env var first (bypass for testing), then calls Whop API
- On success: `activateLicense(code)` stores `gc_tier=paid` + `gc_license_code` in localStorage
- `isPaid()` requires BOTH `gc_tier==='paid'` AND `gc_license_code` present
- Pro status shows masked key + "Remove License" button
- Whop product ID: `prod_FhQkubpj4IiKz`
- Admin key: stored in `ADMIN_KEY` env var (never hardcoded)

### 2. Scope of works editing (estimate.js — estimateCards())
- Available on `type=room` and `type=photo` estimates only (not project-level)
- `allowEdit` = true when `scope === 'photo' || scope === 'room'`
- Each scope item renders with a ✕ delete button: `removeScopeItem(index)`
- Add row at bottom: text input + "Add" button: `addScopeItem()`
- Enter key also triggers add
- `saveScopeEdits(newScope)` — updates localStorage and re-renders list in place
- Saves to `room.roomEstimate.scope_of_works` or `photo.estimate.scope_of_works`

### 3. Labor row editing (estimate.js)
- Available on `type=room` and `type=photo` estimates only
- Each labor row has ✏️ edit button: `editLaborRow(index)`
- Opens inline form with HRS and $/HR inputs
- `saveLaborEdit(index)` — updates hours, rate, recalculates line_total
- Explicitly recalculates `labor_subtotal` and `grand_total` and saves totals to localStorage
- `rerenderEstimate()` re-renders full estimate body after save
- Per-item rate override stored as `l._customRate` (if different from settings rate)
- Labor totals always recalculate using current `getSettings().laborRate` unless `_customRate` set

### 4. View Estimate from jobs list (index.html)
- Job cards show "Open Job" + "📊 View Estimate" buttons when estimates exist
- "View Estimate" goes to `estimate.html?type=project-breakdown&projectId=...`
- Breakdown view shows each room with an ✏️ Edit button → `estimate.html?type=room&...`
- This gives access to scope and labor editing per room

### 5. Save to Camera Roll (project.html)
- After importing photos, if `navigator.canShare` available (iOS/Android), shows prompt:
  "📥 Save N photos to Camera Roll?" with Save + Dismiss buttons
- `saveToDevice()` calls `navigator.share({ files: originalFiles })`
- Opens native share sheet → user taps "Save Image" → Camera Roll
- Falls back to `<a download>` if Web Share API not available
- Prompt only shows on mobile (desktop hides it correctly)

### 6. App name: FieldEstimate
- All pages titled "FieldEstimate"
- manifest.json: `name: "FieldEstimate"`, `short_name: "FieldEst."`
- SW cache prefix: `field-estimate-`

## Data layer (projects.js)

### localStorage keys
| Key | Type | Contents |
|---|---|---|
| `gc_projects` | JSON array | All projects, rooms, photos |
| `gc_materials_db` | JSON array | Custom material prices (Pro) |
| `gc_tier` | string | `'free'` or `'paid'` |
| `gc_license_code` | string | Whop license key (required for isPaid()) |
| `gc_license_email` | string | Legacy — no longer used |
| `gc_labor_rate` | number | $/hr from Settings |
| `gc_markup_pct` | number | Material markup % |
| `gc_contractor_name` | string | Company name |

### Tier functions
```js
isPaid()           // true only if gc_tier==='paid' AND gc_license_code present
activateLicense(code)  // sets gc_tier=paid + gc_license_code
revokeLicense()    // removes all three license keys
getLicenseEmail()  // legacy, no longer used in UI
```

### Project data shape
```
project { id, name, createdAt, gallery[], rooms[] }
  room   { id, name, createdAt, photos[], roomEstimate? }
    photo  { id, label, notes, thumbnailDataUrl, fullBase64, mimeType, analyzed, estimate? }
```

## Design tokens (app.css)

| Token | Value | Use |
|---|---|---|
| `--bg` | `#F5F3EE` | Page background |
| `--ink` | `#0F0F0E` | Primary text + header |
| `--accent` | `#FF6A00` | Safety orange — CTAs |
| `--surface` | `#FFFFFF` | Card background |
| `--green` | `#1C7C4A` | Success states |
| `--red` | `#C62828` | Errors, delete |
| `--font-ui` | Inter Tight | All UI text |
| `--font-mono` | JetBrains Mono | Numbers, IDs, labels |

## Free vs Pro

| Feature | Free | Pro |
|---|---|---|
| Scope of works | ✅ view + edit | ✅ |
| Grand total | ✅ | ✅ |
| Materials table | ❌ locked | ✅ |
| Labor table + editing | ❌ locked | ✅ |
| Custom material prices | ❌ | ✅ |
| Scope editing | ✅ | ✅ |

## When making changes — checklist

1. Never remove scope editing, labor editing, Pro gate, or Save to Camera Roll
2. Always bump SW cache version in `public/sw.js` when changing any JS or CSS
3. Keep `api/analyze.js` and `netlify/functions/analyze.js` in sync
4. Keep `api/validate-license.js` and `netlify/functions/validate-license.js` in sync
5. Keep `dev-server.js` endpoint handlers in sync with the two API files
6. Always commit and push after changes: `git add -A && git commit -m "..." && git push`
