// All In Ascent — Project Mode workshop (project.html; classic script, works
// from file://).
//
// The builder for player-made climbers, route cards and gear cards. It holds
// no rules of its own: the element catalog (what a rule may say), the
// compiler (whether a card is valid) and the rules text all come from the
// engine (engine/content.js, exposed through window.AscentEngine), and the
// preview is the same card renderer the board uses (design/cards.js).
//
//   workshop  — the player's cards in this browser (project-store.js)
//   editor    — one card at a time: a form built from the definition, a live
//               preview and the compile status; structural edits (add /
//               remove / move an element or rule) re-render the form, value
//               edits update the definition in place and refresh the preview
//   submit    — sends the card to the review queue (party/submissions.js)
//               through telemetry-client.js

(function () {
  'use strict';
  const E = window.AscentEngine;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = (name) => (window.AIAIcons ? AIAIcons.icon(name, { className: 'aia-icon' }) : '');
  const $ = (id) => document.getElementById(id);

  const STATS = E.STATS;
  const STAT_LABELS = { strength: 'Strength', technique: 'Technique', focus: 'Focus', flexibility: 'Flexibility' };
  const AREA_LABELS = { bouldering: 'Bouldering', topRope: 'Top Rope', leadClimbing: 'Lead Climbing' };
  const KIND_LABELS = { character: 'Climber', route: 'Route card', gear: 'Gear card' };
  const PORTRAIT_LABELS = { technician: 'Technician (teal)', sprinter: 'Sprinter (coral)', ironLung: 'Iron Lung (marigold)', freeSolo: 'Free Solo (raspberry)', routeReader: 'Route Reader (violet)' };

  // ---------------------------------------------------------------------------
  // Starter definitions
  // ---------------------------------------------------------------------------
  const STARTERS = {
    character: () => ({
      name: 'New Climber', archetype: 'Project climber', description: '',
      portrait: 'technician', accent: 'cobalt',
      startingStats: { strength: 16, technique: 16, focus: 16, flexibility: 16 },
      startingEndurance: 100,
      growth: { strength: 2.5, technique: 2.5, focus: 2.5, flexibility: 2.5, endurance: 6 },
      specialAbility: { name: 'House Rules' },
      rules: [{ when: [{ type: 'routeType', value: 'Overhang' }], then: [{ type: 'statBonus', stat: 'strength', amount: 5 }] }],
    }),
    route: () => ({
      name: 'New Route', area: 'bouldering', grade: 'V2',
      strength: 26, technique: 24, focus: 22, flexibility: 20, time: 2, endurance: 18, xpSuccess: 40, xpFail: 15,
      rollEffect: [{ stat: 'technique', modifier: -1 }],
      routeType: 'Vertical', holdFeatures: ['Jugs'], moveFeatures: [], tag: null,
    }),
    gear: () => ({
      name: 'New Gear', category: 'Strategy Gear', cost: 100, gritCost: 4, prerequisiteLevel: 1, description: '',
      rules: [{ when: [], then: [{ type: 'restBonus', amount: 5 }] }],
    }),
  };

  // ---------------------------------------------------------------------------
  // Editor state
  // ---------------------------------------------------------------------------
  let editing = null; // { kind, def, workshopId }
  let dirty = false;

  function compileNow() {
    if (!editing) return null;
    const def = editing.def;
    if (editing.kind === 'character') return E.compileCharacter(def);
    if (editing.kind === 'route') return E.compileRoute(def);
    return E.compileGear(def);
  }

  // ---------------------------------------------------------------------------
  // Workshop list
  // ---------------------------------------------------------------------------
  function statusOf(kind, card) {
    const def = AscentWorkshop.definitionOf(card);
    const r = kind === 'character' ? E.compileCharacter(def) : kind === 'route' ? E.compileRoute(def) : E.compileGear(def);
    return r.ok ? { ok: true, text: 'compiles' } : { ok: false, text: `${r.errors.length} error${r.errors.length === 1 ? '' : 's'}` };
  }

  function renderWorkshop() {
    const data = AscentWorkshop.load();
    const list = $('workshopList');
    list.innerHTML = '';
    const rows = [
      ...data.characters.map(c => ['character', c]),
      ...data.routes.map(r => ['route', r]),
      ...data.gear.map(g => ['gear', g]),
    ];
    for (const [kind, card] of rows) {
      const st = statusOf(kind, card);
      const li = document.createElement('li');
      li.dataset.kind = kind;
      li.dataset.id = card.workshopId;
      if (editing && editing.workshopId === card.workshopId) li.classList.add('is-editing');
      li.innerHTML = `
        <span class="aia-chip aia-chip--ink">${esc(KIND_LABELS[kind].split(' ')[0])}</span>
        <span><span class="pm-item__name">${esc(card.name || '(unnamed)')}</span><span class="pm-item__meta${st.ok ? '' : ' is-bad'}">${esc(st.text)}${card.submittedAt ? ' · submitted' : ''}</span></span>
        <button class="btn btn--ghost" type="button" data-edit="${esc(card.workshopId)}" aria-label="Edit ${esc(card.name || 'card')}">Edit</button>`;
      list.appendChild(li);
    }
    const n = rows.length;
    $('playLink').textContent = n ? `Play with these ${n === 1 ? 'card' : 'cards'} ▸` : 'Play the game ▸';
  }

  // ---------------------------------------------------------------------------
  // Form building
  // ---------------------------------------------------------------------------
  const field = (label, path, value, { type = 'text', min, max, step, span = false, small = '', maxlength } = {}) => `
    <label class="pm-field${span ? ' pm-field--span' : ''}"><span>${esc(label)}${small ? ` <small>${esc(small)}</small>` : ''}</span>
      ${type === 'textarea'
    ? `<textarea data-path="${esc(path)}" rows="3"${maxlength ? ` maxlength="${maxlength}"` : ''}>${esc(value)}</textarea>`
    : `<input type="${type}" data-path="${esc(path)}" value="${esc(value)}"${min !== undefined ? ` min="${min}"` : ''}${max !== undefined ? ` max="${max}"` : ''}${step !== undefined ? ` step="${step}"` : ''}${maxlength ? ` maxlength="${maxlength}"` : ''}${type === 'number' ? ' inputmode="numeric"' : ''}>`}
    </label>`;
  const select = (label, path, value, options, { span = false, small = '' } = {}) => `
    <label class="pm-field${span ? ' pm-field--span' : ''}"><span>${esc(label)}${small ? ` <small>${esc(small)}</small>` : ''}</span>
      <select data-path="${esc(path)}">${options.map(([v, l]) => `<option value="${esc(v)}"${String(v) === String(value) ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>
    </label>`;
  const statField = (label, path, value, min, max, step = 1, iconName = null) => `
    <label class="pm-field"><span>${iconName ? icon(iconName) : ''}${esc(label)}</span>
      <input type="number" data-path="${esc(path)}" value="${esc(value)}" min="${min}" max="${max}" step="${step}" inputmode="decimal"></label>`;

  function characterForm(def) {
    const L = E.CHARACTER_LIMITS;
    return `
      <div class="pm-fields">
        ${field('Name', 'name', def.name, { maxlength: 40 })}
        ${field('Archetype', 'archetype', def.archetype, { maxlength: 40, small: 'e.g. Steep specialist' })}
        ${select('Portrait', 'portrait', def.portrait, E.PORTRAITS.map(p => [p, PORTRAIT_LABELS[p] || p]))}
        ${select('Accent colour', 'accent', def.accent, E.ACCENTS.map(a => [a, a]))}
        ${field('Ability name', 'specialAbility.name', def.specialAbility && def.specialAbility.name, { maxlength: 40 })}
        ${field('Flavour text', 'description', def.description, { type: 'textarea', span: true, maxlength: 240 })}
      </div>
      <div class="pm-group"><h3>Starting stats <small>${L.stat.min}–${L.stat.max} each, ${L.statTotal.min}–${L.statTotal.max} in total</small></h3>
        <div class="pm-stat-grid">
          ${STATS.map(k => statField(STAT_LABELS[k], `startingStats.${k}`, def.startingStats && def.startingStats[k], L.stat.min, L.stat.max, 1, k)).join('')}
          ${statField('Endurance', 'startingEndurance', def.startingEndurance, L.endurance.min, L.endurance.max, 1, 'endurance')}
        </div></div>
      <div class="pm-group"><h3>Growth per Level <small>${L.growth.min}–${L.growth.max} in steps of ${L.growth.step}; Endurance ${L.enduranceGrowth.min}–${L.enduranceGrowth.max}</small></h3>
        <div class="pm-stat-grid">
          ${STATS.map(k => statField(STAT_LABELS[k], `growth.${k}`, def.growth && def.growth[k], L.growth.min, L.growth.max, L.growth.step, k)).join('')}
          ${statField('Endurance', 'growth.endurance', def.growth && def.growth.endurance, L.enduranceGrowth.min, L.enduranceGrowth.max, L.enduranceGrowth.step, 'endurance')}
        </div></div>
      ${rulesSection(def.rules || [], 'character')}`;
  }

  function routeForm(def) {
    const L = E.ROUTE_LIMITS;
    const V = E.ROUTE_VOCAB;
    const grades = V.grades[def.area] || V.grades.bouldering;
    const checks = (label, path, options, chosen) => `
      <div class="pm-group"><h3>${esc(label)}</h3><div class="pm-checks">
        ${options.map(o => `<label><input type="checkbox" data-list="${esc(path)}" value="${esc(o)}"${(chosen || []).includes(o) ? ' checked' : ''}>${esc(o)}</label>`).join('')}
      </div></div>`;
    return `
      <div class="pm-fields">
        ${field('Name', 'name', def.name, { maxlength: 40 })}
        ${select('Wall', 'area', def.area, E.AREAS.map(a => [a, AREA_LABELS[a]]))}
        ${select('Grade', 'grade', def.grade, grades.map(g => [g, g]))}
        ${select('Route type', 'routeType', def.routeType, V.routeTypes.map(t => [t, t]))}
        ${select('Specialty tag', 'tag', def.tag || '', [['', 'None'], ...V.tags.map(t => [t, t])], { small: 'what specialty gear targets' })}
      </div>
      <div class="pm-group"><h3>Requirements <small>${L.requirement.min}–${L.requirement.max}</small></h3>
        <div class="pm-stat-grid">${STATS.map(k => statField(STAT_LABELS[k], k, def[k], L.requirement.min, L.requirement.max, 1, k)).join('')}</div></div>
      <div class="pm-group"><h3>Costs and XP</h3>
        <div class="pm-stat-grid">
          ${statField('Time', 'time', def.time, L.time.min, L.time.max, 1, 'time')}
          ${statField('Endurance', 'endurance', def.endurance, L.endurance.min, L.endurance.max, 1, 'endurance')}
          ${statField('XP on a send', 'xpSuccess', def.xpSuccess, L.xpSuccess.min, L.xpSuccess.max, 1, 'xp')}
          ${statField('XP on a fall', 'xpFail', def.xpFail, L.xpFail.min, L.xpFail.max, 1, 'xp')}
        </div></div>
      <div class="pm-group"><h3>Dice <small>up to ${L.dice}; a buff die lowers its requirement, a nerf die raises it</small></h3>
        <div class="pm-dice">
          ${(def.rollEffect || []).map((d, i) => `<div class="pm-die">
            <select data-path="rollEffect.${i}.stat">${STATS.map(k => `<option value="${k}"${d.stat === k ? ' selected' : ''}>${STAT_LABELS[k]}</option>`).join('')}</select>
            <select data-path="rollEffect.${i}.modifier" data-number>${[[-1, 'Buff (−die)'], [1, 'Nerf (+die)']].map(([v, l]) => `<option value="${v}"${d.modifier === v ? ' selected' : ''}>${l}</option>`).join('')}</select>
            <button class="pm-mini" type="button" data-remove-die="${i}" aria-label="Remove die ${i + 1}">✕</button>
          </div>`).join('')}
          ${(def.rollEffect || []).length < L.dice ? '<div><button class="pm-mini" type="button" data-add-die>+ Add a die</button></div>' : ''}
        </div></div>
      ${checks('Hold features', 'holdFeatures', V.holdFeatures, def.holdFeatures)}
      ${checks('Move features', 'moveFeatures', V.moveFeatures, def.moveFeatures)}`;
  }

  function gearForm(def) {
    const L = E.GEAR_LIMITS;
    return `
      <div class="pm-fields">
        ${field('Name', 'name', def.name, { maxlength: 40 })}
        ${select('Category', 'category', def.category, E.GEAR_CATEGORIES.map(c => [c, c]))}
        ${field('Grit price', 'gritCost', def.gritCost, { type: 'number', min: L.gritCost.min, max: L.gritCost.max, step: 1, small: 'what it costs in a game' })}
        ${field('XP price', 'cost', def.cost, { type: 'number', min: L.cost.min, max: L.cost.max, step: 1, small: 'printed value' })}
        ${field('Required Level', 'prerequisiteLevel', def.prerequisiteLevel, { type: 'number', min: L.level.min, max: L.level.max, step: 1 })}
        ${field('Flavour text', 'description', def.description, { type: 'textarea', span: true, maxlength: 160 })}
      </div>
      ${rulesSection(def.rules || [], 'gear')}`;
  }

  // ----- rules builder ------------------------------------------------------
  function effectOptionsFor(kind, rule) {
    // Effects this card may carry, whose scope every existing condition can decide.
    return Object.entries(E.EFFECTS).filter(([, spec]) => spec.for.includes(kind) &&
      (rule.when || []).every(c => !E.CONDITIONS[c.type] || E.CONDITIONS[c.type].scopes.includes(spec.scope)));
  }
  function conditionOptionsFor(rule) {
    // Conditions that can decide every effect already in the rule.
    const scopes = new Set((rule.then || []).map(e => E.EFFECTS[e.type] && E.EFFECTS[e.type].scope).filter(Boolean));
    return Object.entries(E.CONDITIONS).filter(([, spec]) => [...scopes].every(s => spec.scopes.includes(s)));
  }

  function paramInputs(spec, el, path) {
    return Object.entries(spec.params).map(([name, p]) => {
      if (p.type === 'enum') {
        return `<select data-path="${esc(`${path}.${name}`)}" aria-label="${esc(name)}"${p.options.every(o => typeof o === 'number') ? ' data-number' : ''}>
          ${p.options.map(o => `<option value="${esc(o)}"${String(el[name]) === String(o) ? ' selected' : ''}>${esc((p.labels && p.labels[o]) || o)}</option>`).join('')}</select>`;
      }
      return `<input type="number" data-path="${esc(`${path}.${name}`)}" value="${esc(el[name])}" min="${p.min}" max="${p.max}" step="1" aria-label="${esc(name)}" title="${p.min} to ${p.max}">`;
    }).join('');
  }

  function elementChip(catalog, el, path, cls, errorPaths) {
    const spec = catalog[el.type];
    const bad = [...errorPaths].some(p => p === path || p.startsWith(`${path}.`));
    if (!spec) return `<span class="pm-element ${cls} is-bad">unknown element <code>${esc(el.type)}</code> <button class="pm-mini" type="button" data-remove="${esc(path)}" aria-label="Remove element">✕</button></span>`;
    return `<span class="pm-element ${cls}${bad ? ' is-bad' : ''}" title="${esc(spec.help || '')}">
      <b>${esc(spec.label)}</b>${paramInputs(spec, el, path)}
      <button class="pm-mini" type="button" data-remove="${esc(path)}" aria-label="Remove ${esc(spec.label)}">✕</button>
    </span>`;
  }

  function rulesSection(rules, kind) {
    const compiled = compileNow();
    const errorPaths = new Set((compiled && !compiled.ok ? compiled.errors : []).map(e => e.path.replace(/^(character|route|gear)\./, '')));
    const max = E.LIMITS.rulesPerCard;
    return `
      <div class="pm-group" id="rulesGroup"><h3>Rules <small>${rules.length} of ${max} · each rule: when every condition holds, its effects apply</small></h3>
        <div class="pm-rules">
          ${rules.map((rule, i) => ruleBlock(rule, i, kind, rules.length, errorPaths)).join('')}
        </div>
        ${rules.length < max ? '<p><button class="btn btn--ink btn--sm" type="button" data-add-rule>+ Add a rule</button></p>' : ''}
      </div>`;
  }

  function ruleBlock(rule, i, kind, count, errorPaths) {
    const path = `rules.${i}`;
    const whenOpts = conditionOptionsFor(rule);
    const thenOpts = effectOptionsFor(kind, rule);
    const text = E.describeRule(rule);
    const ruleErrors = [...errorPaths].filter(p => p === path || p.startsWith(`${path}.`));
    const atMaxWhen = (rule.when || []).length >= E.LIMITS.conditionsPerRule;
    const atMaxThen = (rule.then || []).length >= E.LIMITS.effectsPerRule;
    return `
      <div class="pm-rule" data-rule="${i}">
        <div class="pm-rule__head"><b>Rule ${i + 1}</b>
          <span class="pm-rule__tools">
            <button class="pm-mini" type="button" data-move="${i}:-1" aria-label="Move rule ${i + 1} up"${i === 0 ? ' disabled' : ''}>↑</button>
            <button class="pm-mini" type="button" data-move="${i}:1" aria-label="Move rule ${i + 1} down"${i === count - 1 ? ' disabled' : ''}>↓</button>
            <button class="pm-mini" type="button" data-remove-rule="${i}" aria-label="Remove rule ${i + 1}">✕</button>
          </span></div>
        <div class="pm-rule__row"><span class="pm-rule__label">When</span><div class="pm-elements">
          ${(rule.when || []).length ? (rule.when || []).map((c, j) => elementChip(E.CONDITIONS, c, `${path}.when.${j}`, 'pm-element--when', errorPaths)).join('') : '<span class="pm-note" style="margin:0">always</span>'}
          ${atMaxWhen ? '' : `<span class="pm-add"><select data-add-when="${i}" aria-label="Add a condition to rule ${i + 1}"><option value="">+ condition</option>${whenOpts.map(([k, s]) => `<option value="${k}">${esc(s.label)}</option>`).join('')}</select></span>`}
        </div></div>
        <div class="pm-rule__row"><span class="pm-rule__label pm-rule__label--then">Then</span><div class="pm-elements">
          ${(rule.then || []).map((e, j) => elementChip(E.EFFECTS, e, `${path}.then.${j}`, 'pm-element--then', errorPaths)).join('')}
          ${atMaxThen ? '' : `<span class="pm-add"><select data-add-then="${i}" aria-label="Add an effect to rule ${i + 1}"><option value="">+ effect</option>${thenOpts.map(([k, s]) => `<option value="${k}">${esc(s.label)}</option>`).join('')}</select></span>`}
        </div></div>
        <p class="pm-rule__text${ruleErrors.length ? ' is-bad' : ''}" data-rule-text="${i}">${esc(ruleErrors.length ? 'This rule has errors — see the compile status.' : text)}</p>
      </div>`;
  }

  // ---------------------------------------------------------------------------
  // Editor
  // ---------------------------------------------------------------------------
  function openEditor(kind, def, workshopId = null) {
    editing = { kind, def: JSON.parse(JSON.stringify(def)), workshopId };
    dirty = false;
    $('editor').hidden = false;
    $('emptyEditor').hidden = true;
    $('editorKind').textContent = KIND_LABELS[kind];
    renderForm();
    renderWorkshop();
    $('editorTitle').focus({ preventScroll: true });
    $('editor').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function closeEditor() {
    editing = null;
    $('editor').hidden = true;
    $('emptyEditor').hidden = false;
    renderWorkshop();
  }

  function renderForm() {
    const { kind, def } = editing;
    const form = $('editorForm');
    form.innerHTML = kind === 'character' ? characterForm(def) : kind === 'route' ? routeForm(def) : gearForm(def);
    refresh();
  }

  // Preview, compile status and title — after any edit.
  function refresh() {
    const { kind, def } = editing;
    const compiled = compileNow();
    $('editorTitle').innerHTML = `${esc(def.name || KIND_LABELS[kind])}${dirty ? ' <em>· unsaved</em>' : ''}`;
    // Preview: the compiled card, or the draft with its rules worded as far as they go.
    const shown = compiled.ok ? compiled.value : draftForPreview(kind, def);
    const preview = $('preview');
    preview.innerHTML = '';
    try {
      if (kind === 'character') preview.appendChild(AIACards.climber(shown.key || 'custom-draft', shown));
      else if (kind === 'route') preview.appendChild(AIACards.route(shown, { area: shown.area, grit: E.routeGritValue(E.GRIT_RULES, shown) }));
      else preview.appendChild(AIACards.gear(shown, { currency: 'grit', price: shown.gritCost }));
    } catch (e) {
      preview.innerHTML = `<p class="pm-note">Preview unavailable: ${esc(e.message)}</p>`;
    }
    const status = $('compileStatus');
    status.className = `pm-status ${compiled.ok ? 'is-ok' : 'is-bad'}`;
    status.innerHTML = compiled.ok
      ? `${icon('check')} <b>Compiles.</b> This card plays by its text in local games.`
      : `${icon('cross')} <b>${compiled.errors.length} thing${compiled.errors.length === 1 ? '' : 's'} to fix</b> before it can be played or submitted:<ul>${compiled.errors.map(e => `<li>${esc(e.message)} <code>${esc(e.path.replace(/^(character|route|gear)\./, ''))}</code></li>`).join('')}</ul>`;
    $('submitBtn').disabled = !compiled.ok;
    $('deleteBtn').hidden = !editing.workshopId;
    const note = $('editorNote');
    const card = editing.workshopId ? AscentWorkshop.get(editing.kind, editing.workshopId) : null;
    note.textContent = card && card.submittedAt ? `Submitted for review on ${new Date(card.submittedAt).toLocaleDateString()}${card.submissionId ? ` (${card.submissionId})` : ''}.` : '';
    // Rule texts update in place as values change.
    for (const el of document.querySelectorAll('[data-rule-text]')) {
      const i = Number(el.dataset.ruleText);
      const rule = (def.rules || [])[i];
      if (!rule) continue;
      const path = `rules.${i}`;
      const errs = compiled.ok ? [] : compiled.errors.filter(e => e.path.replace(/^(character|route|gear)\./, '').startsWith(path));
      el.classList.toggle('is-bad', errs.length > 0);
      el.textContent = errs.length ? 'This rule has errors — see the compile status.' : E.describeRule(rule);
    }
    for (const chip of document.querySelectorAll('.pm-element[title]')) {
      const input = chip.querySelector('[data-path]');
      if (!input) continue;
      const base = input.dataset.path.replace(/\.[^.]+$/, '');
      const bad = !compiled.ok && compiled.errors.some(e => e.path.replace(/^(character|route|gear)\./, '').startsWith(base));
      chip.classList.toggle('is-bad', bad);
    }
  }

  function draftForPreview(kind, def) {
    if (kind === 'character') {
      return {
        ...def, custom: true, key: def.key || E.slugKey(def.name),
        specialAbility: { name: (def.specialAbility && def.specialAbility.name) || 'House Rules', description: (def.rules || []).length ? E.describeRules(def.rules) : 'No special rules.' },
      };
    }
    if (kind === 'route') return { ...def, custom: true, rollEffect: def.rollEffect || [], holdFeatures: def.holdFeatures || [], moveFeatures: def.moveFeatures || [] };
    return { ...def, custom: true, effectDisplay: E.describeRules(def.rules || []), prerequisiteItems: [], accessRequirement: null };
  }

  // Set `value` at a dotted path on the definition ("rules.0.when.1.value").
  function setAt(obj, path, value) {
    const keys = path.split('.');
    let o = obj;
    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i];
      if (o[k] === undefined || o[k] === null) o[k] = /^\d+$/.test(keys[i + 1]) ? [] : {};
      o = o[k];
    }
    o[keys[keys.length - 1]] = value;
  }
  function getAt(obj, path) {
    return path.split('.').reduce((o, k) => (o === undefined || o === null ? undefined : o[k]), obj);
  }

  function onFieldInput(e) {
    const el = e.target;
    if (!editing) return;
    if (el.dataset.list) {
      // A checkbox list (hold / move features).
      const chosen = [...document.querySelectorAll(`[data-list="${el.dataset.list}"]`)].filter(x => x.checked).map(x => x.value);
      setAt(editing.def, el.dataset.list, chosen);
    } else if (el.dataset.path) {
      let value = el.value;
      if (el.type === 'number' || el.hasAttribute('data-number')) value = value === '' ? null : Number(value);
      if (el.dataset.path === 'tag' && value === '') value = null;
      setAt(editing.def, el.dataset.path, value);
      // A route's grade list depends on its wall.
      if (el.dataset.path === 'area') {
        const grades = E.ROUTE_VOCAB.grades[value] || [];
        if (!grades.includes(editing.def.grade)) editing.def.grade = grades[0];
        dirty = true;
        renderForm();
        return;
      }
    } else return;
    dirty = true;
    refresh();
  }

  function onFormClick(e) {
    const btn = e.target.closest('button');
    if (!btn || !editing) return;
    const def = editing.def;
    const d = btn.dataset;
    if (d.addRule !== undefined) { (def.rules ||= []).push({ when: [], then: [] }); }
    else if (d.removeRule !== undefined) { def.rules.splice(Number(d.removeRule), 1); }
    else if (d.move !== undefined) {
      const [i, dir] = d.move.split(':').map(Number);
      const j = i + dir;
      if (j < 0 || j >= def.rules.length) return;
      [def.rules[i], def.rules[j]] = [def.rules[j], def.rules[i]];
    } else if (d.remove !== undefined) {
      const path = d.remove;
      const listPath = path.replace(/\.\d+$/, '');
      const idx = Number(path.slice(listPath.length + 1));
      const list = getAt(def, listPath);
      if (Array.isArray(list)) list.splice(idx, 1);
    } else if (d.addDie !== undefined) { (def.rollEffect ||= []).push({ stat: 'strength', modifier: -1 }); }
    else if (d.removeDie !== undefined) { def.rollEffect.splice(Number(d.removeDie), 1); }
    else return;
    dirty = true;
    renderForm();
  }

  function onFormChange(e) {
    const el = e.target;
    if (!editing || el.tagName !== 'SELECT') return;
    const def = editing.def;
    const defaults = (spec) => Object.fromEntries(Object.entries(spec.params).map(([name, p]) => [name,
      p.default !== undefined ? p.default : p.type === 'enum' ? p.options[0] : Math.max(p.min, Math.min(p.max, p.nonzero && p.min <= 0 && p.max >= 1 ? 1 : p.min))]));
    if (el.dataset.addWhen !== undefined && el.value) {
      const rule = def.rules[Number(el.dataset.addWhen)];
      (rule.when ||= []).push({ type: el.value, ...defaults(E.CONDITIONS[el.value]) });
    } else if (el.dataset.addThen !== undefined && el.value) {
      const rule = def.rules[Number(el.dataset.addThen)];
      (rule.then ||= []).push({ type: el.value, ...defaults(E.EFFECTS[el.value]) });
    } else return;
    dirty = true;
    renderForm();
  }

  // ---------------------------------------------------------------------------
  // Save / delete / submit / import / export
  // ---------------------------------------------------------------------------
  function save() {
    if (!editing) return null;
    const existing = editing.workshopId ? AscentWorkshop.get(editing.kind, editing.workshopId) : null;
    const keep = existing ? { submittedAt: existing.submittedAt, submissionId: existing.submissionId } : {};
    const saved = AscentWorkshop.save(editing.kind, { ...keep, ...editing.def, workshopId: editing.workshopId || undefined });
    editing.workshopId = saved.workshopId;
    dirty = false;
    renderWorkshop();
    refresh();
    return saved;
  }

  function remove() {
    if (!editing || !editing.workshopId) return;
    if (!confirm(`Delete "${editing.def.name}" from your workshop?`)) return;
    AscentWorkshop.remove(editing.kind, editing.workshopId);
    closeEditor();
  }

  function openSubmit() {
    if (!editing) return;
    const compiled = compileNow();
    if (!compiled.ok) return;
    $('submitResult').textContent = '';
    $('submitSend').disabled = false;
    $('submitModal').classList.add('show');
    $('submitAuthor').focus();
  }
  function closeSubmit() { $('submitModal').classList.remove('show'); }

  async function sendSubmission() {
    if (!editing) return;
    const saved = save();
    const sub = AscentWorkshop.submission(editing.kind, saved, { author: $('submitAuthor').value.trim(), note: $('submitNote').value.trim() });
    $('submitSend').disabled = true;
    $('submitResult').textContent = 'Sending…';
    const res = await AscentTelemetry.sendSubmission(sub);
    if (res.ok) {
      AscentWorkshop.save(editing.kind, { ...saved, submittedAt: sub.submittedAt, submissionId: res.id });
      $('submitResult').textContent = `Sent for review (${res.id}). Thank you!`;
      renderWorkshop();
      refresh();
    } else {
      $('submitResult').textContent = `Could not send: ${res.error}`;
      $('submitSend').disabled = false;
    }
  }

  function exportWorkshop() {
    const data = AscentWorkshop.load();
    const blob = new Blob([JSON.stringify({ schema: E.CONTENT_SCHEMA, ...data }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'all-in-ascent-workshop.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function importWorkshop(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        const data = AscentWorkshop.load();
        let added = 0;
        for (const kind of ['character', 'route', 'gear']) {
          const list = kind === 'character' ? 'characters' : kind === 'route' ? 'routes' : 'gear';
          const incoming = Array.isArray(parsed[list]) ? parsed[list] : (parsed[list] && typeof parsed[list] === 'object' ? Object.values(parsed[list]) : []);
          for (const card of incoming) {
            if (!card || typeof card !== 'object') continue;
            const def = AscentWorkshop.definitionOf(card);
            if (data[list].some(x => x.name === def.name)) continue;
            AscentWorkshop.save(kind, def);
            added++;
          }
        }
        renderWorkshop();
        alert(`Imported ${added} card${added === 1 ? '' : 's'}.`);
      } catch (e) {
        alert(`Could not import: ${e.message}`);
      }
    };
    reader.readAsText(file);
  }

  // ---------------------------------------------------------------------------
  // Feature flag note
  // ---------------------------------------------------------------------------
  function renderFlag() {
    const on = AscentFlags.isOn('projectMode');
    $('flagToggle').checked = on;
    $('flagNote').classList.toggle('is-off', !on);
    $('flagNote').querySelector('b').textContent = on ? 'Project Mode is on for this browser.' : 'Project Mode is off for this browser.';
    $('flagHelp').textContent = on
      ? 'Cards in your workshop that compile join every local game you start from the setup screen.'
      : 'Switch it on to play your workshop cards in local games. You can still build and submit cards.';
    $('playLink').href = on ? 'index.html' : 'index.html?projectMode=on';
  }

  // ---------------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------------
  function boot() {
    if (window.AIAArt && AIAArt.mount) AIAArt.mount();
    renderFlag();
    renderWorkshop();
    $('flagToggle').addEventListener('change', (e) => { AscentFlags.set('projectMode', e.target.checked); renderFlag(); });
    for (const btn of document.querySelectorAll('[data-new]')) {
      btn.addEventListener('click', () => {
        if (dirty && !confirm('Discard unsaved changes to the card you are editing?')) return;
        openEditor(btn.dataset.new, STARTERS[btn.dataset.new]());
      });
    }
    $('workshopList').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-edit]');
      if (!btn) return;
      if (dirty && !confirm('Discard unsaved changes to the card you are editing?')) return;
      const li = btn.closest('li');
      const card = AscentWorkshop.get(li.dataset.kind, li.dataset.id);
      if (card) openEditor(li.dataset.kind, AscentWorkshop.definitionOf(card), card.workshopId);
    });
    const form = $('editorForm');
    form.addEventListener('input', onFieldInput);
    form.addEventListener('change', (e) => { onFormChange(e); if (e.target.tagName === 'SELECT' && e.target.dataset.path) onFieldInput(e); });
    form.addEventListener('click', onFormClick);
    $('saveBtn').addEventListener('click', save);
    $('deleteBtn').addEventListener('click', remove);
    $('submitBtn').addEventListener('click', openSubmit);
    $('submitCancel').addEventListener('click', closeSubmit);
    $('submitSend').addEventListener('click', sendSubmission);
    $('exportBtn').addEventListener('click', exportWorkshop);
    $('importInput').addEventListener('change', (e) => { if (e.target.files[0]) importWorkshop(e.target.files[0]); e.target.value = ''; });
    window.addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

    const params = new URLSearchParams(window.location.search);
    const edit = params.get('edit');
    const kind = params.get('new');
    if (edit) {
      for (const k of ['character', 'route', 'gear']) {
        const card = AscentWorkshop.get(k, edit);
        if (card) { openEditor(k, AscentWorkshop.definitionOf(card), card.workshopId); break; }
      }
    } else if (kind && STARTERS[kind]) {
      openEditor(kind, STARTERS[kind]());
    }
  }

  // For the end-to-end tests: the editor's current definition and compile result.
  window.AscentProject = {
    get editing() { return editing; },
    compile: compileNow,
    open: openEditor,
    save,
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
