/* ==========================================================================
   GRIT & HOLDS v2 · ACCESSIBILITY + LAYOUT BEHAVIOURS
   ==========================================================================
   Progressive enhancements that sit beside game.js without changing its
   rules code:

   • Dialogs — any .modal that gains .show becomes a proper modal dialog:
     focus moves in, Tab is trapped, Escape closes (data-close="fnName" calls
     window[fnName]; data-close-button="id" clicks that button), the rest of
     the page is made inert, and focus returns to where it was on close.
   • Player-count holds — radio group mirrored into #numPlayers.
   • Card size — S/M/L/XL sets --card-min (remembered per browser).
   • HUD height — exposes --hud-h so the climber rail sticks below it.
   • Area titles — prefixes each wall title with its area icon.
   ========================================================================== */
(function () {
  'use strict';

  const CARD_SIZES = { s: '11.5rem', m: '13.5rem', l: '16rem', xl: '19.5rem' };
  const AREA_ICONS = { bouldering: 'bouldering', topRope: 'topRope', leadClimbing: 'leadClimbing', training: 'training', gearShop: 'gear', milestone: 'milestone' };
  const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), summary';

  const store = {
    get(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } },
  };

  // ---------------------------------------------------------------- dialogs
  const openStack = [];
  function focusables(root) {
    return [...root.querySelectorAll(FOCUSABLE)].filter(el => el.offsetParent !== null || el === document.activeElement);
  }
  function setBackgroundInert(on) {
    document.querySelectorAll('body > :not(.modal):not(script):not(#effects-layer):not(#aia-art-defs)').forEach(el => {
      if (on) el.setAttribute('inert', ''); else el.removeAttribute('inert');
    });
  }
  function onOpen(modal) {
    if (openStack.some(o => o.modal === modal)) return;
    openStack.push({ modal, returnTo: document.activeElement });
    setBackgroundInert(true);
    requestAnimationFrame(() => {
      const content = modal.querySelector('.modal-content') || modal;
      const preferred = modal.querySelector('[data-autofocus]') || modal.querySelector('.action-buttons .btn:last-child') || focusables(content)[0];
      const heading = modal.querySelector('.modal-header, h2, h1');
      // Lead with the heading so screen readers announce the result first.
      if (heading) {
        heading.setAttribute('tabindex', '-1');
        heading.focus({ preventScroll: true });
      } else if (preferred) preferred.focus();
    });
  }
  function onClose(modal) {
    const i = openStack.findIndex(o => o.modal === modal);
    if (i === -1) return;
    const { returnTo } = openStack.splice(i, 1)[0];
    if (!openStack.length) setBackgroundInert(false);
    requestAnimationFrame(() => {
      if (document.querySelector('.modal.show')) return;     // another dialog took over
      if (returnTo && document.body.contains(returnTo) && !returnTo.closest('[inert]')) returnTo.focus({ preventScroll: true });
      else {
        const ti = document.getElementById('turnIndicator');
        if (ti && ti.offsetParent) { ti.setAttribute('tabindex', '-1'); ti.focus({ preventScroll: true }); }
      }
    });
  }
  function closeTop() {
    const top = openStack[openStack.length - 1];
    if (!top) return;
    const { modal } = top;
    const fn = modal.getAttribute('data-close');
    const btnId = modal.getAttribute('data-close-button');
    if (fn && typeof window[fn] === 'function') window[fn]();
    else if (btnId) document.getElementById(btnId)?.click();
  }
  function trap(e) {
    const top = openStack[openStack.length - 1];
    if (!top) return;
    if (e.key === 'Escape') { e.preventDefault(); closeTop(); return; }
    if (e.key !== 'Tab') return;
    const items = focusables(top.modal);
    if (!items.length) { e.preventDefault(); return; }
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && (document.activeElement === first || !top.modal.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
  function watchModals() {
    const mo = new MutationObserver(muts => {
      muts.forEach(m => {
        const el = m.target;
        if (!el.classList || !el.classList.contains('modal')) return;
        if (el.classList.contains('show')) onOpen(el); else onClose(el);
      });
    });
    document.querySelectorAll('.modal').forEach(m => mo.observe(m, { attributes: true, attributeFilter: ['class'] }));
    document.addEventListener('keydown', trap, true);
  }

  // ------------------------------------------------------- setup controls
  function wirePlayerCount() {
    const fs = document.getElementById('playerCount');
    const hidden = document.getElementById('numPlayers');
    if (!fs || !hidden) return;
    fs.addEventListener('change', (e) => { if (e.target.name === 'playerCount') hidden.value = e.target.value; });
    // game.js disables #numPlayers once selection starts; mirror that.
    new MutationObserver(() => { fs.disabled = hidden.disabled; }).observe(hidden, { attributes: true, attributeFilter: ['disabled'] });
  }
  function wireCardSize() {
    const fs = document.getElementById('cardSize');
    if (!fs) return;
    const apply = (v) => {
      if (!CARD_SIZES[v]) return;
      document.documentElement.style.setProperty('--card-min', CARD_SIZES[v]);
      const input = fs.querySelector(`input[value="${v}"]`);
      if (input) input.checked = true;
    };
    apply(store.get('aia.cardSize') || 'm');
    fs.addEventListener('change', (e) => { apply(e.target.value); store.set('aia.cardSize', e.target.value); });
  }
  function watchHud() {
    const hud = document.getElementById('hud');
    if (!hud || typeof ResizeObserver !== 'function') return;
    new ResizeObserver(([entry]) => {
      document.documentElement.style.setProperty('--hud-h', Math.ceil(entry.target.getBoundingClientRect().height) + 'px');
    }).observe(hud);
  }
  function decorateAreaTitles() {
    if (!window.AIAArt) return;
    document.querySelectorAll('.board-section[data-area] .at-name').forEach(h => {
      if (h.querySelector('.aia-icon')) return;
      const area = h.closest('[data-area]').dataset.area;
      h.insertAdjacentHTML('afterbegin', window.AIAArt.icon(AREA_ICONS[area] || 'star'));
    });
  }

  // When play starts (game.js adds body.playing), bring the board into view
  // and hand focus to the turn status so the first announcement is the turn.
  function watchGameStart() {
    let playing = document.body.classList.contains('playing');
    new MutationObserver(() => {
      const now = document.body.classList.contains('playing');
      if (now && !playing) {
        window.scrollTo({ top: 0 });
        const ti = document.getElementById('turnIndicator');
        if (ti) { ti.setAttribute('tabindex', '-1'); ti.focus({ preventScroll: true }); }
      }
      playing = now;
    }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  }

  function init() {
    if (window.AIAArt) window.AIAArt.mount();
    watchModals();
    wirePlayerCount();
    wireCardSize();
    watchHud();
    decorateAreaTitles();
    watchGameStart();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.AIAA11y = { closeTop, CARD_SIZES };
})();
