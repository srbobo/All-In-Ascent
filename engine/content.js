// Project Mode — player-made content: climbers, route cards and gear cards.
//
// This module is the rules language for custom content. A content pack is a
// plain JSON object that a game is created with (createGame({ content })):
//
//   {
//     schema: 'aia-content/1',
//     characters: { [key]: CustomCharacter },      // key starts with "custom-"
//     routes:     { bouldering: [...], topRope: [...], leadClimbing: [...] },
//     gear:       [ CustomGear ],
//   }
//
// Custom climbers and custom gear carry RULES — ordered lists of
// { when: [condition...], then: [effect...] } built from the element catalog
// below (CONDITIONS and EFFECTS). A rule's effects apply whenever every one
// of its conditions holds. Routes are plain cards (requirements, dice, tags)
// in the same shape as the printed deck.
//
// Two jobs:
//   1. compile*(definition) → { ok, errors, value }
//      Validates a definition element by element (unknown elements, missing or
//      out-of-range parameters, conditions that cannot apply to an effect's
//      scope, name clashes with the printed deck) and returns the normalized,
//      engine-ready value with its rules text generated. Nothing reaches the
//      engine without compiling clean: createGame refuses a pack with errors.
//   2. ruleEffects / effectSum / hasEffect
//      Evaluate a climber's active rules (its own, plus those of every custom
//      gear card it owns) in a context — the engine's helpers call these at
//      each point a printed ability acts (stats, requirements, dice, costs,
//      XP, rest, training, round start). Scopes:
//        climb     a climb attempt: { route, area, isMilestone }
//        access    entering a wall: { area }
//        rest      a rest action
//        round     the start of a new round
//        training  a training session: { stat }
//        setup     game setup (unconditional)
//
// Everything here is pure and JSON-friendly; the browser bundle exposes it as
// part of window.AscentEngine so the builder UI compiles with the same code.

import { ROUTES, GEAR_SHOP, CHARACTERS } from './data.js';

export const CONTENT_SCHEMA = 'aia-content/1';
export const SUBMISSION_SCHEMA = 'aia-submission/1';
export const CONTENT_KINDS = ['character', 'route', 'gear'];

export const STATS = ['strength', 'technique', 'focus', 'flexibility'];
export const AREAS = ['bouldering', 'topRope', 'leadClimbing'];
const AREA_LABELS = { bouldering: 'Bouldering', topRope: 'Top Rope', leadClimbing: 'Lead' };
const STAT_LABELS = { strength: 'Strength', technique: 'Technique', focus: 'Focus', flexibility: 'Flexibility', all: 'every stat' };
const ALL_STATS = [...STATS, 'all'];
const OPS = ['<', '<=', '>', '>='];
const BANDS = ['easy', 'mid', 'hard'];
const BAND_LABELS = { easy: 'easy (V0–V2, 5.6–5.9)', mid: 'mid (V3–V7, 5.10–5.11)', hard: 'hard (V8+, 5.12+)' };

// The deck's vocabulary, so a custom route only uses words the rules know.
const YDS = ['5.6', '5.7', '5.8', '5.9', '5.10a', '5.10b', '5.10c', '5.10d', '5.11a', '5.11b', '5.11c', '5.11d',
  '5.12a', '5.12b', '5.12c', '5.12d', '5.13a', '5.13b', '5.13c', '5.13d', '5.14a', '5.14b', '5.14c', '5.14d'];
export const ROUTE_VOCAB = Object.freeze({
  grades: {
    bouldering: Array.from({ length: 13 }, (_, i) => `V${i}`),
    topRope: YDS,
    leadClimbing: YDS,
  },
  routeTypes: ['Slab', 'Vertical', 'Overhang', 'Traverse'],
  holdFeatures: ['Jugs', 'Pinch', 'Crimp', 'Sloper'],
  moveFeatures: ['Toe Hook', 'Heel Hook', 'Dynamic', 'Dyno', 'Roof'],
  tags: ['Pinch/Crimp', 'Toe/Heel Hook', 'Roof/Sloper', 'Dynamic'],
});
export const GEAR_CATEGORIES = ['Essential Safety Gear', 'Strategy Gear', 'Specialized Gear', 'Recovery Gear', 'Comfort Gear', 'Training Equipment'];
// Portraits a custom climber can wear (the printed climbers' art) and accents.
export const PORTRAITS = Object.keys(CHARACTERS);
export const ACCENTS = ['coral', 'teal', 'violet', 'marigold', 'raspberry', 'lime', 'cobalt'];

export const LIMITS = Object.freeze({
  rulesPerCard: 8, conditionsPerRule: 4, effectsPerRule: 4,
  charactersPerPack: 8, routesPerPack: 24, gearPerPack: 12,
});

// Grade band of a route: 0 easy (V0–V2, 5.6–5.9), 1 mid (V3–V7, 5.10–5.11),
// 2 hard (V8+, 5.12+). helpers.js re-exports this as gradeBand.
export function gradeBandOf(route) {
  const g = String((route && route.grade) || '');
  if (g.startsWith('V')) {
    const v = Number(g.slice(1));
    return v <= 2 ? 0 : v <= 7 ? 1 : 2;
  }
  const m = g.match(/^5\.(\d+)/);
  const yds = m ? Number(m[1]) : 0;
  return yds <= 9 ? 0 : yds <= 11 ? 1 : 2;
}

function compare(a, op, b) {
  if (typeof a !== 'number') return false;
  switch (op) {
    case '<': return a < b;
    case '<=': return a <= b;
    case '>': return a > b;
    case '>=': return a >= b;
    default: return false;
  }
}
const OP_WORDS = { '<': 'under', '<=': 'at most', '>': 'over', '>=': 'at least' };

// =============================================================================
// ELEMENT CATALOG
// =============================================================================
// Parameter specs: { type: 'enum', options, labels?, default? } |
// { type: 'int', min, max, nonzero?, default? } (`default` is what a builder
// starts a new element with).
// `scopes` lists where a condition can be tested; an effect has one `scope`.
// `for` says which cards may carry the element. `text` words the element.

export const CONDITIONS = Object.freeze({
  area: {
    label: 'Wall', help: 'The climb is on this wall.',
    scopes: ['climb', 'access'],
    params: { value: { type: 'enum', options: AREAS, labels: AREA_LABELS } },
    test: (c, ctx) => ctx.area === c.value,
    text: (c) => `on ${AREA_LABELS[c.value]}`,
  },
  milestone: {
    label: 'Milestone', help: 'Whether the climb is a Milestone attempt.',
    scopes: ['climb'],
    params: { value: { type: 'enum', options: ['yes', 'no'], labels: { yes: 'Milestone attempts', no: 'regular routes' } } },
    test: (c, ctx) => (ctx.isMilestone ? 'yes' : 'no') === c.value,
    text: (c) => (c.value === 'yes' ? 'on Milestone attempts' : 'on regular routes'),
  },
  routeType: {
    label: 'Route type', help: 'Slab, Vertical, Overhang or Traverse.',
    scopes: ['climb'],
    params: { value: { type: 'enum', options: ROUTE_VOCAB.routeTypes } },
    test: (c, ctx) => !!ctx.route && ctx.route.routeType === c.value,
    text: (c) => `on ${c.value} routes`,
  },
  tag: {
    label: 'Route tag', help: 'The specialty tag printed on the route.',
    scopes: ['climb'],
    params: { value: { type: 'enum', options: ROUTE_VOCAB.tags } },
    test: (c, ctx) => !!ctx.route && ctx.route.tag === c.value,
    text: (c) => `on ${c.value} routes`,
  },
  holdFeature: {
    label: 'Hold feature', help: 'The route has this kind of hold.',
    scopes: ['climb'],
    params: { value: { type: 'enum', options: ROUTE_VOCAB.holdFeatures } },
    test: (c, ctx) => !!ctx.route && (ctx.route.holdFeatures || []).includes(c.value),
    text: (c) => `on routes with ${c.value}`,
  },
  moveFeature: {
    label: 'Move feature', help: 'The route has this kind of move.',
    scopes: ['climb'],
    params: { value: { type: 'enum', options: ROUTE_VOCAB.moveFeatures } },
    test: (c, ctx) => !!ctx.route && (ctx.route.moveFeatures || []).includes(c.value),
    text: (c) => `on routes with a ${c.value}`,
  },
  gradeBand: {
    label: 'Grade band', help: 'Easy, mid or hard grades.',
    scopes: ['climb'],
    params: { value: { type: 'enum', options: BANDS, labels: BAND_LABELS } },
    test: (c, ctx) => !!ctx.route && BANDS[gradeBandOf(ctx.route)] === c.value,
    text: (c) => `on ${BAND_LABELS[c.value]} routes`,
  },
  statRequirement: {
    label: 'Route requirement', help: 'Compare one of the route\'s printed requirements with a number.',
    scopes: ['climb'],
    params: {
      stat: { type: 'enum', options: STATS, labels: STAT_LABELS },
      op: { type: 'enum', options: OPS, labels: OP_WORDS },
      value: { type: 'int', min: 0, max: 120, default: 30 },
    },
    test: (c, ctx) => !!ctx.route && compare(ctx.route[c.stat], c.op, c.value),
    text: (c) => `when the route needs ${OP_WORDS[c.op]} ${c.value} ${STAT_LABELS[c.stat]}`,
  },
  level: {
    label: 'Your Level', help: 'Compare the climber\'s Level with a number.',
    scopes: ['climb', 'access', 'rest', 'round', 'training'],
    params: { op: { type: 'enum', options: OPS, labels: OP_WORDS, default: '>=' }, value: { type: 'int', min: 1, max: 15, default: 3 } },
    test: (c, ctx, char) => compare(char.level, c.op, c.value),
    text: (c) => `at Level ${OP_WORDS[c.op]} ${c.value}`,
  },
});

const signed = (n) => (n > 0 ? `+${n}` : `${n}`);

export const EFFECTS = Object.freeze({
  statBonus: {
    label: 'Stat bonus', help: 'Add to (or take from) a stat for the climb.',
    scope: 'climb', for: ['character', 'gear'],
    params: { stat: { type: 'enum', options: ALL_STATS, labels: STAT_LABELS }, amount: { type: 'int', min: -20, max: 20, nonzero: true, default: 3 } },
    text: (e) => `${signed(e.amount)} ${STAT_LABELS[e.stat]}`,
  },
  requirementChange: {
    label: 'Requirement change', help: 'Change the route\'s requirement after the dice (negative = easier, floored at 0).',
    scope: 'climb', for: ['character', 'gear'],
    params: { stat: { type: 'enum', options: ALL_STATS, labels: STAT_LABELS }, amount: { type: 'int', min: -20, max: 20, nonzero: true, default: -3 } },
    text: (e) => `${e.stat === 'all' ? 'every requirement' : `the ${STAT_LABELS[e.stat]} requirement`} ${signed(e.amount)}`,
  },
  timeCost: {
    label: 'Time cost', help: 'Change the Time a climb costs (never below 1).',
    scope: 'climb', for: ['character', 'gear'],
    params: { amount: { type: 'int', min: -3, max: 3, nonzero: true, default: -1 } },
    text: (e) => `the climb costs ${signed(e.amount)} Time (min 1)`,
  },
  enduranceCost: {
    label: 'Endurance cost', help: 'Change the Endurance a climb costs (never below 0).',
    scope: 'climb', for: ['character', 'gear'],
    params: { amount: { type: 'int', min: -30, max: 30, nonzero: true, default: -5 } },
    text: (e) => `the climb costs ${signed(e.amount)} Endurance`,
  },
  enduranceCostScale: {
    label: 'Endurance cost %', help: 'Scale the Endurance a climb costs (rounded up).',
    scope: 'climb', for: ['character', 'gear'],
    params: { percent: { type: 'int', min: 25, max: 200, default: 75 } },
    text: (e) => `the climb costs ${e.percent}% Endurance`,
  },
  xpScale: {
    label: 'XP %', help: 'Scale the XP a climb earns.',
    scope: 'climb', for: ['character', 'gear'],
    params: { percent: { type: 'int', min: 25, max: 300, default: 125 } },
    text: (e) => `the climb earns ${e.percent}% XP`,
  },
  xpBonus: {
    label: 'XP bonus', help: 'Flat XP on a send, a fall, or either.',
    scope: 'climb', for: ['character', 'gear'],
    params: { on: { type: 'enum', options: ['send', 'fall', 'any'], labels: { send: 'a send', fall: 'a fall', any: 'any climb' } }, amount: { type: 'int', min: -50, max: 50, nonzero: true, default: 10 } },
    text: (e) => `${signed(e.amount)} XP on ${{ send: 'a send', fall: 'a fall', any: 'every climb' }[e.on]}`,
  },
  extraDie: {
    label: 'Extra die', help: 'Roll one more d6 on a stat: a buff die lowers its requirement, a nerf die raises it.',
    scope: 'climb', for: ['character', 'gear'],
    params: { stat: { type: 'enum', options: STATS, labels: STAT_LABELS }, kind: { type: 'enum', options: ['buff', 'nerf'] } },
    text: (e) => `roll an extra ${e.kind} die on ${STAT_LABELS[e.stat]}`,
  },
  negateDice: {
    label: 'Ignore dice', help: 'Nerf dice, buff dice, or every die count for nothing.',
    scope: 'climb', for: ['character', 'gear'],
    params: { kind: { type: 'enum', options: ['nerf', 'buff', 'all'], labels: { nerf: 'nerf dice', buff: 'buff dice', all: 'all dice' } } },
    text: (e) => `ignore ${{ nerf: 'every nerf die', buff: 'every buff die', all: 'every die' }[e.kind]}`,
  },
  failPenalty: {
    label: 'Fall penalty', help: 'Extra Endurance lost on a fall.',
    scope: 'climb', for: ['character', 'gear'],
    params: { amount: { type: 'int', min: 1, max: 30, default: 5 } },
    text: (e) => `a fall costs ${e.amount} extra Endurance`,
  },
  ignoreFailPenalty: {
    label: 'No fall penalty', help: 'Falls cost no extra Endurance (from any source).',
    scope: 'climb', for: ['character', 'gear'],
    params: {},
    text: () => 'falls cost no extra Endurance',
  },
  successHeal: {
    label: 'Heal on send', help: 'Recover Endurance after a send (up to your maximum).',
    scope: 'climb', for: ['character', 'gear'],
    params: { amount: { type: 'int', min: 1, max: 30, default: 5 } },
    text: (e) => `a send restores ${e.amount} Endurance`,
  },
  threeOfFour: {
    label: 'Send with 3 of 4', help: 'The climb sends when 3 stats pass and the 4th misses by at most this much.',
    scope: 'climb', for: ['character', 'gear'],
    params: { nearMiss: { type: 'int', min: 0, max: 20, default: 3 } },
    text: (e) => `send with 3 of 4 stats if the 4th misses by at most ${e.nearMiss}`,
  },
  sureSendOnly: {
    label: 'Sure sends only', help: 'May only start a climb whose printed requirements your stats (base, training, permanent gear) already meet.',
    scope: 'climb', for: ['character'],
    params: {},
    text: () => 'may only attempt climbs whose printed requirements your stats already meet',
  },
  freeAccess: {
    label: 'Free access', help: 'Climb Lead without the Lead system cards.',
    scope: 'access', for: ['character', 'gear'],
    params: {},
    text: () => 'climb Lead without the Lead system',
  },
  restBonus: {
    label: 'Rest bonus', help: 'Extra Endurance from every rest (may exceed your maximum).',
    scope: 'rest', for: ['character', 'gear'],
    params: { amount: { type: 'int', min: -20, max: 40, nonzero: true, default: 10 } },
    text: (e) => `rest restores ${signed(e.amount)} Endurance`,
  },
  betaBoostOnRest: {
    label: 'Beta Boost on rest', help: 'Resting grants a bonus to every stat on your next climb.',
    scope: 'rest', for: ['character', 'gear'],
    params: { amount: { type: 'int', min: 1, max: 10, default: 3 } },
    text: (e) => `rest grants +${e.amount} to every stat on your next climb`,
  },
  gritPerRound: {
    label: 'Grit each round', help: 'Grit gained at the start of every round after the first.',
    scope: 'round', for: ['character', 'gear'],
    params: { amount: { type: 'int', min: 1, max: 5, default: 1 } },
    text: (e) => `gain ${e.amount} Grit at the start of every round`,
  },
  timePerRound: {
    label: 'Time each round', help: 'Change the Time you start every round with.',
    scope: 'round', for: ['character', 'gear'],
    params: { amount: { type: 'int', min: -2, max: 3, nonzero: true, default: 1 } },
    text: (e) => `start every round with ${signed(e.amount)} Time`,
  },
  trainingGain: {
    label: 'Training gain', help: 'Change what a training session gives (one stat or every stat).',
    scope: 'training', for: ['character', 'gear'],
    params: { stat: { type: 'enum', options: ALL_STATS, labels: STAT_LABELS }, amount: { type: 'int', min: -4, max: 5, nonzero: true, default: 1 } },
    text: (e) => `${e.stat === 'all' ? 'training sessions' : `${STAT_LABELS[e.stat]} training`} give${e.stat === 'all' ? '' : 's'} ${signed(e.amount)}`,
  },
  trainingCapBonus: {
    label: 'Training cap', help: 'Raise the training cap in every stat.',
    scope: 'training', for: ['character', 'gear'],
    params: { amount: { type: 'int', min: 1, max: 20, default: 5 } },
    text: (e) => `your training cap is +${e.amount} in every stat`,
  },
  gritStart: {
    label: 'Starting Grit', help: 'Extra Grit at the start of the game.',
    scope: 'setup', for: ['character'],
    params: { amount: { type: 'int', min: 1, max: 10, default: 2 } },
    text: (e) => `start the game with +${e.amount} Grit`,
  },
  maxEndurance: {
    label: 'Max Endurance', help: 'Permanently change maximum Endurance while owned.',
    scope: 'setup', for: ['gear'],
    params: { amount: { type: 'int', min: -30, max: 40, nonzero: true, default: 10 } },
    text: (e) => `${signed(e.amount)} max Endurance`,
  },
});

export const SCOPES = Object.freeze(['climb', 'access', 'rest', 'round', 'training', 'setup']);

// =============================================================================
// RULES TEXT
// =============================================================================

export function describeCondition(c) {
  const spec = CONDITIONS[c && c.type];
  return spec ? spec.text(c) : '?';
}

export function describeEffect(e) {
  const spec = EFFECTS[e && e.type];
  return spec ? spec.text(e) : '?';
}

// One sentence per rule: "On Overhang routes: +5 Strength, the climb costs
// -1 Time (min 1)." Unconditional rules read "Always: …".
export function describeRule(rule) {
  const when = (rule.when || []).map(describeCondition);
  const then = (rule.then || []).map(describeEffect).join(', ');
  const head = when.length ? when.join(' and ') : 'always';
  const sentence = `${head.charAt(0).toUpperCase()}${head.slice(1)}: ${then}.`;
  return sentence;
}

export function describeRules(rules) {
  return (rules || []).map(describeRule).join(' ');
}

// =============================================================================
// COMPILING
// =============================================================================

const isInt = (v) => Number.isInteger(v);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const str = (v) => (typeof v === 'string' ? v.trim() : '');

function makeErrors() {
  const errors = [];
  const at = (path, message) => { errors.push({ path, message }); };
  return { errors, at };
}

function checkParam(spec, value) {
  if (spec.type === 'enum') {
    return spec.options.includes(value) ? null : `must be one of ${spec.options.join(', ')}`;
  }
  if (spec.type === 'int') {
    if (!isInt(value)) return 'must be a whole number';
    if (value < spec.min || value > spec.max) return `must be between ${spec.min} and ${spec.max}`;
    if (spec.nonzero && value === 0) return 'must not be 0';
    return null;
  }
  return 'unknown parameter type';
}

// Normalize one element (a condition or an effect) against `catalog`.
function compileElement(catalog, raw, path, at) {
  if (!raw || typeof raw !== 'object') { at(path, 'not an element'); return null; }
  const spec = catalog[raw.type];
  if (!spec) { at(`${path}.type`, `unknown element "${raw.type}"`); return null; }
  const out = { type: raw.type };
  let ok = true;
  for (const [name, pspec] of Object.entries(spec.params)) {
    const problem = checkParam(pspec, raw[name]);
    if (problem) { at(`${path}.${name}`, `${spec.label}: ${name} ${problem}`); ok = false; }
    else out[name] = raw[name];
  }
  return ok ? out : null;
}

// Normalize a rule list for a `kind` ('character' | 'gear').
export function compileRules(rawRules, kind, path, at) {
  if (rawRules === undefined || rawRules === null) return [];
  if (!Array.isArray(rawRules)) { at(path, 'rules must be a list'); return []; }
  if (rawRules.length > LIMITS.rulesPerCard) at(path, `at most ${LIMITS.rulesPerCard} rules per card`);
  const rules = [];
  rawRules.slice(0, LIMITS.rulesPerCard).forEach((raw, i) => {
    const rp = `${path}[${i}]`;
    if (!raw || typeof raw !== 'object') { at(rp, 'not a rule'); return; }
    const whenRaw = Array.isArray(raw.when) ? raw.when : (raw.when === undefined ? [] : null);
    const thenRaw = Array.isArray(raw.then) ? raw.then : null;
    if (whenRaw === null) { at(`${rp}.when`, 'conditions must be a list'); return; }
    if (thenRaw === null) { at(`${rp}.then`, 'a rule needs a list of effects'); return; }
    if (!thenRaw.length) { at(`${rp}.then`, 'a rule needs at least one effect'); return; }
    if (whenRaw.length > LIMITS.conditionsPerRule) at(`${rp}.when`, `at most ${LIMITS.conditionsPerRule} conditions per rule`);
    if (thenRaw.length > LIMITS.effectsPerRule) at(`${rp}.then`, `at most ${LIMITS.effectsPerRule} effects per rule`);
    const when = whenRaw.slice(0, LIMITS.conditionsPerRule).map((c, j) => compileElement(CONDITIONS, c, `${rp}.when[${j}]`, at));
    const then = thenRaw.slice(0, LIMITS.effectsPerRule).map((e, j) => compileElement(EFFECTS, e, `${rp}.then[${j}]`, at));
    if (when.includes(null) || then.includes(null)) return;
    // Every effect must be allowed on this kind of card, and every condition
    // must be testable where every effect acts.
    let valid = true;
    then.forEach((e, j) => {
      const spec = EFFECTS[e.type];
      if (!spec.for.includes(kind)) { at(`${rp}.then[${j}]`, `${spec.label} can't go on a ${kind} card`); valid = false; }
      when.forEach((c, k) => {
        const cspec = CONDITIONS[c.type];
        if (!cspec.scopes.includes(spec.scope)) {
          at(`${rp}.when[${k}]`, `"${cspec.label}" can't decide "${spec.label}" (it only applies ${spec.scope === 'climb' ? 'to climbs' : `at ${spec.scope}`})`);
          valid = false;
        }
      });
    });
    const types = then.map(e => e.type);
    if (new Set(types).size !== types.length) { at(`${rp}.then`, 'the same effect twice in one rule — change its amount instead'); valid = false; }
    if (valid) rules.push({ id: str(raw.id) || `r${i + 1}`, when, then });
  });
  return rules;
}

// djb2 over the JSON text, as base36: a short signature for memo keys.
export function rulesHash(rules) {
  const s = JSON.stringify(rules || []);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

export function slugKey(name) {
  const slug = String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32);
  return `custom-${slug || 'climber'}`;
}

const KEY_RE = /^custom-[a-z0-9-]{1,40}$/;

function checkName(name, path, at, { min = 2, max = 40 } = {}) {
  const n = str(name);
  if (n.length < min || n.length > max) at(path, `name must be ${min}–${max} characters`);
  return n;
}

function checkStatBlock(raw, path, at, min, max, label) {
  const out = {};
  for (const k of STATS) {
    const v = raw && raw[k];
    if (!isNum(v) || v < min || v > max) at(`${path}.${k}`, `${label} ${STAT_LABELS[k]} must be between ${min} and ${max}`);
    else out[k] = v;
  }
  return out;
}

// --- Climbers ---------------------------------------------------------------

export const CHARACTER_LIMITS = Object.freeze({
  stat: { min: 5, max: 40 }, statTotal: { min: 40, max: 90 },
  endurance: { min: 50, max: 160 },
  gritStart: { min: 0, max: 10 }, gritPerRound: { min: 0, max: 5 },
  growth: { min: 0, max: 6, step: 0.5 }, enduranceGrowth: { min: 0, max: 12, step: 0.5 },
});

export function compileCharacter(raw, path = 'character') {
  const { errors, at } = makeErrors();
  if (!raw || typeof raw !== 'object') { at(path, 'not a climber'); return { ok: false, errors, value: null }; }
  const L = CHARACTER_LIMITS;
  const name = checkName(raw.name, `${path}.name`, at);
  const key = str(raw.key) || slugKey(name);
  if (!KEY_RE.test(key)) at(`${path}.key`, 'key must start with "custom-" and use letters, digits and dashes');
  if (CHARACTERS[key]) at(`${path}.key`, 'key clashes with a printed climber');
  const archetype = str(raw.archetype).slice(0, 40) || 'Custom climber';
  const description = str(raw.description).slice(0, 240);
  const startingStats = checkStatBlock(raw.startingStats, `${path}.startingStats`, at, L.stat.min, L.stat.max, 'starting');
  const total = STATS.reduce((t, k) => t + (startingStats[k] || 0), 0);
  if (Object.keys(startingStats).length === 4 && (total < L.statTotal.min || total > L.statTotal.max)) {
    at(`${path}.startingStats`, `starting stats must add up to ${L.statTotal.min}–${L.statTotal.max} (now ${total})`);
  }
  const startingEndurance = raw.startingEndurance;
  if (!isInt(startingEndurance) || startingEndurance < L.endurance.min || startingEndurance > L.endurance.max) {
    at(`${path}.startingEndurance`, `starting Endurance must be a whole number between ${L.endurance.min} and ${L.endurance.max}`);
  }
  const growth = {};
  const g = raw.growth || {};
  for (const k of [...STATS, 'endurance']) {
    const lim = k === 'endurance' ? L.enduranceGrowth : L.growth;
    const v = g[k];
    if (!isNum(v) || v < lim.min || v > lim.max || Math.round(v / lim.step) * lim.step !== v) {
      at(`${path}.growth.${k}`, `${k === 'endurance' ? 'Endurance' : STAT_LABELS[k]} growth must be ${lim.min}–${lim.max} in steps of ${lim.step}`);
    } else growth[k] = v;
  }
  // Grit (the Grit rules): what the climber starts with and gains each
  // round, as plain numbers on the card. Conditional versions are rules.
  const gritField = (field, lim, label) => {
    const v = raw[field] === undefined || raw[field] === null ? 0 : raw[field];
    if (!isInt(v) || v < lim.min || v > lim.max) { at(`${path}.${field}`, `${label} must be a whole number between ${lim.min} and ${lim.max}`); return 0; }
    return v;
  };
  const gritStart = gritField('gritStart', L.gritStart, 'starting Grit');
  const gritPerRound = gritField('gritPerRound', L.gritPerRound, 'Grit each round');
  const rules = compileRules(raw.rules, 'character', `${path}.rules`, at);
  const ability = raw.specialAbility || {};
  const abilityName = str(ability.name).slice(0, 40) || 'House rules';
  const portrait = PORTRAITS.includes(raw.portrait) ? raw.portrait : PORTRAITS[0];
  const accent = ACCENTS.includes(raw.accent) ? raw.accent : 'cobalt';
  if (errors.length) return { ok: false, errors, value: null };
  const value = {
    key, name, archetype, description, portrait, accent, custom: true,
    startingStats, startingEndurance, growth, gritStart, gritPerRound,
    specialAbility: {
      name: abilityName,
      description: rules.length ? describeRules(rules) : 'No special rules.',
      used: false,
    },
    rules,
    rulesHash: rulesHash(rules),
  };
  return { ok: true, errors, value };
}

// --- Routes -----------------------------------------------------------------

export const ROUTE_LIMITS = Object.freeze({
  requirement: { min: 0, max: 99 }, time: { min: 1, max: 8 }, endurance: { min: 0, max: 100 },
  xpSuccess: { min: 5, max: 150 }, xpFail: { min: 0, max: 150 }, dice: 4, grit: { min: 0, max: 6 },
});

// The Grit a route of this grade carries under the Grit rules (what a custom
// route gets when its builder leaves the Grit field alone).
export function defaultRouteGrit(route) {
  return [2, 3, 4][gradeBandOf(route)];
}

export function compileRoute(raw, path = 'route') {
  const { errors, at } = makeErrors();
  if (!raw || typeof raw !== 'object') { at(path, 'not a route'); return { ok: false, errors, value: null }; }
  const L = ROUTE_LIMITS;
  const name = checkName(raw.name, `${path}.name`, at);
  const area = AREAS.includes(raw.area) ? raw.area : null;
  if (!area) at(`${path}.area`, `wall must be one of ${AREAS.join(', ')}`);
  if (area && (ROUTES[area] || []).some(r => r.name === name)) at(`${path}.name`, `"${name}" is already a printed ${AREA_LABELS[area]} route`);
  const grade = str(raw.grade);
  if (area && !ROUTE_VOCAB.grades[area].includes(grade)) at(`${path}.grade`, `grade must be one of ${ROUTE_VOCAB.grades[area].join(', ')}`);
  const reqs = checkStatBlock(raw, path, at, L.requirement.min, L.requirement.max, 'required');
  const intIn = (field, lim, label) => {
    const v = raw[field];
    if (!isInt(v) || v < lim.min || v > lim.max) { at(`${path}.${field}`, `${label} must be a whole number between ${lim.min} and ${lim.max}`); return null; }
    return v;
  };
  const time = intIn('time', L.time, 'Time');
  const endurance = intIn('endurance', L.endurance, 'Endurance');
  const xpSuccess = intIn('xpSuccess', L.xpSuccess, 'XP on a send');
  const xpFail = intIn('xpFail', L.xpFail, 'XP on a fall');
  if (xpSuccess !== null && xpFail !== null && xpFail > xpSuccess) at(`${path}.xpFail`, 'XP on a fall can\'t exceed XP on a send');
  const rollEffect = [];
  const dice = Array.isArray(raw.rollEffect) ? raw.rollEffect : (raw.rollEffect === undefined ? [] : null);
  if (dice === null) at(`${path}.rollEffect`, 'dice must be a list');
  else {
    if (dice.length > L.dice) at(`${path}.rollEffect`, `at most ${L.dice} dice`);
    dice.slice(0, L.dice).forEach((d, i) => {
      if (!d || !STATS.includes(d.stat) || ![1, -1].includes(d.modifier)) at(`${path}.rollEffect[${i}]`, 'a die needs a stat and a modifier of -1 (buff) or 1 (nerf)');
      else rollEffect.push({ stat: d.stat, modifier: d.modifier });
    });
  }
  const routeType = ROUTE_VOCAB.routeTypes.includes(raw.routeType) ? raw.routeType : null;
  if (!routeType) at(`${path}.routeType`, `route type must be one of ${ROUTE_VOCAB.routeTypes.join(', ')}`);
  const listOf = (field, options) => {
    const v = raw[field] === undefined ? [] : raw[field];
    if (!Array.isArray(v) || v.some(x => !options.includes(x))) { at(`${path}.${field}`, `must only list ${options.join(', ')}`); return []; }
    return [...new Set(v)];
  };
  const holdFeatures = listOf('holdFeatures', ROUTE_VOCAB.holdFeatures);
  const moveFeatures = listOf('moveFeatures', ROUTE_VOCAB.moveFeatures);
  const tag = raw.tag === null || raw.tag === undefined || raw.tag === '' ? null : raw.tag;
  if (tag !== null && !ROUTE_VOCAB.tags.includes(tag)) at(`${path}.tag`, `tag must be one of ${ROUTE_VOCAB.tags.join(', ')} or none`);
  // Grit printed on the card (Grit rules): the grade's usual amount unless the
  // builder sets one. Kept as printedGrit — `grit` on a dealt card is what is
  // left to take.
  let printedGrit = null;
  if (raw.grit !== undefined && raw.grit !== null && raw.grit !== '') {
    if (!isInt(raw.grit) || raw.grit < L.grit.min || raw.grit > L.grit.max) at(`${path}.grit`, `Grit on the card must be a whole number between ${L.grit.min} and ${L.grit.max}`);
    else printedGrit = raw.grit;
  }
  if (errors.length) return { ok: false, errors, value: null };
  const value = {
    name, area, grade, ...reqs, time, endurance, xpSuccess, xpFail, rollEffect,
    gearModifiers: [], routeType, holdFeatures, moveFeatures, tag, custom: true,
    printedGrit: printedGrit === null ? defaultRouteGrit({ grade }) : printedGrit,
  };
  return { ok: true, errors, value };
}

// --- Gear -------------------------------------------------------------------

export const GEAR_LIMITS = Object.freeze({ cost: { min: 20, max: 300 }, gritCost: { min: 1, max: 12 }, level: { min: 1, max: 15 } });

export function compileGear(raw, path = 'gear') {
  const { errors, at } = makeErrors();
  if (!raw || typeof raw !== 'object') { at(path, 'not a gear card'); return { ok: false, errors, value: null }; }
  const L = GEAR_LIMITS;
  const name = checkName(raw.name, `${path}.name`, at);
  if (GEAR_SHOP.some(g => g.name === name)) at(`${path}.name`, `"${name}" is already a printed gear card`);
  const category = GEAR_CATEGORIES.includes(raw.category) ? raw.category : null;
  if (!category) at(`${path}.category`, `category must be one of ${GEAR_CATEGORIES.join(', ')}`);
  const cost = raw.cost;
  if (!isInt(cost) || cost < L.cost.min || cost > L.cost.max) at(`${path}.cost`, `XP cost must be a whole number between ${L.cost.min} and ${L.cost.max}`);
  const gritCost = raw.gritCost;
  if (!isInt(gritCost) || gritCost < L.gritCost.min || gritCost > L.gritCost.max) at(`${path}.gritCost`, `Grit cost must be a whole number between ${L.gritCost.min} and ${L.gritCost.max}`);
  const prerequisiteLevel = raw.prerequisiteLevel === undefined ? 1 : raw.prerequisiteLevel;
  if (!isInt(prerequisiteLevel) || prerequisiteLevel < L.level.min || prerequisiteLevel > L.level.max) at(`${path}.prerequisiteLevel`, `required Level must be ${L.level.min}–${L.level.max}`);
  const description = str(raw.description).slice(0, 160);
  const rules = compileRules(raw.rules, 'gear', `${path}.rules`, at);
  if (!errors.length && !rules.length) at(`${path}.rules`, 'a gear card needs at least one rule');
  if (errors.length) return { ok: false, errors, value: null };
  const value = {
    name, category, cost, gritCost, description, prerequisiteLevel, custom: true,
    effectDisplay: describeRules(rules),
    rules, rulesHash: rulesHash(rules),
    // The printed-card fields the engine's gear code reads, as a no-op card:
    // every effect of a custom card comes from its rules.
    statEffect: 'none', value: 0, routeFilter: [], holdFeatureFilter: [],
    prerequisiteItems: [], accessRequirement: null, restBonus: 0,
  };
  return { ok: true, errors, value };
}

// --- Packs ------------------------------------------------------------------

export function emptyContentPack() {
  return { schema: CONTENT_SCHEMA, characters: {}, routes: { bouldering: [], topRope: [], leadClimbing: [] }, gear: [] };
}

// Does this pack add anything to the printed deck?
export function hasCustomContent(pack) {
  if (!pack || typeof pack !== 'object') return false;
  return Object.keys(pack.characters || {}).length > 0 ||
    AREAS.some(a => ((pack.routes || {})[a] || []).length > 0) ||
    (pack.gear || []).length > 0;
}

// Compile a whole pack. Accepts characters as a list or a keyed object, and
// routes as a flat list (each with an `area`) or by wall. Returns the
// normalized pack (characters keyed, routes by wall) or the errors.
export function compileContentPack(raw) {
  const { errors, at } = makeErrors();
  const pack = emptyContentPack();
  if (!raw || typeof raw !== 'object') { at('pack', 'not a content pack'); return { ok: false, errors, value: null }; }
  if (raw.schema !== undefined && raw.schema !== CONTENT_SCHEMA) at('pack.schema', `unknown schema "${raw.schema}"`);
  const chars = Array.isArray(raw.characters) ? raw.characters : Object.values(raw.characters || {});
  if (chars.length > LIMITS.charactersPerPack) at('pack.characters', `at most ${LIMITS.charactersPerPack} climbers in a pack`);
  chars.slice(0, LIMITS.charactersPerPack).forEach((c, i) => {
    const r = compileCharacter(c, `characters[${i}]`);
    errors.push(...r.errors);
    if (!r.ok) return;
    if (pack.characters[r.value.key]) at(`characters[${i}].key`, `two climbers share the key "${r.value.key}"`);
    else pack.characters[r.value.key] = r.value;
  });
  const routes = Array.isArray(raw.routes) ? raw.routes
    : AREAS.flatMap(a => ((raw.routes || {})[a] || []).map(r => ({ ...r, area: r.area || a })));
  if (routes.length > LIMITS.routesPerPack) at('pack.routes', `at most ${LIMITS.routesPerPack} routes in a pack`);
  routes.slice(0, LIMITS.routesPerPack).forEach((rt, i) => {
    const r = compileRoute(rt, `routes[${i}]`);
    errors.push(...r.errors);
    if (!r.ok) return;
    if (pack.routes[r.value.area].some(x => x.name === r.value.name)) at(`routes[${i}].name`, `two ${AREA_LABELS[r.value.area]} routes are called "${r.value.name}"`);
    else pack.routes[r.value.area].push(r.value);
  });
  const gear = Array.isArray(raw.gear) ? raw.gear : Object.values(raw.gear || {});
  if (gear.length > LIMITS.gearPerPack) at('pack.gear', `at most ${LIMITS.gearPerPack} gear cards in a pack`);
  gear.slice(0, LIMITS.gearPerPack).forEach((g, i) => {
    const r = compileGear(g, `gear[${i}]`);
    errors.push(...r.errors);
    if (!r.ok) return;
    if (pack.gear.some(x => x.name === r.value.name)) at(`gear[${i}].name`, `two gear cards are called "${r.value.name}"`);
    else pack.gear.push(r.value);
  });
  return { ok: errors.length === 0, errors, value: errors.length ? null : pack };
}

// =============================================================================
// LOOKUPS — the printed deck plus a pack's additions
// =============================================================================

export function characterTemplate(content, key) {
  return CHARACTERS[key] || (content && content.characters && content.characters[key]) || null;
}

export function routesForArea(content, area) {
  const extra = content && content.routes && content.routes[area];
  return extra && extra.length ? ROUTES[area].concat(extra) : ROUTES[area];
}

export function allRoutes(content) {
  const out = {};
  for (const a of AREAS) out[a] = routesForArea(content, a);
  return out;
}

export function gearPool(content) {
  const extra = content && content.gear;
  return extra && extra.length ? GEAR_SHOP.concat(extra) : GEAR_SHOP;
}

// A gear card by name: the printed deck or the game's custom cards.
export function findGear(state, name) {
  const inPrinted = GEAR_SHOP.find(g => g.name === name);
  if (inPrinted) return inPrinted;
  if (state && state.content && state.content.gear) {
    const own = state.content.gear.find(g => g.name === name);
    if (own) return own;
  }
  return null;
}

// =============================================================================
// EVALUATION — a climber's active rules in a context
// =============================================================================

// The rule sets that act for `char`: its own custom rules and the rules of
// every custom gear card it owns (copied onto the climber when bought). An
// empty list for every printed climber without custom gear.
export function activeRules(char) {
  if (!char) return [];
  const out = [];
  if (char.customRules && char.customRules.length) out.push({ source: char.name || char.key, rules: char.customRules });
  for (const g of char.gearRules || []) out.push({ source: g.gear, rules: g.rules });
  return out;
}

// Short signature of every rule acting on `char`, for memo keys.
export function rulesSignature(char) {
  if (!char) return '';
  const parts = [];
  if (char.customRules && char.customRules.length) parts.push(char.rulesHash || rulesHash(char.customRules));
  for (const g of char.gearRules || []) parts.push(g.hash || rulesHash(g.rules));
  return parts.join('+');
}

function conditionsHold(rule, ctx, char) {
  for (const c of rule.when || []) {
    const spec = CONDITIONS[c.type];
    if (!spec || !spec.test(c, ctx, char)) return false;
  }
  return true;
}

// Every effect of `type` whose rule applies in `ctx` (one entry per effect,
// tagged with the card it came from and its rule).
export function ruleEffects(char, type, ctx = {}) {
  const sets = activeRules(char);
  if (!sets.length) return [];
  const out = [];
  for (const { source, rules } of sets) {
    for (const rule of rules) {
      let hit = null;
      for (const e of rule.then || []) {
        if (e.type !== type) continue;
        if (hit === null) hit = conditionsHold(rule, ctx, char);
        if (hit) out.push({ ...e, source, ruleId: rule.id });
      }
    }
  }
  return out;
}

export function effectSum(char, type, ctx = {}, param = 'amount') {
  let total = 0;
  for (const e of ruleEffects(char, type, ctx)) total += e[param] || 0;
  return total;
}

export function hasEffect(char, type, ctx = {}) {
  return ruleEffects(char, type, ctx).length > 0;
}

// The climb-scope rules that applied to a climb, worded for the climb result:
// [{ source, ruleId, text }]. Read-only.
export function describeAppliedClimbRules(char, ctx) {
  const out = [];
  for (const { source, rules } of activeRules(char)) {
    for (const rule of rules) {
      if (!(rule.then || []).some(e => EFFECTS[e.type] && EFFECTS[e.type].scope === 'climb')) continue;
      if (!conditionsHold(rule, ctx, char)) continue;
      out.push({ source, ruleId: rule.id, text: describeRule({ ...rule, then: rule.then.filter(e => EFFECTS[e.type].scope === 'climb') }) });
    }
  }
  return out;
}

// =============================================================================
// SUBMISSIONS — a card sent for the designer's review
// =============================================================================

export const SUBMISSION_STATUSES = ['new', 'approved', 'rejected'];

// Check a submission the way the server does. Returns null when acceptable,
// else a short reason. The definition must compile.
export function validateSubmission(sub) {
  if (!sub || typeof sub !== 'object' || Array.isArray(sub)) return 'not an object';
  if (sub.schema !== SUBMISSION_SCHEMA) return 'unknown schema';
  if (typeof sub.id !== 'string' || !/^[\w.:-]{6,100}$/.test(sub.id)) return 'bad id';
  if (!CONTENT_KINDS.includes(sub.kind)) return 'bad kind';
  if (sub.author !== undefined && sub.author !== null && (typeof sub.author !== 'string' || sub.author.length > 40)) return 'bad author';
  if (sub.note !== undefined && sub.note !== null && (typeof sub.note !== 'string' || sub.note.length > 500)) return 'bad note';
  if (typeof sub.engineVersion !== 'string' || sub.engineVersion.length > 20) return 'bad engineVersion';
  const compiled = sub.kind === 'character' ? compileCharacter(sub.definition)
    : sub.kind === 'route' ? compileRoute(sub.definition) : compileGear(sub.definition);
  if (!compiled.ok) return `does not compile: ${compiled.errors[0].message}`;
  return null;
}
