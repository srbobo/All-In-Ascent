/* global ROUTES, GEAR_SHOP, CHARACTERS -- game data from game.js, when loaded */
/* ==========================================================================
   ALL IN ASCENT — GRIT & HOLDS v2 · CARD COMPONENTS
   ==========================================================================
   Builders for every card type. Each returns a live <article> element laid
   out like a printed poker-size card (5 : 7) that scales with its container.

     AIACards.route(route, opts)      climbing route (bouldering / top rope / lead)
     AIACards.gear(gear, opts)        gear-shop card
     AIACards.climber(key, char, opts) climber (character) card
     AIACards.training(area, opts)    training-station card

   Shared opts:
     action   { label, onClick, disabled, reason, ariaLabel }
              Renders a real <button> stretched over the whole card, so mouse,
              touch, keyboard and screen readers all reach one control.
              `reason` is shown on the card when disabled (never colour-only).
     status   short text badge ("Attempted", "Owned", "Your station"...)
     tone     'muted' | 'locked' | 'done' — visual state hooks
     setCode  footer set code override

   Requires design/card-art.js (window.AIAArt).
   ========================================================================== */
(function () {
  'use strict';
  const Art = () => window.AIAArt;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let uid = 0;

  const STATS = [
    { key: 'strength',    short: 'STR', name: 'Strength' },
    { key: 'technique',   short: 'TEC', name: 'Technique' },
    { key: 'focus',       short: 'FOC', name: 'Focus' },
    { key: 'flexibility', short: 'FLX', name: 'Flexibility' },
  ];
  const AREAS = {
    bouldering:   { label: 'Bouldering',    short: 'BLD', icon: 'bouldering',   color: 'coral' },
    topRope:      { label: 'Top Rope',      short: 'TR',  icon: 'topRope',      color: 'teal' },
    leadClimbing: { label: 'Lead Climbing', short: 'LD',  icon: 'leadClimbing', color: 'raspberry' },
  };
  const MILESTONES = {
    beginner:     { label: 'Beginner Project',     color: 'lime' },
    intermediate: { label: 'Intermediate Project', color: 'marigold' },
    expert:       { label: 'Expert Project',       color: 'raspberry' },
  };
  const EDITION = () => (typeof window !== 'undefined' && window.GAME_VERSION) ? `v${window.GAME_VERSION}` : 'Digital';

  function icon(name, cls) { return Art().icon(name, { className: cls }); }
  function frameVars(color) {
    return `--frame: var(--${color}); --frame-on: var(--on-${color});`;
  }

  function el(html) {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }

  function actionMarkup(id, a) {
    if (!a) return '';
    const disabled = a.disabled ? ' aria-disabled="true"' : '';
    const reasonId = a.disabled && a.reason ? `${id}-reason` : '';
    const describedBy = [`${id}-name`, reasonId].filter(Boolean).join(' ');
    return `
      <button type="button" class="aia-card__action" aria-describedby="${describedBy}"${disabled}${a.ariaLabel ? ` aria-label="${esc(a.ariaLabel)}"` : ''}>
        <span class="aia-card__action-label">${esc(a.label || 'Select')}</span>
      </button>
`;
  }
  // The "why not" badge sits on the illustration so it never hides rules text.
  function reasonMarkup(id, a) {
    if (!a || !a.disabled || !a.reason) return '';
    return `<p class="aia-card__reason" id="${id}-reason">${icon(a.reasonIcon || 'lock')}<span>${esc(a.reason)}</span></p>`;
  }
  function wireAction(node, a) {
    if (!a) return node;
    const btn = node.querySelector('.aia-card__action');
    if (!btn) return node;
    btn.addEventListener('click', (e) => {
      if (btn.getAttribute('aria-disabled') === 'true') { e.preventDefault(); return; }
      if (typeof a.onClick === 'function') a.onClick(e);
    });
    return node;
  }
  function statusMarkup(status) {
    return status ? `<span class="aia-card__status">${esc(status)}</span>` : '';
  }
  function stateClasses(o) {
    return [o.tone ? `is-${o.tone}` : '', o.action && o.action.disabled ? 'is-disabled' : '', o.current ? 'is-current' : ''].filter(Boolean).join(' ');
  }

  // ---- requirement block (also used by climber stats) --------------------
  function reqsMarkup(values, compareTo, opts = {}) {
    return `<dl class="aia-reqs${opts.cls ? ' ' + opts.cls : ''}">${STATS.map(s => {
      const v = values[s.key];
      let state = '', sr = '';
      if (compareTo && typeof compareTo[s.key] === 'number') {
        const met = compareTo[s.key] >= v;
        state = met ? ' is-met' : ' is-unmet';
        sr = met ? ` (you have ${compareTo[s.key]}, met)` : ` (you have ${compareTo[s.key]}, short by ${v - compareTo[s.key]})`;
      }
      return `<div class="aia-req aia-req--${s.key}${state}">
        <dt>${icon(s.key, 'aia-req__icon')}<span class="aia-req__label">${s.short}</span><span class="sr-only">${s.name}${opts.verb ? ' ' + opts.verb : ''}</span></dt>
        <dd><span class="aia-req__value">${v}</span>${state ? `<span class="aia-req__mark" aria-hidden="true">${icon(state.includes('unmet') ? 'cross' : 'check')}</span>` : ''}<span class="sr-only">${esc(sr)}</span></dd>
      </div>`;
    }).join('')}</dl>`;
  }

  function diceMarkup(rollEffect) {
    if (!rollEffect || !rollEffect.length) {
      return `<p class="aia-dice aia-dice--none">${icon('die')}<span>No dice — pure skill</span></p>`;
    }
    return `<ul class="aia-dice" aria-label="Dice effects">${rollEffect.map(e => {
      const s = STATS.find(x => x.key === e.stat) || STATS[0];
      const buff = e.modifier === -1;
      return `<li class="aia-die-chip ${buff ? 'is-buff' : 'is-nerf'}">
        ${icon('die')}<span aria-hidden="true">${buff ? '−' : '+'}${s.short}</span>
        <span class="sr-only">${buff ? 'Buff die: lowers' : 'Nerf die: raises'} the ${s.name} requirement by one d6</span>
      </li>`;
    }).join('')}</ul>`;
  }

  function setCodeFor(route, area) {
    const pool = (typeof ROUTES !== 'undefined' && ROUTES[area]) || null;
    const meta = AREAS[area] || AREAS.bouldering;
    if (!pool) return `AIA · ${meta.short}`;
    const i = pool.findIndex(r => r.name === route.name);
    const pad = (n) => String(n).padStart(2, '0');
    return `AIA · ${meta.short} ${pad(i + 1)}/${pad(pool.length)}`;
  }

  // ========================================================================
  // ROUTE CARD
  // ========================================================================
  function route(r, o = {}) {
    const area = o.area || 'bouldering';
    const meta = AREAS[area] || AREAS.bouldering;
    const circ = Art().circuit(r.grade);
    const id = `aia-card-${++uid}`;
    const ms = o.milestone ? MILESTONES[o.milestone] : null;
    const frame = ms ? 'marigold' : meta.color;
    const moves = (r.moveFeatures || []).join(' · ');
    const chips = [r.routeType, r.tag].filter(Boolean);
    const node = el(`
      <article class="aia-card aia-card--route ${ms ? 'aia-card--milestone' : ''} ${stateClasses(o)}" data-area="${area}" style="${frameVars(frame)} --circuit: var(--${circ.key}); --circuit-on: var(--on-${circ.key});" aria-labelledby="${id}-name">
        <div class="aia-card__face">
          <header class="aia-card__head">
            ${ms
              ? `<span class="aia-card__kind tape tape--straight tape--${ms.color}">${icon('milestone')}${esc(ms.label)}</span>`
              : `<span class="aia-card__kind">${icon(meta.icon)}${esc(meta.label)}</span>`}
            ${statusMarkup(o.status)}
          </header>
          <h3 class="aia-card__name" id="${id}-name">${esc(r.name)}${ms ? `<span class="sr-only">, ${esc(meta.label)}</span>` : ''}</h3>
          <div class="aia-card__art">
            ${Art().route(r, area)}
            ${reasonMarkup(id, o.action)}
            <span class="aia-card__grade hold hold--label hold--${circ.key}" data-len="${Math.min(5, String(r.grade).length)}" title="${esc(circ.label)}"><span class="sr-only">Grade </span>${esc(r.grade)}<span class="sr-only">, ${esc(circ.label)}</span></span>
            <span class="aia-card__art-chips">${chips.map(c => `<span class="aia-chip">${esc(c)}</span>`).join('')}</span>
            ${ms ? `<span class="aia-card__area-flag">${icon(meta.icon)}${esc(meta.label)}</span>` : ''}
          </div>
          ${reqsMarkup(r, o.stats, { verb: 'required' })}
          ${diceMarkup(r.rollEffect)}
          <div class="aia-costs">
            <span class="aia-cost aia-cost--time" title="Time cost">${icon('time')}<b>${r.time}</b><span class="sr-only"> time</span></span>
            <span class="aia-cost aia-cost--endurance" title="Endurance cost">${icon('endurance')}<b>${r.endurance}</b><span class="sr-only"> endurance</span></span>
            <span class="aia-cost aia-cost--xp" title="XP on send / on fall">${icon('xp')}<b>${r.xpSuccess}</b><span class="aia-cost__fail" aria-hidden="true">/${r.xpFail}</span><span class="sr-only"> XP on a send, ${r.xpFail} XP on a fall</span></span>
          </div>
          ${o.extra || ''}
          <footer class="aia-card__foot">
            <span>${esc(o.setCode || setCodeFor(r, area))}</span>
            <span>${moves ? esc(moves) : esc(EDITION())}</span>
          </footer>
        </div>
        ${actionMarkup(id, o.action)}
      </article>`);
    return wireAction(node, o.action);
  }

  // ========================================================================
  // GEAR CARD
  // ========================================================================
  function gear(g, o = {}) {
    const id = `aia-card-${++uid}`;
    const tint = Art().gearCategoryColor(g.category);
    const prereq = (g.prerequisiteItems || []).length ? `Requires ${g.prerequisiteItems.join(' + ')}` : '';
    const access = g.accessRequirement ? `Part of the ${g.accessRequirement} system` : '';
    const node = el(`
      <article class="aia-card aia-card--gear ${stateClasses(o)}" style="${frameVars(tint)}" aria-labelledby="${id}-name">
        <div class="aia-card__face">
          <header class="aia-card__head">
            <span class="aia-card__kind">${icon('gear')}${esc(g.category || 'Gear')}</span>
            ${statusMarkup(o.status)}
          </header>
          <h3 class="aia-card__name" id="${id}-name">${esc(g.name)}</h3>
          <div class="aia-card__art">
            ${Art().gear(g)}
            ${reasonMarkup(id, o.action)}
            <span class="aia-card__price" title="Cost">${icon('xp')}<b>${g.cost}</b><span>XP</span></span>
            ${access ? `<span class="aia-card__art-chips"><span class="aia-chip aia-chip--access">${icon('lock')}${esc(g.accessRequirement)} access</span></span>` : ''}
          </div>
          <div class="aia-rules">
            <p class="aia-rules__effect">${esc(g.effectDisplay)}</p>
            <p class="aia-rules__flavor">${esc(g.description)}</p>
          </div>
          ${prereq || access ? `<p class="aia-card__prereq">${icon('info')}<span>${esc([prereq, access].filter(Boolean).join(' · '))}</span></p>` : ''}
          <footer class="aia-card__foot">
            <span>${esc(o.setCode || setCodeForGear(g))}</span>
            <span>${esc(EDITION())}</span>
          </footer>
        </div>
        ${actionMarkup(id, o.action)}
      </article>`);
    return wireAction(node, o.action);
  }
  function setCodeForGear(g) {
    const pool = typeof GEAR_SHOP !== 'undefined' ? GEAR_SHOP : null;
    if (!pool) return 'AIA · GR';
    const i = pool.findIndex(x => x.name === g.name);
    return `AIA · GR ${String(i + 1).padStart(2, '0')}/${String(pool.length).padStart(2, '0')}`;
  }

  // ========================================================================
  // CLIMBER CARD
  // ========================================================================
  function climber(key, c, o = {}) {
    const id = `aia-card-${++uid}`;
    const accent = Art().climberAccent(key);
    const ab = c.specialAbility || {};
    const abText = String(ab.description || '').replace(/^PASSIVE:\s*/i, '');
    const passive = /^PASSIVE:/i.test(ab.description || '');
    const stats = c.startingStats || c.stats || {};
    const node = el(`
      <article class="aia-card aia-card--climber ${stateClasses(o)}" style="${frameVars('basalt')} --accent: var(--${accent}); --accent-on: var(--on-${accent});" aria-labelledby="${id}-name">
        <div class="aia-card__face">
          <header class="aia-card__head">
            <span class="aia-card__kind">${icon('climber')}${esc(c.archetype || 'Climber')}</span>
            ${statusMarkup(o.status)}
          </header>
          <h3 class="aia-card__name" id="${id}-name">${esc(c.name)}</h3>
          <div class="aia-card__art">
            ${Art().climber(key)}
            ${reasonMarkup(id, o.action)}
            <span class="aia-card__endurance" title="Starting endurance">${icon('endurance')}<b>${c.startingEndurance ?? c.maxEndurance}</b><span class="sr-only"> starting endurance</span></span>
          </div>
          ${reqsMarkup(stats, null, { cls: 'aia-reqs--stats', verb: 'starting value' })}
          <div class="aia-rules aia-rules--ability">
            <p class="aia-rules__title">${esc(ab.name || 'Ability')}${passive ? '<span class="aia-chip aia-chip--ink">Passive</span>' : ''}</p>
            <p class="aia-rules__effect">${esc(abText)}</p>
            <p class="aia-rules__flavor">${esc(c.description)}</p>
          </div>
          <footer class="aia-card__foot">
            <span>${esc(o.setCode || setCodeForClimber(key))}</span>
            <span>${esc(EDITION())}</span>
          </footer>
        </div>
        ${actionMarkup(id, o.action)}
      </article>`);
    return wireAction(node, o.action);
  }
  function setCodeForClimber(key) {
    const keys = typeof CHARACTERS !== 'undefined' ? Object.keys(CHARACTERS) : [];
    const i = keys.indexOf(key);
    return i >= 0 ? `AIA · CL ${String(i + 1).padStart(2, '0')}/${String(keys.length).padStart(2, '0')}` : 'AIA · CL';
  }

  // ========================================================================
  // TRAINING CARD
  // ========================================================================
  function training(a, o = {}) {
    const id = `aia-card-${++uid}`;
    const s = STATS.find(x => x.key === a.stat) || STATS[0];
    const statColor = { strength: 'coral', technique: 'teal', focus: 'violet', flexibility: 'lime' }[a.stat] || 'wood';
    const bonus = o.bonus ?? a.bonus;
    const node = el(`
      <article class="aia-card aia-card--training ${stateClasses(o)}" style="${frameVars('wood')} --stat: var(--${statColor}); --stat-on: var(--on-${statColor});" aria-labelledby="${id}-name">
        <div class="aia-card__face">
          <header class="aia-card__head">
            <span class="aia-card__kind">${icon('training')}Training</span>
            ${statusMarkup(o.status)}
          </header>
          <h3 class="aia-card__name" id="${id}-name">${esc(a.name)}</h3>
          <div class="aia-card__art">
            ${Art().training(a)}
            ${reasonMarkup(id, o.action)}
            <span class="aia-card__bonus hold hold--label hold--${statColor}">+${bonus}<small>${s.short}</small><span class="sr-only"> ${s.name}</span></span>
          </div>
          <div class="aia-rules">
            <p class="aia-rules__effect">Permanently gain <b>+${bonus} ${esc(s.name)}</b>.</p>
            <p class="aia-rules__flavor">One climber per station. Occupied stations are blocked until the round ends.</p>
          </div>
          <div class="aia-costs">
            <span class="aia-cost aia-cost--time">${icon('time')}<b>${a.time}</b><span class="sr-only"> time</span></span>
            <span class="aia-cost aia-cost--endurance">${icon('endurance')}<b>${a.endurance}</b><span class="sr-only"> endurance</span></span>
            <span class="aia-cost aia-cost--stat">${icon(a.stat)}<b>+${bonus}</b><span class="sr-only"> ${s.name}</span></span>
          </div>
          <footer class="aia-card__foot">
            <span>${esc(o.setCode || 'AIA · TR STATION')}</span>
            <span>${esc(EDITION())}</span>
          </footer>
        </div>
        ${actionMarkup(id, o.action)}
      </article>`);
    return wireAction(node, o.action);
  }

  window.AIACards = { route, gear, climber, training, reqsMarkup, diceMarkup, STATS, AREAS, MILESTONES };
})();
