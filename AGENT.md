# AGENT.md

A reference for AI coding agents working on a `comic-starter` project. If you are an AI helping a writer edit or extend a long-scroll documentary comic, read this first.

This document is the **shared lexicon** between the writer and you. Everything below is enforced by `editor.js` and rendered visually in edit mode (`?edit=1` in the URL).

---

## Two-name addressing

Every frame in a comic has **two names**:

| Kind | Example | Used for |
|---|---|---|
| **Human name** | "Chapter 1 · Frame 2" | What the writer says in conversation. **Auto-derived from the machine ID.** |
| **Machine ID** | `c01.f02` | What appears in HTML, filenames, code. Stable, dot-separated, lowercase. |

The human name is **procedural, not descriptive**. The framework reads it directly off the machine ID — there is no `data-frame-name` attribute by default. So:

- `cover` → "Cover"
- `c01.f00` → "Chapter 1 · Frame 0" (the chapter-opening / title slide — frame 0 of chapter 1)
- `c01.f01` → "Chapter 1 · Frame 1" (first content frame)
- `c01.f02` → "Chapter 1 · Frame 2"
- `end.cta` → "End Cta" (fallback title-case)

This means the writer and you can both refer to "Chapter 1 Frame 2" without anyone needing to remember a content-specific label.

If a frame needs a descriptive override, set `data-frame-name="…"` explicitly on the frame's `<div>`. Use sparingly.

In edit mode, a gold pill sits in the **margin above** each frame showing both names: `Chapter 1 · Frame 2 · c01.f02`. The writer reads the human name; you operate on the machine ID.

When the writer says *"change the speech bubble in Chapter 1 Frame 2"*, you:
1. Parse "Chapter 1 Frame 2" → machine ID `c01.f02`.
2. Find `[data-frame-id="c01.f02"]`.
3. Operate on its primitives (e.g. `[data-prim-id="speech.0"]`).

If the writer uses a machine ID directly, use it directly.

---

## Frame IDs — the convention

Machine IDs are dot-separated tokens with structural meaning:

| Form | Meaning | Example |
|---|---|---|
| `cover` | The cover frame (rendered before chapter 1) | `cover` |
| `c<NN>.f<NN>` | The Mth frame in chapter NN. `f00` is the chapter-opening / title slide. | `c01.f00`, `c01.f01`, `c01.f02` |
| `end.cta` | The closing call-to-action | `end.cta` |
| `end.refs` | The references / sources block | `end.refs` |

Chapter and frame numbers are zero-padded to two digits. Frames go in document order; do not skip numbers without a reason. A chapter break (the title slide) is just frame 0 of that chapter (`c01.f00`).

---

## The four primitives

A frame is made of an image (optional) plus one or more **primitives** layered on top or beside it. There are four primitive types:

| Primitive | Role class | Use for | Visual |
|---|---|---|---|
| **label** | `.editable-label` | Titles, speaker names, attributions, button copy, typewriter tags | Short text, sometimes uppercase / monospace |
| **caption** | `.editable-caption` | Narration, body text, captions, dialogue inside speech bubbles | Body-text styling |
| **speech** | `.speech` (container) | Spoken dialogue inside a bubble with optional speaker | Cartoon speech bubble with pointed tail |
| **thought** | `.thought` (container) | Internal monologue inside a cloud-shaped bubble | Cloud with trailing dots toward the thinker |

`speech` and `thought` are **container primitives** — they wrap inner editable text (a `.speaker` label + the dialogue text). `label` and `caption` are **leaf primitives** — the element itself is the editable text.

---

## Primitive addresses

Every primitive has a stable `data-prim-id` on its element:

```
<role>.<index>
```

Where `index` starts at `0` and counts per-role per-frame. So inside frame `c01.f02` you might have:

- `speech.0` — the first speech bubble
- `label.0` — the first standalone label
- `caption.0` — the first standalone caption

Full address: `<frameId>.<primId>` → `c01.f02.speech.0`.

In edit mode, each primitive shows a small dark badge above it with its prim ID. Combined with the frame badge at the corner of the panel, the full address is visible.

`editor.js` will auto-assign `data-prim-id` to any editable element that doesn't have one. **Prefer to set it manually** when writing new HTML — it's stable across reorderings.

---

## Position variants — universal class-based positioning

Every primitive layered over a panel image uses **the same set of position classes**. No inline `top:`/`left:` styles — positioning is class-driven so the writer can drag-snap between positions in edit mode.

### The position lexicon

```
top-left      top-center      top-right
                              
bottom-left   bottom-center   bottom-right

below-frame   (caption / speech / thought only; not labels)
```

All overlay primitives share the same set of zones: **four corners + `below-frame`**.

| Primitive | Allowed positions |
|---|---|
| `label` (`.editable-label`) | 4 corners + `below-frame` |
| `caption` (`.editable-caption`) | 4 corners + `below-frame` |
| `speech` (`.speech`) | 4 corners + `below-frame` |
| `thought` (`.thought`) | 4 corners + `below-frame` |

`below-frame` renders the primitive in the strip beneath the panel image (not overlaid). The framework auto-adds margin to the host frame so the next frame doesn't crowd it.

### Drag-drop in edit mode

Each draggable primitive shows a small gold `⋮⋮` handle in its top-right corner. The writer grabs the handle (not the primitive's text, which stays contenteditable) and drags to a highlighted drop zone — any of the four corners or the `below-frame` strip beneath the panel.

On drop, the position class on the primitive is swapped to the target. No inline styles. No manual CSS. The drag-drop UI is the canonical way to reposition a primitive.

### Speech bubble tail variants

Tail direction is **independent** of position and chosen manually based on where the speaker sits in the image:

```
.tail-up      tail points UP (speaker is above the bubble)
.tail-down    tail points DOWN
.tail-left    tail points LEFT
.tail-right   tail points RIGHT
```

### Thought bubble trail variants

```
(default)         trail goes down-left
.trail-right      trail goes down-right
.trail-up-right   trail goes up-right
```

---

## Canonical HTML snippets

When inserting new primitives, use these as templates. Every snippet includes `data-prim-id` — replace the index with the next available number for that role in the target frame.

### Label (standalone)

```html
<div data-prim-id="label.0" class="caption-typewriter editable-label" style="...positioning...">
  Your label text
</div>
```

### Caption (standalone)

```html
<div data-prim-id="caption.0" class="caption bottom-left editable-caption" style="z-index:10; max-width:380px;">
  Body text goes here.
</div>
```

### Speech bubble

```html
<div data-prim-id="speech.0" class="speech tail-up bottom-left" style="max-width:420px;">
  <span class="speaker editable-label">Speaker Name</span>
  <span class="editable-caption">The dialogue text.</span>
</div>
```

### Thought bubble

```html
<div data-prim-id="thought.0" class="thought trail-right top-right editable-caption">
  Internal monologue text.
</div>
```

**Note:** position classes (e.g., `bottom-left`, `top-right`, `below-frame`) replace inline `top/left/right/bottom` styles. The drag-drop UI in edit mode is the canonical way to change a primitive's position.

---

## Frame templates

When inserting new frames, use these. Each frame has a unique `data-frame-id` and a human-readable `data-frame-name`.

### Chapter break

```html
<div data-frame-id="c02.cb" data-frame-name="Chapter 2 Opening" class="chapter-break">
  <h2 data-prim-id="label.0" class="editable-label">Chapter 2</h2>
  <div data-prim-id="label.1" class="subtitle editable-label">The Subtitle</div>
</div>
```

### Hero with caption(s)

```html
<div data-frame-id="c02.f01" data-frame-name="Establishing Shot" class="panel-wide" style="position:relative; background:#0E0A06;">
  <img src="images/c02.f01_v1_placeholder.svg" alt="..." style="width:100%; height:100%; object-fit:cover; position:absolute; top:0; left:0;">
  <div data-prim-id="caption.0" class="caption-typewriter caption top-left editable-caption" style="z-index:10;">
    Top-left typewriter caption.
  </div>
  <div data-prim-id="caption.1" class="caption bottom-right editable-caption" style="z-index:10; max-width:380px;">
    Bottom-right body caption.
  </div>
</div>
```

### Hero with speech

```html
<div data-frame-id="c02.f02" data-frame-name="..." class="panel-wide" style="position:relative; background:#0E0A06;">
  <img src="..." style="width:100%; height:100%; object-fit:cover; position:absolute; top:0; left:0;">
  <div data-prim-id="speech.0" class="speech tail-up" style="bottom:8%; left:5%; max-width:420px; z-index:10;">
    <span class="speaker editable-label">Speaker</span>
    <span class="editable-caption">Dialogue.</span>
  </div>
</div>
```

### Narration band (no image)

```html
<div data-frame-id="c02.f03" data-frame-name="..." style="width:100%; background:linear-gradient(180deg, #0a1422 0%, #0e1b2e 100%); padding:80px 0; position:relative;">
  <div data-prim-id="caption.0" class="caption-typewriter editable-caption" style="position:static; display:block; margin:0 auto; max-width:760px; text-align:center; ...">
    Narration text.
  </div>
</div>
```

---

## Image naming convention

Every image file lives in `images/` and is named:

```
<frameId>_v<N>_<slug>.<ext>
```

| Part | Meaning |
|---|---|
| `<frameId>` | The owning frame's machine ID (`cover`, `c01.f02`, ...) |
| `<N>` | Version number, starts at 1 |
| `<slug>` | Optional lowercase slug derived from the source filename |
| `<ext>` | `webp` preferred. `jpg`, `png`, `svg` also OK. |

**The framework does the naming.** When the writer drops a file onto a panel in edit mode, `editor.js` renames it automatically and bumps the version. You should follow the same convention when writing image references in HTML.

Previous versions move to `images/_archive/` on export.

`images/placeholder.svg` is the shared placeholder for empty panels and is **never archived**.

---

## Storage keys (editor.js)

Text edits are saved to `localStorage` while the writer types. Keys are formatted:

```
comic-starter::v3::<frameId>::<primId>::<subrole>
```

Where `subrole` is one of:

- `self` — the editable element is the primitive itself (leaf primitives)
- `speaker` — inside a `speech` or `thought` container, the `.speaker` / `.thinker` element
- `text` — inside a container, the non-speaker editable text

Image replacements are tracked in memory and bundled into a ZIP on export.

---

## How the writer talks to you

Likely phrasings and what they mean:

| Writer says | You do |
|---|---|
| *"Change the speech in Narrator Speech to ..."* | Find `[data-frame-name="Narrator Speech"]` → find `[data-prim-id="speech.0"]` inside → replace dialogue. |
| *"Add a thought bubble bottom-right of A Thought."* | Append `<div data-prim-id="thought.N" class="thought trail-right ...">` inside `[data-frame-id="c01.f03"]`. Use next available N. |
| *"New frame after Establishing Shot called Tense Moment."* | Insert a new `<div data-frame-id="c01.f01b" data-frame-name="Tense Moment" ...>` between c01.f01 and c01.f02. |
| *"Move c01.f02 before c01.f01."* | Reorder the divs in `comic.html`. (Manually for now — drag reorder not yet implemented.) |
| *"Replace the image in cover with this file."* | The writer should drop it via the editor. If you're doing it programmatically: rename to `cover_v2_<slug>.<ext>`, move old to `_archive/`, update `<img src>`. |

---

## What's NOT in the framework yet

- Drag-reorder frames
- Add-frame template picker (writer-facing UI)
- Social export pipeline (carousel/reel/MP4 builds)
- File System Access API (direct disk writes for Chromium)

When the writer asks for these, build them. Read the existing `editor.js` and `STATUS.md` first.

---

## Files in the framework

```
comic.html                 ← the writer's comic (also where the editor mounts)
editor.js                  ← edit-mode shim
frames.json                ← frame manifest (order, IDs, templates)
vendor/jszip.min.js        ← ZIP support for image-replacement export
images/
  placeholder.svg          ← shared placeholder
  _archive/                ← previous image versions
AGENT.md                   ← this file
README.md                  ← human-facing quick-start
STATUS.md                  ← what's built, what isn't
```
