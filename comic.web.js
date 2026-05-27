/* comic.web.js — tiny runtime helper for the PUBLISHED web view (loaded by index.html, never the editor).
   Mobile reflow linearizes a page, which would re-expose anything hidden by z-order on the print page
   (e.g. a full-bleed image laid over old content). This flags those covered elements with `.m-covered`
   so comic.web.css can hide them on mobile only. Pure arithmetic on the inline %s — no layout dependency. */
(function () {
  // Mobile-only "best viewed on desktop" banner (CSS shows it only ≤700px).
  var notice = document.createElement('div');
  notice.className = 'm-notice';
  notice.textContent = 'Best viewed on desktop';
  if (document.body.firstChild) document.body.insertBefore(notice, document.body.firstChild);
  else document.body.appendChild(notice);

  function pct(el, prop, dflt) {
    var m = (el.getAttribute('style') || '').match(new RegExp(prop + '\\s*:\\s*(-?[\\d.]+)%'));
    return m ? parseFloat(m[1]) : dflt;
  }
  document.querySelectorAll('.page').forEach(function (page) {
    var kids = Array.prototype.filter.call(page.children, function (c) {
      return c.nodeType === 1 && !c.classList.contains('guides');
    });
    var coverIdx = -1;
    kids.forEach(function (cover, ci) {
      // A page-covering opaque frame = a frame with an <img>, ~full-bleed.
      if (!cover.classList.contains('frame') || !cover.querySelector('img')) return;
      var L = pct(cover, 'left', 0), T = pct(cover, 'top', 0);
      var W = pct(cover, 'width', 100), H = pct(cover, 'height', 100);
      if (!(L <= 3 && T <= 3 && W >= 94 && H >= 94)) return;
      // Everything earlier in the DOM sits underneath it → hide on mobile.
      for (var i = 0; i < ci; i++) kids[i].classList.add('m-covered');
      coverIdx = ci;
    });
    // Page-level FURNITURE (titles/labels/punch — not narration captions) over a full-bleed cover
    // stays overlaid in place on mobile, instead of dropping below as a big block.
    if (coverIdx >= 0) kids.forEach(function (k, i) {
      if (i !== coverIdx && k.classList.contains('prim') && !k.classList.contains('caption')) {
        k.classList.add('m-overlay');
        if (pct(k, 'left', 0) > 50) k.classList.add('m-overlay-r');   // right-half furniture → anchor right (no overflow)
      }
    });
  });

  // Tag the first + last page so the desktop 2-up spread shows them alone (cover / back cover).
  var allPages = document.querySelectorAll('.page');
  if (allPages.length) {
    allPages[0].classList.add('m-cover');
    allPages[allPages.length - 1].classList.add('m-back');
  }
})();
