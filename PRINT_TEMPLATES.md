# comic-starter — layout primitives & page templates

The shared taxonomy for **web ↔ print**. A beat declares a `data-layout` role; the
role decides how it renders on **mobile**, **desktop**, and **print** — decided
*up the chain* so authoring on the web already knows the printed result.

Trim page = **157 × 240 mm** (+ 3 mm bleed). "Per page" counts are for that page.

---

## The primitives

| `data-layout` | Print packing | Web: mobile-first → desktop | Used for |
|---|---|---|---|
| `page` | **1 / page** | mobile: flows naturally · **desktop (≥900px): bounded to the 157:240 page box** so you preview the printed page and can't overflow it | cover, splash, the plate, evidence figure, the paper, a standalone quote |
| `panel` | **3 / page** (full-width rows) | full-width image + overlaid caption/speech/thought (mobile = desktop) | main narrative beats |
| `card` | **up to 6 / page**, in a grid | mobile: 1-col stack · desktop: the card's column variant | profiles, cutouts, source lists, tool lists |
| `chapter` | 1 / page + **boundary** (panels restart after) | centred title slide | chapter breaks |
| `skip` | excluded | normal on web | web-only asks / CTAs |

**Two rules layered on top**
- **Portrait images → their own `page`** automatically (image aspect ratio < 1). No squished verticals.
- **`page` height-constraint is desktop-only.** Mobile is mobile-first (natural flow); the page-box preview kicks in at the desktop breakpoint, where it actually matters.

---

## Page templates (the "map")

```
FULL PAGE (page)            PANELS ×3 (panel)         CHAPTER (chapter)
┌───────────────┐           ┌───────────────┐         ┌───────────────┐
│               │           │   panel  1    │         │               │
│               │           ├───────────────┤         │   CHAPTER N   │
│   one beat    │           │   panel  2    │         │   The Title   │
│   fills it    │           ├───────────────┤         │               │
│               │           │   panel  3    │         │  (own page +  │
└───────────────┘           └───────────────┘         │   boundary)   │
                                                       └───────────────┘

CARDS 1-col ×6              CARDS 2-col ×6            CARDS 3-col ×6
┌───────────────┐           ┌───────┬───────┐         ┌────┬────┬────┐
│   card 1      │           │ c1    │ c2    │         │ c1 │ c2 │ c3 │
│   card 2      │           ├───────┼───────┤         ├────┼────┼────┤
│   card 3      │           │ c3    │ c4    │         │ c4 │ c5 │ c6 │
│   card 4      │           ├───────┼───────┤         └────┴────┴────┘
│   card 5      │           │ c5    │ c6    │         (e.g. 3 profiles
│   card 6      │           └───────┴───────┘          = one 3-col row)
└───────────────┘
```

A run of consecutive `card` beats fills a card page (then a new page). Column
count is the card variant (`data-card-cols="1|2|3"`, default 2); 6 per page.

---

## How #001's beats map

| Beat group | Primitive |
|---|---|
| Cover, chapter titles, the plate (Exhibit A), evidence figure, the paper, standalone quotes, references, END | `page` |
| Main narrative (Abell, plates, Tenerife reaction, …) | `panel` (3/page) |
| Character profiles (Doherty / Busko / Cann) | `card` 3-col (one row) |
| The "response" sources, the critics' tools (scanner / SuperCOSMOS / copies), transient cutouts (T1–T9) | `card` (2- or 3-col) |
| Epilogue two-col cards | `card` 2-col |
| Donation ask, author headshot, waitlist | `skip` |
| Ch.2 / Ch.3 interactive shadow-tests, Samford video | `page` + `data-print-img` static still |

---

## Customisation policy
No arbitrary custom CSS on beats (that's what breaks import). Flexibility comes
from **declared variants only** — e.g. `card-1col`/`-2col`/`-3col`,
`panel` matted/full-bleed. New variants are added to this catalog deliberately,
never improvised in a comic's HTML.
