# CLAUDE.md

## Overview

Qortium Paint is a Q-App (QDN web app) for Qortium Home: a raster paint editor
that saves locally or publishes images to QDN. It never touches key material —
QDN writes go through Home's `PUBLISH_QDN_RESOURCE` approval prompt. In a plain
browser (no bridge) it runs read-only with local-download fallback.

## Build / Test / Run

- `npm run dev` — Vite dev server (browser fallback mode)
- `npm run build` — `tsc --noEmit` + `vite build` into `dist/`
- `npm test` — vitest (jsdom), tests colocated as `src/**/*.test.ts(x)`
- `npm run qdn:publish` — publish `dist/` as `APP/Paint/Paint` (see below)

## Architecture

- `src/types.ts` — frozen contracts (`PaintEngineApi`, `QdnServicesApi`)
  between the three layers; keep it import-free.
- `src/engine/` — canvas raster engine: tools, snapshot undo/redo history,
  floating-image import/commit, export. Pure logic (flood fill, geometry) is
  kept canvas-free for unit testing.
- `src/ui/` — React components (toolbar, dialogs, status bar) + `app.css`.
  Talks to the engine via its public API and to QDN via `QdnServicesApi` only.
- `src/qdn/` — `qdnRequest.ts` bridge wrapper (same pattern as
  qortium-notify/boards/chat) + `api.ts` implementing save/publish/account.
- `src/displaySettings.ts` — stamps Home's injected `_qdn*` display globals
  onto `<html>` before first paint; subscribes to `*_CHANGED` messages.

## QDN publishing

`scripts/publish-qdn.mjs` (same shape as sibling apps): requires a synced
local node, resolves the API key (`QORTIUM_PAINT_NODE_API_KEY[_PATH]` → running
core detection → `~/.config/qortium-core/runtime/apikey.txt`), signs with a
preview account from `initial-minting-accounts.json`, registers the name if
missing, publishes `dist/`, then polls resource status until `READY`.
Env prefix: `QORTIUM_PAINT_`.

## Conventions / gotchas

- TS strict, ESM, `base: './'` — all asset URLs must stay relative.
- QAVS: app version `X.Y` = min platform level (currently built against 1.5),
  `Z` = app counter; `qortium-app.json` is emitted by the Vite plugin from
  `package.json` version — bump `package.json` only.
- Bridge actions are feature-gated with `hasAction(...)` — a public node
  reports fewer actions than a local one; never assume writes exist.
- Account action is `GET_SELECTED_ACCOUNT`; `SAVE_QDN_RESOURCE` saves an
  already-published resource, NOT a fresh drawing (local save = download).
- QDN identifiers cap at 64 UTF-8 bytes (`suggestIdentifier` enforces this).
- No external URLs in the bundle — grep `dist/` for `https://` before publish.
- No lint script exists; CI runs `npm ci && npm run build && npm test`.
