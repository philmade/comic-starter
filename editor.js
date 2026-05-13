/**
 * comic-starter — editor.js
 * v0.4: shared-lexicon addressing.
 *
 *   - Activates on ?edit=1 (forgiving: ??edit=1, #edit also work).
 *   - Editable text classes: .editable-caption .editable-speech .editable-thought .editable-label
 *   - Every panel has data-frame-id (e.g. c01.f02).
 *   - Every primitive has data-prim-id (e.g. speech.0). Auto-assigned if missing.
 *   - In edit mode, every frame shows its ID as a gold badge top-left,
 *     and every primitive shows its prim ID as a small dark badge.
 *
 * Full primitive address: <frameId>.<primId>  e.g. c01.f02.speech.0
 * Storage key:            <frameId>::<primId>::<subrole>
 *                         subrole = "self" | "speaker" | "text"
 *
 * Image drop with auto-rename + ZIP export — unchanged from v0.3.
 */
(function () {
  'use strict';

  const EDIT_MODE = /\bedit(?:=1)?\b/.test(location.search + location.hash);
  if (!EDIT_MODE) return;
  console.log('[editor] edit mode detected from URL:', location.href);

  const STORAGE_PREFIX = 'comic-starter::v3::';
  const ROLES = ['caption', 'speech', 'thought', 'label'];
  const TEXT_SELECTOR = ROLES.map(r => '.editable-' + r).join(', ');
  const PLACEHOLDER = 'images/placeholder.svg';

  const pendingImages = new Map();
  const originalSrcs = new WeakMap();

  // ─── IndexedDB persistence ─────────────────────────────────────────────────
  //
  // Two stores in one DB:
  //   pendingImages — dropped image blobs (existing)
  //   snapshots     — full-comic HTML snapshots, keyed by project name
  //
  // The snapshot store is what gives the editor its Google-Docs-style
  // autosave: every meaningful action writes a debounced snapshot of the
  // .comic container's cleaned HTML, and on next load we restore it before
  // wiring up the editor.
  const DB_NAME = 'comic-starter';
  const DB_STORE = 'pendingImages';
  const SNAPSHOT_STORE = 'snapshots';
  const CURRENT_PROJECT_KEY = 'comic-starter::current-project';
  let dbHandle = null;
  function openDB() {
    if (dbHandle) return Promise.resolve(dbHandle);
    return new Promise((resolve, reject) => {
      // Version 2 adds the snapshots store on top of v1's pendingImages.
      const req = indexedDB.open(DB_NAME, 2);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE);
        if (!db.objectStoreNames.contains(SNAPSHOT_STORE)) db.createObjectStore(SNAPSHOT_STORE);
      };
      req.onsuccess = () => { dbHandle = req.result; resolve(dbHandle); };
      req.onerror = () => reject(req.error);
      // If another tab holds v1 open, the upgrade hangs forever. Reject fast
      // and let the editor boot without IDB rather than freezing the page.
      req.onblocked = () => {
        console.warn('[editor] IndexedDB v2 upgrade blocked — close other comic.html tabs.');
        reject(new Error('IndexedDB upgrade blocked by another tab'));
      };
      // Final safety: if neither success/error/blocked fires within 3s, bail.
      setTimeout(() => reject(new Error('IndexedDB open timeout')), 3000);
    });
  }
  async function dbPut(key, value) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
  async function dbDelete(key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
  async function dbClear() {
    try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE, 'readwrite');
        tx.objectStore(DB_STORE).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) { console.warn('[editor] dbClear failed:', e); }
  }
  async function dbGetAll() {
    try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE, 'readonly');
        const store = tx.objectStore(DB_STORE);
        const keysReq = store.getAllKeys();
        const valsReq = store.getAll();
        let ks, vs;
        keysReq.onsuccess = () => { ks = keysReq.result; if (vs) finish(); };
        valsReq.onsuccess = () => { vs = valsReq.result; if (ks) finish(); };
        function finish() {
          const map = new Map();
          ks.forEach((k, i) => map.set(k, vs[i]));
          resolve(map);
        }
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) { console.warn('[editor] dbGetAll failed:', e); return new Map(); }
  }

  // ─── Snapshot helpers (separate store, same DB) ────────────────────────────
  async function snapshotPut(name, html) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(SNAPSHOT_STORE, 'readwrite');
      tx.objectStore(SNAPSHOT_STORE).put({ html, savedAt: Date.now() }, name);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
  async function snapshotGet(name) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(SNAPSHOT_STORE, 'readonly');
      const req = tx.objectStore(SNAPSHOT_STORE).get(name);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function snapshotList() {
    try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(SNAPSHOT_STORE, 'readonly');
        const req = tx.objectStore(SNAPSHOT_STORE).getAllKeys();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    } catch (e) { console.warn('[editor] snapshotList failed:', e); return []; }
  }
  async function snapshotDelete(name) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(SNAPSHOT_STORE, 'readwrite');
      tx.objectStore(SNAPSHOT_STORE).delete(name);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  function currentProject() {
    return localStorage.getItem(CURRENT_PROJECT_KEY) || 'untitled';
  }
  function setCurrentProject(name) {
    localStorage.setItem(CURRENT_PROJECT_KEY, name);
  }

  // Build a clean HTML snapshot of the .comic container — strip all editor
  // chrome (handles, badges, drop zones, contenteditable state) so the
  // snapshot is exactly what the comic would look like when published.
  function cleanSnapshotHTML() {
    const comic = document.querySelector('.comic');
    if (!comic) return '';
    const clone = comic.cloneNode(true);
    clone.querySelectorAll('.drag-handle, .frame-badge, .prim-drop-zone').forEach(n => n.remove());
    clone.querySelectorAll('[data-editing], [data-dirty], [data-drop-target], [data-img-dirty]').forEach(n => {
      n.removeAttribute('data-editing');
      n.removeAttribute('data-dirty');
      n.removeAttribute('contenteditable');
      n.removeAttribute('spellcheck');
      n.removeAttribute('data-drop-target');
      n.removeAttribute('data-img-dirty');
    });
    // Img elements pointing at blob: URLs are session-scoped — replace with
    // the original placeholder; hydrateImages will re-apply blob URLs on load.
    clone.querySelectorAll('img').forEach(img => {
      if ((img.getAttribute('src') || '').startsWith('blob:')) {
        img.setAttribute('src', 'images/placeholder.svg');
      }
      img.removeAttribute('data-pending-src');
    });
    return clone.innerHTML;
  }

  let snapshotSaveTimer = null;
  // Debounced — every action calls this, real write happens once per ~250ms.
  function scheduleSnapshotSave() {
    if (snapshotSaveTimer) clearTimeout(snapshotSaveTimer);
    snapshotSaveTimer = setTimeout(async () => {
      try {
        await snapshotPut(currentProject(), cleanSnapshotHTML());
        if (snapshotStatusEl) snapshotStatusEl.textContent = `saved ${new Date().toLocaleTimeString()}`;
      } catch (e) { console.warn('[editor] snapshot save failed:', e); }
    }, 250);
  }
  async function flushSnapshot() {
    if (snapshotSaveTimer) { clearTimeout(snapshotSaveTimer); snapshotSaveTimer = null; }
    try { await snapshotPut(currentProject(), cleanSnapshotHTML()); } catch (e) {}
  }

  async function restoreSnapshot() {
    try {
      const rec = await snapshotGet(currentProject());
      if (!rec || !rec.html) return false;
      const comic = document.querySelector('.comic');
      if (!comic) return false;
      comic.innerHTML = rec.html;
      return true;
    } catch (e) { console.warn('[editor] restoreSnapshot failed:', e); return false; }
  }

  // ─── Primitive ID auto-assignment ──────────────────────────────────────────

  function roleFor(el) {
    for (const r of ROLES) if (el.classList.contains('editable-' + r)) return r;
    return 'unknown';
  }

  // Auto-assign data-prim-id to any top-level editable in each frame that
  // doesn't already have one or sit inside an existing primitive container.
  function autoAssignPrimIds() {
    const frames = document.querySelectorAll('[data-frame-id]');
    for (const frame of frames) {
      const counts = new Map();
      // Seed counts from any existing primitive containers within this frame
      frame.querySelectorAll('[data-prim-id]').forEach(p => {
        const m = (p.getAttribute('data-prim-id') || '').match(/^(\w+)\.(\d+)$/);
        if (m) counts.set(m[1], Math.max(counts.get(m[1]) || 0, parseInt(m[2], 10) + 1));
      });
      const editables = frame.querySelectorAll(TEXT_SELECTOR);
      for (const el of editables) {
        if (el.hasAttribute('data-prim-id')) continue;
        // Skip if this element sits inside another primitive container
        const parent = el.parentElement && el.parentElement.closest('[data-prim-id]');
        if (parent) continue;
        const role = roleFor(el);
        const idx = counts.get(role) || 0;
        counts.set(role, idx + 1);
        el.setAttribute('data-prim-id', `${role}.${idx}`);
      }
    }
  }

  // ─── Storage key ───────────────────────────────────────────────────────────

  function subroleFor(el, container) {
    if (el === container) return 'self';
    if (el.classList.contains('speaker') || el.classList.contains('thinker')) return 'speaker';
    return 'text';
  }

  function keyFor(el) {
    const frame = el.closest('[data-frame-id]');
    const frameId = frame ? frame.getAttribute('data-frame-id') : '::doc';
    const container = el.closest('[data-prim-id]');
    const primId = container ? container.getAttribute('data-prim-id') : '?';
    const subrole = subroleFor(el, container);
    return `${STORAGE_PREFIX}${frameId}::${primId}::${subrole}`;
  }

  // ─── Text editing ──────────────────────────────────────────────────────────

  // Return innerHTML without any editor chrome (drag handles, prim badges).
  // Used so localStorage stores only the writer's content, never the chrome
  // — otherwise reloading would resurrect stale handles with no listeners.
  function cleanInnerHTML(el) {
    const clone = el.cloneNode(true);
    clone.querySelectorAll('.drag-handle').forEach(n => n.remove());
    return clone.innerHTML;
  }

  function activateText() {
    const all = Array.from(document.querySelectorAll(TEXT_SELECTOR));
    for (const el of all) {
      const key = keyFor(el);
      const stored = localStorage.getItem(key);
      if (stored !== null && stored !== el.innerHTML) {
        el.innerHTML = stored;
        el.dataset.dirty = 'true';
      }
      // Strip any drag-handle that got persisted from a prior session — old
      // localStorage entries from before this fix have the handle baked in.
      el.querySelectorAll(':scope > .drag-handle').forEach(n => n.remove());
      el.contentEditable = 'true';
      el.spellcheck = true;
      el.dataset.editing = 'true';
      el.addEventListener('input', () => {
        localStorage.setItem(key, cleanInnerHTML(el));
        el.dataset.dirty = 'true';
        refreshStatus();
        scheduleSnapshotSave();
      });
    }
    return all.length;
  }

  // ─── Image replacement (unchanged from v0.3) ───────────────────────────────

  function slugify(filename) {
    return filename.toLowerCase().replace(/\.[^.]+$/, '').replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '').substring(0, 40) || 'image';
  }
  function parseImageFilename(src) {
    const filename = src.split('/').pop();
    const m = filename.match(/^([\w.]+?)_v(\d+)(?:_([^.]+))?\.([a-z0-9]+)$/i);
    if (!m) return null;
    return { frameId: m[1], version: parseInt(m[2], 10), slug: m[3] || 'image', ext: m[4].toLowerCase(), filename };
  }
  function buildNewSrc(frameId, version, slug, ext) {
    return `images/${frameId}_v${version}_${slug}.${ext}`;
  }
  function extFromFile(file) {
    const m = file.name.match(/\.([a-z0-9]+)$/i);
    if (m) return m[1].toLowerCase();
    return ((file.type || '').split('/')[1] || 'jpg').replace('jpeg', 'jpg');
  }

  function setupImageDrops() {
    let count = 0;
    for (const panel of document.querySelectorAll('[data-frame-id]')) {
      if (setupFrameImageDrop(panel)) count++;
    }
    return count;
  }

  function setupFrameImageDrop(panel) {
    const img = panel.querySelector('img');
    if (!img) return false;
    if (panel.dataset.dropTarget === 'true') return false; // idempotent — skip if already wired
    originalSrcs.set(img, img.getAttribute('src'));
    panel.dataset.dropTarget = 'true';
    panel.addEventListener('dragover', e => {
      if (!e.dataTransfer || !e.dataTransfer.types.includes('Files')) return;
      e.preventDefault();
      panel.classList.add('drop-hover');
    });
    panel.addEventListener('dragleave', e => {
      if (e.target === panel) panel.classList.remove('drop-hover');
    });
    panel.addEventListener('drop', async e => {
      e.preventDefault();
      panel.classList.remove('drop-hover');
      const file = e.dataTransfer.files[0];
      if (!file) return;
      if (!file.type.startsWith('image/')) { flashPanel(panel, '#C8102E'); return; }
      await handleImageDrop(panel, img, file);
    });
    return true;
  }

  async function handleImageDrop(panel, img, file) {
    const frameId = panel.getAttribute('data-frame-id');
    const oldSrc = originalSrcs.get(img) || img.getAttribute('src');
    const parsed = parseImageFilename(oldSrc);
    const newVersion = (parsed ? parsed.version : 1) + 1;
    const slug = slugify(file.name);
    const ext = extFromFile(file);
    const newSrc = buildNewSrc(frameId, newVersion, slug, ext);

    // If there's a prior pending change on this img, discard it (replace, not stack).
    const prior = [...pendingImages.entries()].find(([_, v]) => v.imgEl === img);
    if (prior) {
      URL.revokeObjectURL(prior[1].blobUrl);
      pendingImages.delete(prior[0]);
      await dbDelete(prior[0]);
    }

    const blobUrl = URL.createObjectURL(file);
    img.src = blobUrl;
    img.dataset.pendingSrc = newSrc;
    panel.dataset.imgDirty = 'true';
    pendingImages.set(newSrc, { file, oldSrc, blobUrl, frameId, imgEl: img });

    // Persist to IndexedDB so it survives a refresh.
    await dbPut(newSrc, { file, oldSrc, frameId });

    console.log(`[editor] queued: ${oldSrc} → ${newSrc}`);
    refreshStatus();
    scheduleSnapshotSave();
    flashPanel(panel, '#A8D443');
  }

  // Re-hydrate pending image drops from IndexedDB on page load.
  async function hydrateImages() {
    const entries = await dbGetAll();
    if (entries.size === 0) return 0;
    for (const [newSrc, entry] of entries) {
      const { file, oldSrc, frameId } = entry;
      const panel = document.querySelector(`[data-frame-id="${frameId}"]`);
      if (!panel) continue;
      const img = panel.querySelector(':scope > img');
      if (!img) continue;
      // Make sure originalSrcs has the *true* original, not the blob we're about to set.
      if (!originalSrcs.has(img)) originalSrcs.set(img, oldSrc);
      const blobUrl = URL.createObjectURL(file);
      img.src = blobUrl;
      img.dataset.pendingSrc = newSrc;
      panel.dataset.imgDirty = 'true';
      pendingImages.set(newSrc, { file, oldSrc, blobUrl, frameId, imgEl: img });
    }
    return entries.size;
  }

  function flashPanel(panel, color) {
    const orig = panel.style.boxShadow;
    panel.style.boxShadow = `inset 0 0 0 6px ${color}`;
    setTimeout(() => { panel.style.boxShadow = orig; }, 600);
  }

  // ─── Export ────────────────────────────────────────────────────────────────

  function buildExportHTML() {
    const clone = document.documentElement.cloneNode(true);
    clone.querySelectorAll('.editor-toolbar, .editor-banner, [data-editor-style], .frame-badge, .drag-handle, .prim-drop-zone').forEach(n => n.remove());
    clone.querySelectorAll('[data-editing], [data-dirty], [contenteditable], [data-drop-target], [data-img-dirty]').forEach(n => {
      n.removeAttribute('data-editing'); n.removeAttribute('data-dirty');
      n.removeAttribute('contenteditable'); n.removeAttribute('spellcheck');
      n.removeAttribute('data-drop-target'); n.removeAttribute('data-img-dirty');
    });
    clone.querySelectorAll('img[data-pending-src]').forEach(img => {
      img.setAttribute('src', img.getAttribute('data-pending-src'));
      img.removeAttribute('data-pending-src');
    });
    return '<!DOCTYPE html>\n' + clone.outerHTML;
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  async function exportPlainHTML() {
    downloadBlob(new Blob([buildExportHTML()], { type: 'text/html' }), 'comic.html');
    clearLocalStorage();
  }

  async function exportZIP() {
    if (typeof JSZip === 'undefined') { alert('JSZip failed to load.'); return; }
    const zip = new JSZip();
    zip.file('comic.html', buildExportHTML());

    try {
      const resp = await fetch('frames.json');
      if (resp.ok) {
        const manifest = await resp.json();
        const bumpedFrames = (manifest.frames || []).map(f => {
          const change = [...pendingImages.entries()].find(([_, v]) => v.frameId === f.id);
          if (change) return { ...f, image: change[0], version: (f.version || 1) + 1 };
          return f;
        });
        zip.file('frames.json', JSON.stringify({ ...manifest, frames: bumpedFrames }, null, 2));
      }
    } catch (err) { console.warn('[editor] frames.json:', err); }

    const imgFolder = zip.folder('images');
    const archiveFolder = imgFolder.folder('_archive');
    for (const [newSrc, { file, oldSrc }] of pendingImages) {
      imgFolder.file(newSrc.replace(/^images\//, ''), await file.arrayBuffer());
      if (oldSrc !== PLACEHOLDER) {
        try {
          const resp = await fetch(oldSrc);
          if (resp.ok) archiveFolder.file(oldSrc.replace(/^images\//, ''), await resp.arrayBuffer());
        } catch (err) { console.warn(`[editor] archive ${oldSrc}:`, err); }
      }
    }

    const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
    const stamp = new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-');
    downloadBlob(zipBlob, `comic-export-${stamp}.zip`);
    clearLocalStorage();
    await dbClear();
    pendingImages.clear();
    document.querySelectorAll('[data-img-dirty]').forEach(el => el.removeAttribute('data-img-dirty'));
    document.querySelectorAll('[data-pending-src]').forEach(el => el.removeAttribute('data-pending-src'));
    refreshStatus();
    alert('ZIP downloaded. Unzip into your project folder to apply.');
  }

  function exportClicked() {
    return pendingImages.size > 0 ? exportZIP() : exportPlainHTML();
  }
  function clearLocalStorage() {
    Object.keys(localStorage).filter(k => k.startsWith(STORAGE_PREFIX)).forEach(k => localStorage.removeItem(k));
    document.querySelectorAll('[data-dirty="true"]').forEach(el => el.removeAttribute('data-dirty'));
  }
  async function resetEdits() {
    if (!confirm('Discard ALL local edits for this project (text, images, positions, inserts) and reload?')) return;
    clearLocalStorage();
    await dbClear();
    // Also drop this project's snapshot — otherwise restoreSnapshot puts us
    // right back where we started, defeating the reset.
    try { await snapshotDelete(currentProject()); } catch (e) {}
    for (const v of pendingImages.values()) URL.revokeObjectURL(v.blobUrl);
    pendingImages.clear();
    location.reload();
  }

  // ─── Toolbar ───────────────────────────────────────────────────────────────

  let statusEl, dirtyCountEl, imgCountEl, exportBtn, snapshotStatusEl;
  function refreshStatus() {
    const textDirty = document.querySelectorAll('[data-dirty="true"]').length;
    const imgDirty = pendingImages.size;
    if (dirtyCountEl) dirtyCountEl.textContent = textDirty;
    if (imgCountEl) imgCountEl.textContent = imgDirty;
    if (exportBtn) {
      exportBtn.textContent = imgDirty > 0
        ? `Export ZIP (${imgDirty} image${imgDirty > 1 ? 's' : ''}) ↓` : 'Export HTML ↓';
    }
    if (statusEl) statusEl.textContent = (textDirty + imgDirty) === 0 ? 'no unsaved changes' : 'unsaved:';
  }

  function buildToolbar() {
    const banner = document.createElement('div');
    banner.className = 'editor-banner';
    banner.textContent = '— edit mode · primitive addressing visible —';
    document.body.appendChild(banner);

    const bar = document.createElement('div');
    bar.className = 'editor-toolbar';
    bar.innerHTML = `
      <span class="status">no unsaved changes</span>
      <span class="legend">text:</span><span class="dirty-count">0</span>
      <span class="legend">img:</span><span class="img-count">0</span>
      <button class="secondary" data-action="reset">Reset</button>
      <button data-action="export">Export HTML ↓</button>
    `;
    document.body.appendChild(bar);
    statusEl = bar.querySelector('.status');
    dirtyCountEl = bar.querySelector('.dirty-count');
    imgCountEl = bar.querySelector('.img-count');
    exportBtn = bar.querySelector('[data-action="export"]');
    exportBtn.addEventListener('click', exportClicked);
    bar.querySelector('[data-action="reset"]').addEventListener('click', resetEdits);
    refreshStatus();
  }

  // ─── Styles (incl. address badges) ─────────────────────────────────────────

  function injectStyles() {
    const css = `
      [data-editing="true"] {
        outline: 1px dashed rgba(212, 168, 67, 0.55);
        outline-offset: 4px;
        transition: outline-color 120ms ease;
        cursor: text;
      }
      [data-editing="true"]:hover,
      [data-editing="true"]:focus { outline: 2px dashed rgba(212, 168, 67, 1); }
      [data-editing="true"][data-dirty="true"] { outline-color: rgba(168, 212, 67, 0.9); }

      /* Frame badges — hang ABOVE the frame in margin space, never occluding content.
         The human name is set on .frame-badge by JS (auto-derived from machine ID). */
      [data-frame-id] {
        position: relative;
        margin-top: 38px;
        /* In edit mode, frames must show overflowing chrome (drag handles, prim
           badges, below-frame zones). Panels normally have overflow:hidden which
           clips top-edge handles and the below-frame drop zone. */
        overflow: visible !important;
      }
      [data-frame-id]:first-of-type,
      [data-frame-id="cover"] {
        margin-top: 0;
      }
      .frame-badge {
        position: absolute;
        top: -32px; left: 0;
        background: rgba(212, 168, 67, 0.96);
        color: #0E0A06;
        font-family: 'Special Elite', 'Courier New', monospace;
        font-size: 12px;
        letter-spacing: 0.14em;
        padding: 5px 11px;
        z-index: 9990;
        font-weight: 700;
        cursor: grab;
        user-select: none;
        white-space: nowrap;
        box-shadow: 0 2px 6px rgba(0,0,0,0.5);
      }
      .frame-badge:active,
      body.dragging-frame .frame-badge { cursor: grabbing; }
      [data-frame-id].being-dragged-frame { opacity: 0.45; outline: 2px dashed rgba(200,16,46,0.7); outline-offset: -2px; }
      /* For the cover frame the badge sits inside (top-left) so it isn't off-screen above the page top */
      [data-frame-id="cover"] > .frame-badge {
        top: 8px; left: 8px;
      }
      /* Primitive badges — small dark tag above each addressable primitive.
         Do NOT force position:relative on [data-prim-id] globally — it would
         override .speech/.thought/.caption{position:absolute}. The ::after
         simply positions within the closest positioned ancestor. */
      [data-prim-id]::after {
        content: attr(data-prim-id);
        position: absolute;
        top: -16px; left: 0;
        background: rgba(14, 10, 6, 0.94);
        color: #D4A843;
        font-family: 'Special Elite', 'Courier New', monospace;
        font-size: 10px;
        letter-spacing: 0.12em;
        padding: 2px 7px;
        z-index: 9991;
        pointer-events: none;
        white-space: nowrap;
        font-weight: 400;
      }
      /* Drag handles — small grip in the corner of each draggable primitive */
      .drag-handle {
        position: absolute;
        top: -18px;
        right: 0;
        min-width: 22px; height: 18px;
        background: rgba(212, 168, 67, 0.96);
        color: #0E0A06;
        font-family: 'Special Elite', 'Courier New', monospace;
        font-size: 14px;
        line-height: 1;
        display: flex; align-items: center; justify-content: center;
        cursor: grab;
        z-index: 9992;
        user-select: none;
        padding: 0 4px;
        font-weight: 700;
        letter-spacing: -2px;
      }
      .drag-handle:hover { background: rgba(255, 210, 100, 1); }
      .drag-handle:active,
      body.dragging-prim .drag-handle { cursor: grabbing; }
      .drag-handle::before {
        content: 'move';
        position: absolute;
        top: -18px; right: 0;
        background: rgba(14, 10, 6, 0.94);
        color: #D4A843;
        font-size: 9px;
        letter-spacing: 0.14em;
        padding: 1px 5px;
        opacity: 0;
        transition: opacity 120ms ease;
        pointer-events: none;
        white-space: nowrap;
      }
      .drag-handle:hover::before { opacity: 1; }
      /* Hide drag handles when exporting */
      [data-exporting] .drag-handle { display: none; }

      /* Primitive drop zones — visible only while a primitive is being dragged.
         Use visibility:hidden (not display:none) so layout/getBoundingClientRect
         still works for tests + elementFromPoint hit-testing. */
      .prim-drop-zone {
        position: absolute;
        visibility: hidden;
        border: 2px dashed rgba(212, 168, 67, 0.5);
        background: rgba(212, 168, 67, 0.08);
        pointer-events: none;
        z-index: 9995; /* above frame & primitive badges (9990/9991), below toolbar (99999) */
        transition: background 120ms ease, border-color 120ms ease;
      }
      body.dragging-prim .prim-drop-zone { visibility: visible; pointer-events: auto; }
      body.dragging-prim .prim-drop-zone[data-disabled="true"] { visibility: hidden; pointer-events: none; }
      /* During drag, give the below-frame zone breathing room beneath the panel
         so the zone doesn't visually overlap the next frame's chrome. */
      body.dragging-prim [data-frame-id]:not(:last-child) { margin-bottom: 70px; }
      .prim-drop-zone.hover {
        background: rgba(212, 168, 67, 0.28);
        border-color: rgba(212, 168, 67, 1);
        border-style: solid;
      }
      .prim-drop-zone::after {
        content: attr(data-zone-label);
        position: absolute; bottom: 6px; right: 8px;
        background: rgba(14, 10, 6, 0.92); color: #D4A843;
        font-family: 'Special Elite', 'Courier New', monospace;
        font-size: 10px; padding: 2px 6px; letter-spacing: 0.1em;
      }
      .prim-drop-top-left    { top: 4px; left: 4px; width: calc(50% - 8px); height: calc(50% - 8px); }
      .prim-drop-top-right   { top: 4px; right: 4px; width: calc(50% - 8px); height: calc(50% - 8px); }
      .prim-drop-bottom-left { bottom: 4px; left: 4px; width: calc(50% - 8px); height: calc(50% - 8px); }
      .prim-drop-bottom-right{ bottom: 4px; right: 4px; width: calc(50% - 8px); height: calc(50% - 8px); }
      .prim-drop-below-frame { top: 100%; left: 0; right: 0; height: 50px; margin-top: 8px; }
      .being-dragged { opacity: 0.35; }

      /* Image drop target visuals */
      [data-drop-target="true"]::after {
        /* shadowed by [data-prim-id]::after if frame also is a primitive */
      }
      [data-drop-target="true"][data-img-dirty="true"] {
        outline: 4px solid rgba(168, 212, 67, 0.75);
        outline-offset: -4px;
      }
      [data-drop-target="true"].drop-hover {
        outline: 6px dashed rgba(212, 168, 67, 0.95);
        outline-offset: -6px;
      }
      [data-drop-target="true"].drop-hover::before {
        content: "DROP IMAGE TO REPLACE — " attr(data-frame-id);
      }
      .editor-toolbar {
        position: fixed; right: 18px; bottom: 18px; z-index: 99999;
        background: #0a1422; border: 1px solid #D4A843;
        box-shadow: 0 8px 26px rgba(0,0,0,0.7);
        padding: 12px 14px; display: flex; gap: 8px; align-items: center;
        font-family: 'Special Elite', 'Courier New', monospace;
        font-size: 0.78rem; letter-spacing: 0.08em; color: #E8D9B0;
      }
      .editor-toolbar button {
        background: #D4A843; color: #0E0A06; border: none;
        padding: 8px 14px; font: inherit; font-weight: 700; cursor: pointer;
      }
      .editor-toolbar button.secondary {
        background: transparent; color: #E8D9B0; border: 1px solid #A89D7E;
      }
      .editor-toolbar button:hover { filter: brightness(1.1); }
      .editor-toolbar .legend { color: #5C5240; margin-left: 4px; }
      .editor-toolbar .status { color: #A89D7E; margin-right: 4px; }
      .editor-toolbar .dirty-count,
      .editor-toolbar .img-count { color: #D4A843; min-width: 14px; text-align: right; }
      .editor-toolbar .status-line { display: inline; padding: 0; }
      .editor-banner {
        position: fixed; top: 0; left: 0; right: 0; z-index: 99998;
        background: rgba(212,168,67,0.94); color: #0E0A06;
        padding: 6px 14px; text-align: center;
        font-family: 'Special Elite', 'Courier New', monospace;
        font-size: 0.72rem; letter-spacing: 0.22em; text-transform: uppercase;
      }
      /* Primitive palette — drag items onto any frame to insert a new primitive.
         Sits below the project picker on the left rail. */
      .primitive-palette {
        position: fixed; left: 12px; top: 340px;
        z-index: 99999;
        background: #0a1422; border: 1px solid #D4A843;
        box-shadow: 0 8px 26px rgba(0,0,0,0.7);
        padding: 10px 10px; display: flex; flex-direction: column; gap: 6px;
        font-family: 'Special Elite', 'Courier New', monospace;
        color: #E8D9B0; width: 120px;
      }
      .palette-header {
        color: #A89D7E; text-align: center;
        font-size: 0.62rem; letter-spacing: 0.20em;
        padding: 2px 0 4px;
      }
      .palette-item {
        background: transparent; border: 1px dashed rgba(212,168,67,0.55);
        color: #E8D9B0; padding: 7px 10px;
        font-size: 0.72rem; letter-spacing: 0.10em;
        cursor: grab; user-select: none;
        transition: background 100ms ease, border-color 100ms ease;
      }
      .palette-item:hover {
        background: rgba(212,168,67,0.14);
        border-color: rgba(212,168,67,1);
      }
      .palette-item:active,
      body.dragging-palette .palette-item { cursor: grabbing; }
      body.dragging-palette .palette-drop-target {
        outline: 4px dashed rgba(168, 212, 67, 0.9);
        outline-offset: -4px;
      }
      body.dragging-palette { cursor: copy; }

      /* Frame palette item — visually distinct from primitive items. */
      .palette-item.palette-frame {
        border-style: solid;
        background: rgba(212,168,67,0.06);
        margin-top: 4px;
      }

      /* Bin — drag a primitive's handle, or a frame's badge, here to delete. */
      .palette-bin {
        margin-top: 8px;
        padding: 9px 10px;
        text-align: center;
        font-size: 0.66rem; letter-spacing: 0.12em;
        background: transparent;
        border: 1px dashed rgba(200, 16, 46, 0.55);
        color: #C8102E;
        user-select: none;
        transition: background 100ms ease, border-color 100ms ease, transform 100ms ease;
      }
      body.dragging-prim .palette-bin,
      body.dragging-frame .palette-bin {
        border-color: rgba(200, 16, 46, 0.95);
        background: rgba(200, 16, 46, 0.08);
      }
      .palette-bin.hover {
        background: rgba(200, 16, 46, 0.28);
        border-color: rgba(200, 16, 46, 1);
        color: #FFE5E5;
        transform: scale(1.04);
      }

      /* Project picker — top-left, lists IndexedDB-backed autosave snapshots. */
      .project-picker {
        position: fixed; left: 12px; top: 44px; z-index: 99999;
        background: #0a1422; border: 1px solid #D4A843;
        box-shadow: 0 8px 26px rgba(0,0,0,0.7);
        padding: 10px 10px; display: flex; flex-direction: column; gap: 6px;
        font-family: 'Special Elite', 'Courier New', monospace;
        color: #E8D9B0; width: 200px;
      }
      .project-picker .picker-header {
        color: #A89D7E; text-align: center;
        font-size: 0.62rem; letter-spacing: 0.20em; text-transform: uppercase;
        padding: 2px 0 4px;
      }
      .project-picker .picker-list {
        display: flex; flex-direction: column; gap: 3px;
        max-height: 200px; overflow-y: auto;
      }
      .picker-item {
        display: flex; align-items: center; justify-content: space-between;
        padding: 5px 8px;
        font-size: 0.72rem; letter-spacing: 0.06em;
        border: 1px solid rgba(168, 157, 126, 0.3);
        cursor: pointer; user-select: none;
        transition: background 100ms ease, border-color 100ms ease;
      }
      .picker-item:hover { background: rgba(212, 168, 67, 0.10); border-color: rgba(212, 168, 67, 0.6); }
      .picker-item.active {
        background: rgba(212, 168, 67, 0.18);
        border-color: rgba(212, 168, 67, 0.9);
        color: #D4A843;
      }
      .picker-name {
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        flex: 1; min-width: 0;
      }
      .picker-delete {
        background: transparent; border: none;
        color: #5C5240; font-size: 0.7rem; cursor: pointer;
        padding: 0 4px; margin-left: 6px;
      }
      .picker-delete:hover { color: #C8102E; }
      .picker-actions { display: flex; gap: 4px; }
      .picker-actions button {
        flex: 1; background: transparent; color: #E8D9B0;
        border: 1px dashed rgba(212, 168, 67, 0.55);
        padding: 5px 6px; cursor: pointer;
        font: inherit; font-size: 0.66rem; letter-spacing: 0.10em;
      }
      .picker-actions button:hover { background: rgba(212,168,67,0.12); border-color: rgba(212,168,67,1); }
      .picker-status {
        color: #5C5240; font-size: 0.6rem; letter-spacing: 0.12em;
        text-align: center; padding-top: 2px; min-height: 12px;
      }
    `;
    const style = document.createElement('style');
    style.dataset.editorStyle = '1';
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ─── Boot ──────────────────────────────────────────────────────────────────

  // Derive human name from machine ID. Overridable via data-frame-name.
  function humanNameFor(frame) {
    const override = frame.getAttribute('data-frame-name');
    if (override) return override;
    const id = frame.getAttribute('data-frame-id') || '';
    const m = id.match(/^c(\d+)\.f(\d+)$/);
    if (m) return `Chapter ${parseInt(m[1], 10)} · Frame ${parseInt(m[2], 10)}`;
    // Fallback: title-case the id (cover, end.cta, etc.)
    return id.split(/[._]/).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
  }

  function paintFrameBadges() {
    for (const frame of document.querySelectorAll('[data-frame-id]')) paintFrameBadge(frame);
  }

  function paintFrameBadge(frame) {
    if (frame.querySelector(':scope > .frame-badge')) return;
    const badge = document.createElement('div');
    badge.className = 'frame-badge';
    badge.textContent = `${humanNameFor(frame)} · ${frame.getAttribute('data-frame-id')}`;
    badge.title = 'Drag this badge to delete this whole frame';
    // Make the badge a drag handle for the entire frame — drag to the bin to delete.
    badge.addEventListener('mousedown', e => {
      e.preventDefault();
      e.stopPropagation();
      startFrameDrag(frame, e);
    });
    frame.appendChild(badge);
  }

  // ─── Primitive drag-drop snap positioning ──────────────────────────────────

  const POSITION_CLASSES = ['top-left', 'top-right', 'bottom-left', 'bottom-right',
                            'top-center', 'bottom-center', 'middle-center', 'below-frame'];

  // Frames where primitives can be dragged to corners: those with an absolutely-positioned image.
  function isOverlayFrame(frame) {
    const img = frame.querySelector(':scope > img');
    if (!img) return false;
    return getComputedStyle(img).position === 'absolute';
  }

  function zonesFor(prim) {
    // All overlay primitives can snap to any zone: 4 corners + below-frame.
    return ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'below-frame'];
  }

  function snapToPosition(prim, pos) {
    POSITION_CLASSES.forEach(p => prim.classList.remove(p));
    ['top', 'right', 'bottom', 'left'].forEach(p => { prim.style[p] = ''; });
    prim.classList.add(pos);
    scheduleSnapshotSave();
  }

  function setupPrimitiveDrag() {
    for (const frame of document.querySelectorAll('[data-frame-id]')) {
      setupFrameDrag(frame);
    }
  }

  // Per-frame setup — idempotent. Called for existing frames at boot AND
  // for newly inserted frames at drop time.
  function setupFrameDrag(frame) {
    if (!isOverlayFrame(frame)) return;

    // Inject drop zones (one per allowed position). Skip if already present.
    if (!frame.querySelector(':scope > .prim-drop-zone')) {
      for (const zone of ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'below-frame']) {
        const dz = document.createElement('div');
        dz.className = `prim-drop-zone prim-drop-${zone}`;
        dz.dataset.targetPos = zone;
        dz.dataset.zoneLabel = zone;
        frame.appendChild(dz);
      }
    }

    // Mouse-event drag handles for each primitive.
    for (const prim of frame.querySelectorAll(':scope > [data-prim-id]')) {
      prim.querySelectorAll(':scope > .drag-handle').forEach(n => n.remove());
      const handle = document.createElement('div');
      handle.className = 'drag-handle';
      handle.textContent = '⋮⋮';
      handle.title = 'Drag to reposition (or to the bin to delete)';
      handle.contentEditable = 'false';
      handle.addEventListener('mousedown', e => {
        e.preventDefault();
        e.stopPropagation();
        startPrimitiveDrag(prim, frame, e);
      });
      prim.appendChild(handle);
    }
  }

  // Active mouse-drag state
  let activeDrag = null;

  function startPrimitiveDrag(prim, frame, downEvent) {
    activeDrag = { prim, frame };
    document.body.classList.add('dragging-prim');
    prim.classList.add('being-dragged');
    const allowed = zonesFor(prim);
    frame.querySelectorAll('.prim-drop-zone').forEach(dz => {
      dz.dataset.disabled = allowed.includes(dz.dataset.targetPos) ? 'false' : 'true';
    });
    document.addEventListener('mousemove', onPrimitiveDragMove);
    document.addEventListener('mouseup', onPrimitiveDragEnd);
  }

  // Find the drop zone whose rect contains (x, y), among zones in the active frame.
  // Bypasses elementFromPoint — which gets confused by overflow:hidden, visibility,
  // and stacking — by reading each zone's actual bounding rect directly.
  function zoneAt(clientX, clientY) {
    if (!activeDrag) return null;
    const zones = activeDrag.frame.querySelectorAll('.prim-drop-zone');
    for (const z of zones) {
      if (z.dataset.disabled === 'true') continue;
      const r = z.getBoundingClientRect();
      if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) {
        return z;
      }
    }
    return null;
  }

  function onPrimitiveDragMove(e) {
    if (!activeDrag) return;
    const overBin = isOverBin(e.clientX, e.clientY);
    highlightBin(overBin);
    document.querySelectorAll('.prim-drop-zone.hover').forEach(z => z.classList.remove('hover'));
    if (overBin) return; // bin takes precedence over snap zones
    const zone = zoneAt(e.clientX, e.clientY);
    if (zone) zone.classList.add('hover');
  }

  function onPrimitiveDragEnd(e) {
    if (!activeDrag) return;
    const { prim, frame } = activeDrag;
    if (isOverBin(e.clientX, e.clientY)) {
      removePrimitive(prim);
    } else {
      const zone = zoneAt(e.clientX, e.clientY);
      if (zone) snapToPosition(prim, zone.dataset.targetPos);
    }
    document.body.classList.remove('dragging-prim');
    prim.classList.remove('being-dragged');
    highlightBin(false);
    frame.querySelectorAll('.prim-drop-zone').forEach(dz => {
      dz.classList.remove('hover');
      dz.removeAttribute('data-disabled');
    });
    document.removeEventListener('mousemove', onPrimitiveDragMove);
    document.removeEventListener('mouseup', onPrimitiveDragEnd);
    activeDrag = null;
  }

  // ─── Primitive palette (drag-to-add) ───────────────────────────────────────

  // Factory for each primitive type. The factory returns a fully-styled element
  // with default top-left position. The caller assigns data-prim-id and wires
  // it into the editor's text/drag plumbing.
  const PRIMITIVE_FACTORIES = {
    label: () => {
      const el = document.createElement('div');
      el.className = 'caption-typewriter editable-label top-left';
      el.style.cssText = 'font-size:0.72rem; letter-spacing:0.2em; padding:6px 10px;';
      el.textContent = 'New label';
      return el;
    },
    caption: () => {
      const el = document.createElement('div');
      el.className = 'caption top-left editable-caption';
      el.style.cssText = 'z-index:10; max-width:380px;';
      el.textContent = 'New caption text.';
      return el;
    },
    speech: () => {
      const el = document.createElement('div');
      el.className = 'speech tail-up top-left';
      el.style.cssText = 'max-width:420px;';
      el.innerHTML = '<span class="speaker editable-label">Speaker</span><span class="editable-caption">New dialogue.</span>';
      return el;
    },
    thought: () => {
      const el = document.createElement('div');
      el.className = 'thought trail-right top-left editable-caption';
      el.textContent = 'New thought.';
      return el;
    },
  };

  // Frame factory — produces a panel-wide overlay frame ready for an image drop.
  function buildNewFrame() {
    const el = document.createElement('div');
    el.setAttribute('data-frame-id', nextFrameId());
    el.className = 'panel-wide';
    el.setAttribute('style', 'position:relative; background:#0E0A06;');
    const img = document.createElement('img');
    img.src = 'images/placeholder.svg';
    img.alt = 'Drop an image here.';
    img.setAttribute('style', 'width:100%; height:100%; object-fit:cover; position:absolute; top:0; left:0;');
    el.appendChild(img);
    return el;
  }

  function nextFrameId() {
    let maxCh = 1, maxFr = -1;
    document.querySelectorAll('[data-frame-id]').forEach(f => {
      const m = (f.getAttribute('data-frame-id') || '').match(/^c(\d+)\.f(\d+)$/);
      if (m) {
        const ch = parseInt(m[1], 10), fr = parseInt(m[2], 10);
        if (ch > maxCh || (ch === maxCh && fr > maxFr)) { maxCh = ch; maxFr = fr; }
      }
    });
    const pad = n => String(n).padStart(2, '0');
    return `c${pad(maxCh)}.f${pad(maxFr + 1)}`;
  }

  function nextPrimIndex(frame, type) {
    let max = -1;
    frame.querySelectorAll('[data-prim-id]').forEach(p => {
      const m = (p.getAttribute('data-prim-id') || '').match(/^(\w+)\.(\d+)$/);
      if (m && m[1] === type) max = Math.max(max, parseInt(m[2], 10));
    });
    return max + 1;
  }

  // Wire a freshly-inserted element into the editor: make its text children
  // contenteditable + autosaving, and (if its host frame is an overlay frame)
  // attach a drag handle so the user can reposition it.
  function activateNewPrimitive(prim, frame) {
    const editables = prim.matches(TEXT_SELECTOR)
      ? [prim]
      : Array.from(prim.querySelectorAll(TEXT_SELECTOR));
    for (const child of editables) {
      const key = keyFor(child);
      child.contentEditable = 'true';
      child.spellcheck = true;
      child.dataset.editing = 'true';
      child.addEventListener('input', () => {
        localStorage.setItem(key, cleanInnerHTML(child));
        child.dataset.dirty = 'true';
        refreshStatus();
        scheduleSnapshotSave();
      });
    }
    if (isOverlayFrame(frame)) {
      const handle = document.createElement('div');
      handle.className = 'drag-handle';
      handle.textContent = '⋮⋮';
      handle.title = 'Drag to reposition';
      handle.contentEditable = 'false';
      handle.addEventListener('mousedown', e => {
        e.preventDefault();
        e.stopPropagation();
        startPrimitiveDrag(prim, frame, e);
      });
      prim.appendChild(handle);
    }
  }

  function insertPrimitive(frame, type) {
    const factory = PRIMITIVE_FACTORIES[type];
    if (!factory) return null;
    const el = factory();
    el.setAttribute('data-prim-id', `${type}.${nextPrimIndex(frame, type)}`);
    frame.appendChild(el);
    activateNewPrimitive(el, frame);
    scheduleSnapshotSave();
    return el;
  }

  function frameAt(clientX, clientY) {
    for (const frame of document.querySelectorAll('[data-frame-id]')) {
      const r = frame.getBoundingClientRect();
      if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) {
        return frame;
      }
    }
    return null;
  }

  let activePaletteDrag = null;

  function startPaletteDrag(type, downEvent) {
    activePaletteDrag = { type };
    document.body.classList.add('dragging-palette');
    document.addEventListener('mousemove', onPaletteDragMove);
    document.addEventListener('mouseup', onPaletteDragEnd);
  }

  function onPaletteDragMove(e) {
    if (!activePaletteDrag) return;
    document.querySelectorAll('.palette-drop-target').forEach(f =>
      f.classList.remove('palette-drop-target'));
    const frame = frameAt(e.clientX, e.clientY);
    if (frame) frame.classList.add('palette-drop-target');
  }

  function onPaletteDragEnd(e) {
    if (!activePaletteDrag) return;
    const { type } = activePaletteDrag;
    const targetFrame = frameAt(e.clientX, e.clientY);
    if (type === 'frame') {
      // Drop on a frame → insert new frame AFTER it. Drop elsewhere → append to comic.
      insertNewFrame(targetFrame);
    } else if (targetFrame) {
      insertPrimitive(targetFrame, type);
    }
    document.body.classList.remove('dragging-palette');
    document.querySelectorAll('.palette-drop-target').forEach(f =>
      f.classList.remove('palette-drop-target'));
    document.removeEventListener('mousemove', onPaletteDragMove);
    document.removeEventListener('mouseup', onPaletteDragEnd);
    activePaletteDrag = null;
  }

  // ─── Project picker (top-left) ─────────────────────────────────────────────

  async function buildProjectPicker() {
    const picker = document.createElement('div');
    picker.className = 'project-picker';
    picker.innerHTML = `
      <div class="picker-header">Projects</div>
      <div class="picker-list"></div>
      <div class="picker-actions">
        <button data-action="new-project">+ New</button>
        <button data-action="rename-project">✎ Rename</button>
      </div>
      <div class="picker-status"></div>
    `;
    document.body.appendChild(picker);
    snapshotStatusEl = picker.querySelector('.picker-status');
    picker.querySelector('[data-action="new-project"]').addEventListener('click', newProject);
    picker.querySelector('[data-action="rename-project"]').addEventListener('click', renameProject);
    await refreshProjectList();
  }

  async function refreshProjectList() {
    const list = document.querySelector('.project-picker .picker-list');
    if (!list) return;
    let names = await snapshotList();
    // Ensure the current project is shown even if no snapshot exists yet.
    if (!names.includes(currentProject())) names = [currentProject(), ...names];
    list.innerHTML = names.map(name => `
      <div class="picker-item ${name === currentProject() ? 'active' : ''}" data-project="${escapeAttr(name)}">
        <span class="picker-name">${escapeText(name)}</span>
        <button class="picker-delete" data-action="delete-project" data-project="${escapeAttr(name)}" title="Delete">✕</button>
      </div>
    `).join('');
    list.querySelectorAll('.picker-item').forEach(item => {
      item.addEventListener('click', e => {
        if (e.target.closest('[data-action]')) return;
        switchProject(item.dataset.project);
      });
    });
    list.querySelectorAll('[data-action="delete-project"]').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const name = btn.dataset.project;
        if (!confirm(`Delete project "${name}"? This cannot be undone.`)) return;
        await snapshotDelete(name);
        if (name === currentProject()) {
          const remaining = await snapshotList();
          setCurrentProject(remaining[0] || 'untitled');
          location.reload();
        } else {
          await refreshProjectList();
        }
      });
    });
  }

  function escapeAttr(s) { return String(s).replace(/"/g, '&quot;'); }
  function escapeText(s) { return String(s).replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c])); }

  async function switchProject(name) {
    if (name === currentProject()) return;
    await flushSnapshot();
    setCurrentProject(name);
    location.reload();
  }

  async function newProject() {
    const name = (prompt('New project name:', '') || '').trim();
    if (!name) return;
    if (name === currentProject()) return;
    const existing = await snapshotList();
    if (existing.includes(name)) {
      if (!confirm(`Project "${name}" already exists. Switch to it?`)) return;
      return switchProject(name);
    }
    await flushSnapshot();
    setCurrentProject(name);
    // Wipe per-key text storage so the new project starts fresh
    Object.keys(localStorage).filter(k => k.startsWith(STORAGE_PREFIX)).forEach(k => localStorage.removeItem(k));
    location.reload();
  }

  async function renameProject() {
    const old = currentProject();
    const next = (prompt('Rename current project to:', old) || '').trim();
    if (!next || next === old) return;
    const existing = await snapshotList();
    if (existing.includes(next)) { alert(`Project "${next}" already exists.`); return; }
    await flushSnapshot();
    const rec = await snapshotGet(old);
    if (rec) await snapshotPut(next, rec.html);
    await snapshotDelete(old);
    setCurrentProject(next);
    await refreshProjectList();
  }

  function buildPalette() {
    const palette = document.createElement('div');
    palette.className = 'primitive-palette';
    palette.innerHTML = `
      <div class="palette-header">+ Add</div>
      <div class="palette-item" data-prim-type="label">▦ Label</div>
      <div class="palette-item" data-prim-type="caption">¶ Caption</div>
      <div class="palette-item" data-prim-type="speech">⬬ Speech</div>
      <div class="palette-item" data-prim-type="thought">☁ Thought</div>
      <div class="palette-item palette-frame" data-prim-type="frame">⊞ Frame</div>
      <div class="palette-bin" id="palette-bin" title="Drag a primitive's handle, or a frame's badge, here to delete it.">🗑 Bin</div>
    `;
    document.body.appendChild(palette);
    for (const item of palette.querySelectorAll('.palette-item')) {
      item.addEventListener('mousedown', e => {
        e.preventDefault();
        e.stopPropagation();
        startPaletteDrag(item.dataset.primType, e);
      });
    }
  }

  // ─── Bin (drag-to-delete) ──────────────────────────────────────────────────
  function binEl() { return document.getElementById('palette-bin'); }
  function isOverBin(clientX, clientY) {
    const bin = binEl();
    if (!bin) return false;
    const r = bin.getBoundingClientRect();
    return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
  }
  function highlightBin(on) {
    const bin = binEl();
    if (!bin) return;
    bin.classList.toggle('hover', !!on);
  }

  // ─── Frame insertion / deletion ────────────────────────────────────────────
  function insertNewFrame(afterFrame) {
    const el = buildNewFrame();
    if (afterFrame && afterFrame.parentElement) {
      afterFrame.insertAdjacentElement('afterend', el);
    } else {
      const comic = document.querySelector('.comic');
      if (!comic) return null;
      comic.appendChild(el);
    }
    // Wire the new frame into all editor systems.
    paintFrameBadge(el);
    setupFrameImageDrop(el);
    setupFrameDrag(el);
    scheduleSnapshotSave();
    return el;
  }

  function removeFrame(frame) {
    frame.remove();
    scheduleSnapshotSave();
  }

  function removePrimitive(prim) {
    // Clean up its localStorage keys (per-element editable storage).
    const frame = prim.closest('[data-frame-id]');
    const frameId = frame ? frame.getAttribute('data-frame-id') : null;
    const primId = prim.getAttribute('data-prim-id');
    if (frameId && primId) {
      ['self', 'speaker', 'text'].forEach(sub => {
        localStorage.removeItem(`${STORAGE_PREFIX}${frameId}::${primId}::${sub}`);
      });
    }
    prim.remove();
    scheduleSnapshotSave();
  }

  // ─── Frame drag (badge → bin to delete) ───────────────────────────────────
  let activeFrameDrag = null;
  function startFrameDrag(frame, downEvent) {
    activeFrameDrag = { frame };
    document.body.classList.add('dragging-frame');
    frame.classList.add('being-dragged-frame');
    document.addEventListener('mousemove', onFrameDragMove);
    document.addEventListener('mouseup', onFrameDragEnd);
  }
  function onFrameDragMove(e) {
    if (!activeFrameDrag) return;
    highlightBin(isOverBin(e.clientX, e.clientY));
  }
  function onFrameDragEnd(e) {
    if (!activeFrameDrag) return;
    const { frame } = activeFrameDrag;
    if (isOverBin(e.clientX, e.clientY)) {
      const name = humanNameFor(frame);
      if (confirm(`Delete frame "${name}"? This cannot be undone (until next reload if no snapshot has saved yet).`)) {
        removeFrame(frame);
      }
    }
    document.body.classList.remove('dragging-frame');
    frame.classList.remove('being-dragged-frame');
    highlightBin(false);
    document.removeEventListener('mousemove', onFrameDragMove);
    document.removeEventListener('mouseup', onFrameDragEnd);
    activeFrameDrag = null;
  }

  async function boot() {
    injectStyles();
    const restored = await restoreSnapshot();
    autoAssignPrimIds();
    paintFrameBadges();
    const textCount = activateText();
    const dropCount = setupImageDrops();
    setupPrimitiveDrag();
    let hydrated = 0;
    try { hydrated = await hydrateImages(); } catch (e) { console.warn('[editor] hydrateImages failed:', e); }
    buildToolbar();
    buildPalette();
    try { await buildProjectPicker(); } catch (e) { console.warn('[editor] buildProjectPicker failed:', e); }
    // Capture a baseline snapshot so the current project always exists in the
    // project list even before the user makes their first edit. Wrapped: if
    // IDB is unavailable (e.g. blocked by another tab), the editor still works.
    if (!restored) {
      try { await snapshotPut(currentProject(), cleanSnapshotHTML()); } catch (e) {}
    }
    console.log(`[editor] project="${currentProject()}" restored=${restored} · ${textCount} text · ${dropCount} drops · ${hydrated} images.`);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
