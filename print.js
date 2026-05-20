/**
 * comic-starter — print.js
 *
 * Turns a long-scroll comic into print-ready pages for real printers.
 * Activate with ?print=<format>  (format: tabloid | comic | book).
 *
 * It does an extract-and-reflow: reads each panel's essential content
 * (image + caption/speaker, or chapter title), rebuilds a clean .print-doc,
 * and hides the original. Screen-only effects (halftone, grain, mood tints,
 * editor chrome) never reach the page.
 *
 * Format profiles are source-verified printer specs:
 *   tabloid — Newspaper Club Digital Tabloid: 289x380mm, 15mm margin,
 *             NO bleed, CMYK/greyscale, pages in multiples of 4.
 *   comic   — Gelato saddle-stitch A4: 210x297mm trim + 4mm bleed, 4mm safe.
 *   book    — Gelato perfect-bound A4: 210x297mm trim + 4mm bleed,
 *             12mm binding-side safe.
 *
 * Add ?raw=1 to skip Paged.js (used for headless puppeteer PDF generation,
 * which paginates natively via preferCSSPageSize).
 */
(function () {
  'use strict';

  const params = new URLSearchParams(location.search);
  const format = params.get('print');
  if (!format) return;
  const RAW = params.get('raw') === '1';

  const FORMATS = {
    // Newspaper Club Digital Tabloid — margin-based, no bleed.
    tabloid: {
      label: 'Newspaper Club Digital Tabloid',
      pageW: 289, pageH: 380, unit: 'mm',
      margin: 15, bleed: 0,
      pageMultiple: 4,
      template: 'two-up',
      note: 'Export single pages, no crop marks. Convert RGB->CMYK after export (Ghostscript).',
    },
    // Gelato saddle-stitch A4 — bleed-based.
    comic: {
      label: 'Gelato saddle-stitch A4',
      pageW: 210, pageH: 297, unit: 'mm',
      margin: 4, bleed: 4,
      pageMultiple: 4,
      template: 'two-up',
      note: 'PDF/X-4, sRGB or CMYK (GRACoL 2006). Bleed 4mm included.',
    },
    // Gelato perfect-bound A4 — bleed-based, wider binding-side safe area.
    book: {
      label: 'Gelato perfect-bound A4',
      pageW: 210, pageH: 297, unit: 'mm',
      margin: 4, bleed: 4, bindingSafe: 12,
      pageMultiple: 2,
      template: 'hero',
      note: 'PDF/X-4. Cover needs a spine (handled separately).',
    },
    // Mixam UK Standard Paperback Comic — bleed-based, real paper (bold/dark OK).
    paperback: {
      label: 'Mixam UK Standard Paperback Comic 157x240',
      pageW: 157, pageH: 240, unit: 'mm',
      margin: 5, bleed: 3,             // 5mm quiet/safe, 3mm bleed
      pageMultiple: 4,
      template: 'two-up',
      note: 'PDF, 157x240 trim + 3mm bleed, 5mm quiet margin. Full bleed OK. Convert to CMYK for Mixam.',
    },
  };

  const profile = FORMATS[format];
  if (!profile) {
    console.warn('[print] unknown format:', format, '— valid:', Object.keys(FORMATS).join(', '));
    return;
  }

  // Swap a web image src for its full-resolution print original where one is
  // likely to exist (.webp web copy -> .png 2560px original). Falls back via
  // onerror to the original src if the .png isn't there.
  function printSrc(src) {
    if (/\.webp$/i.test(src)) return src.replace(/\.webp$/i, '.png');
    return src;
  }

  function swapToHiRes(img) {
    const orig = img.getAttribute('src');
    if (!orig) return;
    img.dataset.fallback = orig;
    img.addEventListener('error', function onErr() {
      if (!this.dataset.fellBack && this.dataset.fallback) {
        this.dataset.fellBack = '1';
        this.src = this.dataset.fallback;
      }
    });
    img.setAttribute('src', printSrc(orig));
  }

  // Story frames to KEEP — the comic itself. Everything else on the page
  // (pre-order section, signup form, footer, editor chrome) is excluded.
  const FRAME_SEL = '[data-frame-id], .panel-wide, .panel-strip, .panel-hero, .panel-half, .panel-image, .chapter-break';

  // Build the print document by CLONING each styled frame intact — image plus
  // its overlaid speech bubbles, thought bubbles, and corner-positioned
  // captions, plus the frame's own mood/effect classes. The comic's own CSS
  // still applies to the clones (same class names), so the *design* survives;
  // we only re-flow whole frames onto pages. This is the opposite of the old
  // extract-and-rebuild approach that flattened the comic to images+captions.
  // Is this frame's image absolutely-positioned (a fixed-aspect panel with
  // overlays) vs a natural-height flow image? Determines print sizing.
  function isFixedAspect(frame) {
    const img = frame.querySelector(':scope > img');
    if (!img) return false;
    const pos = (img.style.position || getComputedStyle(img).position);
    return pos === 'absolute';
  }

  // Find the cover/title splash — it has no panel class, so detect by the
  // intro image (alt mentions "cover", or src contains "intro").
  function findCover() {
    const imgs = Array.from(document.querySelectorAll('img'));
    return imgs.find(i => /intro/i.test(i.getAttribute('src') || '') ||
                          /\bcover\b/i.test(i.getAttribute('alt') || '')) || null;
  }

  function buildPrintDoc() {
    const doc = document.createElement('div');
    doc.className = 'print-doc';
    doc.dataset.template = profile.template;

    // Front matter: a clean full-page cover built from the intro splash image.
    // (Cloning the original wrapper dragged in flex/inline styles that collapsed
    // it and clipped the art — so we build a fresh, page-height container.)
    const cover = findCover();
    const coverWrap = cover ? cover.closest('div') : null;
    if (cover) {
      const cv = document.createElement('section');
      cv.className = 'print-cover print-frame';
      const ci = document.createElement('img');
      ci.alt = cover.getAttribute('alt') || '';
      const csrc = cover.getAttribute('src');
      ci.dataset.fallback = csrc;
      ci.addEventListener('error', function () {
        if (!this.dataset.fellBack) { this.dataset.fellBack = '1'; this.src = this.dataset.fallback; }
      });
      ci.src = printSrc(csrc);
      cv.appendChild(ci);
      doc.appendChild(cv);
    }

    document.querySelectorAll(FRAME_SEL).forEach(frame => {
      // Skip the cover wrapper / anything inside it (already placed above).
      if (coverWrap && (frame === coverWrap || coverWrap.contains(frame) || frame.contains(cover))) return;
      // Skip nested frames — a frame inside another matched frame is already
      // cloned as part of its ancestor (e.g. .panel-image inside .panel-wide).
      if (frame.parentElement && frame.parentElement.closest(FRAME_SEL)) return;
      const clone = frame.cloneNode(true);
      clone.querySelectorAll('.drag-handle, .frame-badge, .prim-drop-zone').forEach(n => n.remove());
      clone.querySelectorAll('img').forEach(swapToHiRes);
      clone.querySelectorAll('img[loading]').forEach(i => i.removeAttribute('loading'));
      clone.classList.add('print-frame');
      // Narration-only frame (no image) → a text plate, styled distinctly.
      if (!clone.querySelector('img')) {
        clone.classList.add('print-textplate');
      } else {
        clone.classList.add(isFixedAspect(frame) ? 'print-fixed' : 'print-natural');
      }
      doc.appendChild(clone);
    });

    return doc;
  }

  // Inject the @page rule for this format. Newspaper Club is margin-based with
  // no bleed; Gelato formats add bleed and fill to the trim edge.
  function injectPageRule() {
    const { pageW, pageH, margin, bleed, unit } = profile;
    const w = pageW + (bleed * 2);
    const h = pageH + (bleed * 2);
    const css = bleed > 0
      ? `@page { size: ${w}${unit} ${h}${unit}; margin: 0; }
         .print-doc { padding: ${bleed + margin}${unit}; }
         .print-doc .print-cover { height: ${h}${unit}; margin: -${bleed + margin}${unit} -${bleed + margin}${unit} 0; }`
      : `@page { size: ${pageW}${unit} ${pageH}${unit}; margin: ${margin}${unit}; }
         .print-doc .print-cover { height: ${pageH - 2 * margin}${unit}; }`;
    const style = document.createElement('style');
    style.dataset.printPage = '1';
    style.textContent = css;
    document.head.appendChild(style);
  }

  function ensureStylesheet() {
    if (document.querySelector('link[data-print-css]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'print.css';
    link.dataset.printCss = '1';
    document.head.appendChild(link);
  }

  // Resolve once every image under `root` has finished — either loaded, or
  // failed and fallen back to its .webp (handled by swapToHiRes's onerror).
  // A per-image timeout guarantees one stuck asset can't hang pagination.
  function settleImages(root) {
    const imgs = Array.from(root.querySelectorAll('img'));
    return Promise.all(imgs.map(img => new Promise(resolve => {
      if (img.complete && img.naturalWidth > 0) return resolve();
      img.addEventListener('load', resolve, { once: true });
      img.addEventListener('error', () => {
        // swapToHiRes's onerror has now pointed src at the .webp fallback;
        // wait for that to load (or give up if it fails too).
        img.addEventListener('load', resolve, { once: true });
        img.addEventListener('error', resolve, { once: true });
      }, { once: true });
      setTimeout(resolve, 8000);
    })));
  }

  function boot() {
    ensureStylesheet();
    injectPageRule();
    const doc = buildPrintDoc();
    document.body.appendChild(doc);
    document.documentElement.classList.add('print-active');

    const figs = doc.querySelectorAll('.print-figure').length;
    console.log(`[print] format="${format}" (${profile.label}) · ${figs} panels · template=${profile.template}`);
    console.log(`[print] ${profile.note}`);

    // In a real browser, load Paged.js for proper pagination + page furniture.
    // In raw mode (puppeteer), skip it and let page.pdf() paginate natively.
    //
    // Paged.js preloads EVERY image up-front and rejects its render promise if
    // any one fails. Print swaps .webp→.png for resolution, and not every image
    // has a .png original — so an un-settled 404 would abort the whole layout
    // into a single blank page. Wait for every image to settle (load or fail
    // over to .webp) before handing a fully-resolved DOM to Paged.js.
    if (!RAW) {
      // Paged.js auto-paginates the whole <body>. Our print doc lives there
      // alongside the original web comic (hidden via CSS) — but Paged.js clones
      // its source into pages where that CSS no longer reaches, so the web comic
      // would render instead of the print layout. Strip every body element
      // except the print doc (keep <script>s, already executed) so Paged.js
      // lays out the print frames only.
      Array.from(document.body.children).forEach(el => {
        if (el !== doc && el.tagName !== 'SCRIPT') el.remove();
      });
      settleImages(doc).then(() => {
        const s = document.createElement('script');
        s.src = 'vendor/paged.polyfill.js';
        document.head.appendChild(s);
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
