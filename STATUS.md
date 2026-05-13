---
title: comic-starter — current status
updated: 2026-05-13
---

# Where things stand

This is a **sandbox / dev project** for the long-scroll comic framework. It is **not** the live Palomar Lights — that remains at `/Users/phill/transients/` and deploys to `comics.phillyharper.com`. Nothing done here pushes to production unless Phil manually copies files and deploys.

## What's built (v0.2)

1. **Workspace at `/Users/phill/comic-starter/`** — clean framework template, fully isolated from the live Palomar Lights project.
2. **`comic.html`** — 7-frame demo comic showcasing the template types: cover, chapter break, hero with caption, hero with speech, narration band, press card, CTA. Full Palomar Lights design system intact (CSS is the design system).
3. **`editor.js`** — text-edit + image-drop shim, v0.3. Uses `data-frame-id` + `.editable-*` class conventions. Text storage keyed by `frameId::role::index`. Image replacements queued in memory and bundled on export.
4. **`frames.json`** — manifest listing the 7 demo frames with template types.
5. **`images/placeholder.svg`** — single reusable placeholder for empty panels.
6. **`images/_archive/`** — empty, ready to receive replaced image versions.
7. **`README.md`** — quick-start, conventions, what works, what doesn't.
8. **`comic.html.palomar-backup`** — the original full Palomar Lights copy is preserved as a backup file in case we want it.

## What the editor does today

- Activates on `?edit=1`, `??edit=1`, or `#edit` (forgiving URL detection).
- Top-of-page banner reads `— edit mode —` so it's unambiguous when active.
- Targets `.editable-caption`, `.editable-speech`, `.editable-label` zones.
- Storage keyed by `${frameId}::${role}::${nth}` — stable across edits.
- Dashed gold outline on hover, green on dirty.
- Auto-saves to `localStorage` while typing (crash-proof).
- **Export HTML** downloads a new `comic.html` with edits baked in and editor scaffolding stripped.
- **Reset** discards in-progress edits.

15 editable zones in the current 7-frame demo.

## What's NOT yet built

- **Frame reordering** — drag panels to a new position.
- **Add-frame template picker** — pick a layout type and inject the HTML stub.
- **Social export pipeline** — the carousel/reel/MP4 build (already proven in `/Users/phill/transients/social/`, but not yet ported into the framework as a reusable command).
- **File System Access API integration** — direct writes for Chromium browsers, as a progressive enhancement to the ZIP export.

## What's new in v0.3

- **Image drag-drop with auto-rename + versioning.** Drop any file onto any panel; it's renamed to `<frameId>_v<N+1>_<slug>.<ext>` and queued for export.
- **ZIP export.** When image changes are pending, Export downloads a single `comic-export-<timestamp>.zip` containing: updated `comic.html`, updated `frames.json` (version bumps), new images, and previous versions in `images/_archive/`.
- **Vendored JSZip** at `vendor/jszip.min.js` (~95 KB) — no CDN dependency.

## What's new in v0.5

- **Drag-drop primitive snap positioning.** Each draggable primitive shows a small gold `⋮⋮` drag handle in the top-right corner. Grab the handle, drag onto a highlighted corner (or `below-frame` strip), and the primitive snaps to that position — class swapped, no inline styles, no manual CSS. The text inside remains fully editable separately (handles avoid the contenteditable / drag conflict).
- **Universal position class library** added to the design system:
  - 4 corners (`top-left` `top-right` `bottom-left` `bottom-right`)
  - 2 centers (`top-center` `bottom-center`) — for captions
  - `below-frame` — available to all primitives (labels, captions, speech, thought)
- **Tail direction (speech) and trail direction (thought) remain manual** — independent of position, chosen based on where the speaker/thinker sits in the image.
- **Demo updated**: speech and thought bubbles in `c01.f02` and `c01.f03` now use position classes instead of inline `style="top:..."`. Drag them around to test.

## What's new in v0.4

- **Shared lexicon for human + AI.** Every frame has a machine ID (`c01.f02`) and an auto-derived human name (`Chapter 1 · Frame 2`). Both render as a single gold pill **above** each frame in edit mode.
- **Procedural human naming.** Names are not content-specific — they're derived from the machine ID by pattern. Chapter breaks are just `Chapter N · Frame 0`. Override with `data-frame-name` only when needed.
- **`c01.cb` → `c01.f00`.** Chapter-opening frames are now `f00` (frame zero of the chapter), making the numbering uniform.
- **Primitive addressing.** Every editable text element has a `data-prim-id` (`speech.0`, `label.0`, `caption.0`, `thought.0`). Full primitive address: `<frameId>.<primId>` → `c01.f02.speech.0`.
- **Thought-bubble primitive added** to the lexicon. Demo frame `c01.f03` showcases it.
- **Badges hang in the margin above each frame**, never occluding content. Cover keeps its badge inside (no margin above page top).
- **`AGENT.md`** — reference document for AI coding agents. Conventions, primitive snippets, frame templates, image-naming rules, and a "how the writer talks to you" cheat sheet.

## Safety properties of the current setup

- Export writes to `~/Downloads/comic.html`. **Not** to the project folder. Phil must move it manually.
- Local images live at `/Users/phill/comic-starter/images/` — distinct from production.
- The framework copy does NOT reference `comics.phillyharper.com`. All assets are local.
- No `wrangler pages deploy` happens automatically. Production stays untouched.

## Files in the workspace

```
/Users/phill/comic-starter/
├── comic.html                    ← 7-frame demo (~37 KB)
├── editor.js                     ← v0.3 shim (text + image drop)
├── frames.json                   ← frame manifest
├── vendor/
│   └── jszip.min.js              ← bundled JSZip for ZIP export
├── images/
│   ├── placeholder.svg           ← single shared placeholder
│   └── _archive/                 ← receives replaced versions on export
├── comic.html.palomar-backup     ← backup of Palomar Lights copy
├── README.md                     ← quick-start + conventions
└── STATUS.md                     ← this file
```

## How to test

```bash
cd /Users/phill/comic-starter
python3 -m http.server 8765
```

Visit `http://localhost:8765/comic.html?edit=1` in any modern browser.
