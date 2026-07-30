# Qortium Paint

A raster paint and image-editing app for Qortium Home, published on QDN as
`qdn://APP/Paint/Paint`. Draw with classic tools, import and join images, then
save the result to your computer or publish it to Qortium QDN under your name.

Qortium Paint replaces the source-less "Canvas" bundle previously circulated on
QDN: it is built from scratch, fully self-contained (no CDN or external font
fetches), and every QDN write happens only behind an explicit confirm dialog —
nothing is published silently.

## Features

- Brush, eraser, line, rectangle, ellipse, flood fill, text, and eyedropper
  tools with a classic palette, free color picker, and adjustable brush size
- Undo/redo, zoom, canvas resize, and crash-recovery autosave
- Import images from file, paste, or drag-and-drop; place, scale, and commit
  them onto the canvas ("image joining")
- Export as PNG or JPEG
- **Save to computer** — local download via Qortium Home
- **Publish to QDN** — posts the image to Qortium QDN under your registered
  name, with title, description, and an editable identifier

## Development

```sh
npm install
npm run dev       # Vite dev server (browser mode; read-only node fallback)
npm run build     # typecheck + production build into dist/
npm test          # vitest
```

Inside Qortium Home the app talks to the injected `window.qdnRequest` bridge.
In a plain browser drawing and local export still work fully offline, but
account and QDN publishing features require Home.

## Publishing to QDN

```sh
npm run build
npm run qdn:publish
```

`scripts/publish-qdn.mjs` publishes `dist/` as `APP/Paint/Paint` against a
local synced node. Configuration via `QORTIUM_PAINT_*` environment variables
(node URL, API key path, name/identifier/service overrides) — see the script
header. Versioning follows QAVS (`qortium-app.json` emitted at build time; app
`X.Y` = minimum platform level, `Z` = app counter).

## License

0BSD — see [LICENSE](LICENSE).
