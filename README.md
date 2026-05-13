# comic-starter

A single-file framework for drafting long-scroll documentary comics with an AI coding assistant.

Built in collaboration with [Claude Code](https://claude.com/claude-code), and inspired by [The Palomar Lights](https://comics.phillyharper.com) — a long-scroll documentary comic about Beatriz Villarroel's modern hunt for the 1950s POSS-I sky transients.

---

## The paradigm — AI-assisted curation

Most comic-making tools sit at one of two extremes: a visual canvas (rigid, slow to iterate, hard to version) or a code editor (precise, but you lose the visual). This framework splits the work into three modes, each in the tool that's best at it:

**1. Drafting — with your AI assistant**
You describe the beats; the AI generates the HTML using a small, shared lexicon of primitives. Frames, labels, captions, speech bubbles, thought bubbles. The lexicon is documented in `AGENT.md`, which you point your AI at once at the start of a session.

**2. Arranging — in the browser**
Load `comic.html?edit=1`. Drag primitives from the palette onto frames. Drag corners to snap captions and speech to top/bottom/left/right. Drop image files from Finder onto panels — they auto-rename and version. Edit text inline. Everything autosaves to IndexedDB on every action; close the tab, come back tomorrow, it's exactly where you left it.

**3. Fine-tuning — back with the AI**
Once the structure feels right, you go back to your AI and ask for the polish: fonts, colours, spacing, custom mood styles, mobile breakpoints, new layout variants. The HTML and CSS are right there in `comic.html` — no abstraction layer, no JSON intermediate, no framework to fight.

The AI is your draftsman. The browser is your editing room. The AI is your typographer.

---

## What's in the lexicon

The framework gives you four overlay primitives:

| | Primitive | Use for |
|---|---|---|
| **▦** | Label | Short tags, attributions, masthead text |
| **¶** | Caption | Body text, narration |
| **⬬** | Speech | Dialogue in a cartoon bubble |
| **☁** | Thought | Internal monologue in a cloud |

And one container: **⊞ Frame** — a 16:9 panel that hosts an image and any number of primitives.

Each primitive snaps to one of five positions per frame: `top-left`, `top-right`, `bottom-left`, `bottom-right`, or `below-frame`. Positioning is class-driven (no inline coords), so drag-drop in the browser maps directly to one CSS class change.

Every frame has two names:
- A **machine ID** like `c01.f02` — what appears in HTML, filenames, and AI prompts
- A **human name** like `Chapter 1 · Frame 2` — auto-derived from the machine ID, what you say out loud

Both render in edit mode as gold pills above each frame. Writers say "the speech bubble in Chapter 1 Frame 2"; the AI resolves that to `[data-frame-id="c01.f02"] [data-prim-id="speech.0"]`.

---

## Edit mode

Append `?edit=1` to the URL to activate:

- **Banner** at top confirms edit mode is live
- **Project picker** (top-left) — IndexedDB-backed autosave snapshots; new / rename / delete / switch between drafts
- **Primitive palette** (left) — drag any of the five primitive types onto a frame to insert; drag the 🗑 Bin to delete
- **Toolbar** (bottom-right) — Reset (wipes local edits for the current project), Export (HTML or ZIP)

Everything you do — text edits, position snaps, palette inserts, image drops, frame deletes — autosaves to IndexedDB on every action. Per-element text edits also save to `localStorage` as a redundant backup.

### What can you drag?

- **A primitive's ⋮⋮ handle** → drop into any of the four corners (or `below-frame`) to reposition; drop onto the 🗑 Bin to delete
- **A frame's badge** (the gold "Chapter N · Frame M" pill) → drop onto the 🗑 Bin to delete the whole frame
- **A palette item** → drop onto a frame to insert that primitive (top-left by default); drag the ⊞ Frame palette item onto an existing frame to insert a new frame after it
- **An image file from Finder** → drop onto any panel to replace its image (auto-renamed `<frameId>_v<N+1>_<slug>.<ext>`, prior version archived)

---

## How a typical project flows

1. **Spin up.** Clone, start `python3 -m http.server 8765`, open `?edit=1`.
2. **Brief the AI.** Point Claude at `AGENT.md` and describe your comic at a high level. The AI scaffolds the frames with placeholder captions and image alts in `comic.html`.
3. **Draft.** Iterate with the AI on the *content* — what each frame says, what mood, what the image should depict.
4. **Arrange.** In the browser, drag captions into the right corners, drop your rendered images onto panels, edit copy inline. The AI is irrelevant here — your cursor is faster.
5. **Polish.** Back with the AI: "tighten the spacing between frames 4 and 5", "add a `.mood-stockholm` variant for the Sweden chapter", "make speech bubbles wider on tablet". The AI edits CSS in place.
6. **Export.** Hit Export ZIP. You get `comic.html` (clean, no editor chrome) + versioned images + previous versions in `_archive/`. Unzip into your project, deploy to any static host.

---

## What the AI does well

- Generates structurally-correct HTML from a description ("a chapter-break frame, then three panel-wide frames with captions in the bottom-right")
- Reorganises content (rewrites copy, swaps speakers, splits a long caption into a sequence)
- Builds new style variants and mood classes
- Adjusts typography, colour, spacing — anywhere it can express the change in CSS
- Cross-cuts (e.g., "make every speech bubble across the whole comic use a thinner border")

## What the browser does well

- Position decisions ("does this caption look better top-left or bottom-right?")
- Image curation (which version of this render, which crop, which file)
- Fine in-place text edits (typos, tone tweaks)
- Quick "does this beat land?" reads — just scroll through

Trying to do the first set with the cursor or the second set with the AI is the failure mode this framework is built to avoid.

---

## File layout

```
comic.html              ← the comic itself; the editor mounts here
editor.js               ← all editor logic — text editing, drag-drop, palette,
                          bin, project picker, autosave, export. Single file.
frames.json             ← frame manifest for export (frame order, image refs)
vendor/jszip.min.js     ← bundled JSZip for ZIP export (~95 KB, MIT)
images/
  placeholder.svg       ← shared placeholder for empty panels
  _archive/             ← previous versions of replaced images
AGENT.md                ← reference for AI coding assistants — lexicon, conventions
README.md               ← this file
STATUS.md               ← changelog: what's built, what isn't
```

## Constraints

- **No build step.** Open `comic.html` in any modern browser. Append `?edit=1` to edit.
- **No backend.** All editor state lives in `localStorage` (text) + `IndexedDB` (images, snapshots).
- **No npm, no toolchain.** One vendored dependency (JSZip), loaded with a `<script>` tag.
- **Static output.** What you publish is plain HTML — no runtime JS needed for viewing.

## Quick start

```bash
git clone <this-repo> my-comic
cd my-comic
python3 -m http.server 8765
```

Then visit `http://localhost:8765/comic.html?edit=1`.

Hit **Export ZIP** when done; unzip into your project folder and overwrite to commit.

## Deploying

Any static host. The reference deployment uses Cloudflare Pages:

```bash
wrangler pages deploy . --project-name=my-comic --branch=main
```

## Acknowledgements

- Built in collaboration with [Claude Code](https://claude.com/claude-code), Anthropic's coding agent CLI. `AGENT.md` is the shared lexicon — Claude reads it once and produces consistent, framework-compliant HTML in the same vocabulary the human writer uses.
- The framework was extracted from [The Palomar Lights](https://comics.phillyharper.com) — a documentary comic about Stockholm astronomer Beatriz Villarroel's hunt for transient objects in the 1950s Palomar Observatory Sky Survey photographic plates.
