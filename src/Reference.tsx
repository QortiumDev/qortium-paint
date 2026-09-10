import { useEffect, useState, type MouseEvent } from 'react';
import { copyTextToClipboard } from './clipboard';
import { MAX_IMAGE_BYTES, MAX_IDENTIFIER_BYTES, suggestIdentifier } from './qdn/api';
import { AUTOSAVE_KEY, AUTOSAVE_DEBOUNCE_MS } from './editorContract';
import { DEFAULT_CANVAS_WIDTH, DEFAULT_CANVAS_HEIGHT, MIN_CANVAS_SIZE, MAX_CANVAS_SIZE, MAX_IMPORT_BYTES, MAX_IMPORT_PIXELS, DEFAULT_JPEG_QUALITY } from './engine/engine';
import { DEFAULT_HISTORY_CAP } from './engine/history';
export const SECTIONS = ['editor', 'files', 'publishing', 'examples'] as const;
export function sectionUrl(input: string, section: string) {
  const url = new URL(input); url.searchParams.set('view', 'developers'); url.searchParams.set('section', section);
  return url.pathname + url.search + url.hash;
}
export const SNIPPETS = {
  capabilities: `const actions = await qdnRequest({ action: 'SHOW_ACTIONS' });\nconst canPublish = Array.isArray(actions) && actions.includes('PUBLISH_QDN_RESOURCE');\n// An advertised action still requires a supported host and approval.`,
  account: `// Use when preparing a user-requested publish.\nconst account = await qdnRequest({ action: 'GET_SELECTED_ACCOUNT' });\n// Paint needs a registered name for that account. Home enforces ownership.`,
  publish: `// Construct only after the user chooses to publish a PNG/JPEG.\nconst request = {\n  action: 'PUBLISH_QDN_RESOURCE', service: 'IMAGE', name: 'YourRegisteredName',\n  identifier: '${suggestIdentifier('Example', '2026-09-09')}',\n  title: 'Example', description: '', filename: 'example.png',\n  base64: '<raw base64 bytes, without a data URL prefix>'\n};\n// Invoke qdnRequest(request) only after user confirmation.\n// Check accepted; keep work on denial/error. A lost response is an unknown\n// outcome: inspect the resource before retrying to avoid duplicate publishes.`,
} as const;
function scrollSection() {
  const id = new URL(location.href).searchParams.get('section');
  if (!SECTIONS.some(section => section === id)) return;
  const section = document.getElementById(`reference-${id}`), pane = section?.closest<HTMLElement>('.qp-reference-scroll');
  if (section && pane) { pane.scrollTop += section.getBoundingClientRect().top - pane.getBoundingClientRect().top; section.focus({ preventScroll: true }); }
}
export function Reference() {
  const [copyStatus, setCopyStatus] = useState('Code examples can be selected for manual copying.');
  useEffect(() => { scrollSection(); addEventListener('popstate', scrollSection); return () => removeEventListener('popstate', scrollSection); }, []);
  function visit(event: MouseEvent<HTMLAnchorElement>, id: string) {
    if (event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (new URL(location.href).searchParams.get('section') !== id) history.pushState(history.state, '', sectionUrl(location.href, id));
    scrollSection();
  }
  return <article className="qp-reference" lang="en" dir="ltr" aria-label="Paint developer reference">
    <header><h1>Paint Developers <small>{__APP_VERSION__}</small></h1>
      <nav aria-label="Developer reference sections">{SECTIONS.map(id => <a key={id} href={sectionUrl(location.href,id)} onClick={event=>visit(event,id)}>{id === 'editor' ? 'Editor and recovery' : id === 'files' ? 'Files and limits' : id === 'publishing' ? 'QDN publishing' : 'Bridge examples'}</a>)}</nav>
      <p className="copy-status" role="status" aria-live="polite">{copyStatus}</p>
    </header>
    <div className="qp-reference-scroll">
      <section id="reference-editor" tabIndex={-1}><h2>Editor and recovery</h2>
        <p>Paint {__APP_VERSION__} is a raster editor published on Qortium as <code>APP/Paint/Paint</code>. The editor and this English reference work without an account. Home supplies publishing authority; the app never handles private keys.</p>
        <p><code>?view=developers</code> opens this workspace; <code>developer</code> and <code>reference</code> are aliases. Section navigation uses <code>section</code>, preserving unrelated/repeated query parameters and hashes. Home Back/Forward restores the workspace. Switching keeps the engine, pixels, undo/redo, zoom, tool selection, floating image and dialog state mounted. Editor keyboard shortcuts and paste are inactive while reading this reference.</p>
        <p>The initial canvas is {DEFAULT_CANVAS_WIDTH} × {DEFAULT_CANVAS_HEIGHT} pixels. Undo supports up to {DEFAULT_HISTORY_CAP} operations, with PNG snapshots in memory. This is raster history, not persistent layers or a portable project format.</p>
        <p>Best-effort recovery stores a PNG snapshot in the current origin’s localStorage slot <code>{AUTOSAVE_KEY}</code> after {AUTOSAVE_DEBOUNCE_MS} ms without an engine update. The snapshot excludes uncommitted floating images and does not retain placement or undo history. Apply an imported image before saving. Storage can be full, unavailable or cleared; different Home routes/origins may have separate slots. Export valuable work. A local download request keeps the drawing dirty and recovery data available; an accepted QDN publish clears the slot. A reload may offer Restore or Discard. It is not a cloud backup.</p>
      </section>
      <section id="reference-files" tabIndex={-1}><h2>Files and limits</h2>
        <p>File, clipboard and drag/drop imports share the engine’s raster decoder. Supported types are PNG, JPEG, WebP, GIF, BMP and AVIF; SVG is rejected. Import limits: {MAX_IMPORT_BYTES.toLocaleString('en-US')} bytes and {MAX_IMPORT_PIXELS.toLocaleString('en-US')} decoded pixels. Animated imports become a raster frame, not an animation editor. Images are fitted as a floating placement; Apply commits it, Cancel discards it.</p>
        <p>Each canvas dimension must be {MIN_CANVAS_SIZE}–{MAX_CANVAS_SIZE} pixels. Resizing can crop content. Canvas pixels do not change with Home text size. Export uses PNG or JPEG (default JPEG quality {DEFAULT_JPEG_QUALITY}); exported bytes exclude uncommitted floating content, so Apply an imported image before export.</p>
        <p>Local Save creates a browser download from a Blob URL and reports that the download was requested; completion is not proof that the user retained the file. Fresh file downloads are unsupported by Qortium Home 2.x on Android. Keep the drawing open and use another save route there. <code>SAVE_QDN_RESOURCE</code> is for already-published data, not a new drawing. Downloading locally does not publish anything.</p>
      </section>
      <section id="reference-publishing" tabIndex={-1}><h2>QDN publishing</h2>
        <p>Paint discovers <code>SHOW_ACTIONS</code> and offers Publish when <code>PUBLISH_QDN_RESOURCE</code> is available. The dialog obtains <code>GET_SELECTED_ACCOUNT</code>; the selected account needs a registered name. Home checks current ownership, permissions and the selected node. A capability or name is not a guarantee of acceptance.</p>
        <p>The UI publishes service <code>IMAGE</code>, with PNG/JPEG bytes encoded as raw base64. Paint limits the source Blob to {MAX_IMAGE_BYTES.toLocaleString('en-US')} bytes; base64 expands it, and host limits may be lower. Identifiers are nonempty, at most {MAX_IDENTIFIER_BYTES} UTF-8 bytes, and use ASCII letters, digits, dots, underscores or hyphens. The helper accepts IMAGE/FILE; the editor chooses IMAGE.</p>
        <p>Publishing is public. The dialog shows the name, title, description and identifier before the user submits; Home provides its own approval. The tuple <code>service/name/identifier</code> can be republished and is not an immutable content hash. A returned <code>accepted</code> result means Home accepted the request; verify transaction confirmation and served bytes before claiming network availability. Denial/error preserves the drawing. If a response is lost, inspect the tuple before retrying.</p>
        <p>This reference and its copy controls perform no bridge calls or writes. Qortal publishing is outside this app pass. Standalone drawing/export is local; account/publish actions require Home.</p>
      </section>
      <section id="reference-examples" tabIndex={-1}><h2>Bridge examples</h2>{Object.entries(SNIPPETS).map(([key,code])=><div className="qp-reference-example" key={key}><h3>{key}</h3><button className="qp-btn" aria-label={`Copy ${key} example`} onClick={async()=>setCopyStatus(await copyTextToClipboard(code) ? `Copied ${key} example.` : 'Clipboard unavailable. Select the code and copy it manually.')}>Copy</button><pre><code>{code}</code></pre></div>)}</section>
    </div>
  </article>;
}
