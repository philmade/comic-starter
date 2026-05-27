# comic-starter

A **print-first** framework for making comics with an AI coding assistant. Design the comic once, as a print edition — then publish the *same document* to a high-resolution print PDF **and** a responsive website.

Built in collaboration with [Claude Code](https://claude.com/claude-code). Its first issue, [The Palomar Lights](https://comics.phillyharper.com), is live.

> **New paradigm (v1).** Earlier versions of this framework targeted a single long-scroll web page. It is now **print-first**: the comic is a stack of fixed print pages that is the one source of truth, and both the PDF and the website are derived from it. Everything below describes that model.

---

## The paradigm — one source, print + web

The comic is authored as a **print edition**: fixed pages at 157 × 240 mm trim + 3 mm bleed. That print document is the single source of truth; the screen editor, the PDF, and the responsive site are all derived from it.

Three pieces:

- **`working.html`** — THE document. Each page is a `<section class="page" data-page="N">`; each element is a strongly-typed design-system primitive positioned in `%`. This is what you edit.
- **`comic.css`** — the design system. Page box, frames, cards, text primitives, variants, fonts-as-tokens. New looks live here as **named variants**, never one-off per-page CSS.
- **`editor.html` + `server.js`** — a thin in-browser editor (drag / resize / rotate / crop, cast primitives, upload images) that writes straight back to `working.html` on disk.

You design visually in the editor; the AI edits the same `working.html` / `comic.css` directly. No JSON intermediate, no canvas lock-in — the document *is* the comic.

---

## The primitives

Open **`catalog.html`** (the **Primitives ▸** button in the editor) for a live styleguide of every primitive and variant, each labelled with its exact class recipe. In short:

- **Frames** — `.frame` (image panel) and `.frame.card` (image + text), with variants `horizontal`, `polaroid`, `clipping`, `matted`, `stroked` (the comic white-margin + black-keyline edge), `embed`, `cropped`.
- **Text primitives** — `.prim` ` caption · label · quote (+ boxed / typewriter) · speech · thought · title (+ gold / sub / typewriter) · punch`, each anchored by a position class (`top-left … below-frame`). `.hl` is inline emphasis.
- **Page-level blocks** — `chapter-title`, `page-text` (+ `lead` / `framed`), `cards-head` / `cards-foot`, `stat-trio`.
- **Fonts** are role tokens (`--font-display / -mono / -serif / -body`) — change the whole comic's type from one place.

---

## The editor

```
node server.js "<comic dir>" 8080      # dev server: serves the comic + saves to disk
# then open http://localhost:8080/editor.html
```

- **Component palette** — select an element to recast it, or insert a new one.
- **Move / resize / rotate** any element (Moveable), and drag it across pages.
- **Crop / reframe** an image in place (pan + zoom).
- **Set / replace image** — upload straight into a panel.
- **Per-page diff save** — the editor patches only the page you changed (`POST /patch`), so you and the AI can both edit without clobbering each other.

---

## Publishing

### Print
`comic.css` carries the `@page` size + bleed + `print-color-adjust` rules. Print `working.html` to PDF via headless Chrome → a 163 × 246 mm, fonts-embedded, bleed-correct PDF ready for a printer.

### Web
```
node publish.js "<comic dir>"          # → index.html (+ links comic.web.css / comic.web.js)
```
`publish.js` turns `working.html` into a deployable `index.html`. All responsive behaviour lives in **`comic.web.css`** (web-only — the editor never loads it, so its fixed-page layout is untouched):

- **Desktop** — the print pages as a continuous read, scaled up; on wide screens a **two-up comic spread** (cover alone, facing pairs, back cover alone).
- **Mobile** — a principled **reflow to one column**: frames go full-width in reading order, captions drop below the art, speech/thought stay on the art, type goes fluid. Works off whatever the editor produced — no per-comic tweaking.

Deploy `index.html` + `comic.css` + `comic.web.css` + `comic.web.js` + `images/` to any static host. The reference deployment is Cloudflare Pages (run `wrangler pages deploy` from inside the build dir).

---

## A typical project

1. **Brief the AI** — describe the beats; it scaffolds pages in `working.html` from the primitives.
2. **Arrange** — in the editor: drag / resize / rotate, crop images, cast primitives, drop in art.
3. **Polish** — back to the AI for variants, fonts, spacing — edited directly in `comic.css` / `working.html`.
4. **Publish** — print PDF for the printer; `publish.js` → a responsive site for the web. One document, both outputs.

---

## File layout

```
working.html      ← the comic (print source of truth) — you edit this
comic.css         ← the design system (screen + print)
comic.web.css     ← web-only: desktop spread + mobile reflow (loaded only by the published site)
comic.web.js      ← web-only: covered-content + cover-furniture + spread helpers
editor.html       ← the in-browser editor (Moveable-based)
server.js         ← dev server + POST /save · /patch · /upload
publish.js        ← working.html → deployable index.html
catalog.html      ← live styleguide of every primitive/variant
shot.js           ← screenshot one page headless (fast self-check)
images/           ← comic art (images/_archive/ keeps prior versions)
```

---

*The AI is your draftsman and typographer; the editor is your light table; the design system keeps it consistent across print and screen.*
