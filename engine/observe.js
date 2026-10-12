// Structured observation API — the game as a CPU should see it.
//
//   observe(state, { seat, legalActions }) → plain JSON object
//   observeText(obs)                       → compact text rendering of it
//
// Why this exists (docs/CPU_PLAYTEST_AUDIT.md §3.3, §5): every bot so far did
// its own arithmetic about the game, and got it wrong in different ways — the
// heuristic ignored Perfect Beta and Versatility, the LLM prompt showed gaps
// against printed requirements and never a probability. This module computes
// every number a decision needs WITH THE ENGINE'S OWN CODE, so a bot (search,
// heuristic, or LLM) only has to choose:
//
//   - pSend for every legal climb and milestone, exact over all dice
//     (helpers.climbSendProbability — the same dice procedure as applyAction,
//     character abilities, Beta Boost, stat shifts and dice gear included);
//   - for each milestone, how many training sessions (and in which stats)
//     reach a 50% and a 90% send chance;
//   - what each training session or gear purchase does to every milestone's
//     pSend (computed by applying the action to a copy of the state);
//   - resource facts that are easy to forget: spendable XP vs XP to the next
//     Level, Endurance that does not refill between rounds, who holds which
//     station, which wall the Setter resets next.
//
// `actions[k].i` is the index into the legal-action array the observation was
// built from, so a bot answers with `legalActions[obs.actions[k].i]`.
//
// Read-only: never mutates `state`.

import { CHARACTERS, GEAR_SHOP, TRAINING_AREAS, XP_TABLE } from './data.js';
import { getLegalActions, applyAction } from './engine.js';
import { ENGINE_VERSION_STRING } from './version.js';
import { ACCESS_CARDS } from './state.js';
import {
  checkAreaAccess, climbSendProbability, computeClimbXp, computeRestRecovery,
  getEffectiveClimbEnduranceCost, getEffectiveClimbTimeCost,
  usesGrit, gearPrice, gearFunds, trainingGritCost, milestoneGritReward, trainingCap,
  getFailureEnduranceExtra, getSpendableXp, getSuccessEnduranceHeal,
  canUseStatShift, trainingSpec,
} from './helpers.js';

export const OBSERVATION_SCHEMA = 'aia-observation/1';

const STATS = ['strength', 'technique', 'focus', 'flexibility'];
const TIERS = ['beginner', 'intermediate', 'expert'];
const SETTER_WALLS = ['leadClimbing', 'topRope', 'bouldering']; // routeClearingPosition 0/1/2
const PLAN_CAP = 40; // training-plan search stops after this many sessions
const round3 = (x) => Math.round(x * 1000) / 1000;

// =============================================================================
// observe
// =============================================================================

// Options:
//   seat          whose view (default: the player to act)
//   legalActions  the array to annotate (default: getLegalActions(state))
//   plans         include each milestone's training plan (default true; the
//                 costliest part — bots that model training themselves skip it)
//   effects       include train/buy milestonePSendAfter (default true)
export function observe(state, {
  seat = state.currentPlayerIndex, legalActions = null, plans = true, effects = true,
} = {}) {
  const player = state.players[seat];
  if (!player) throw new Error(`observe: no player at seat ${seat}`);
  const yourTurn = !state.gameEnded && seat === state.currentPlayerIndex;

  const obs = {
    schema: OBSERVATION_SCHEMA,
    engineVersion: ENGINE_VERSION_STRING,
    round: state.round,
    seat,
    playerNum: player.playerNum,
    yourTurn,
    gameOver: !!state.gameEnded,
    // Most Time left acts next; a tie keeps the current climber acting,
    // otherwise seat order. Listed so a bot can see who acts after it.
    timeLeft: state.players.map(p => ({ playerNum: p.playerNum, time: p.character.timeRemaining })),
    setterResetsNext: SETTER_WALLS[state.routeClearingPosition],
    you: describePlayer(state, seat, { full: true }),
    milestones: TIERS.map(tier => describeMilestone(state, seat, tier, plans)),
    opponents: state.players
      .map((_, i) => i)
      .filter(i => i !== seat)
      .map(i => describePlayer(state, i, { full: false })),
    board: describeBoard(state),
    actions: null,
  };

  if (yourTurn) {
    const legal = legalActions || getLegalActions(state);
    obs.actions = legal.map((a, i) => describeAction(state, seat, a, i, effects));
  }
  return obs;
}

// =============================================================================
// Players
// =============================================================================

function describePlayer(state, seat, { full }) {
  const p = state.players[seat];
  const c = p.character;
  const milestonesDone = TIERS.filter(t => c.milestonesCompleted[t]);
  const out = {
    seat,
    playerNum: p.playerNum,
    character: c.key,
    level: c.level,
    milestonesDone,
    time: c.timeRemaining,
    endurance: { current: c.currentEndurance, max: c.maxEndurance },
    location: c.location,
  };
  if (!full) {
    // Threat: this opponent's send chance on each milestone they still need.
    out.milestonePSend = {};
    for (const tier of TIERS) {
      if (c.milestonesCompleted[tier]) continue;
      const m = state.milestoneRoutes[tier];
      out.milestonePSend[tier] = round3(climbSendProbability(c, m.route, m.area, {}, { isMilestone: true }).pSend);
    }
    out.equipment = [...c.equipment];
    return out;
  }

  const next = XP_TABLE.find(r => r.level === c.level + 1);
  const total = Object.fromEntries(STATS.map(k => [k, c.stats[k] + c.trainingBonuses[k] + c.gearBonuses[k]]));
  const rest = computeRestRecovery(c);
  if (usesGrit(state.rules)) {
    // Grit economy: Grit buys training and gear; XP only raises your Level.
    out.grit = c.grit || 0;
    out.trainingCap = Number.isFinite(trainingCap(state.rules, c)) ? trainingCap(state.rules, c) : null;
  }
  out.xp = {
    total: c.xp,
    // Spending XP moves you back toward the start of your Level; it never
    // costs a Level, but it delays the next one.
    spendable: getSpendableXp(c),
    toNextLevel: next ? Math.max(0, next.cumulative - c.xp) : null,
  };
  out.stats = { total, base: { ...c.stats }, training: { ...c.trainingBonuses }, gear: { ...c.gearBonuses } };
  // Resting refills toward max + rest-bonus gear (it can go above max).
  out.endurance.restCap = c.maxEndurance + rest.restBonusApplied;
  out.equipment = [...c.equipment];
  out.ability = describeAbility(c);
  return out;
}

function describeAbility(c) {
  const a = { name: (CHARACTERS[c.key] || c).specialAbility.name, rules: c.custom ? c.specialAbility.description : abilityRules(c.key) };
  if (c.key === 'routeReader') {
    a.betaBoostActive = !!c.betaBoostActive;
    a.statShiftAvailable = canUseStatShift(c, false);
  }
  return a;
}

// One-line, engine-accurate summary of each ability (what pSend already
// accounts for). Kept here rather than in game data so it states the rule the
// engine implements, not the flavour text.
function abilityRules(key) {
  switch (key) {
    case 'ironLung': return 'Fall: +50% XP and -5 extra Endurance (Mental Anchor removes the Endurance loss).';
    case 'technician': return 'Every requirement -5; red Crux dice ignored; Milestone attempts +1 Time.';
    case 'sprinter': return 'Every climb -2 Time (min 1); climbs earn 85% XP; +1 red Crux die on Focus every climb.';
    case 'routeReader': return 'Send with 3 of 4 stats if the 4th misses by 3 or less; Rest grants +3 all stats on the next climb; once per round move up to 10 points between stats for one climb (Milestones included).';
    case 'freeSolo': return 'No Lead access cards needed; all dice ignored, never falls; may only start a climb whose requirements base+training+permanent gear already meet; gains 2 Grit every round (Grit rules).';
    default: return '';
  }
}

// =============================================================================
// Milestones
// =============================================================================

function describeMilestone(state, seat, tier, plans = true) {
  const c = state.players[seat].character;
  const m = state.milestoneRoutes[tier];
  const r = m.route;
  const access = checkAreaAccess(c, m.area);
  const out = {
    tier,
    route: r.name,
    grade: r.grade,
    wall: m.area,
    tag: r.tag || null,
    requirements: pickStats(r),
    dice: describeDice(r),
    time: getEffectiveClimbTimeCost(c, r.time, r, true, m.area),
    endurance: getEffectiveClimbEnduranceCost(c, r, r.endurance, m.area, true),
    done: !!c.milestonesCompleted[tier],
  };
  if (out.done) return out;
  out.access = access.hasAccess ? 'open' : { missing: access.missingItems };
  const now = climbSendProbability(c, r, m.area, {}, { isMilestone: true });
  // pSend if attempted with current stats (ignores Time/Endurance/station);
  // Free Solo additionally may not start unless it is 1.
  out.pSend = round3(now.pSend);
  if (plans) out.trainingPlan = trainingPlan(c, r, m.area, state.rules);
  return out;
}

// Greedy training plan: repeatedly add one session to whichever stat raises
// this milestone's send chance most (ties broken by expected deciding
// margin), and report the session counts at which pSend first reaches 0.5
// and 0.9. Counts sessions only — not Time, Endurance or station contention.
function trainingPlan(char, route, area, rules = null) {
  const gain = trainingSpec(rules, TRAINING_AREAS[0], char).gain;
  const cap = trainingCap(rules, char);
  const sim = { ...char, trainingBonuses: { ...char.trainingBonuses } };
  const alloc = Object.fromEntries(STATS.map(k => [k, 0]));
  const plan = { perSession: gain, to50: null, to90: null };
  let cur = climbSendProbability(sim, route, area, {}, { isMilestone: true });
  for (let n = 0; n <= PLAN_CAP; n++) {
    if (!plan.to50 && cur.pSend >= 0.5) plan.to50 = { sessions: n, train: nonZero(alloc) };
    if (!plan.to90 && cur.pSend >= 0.9) { plan.to90 = { sessions: n, train: nonZero(alloc) }; break; }
    if (n === PLAN_CAP) break;
    let best = null;
    for (const k of STATS) {
      if (sim.trainingBonuses[k] + gain > cap) continue; // rules-variant cap at this Level
      sim.trainingBonuses[k] += gain;
      const r = climbSendProbability(sim, route, area, {}, { isMilestone: true });
      sim.trainingBonuses[k] -= gain;
      if (!best || r.pSend > best.r.pSend + 1e-12 ||
          (Math.abs(r.pSend - best.r.pSend) <= 1e-12 && r.expectedMargin > best.r.expectedMargin)) {
        best = { k, r };
      }
    }
    if (!best) break; // every stat at its cap
    sim.trainingBonuses[best.k] += gain;
    alloc[best.k]++;
    cur = best.r;
  }
  if (!plan.to90) plan.beyondCap = PLAN_CAP;
  return plan;
}

function nonZero(alloc) {
  return Object.fromEntries(Object.entries(alloc).filter(([, v]) => v > 0));
}

// =============================================================================
// Board
// =============================================================================

function describeBoard(state) {
  const holder = (pred) => {
    const p = state.players.find(pl => pred(pl.character));
    return p ? p.playerNum : null;
  };
  const topRope = [];
  for (let b = 0; b < state.belayerCount; b++) {
    topRope.push({
      station: b,
      routes: state.availableRoutes.topRope.filter(r => r.belayer === b).map(r => r.name),
      heldBy: holder(c => c.location === 'topRope' && c.belayerStation === b),
    });
  }
  return {
    trainingStations: TRAINING_AREAS.map(t => ({
      station: t.name, stat: t.stat, time: t.time, endurance: t.endurance,
      heldBy: holder(c => c.location === t.name),
    })),
    topRopeStations: topRope,
    leadHeldBy: holder(c => c.location === 'leadClimbing'),
    walls: {
      bouldering: state.availableRoutes.bouldering.map(r => r.name),
      topRope: state.availableRoutes.topRope.map(r => r.name),
      leadClimbing: state.availableRoutes.leadClimbing.map(r => r.name),
    },
    gearMarket: state.availableGear.map(g => g.name),
    accessCards: [...ACCESS_CARDS],
  };
}

// =============================================================================
// Actions
// =============================================================================

function describeAction(state, seat, a, i, effects = true) {
  const c = state.players[seat].character;
  const attempted = state.attemptedRoutes[state.players[seat].playerNum] || {};
  switch (a.type) {
    case 'climb': {
      const route = state.availableRoutes[a.area].find(r => r.name === a.routeName);
      const out = {
        i, type: 'climb', wall: a.area, route: route.name, grade: route.grade, tag: route.tag || null,
        ...(a.area === 'topRope' ? { station: route.belayer } : {}),
        ...climbNumbers(c, route, a.area, attempted, { isMilestone: false, shift: a.shift || null }),
        ...(usesGrit(state.rules) ? { gritOnCard: route.grit || 0 } : {}),
      };
      if (a.shift) out.shift = { ...a.shift };
      return out;
    }
    case 'milestone': {
      const m = state.milestoneRoutes[a.difficulty];
      const others = TIERS.filter(t => t !== a.difficulty);
      return {
        i, type: 'milestone', tier: a.difficulty, wall: m.area, route: m.route.name, grade: m.route.grade,
        ...climbNumbers(c, m.route, m.area, attempted, { isMilestone: true, shift: a.shift || null }),
        ...(a.shift ? { shift: { ...a.shift } } : {}),
        sendWinsGame: others.every(t => c.milestonesCompleted[t]),
        ...(usesGrit(state.rules) ? { gritReward: milestoneGritReward(state.rules, a.difficulty) } : {}),
      };
    }
    case 'train': {
      const t = TRAINING_AREAS.find(x => x.name === a.areaName);
      const spec = trainingSpec(state.rules, t, c);
      return {
        i, type: 'train', station: t.name, stat: t.stat,
        gain: spec.gain, time: spec.time, endurance: spec.endurance,
        ...(usesGrit(state.rules) ? { gritCost: trainingGritCost(state.rules, c) } : {}),
        ...(effects ? { milestonePSendAfter: milestoneEffect(state, seat, a) } : {}),
      };
    }
    case 'rest': {
      const rest = computeRestRecovery(c);
      const out = { i, type: 'rest', time: 1, enduranceAfter: rest.newEndurance };
      if (c.key === 'routeReader') out.grantsBetaBoost = true;
      return out;
    }
    case 'buyGear': {
      const g = GEAR_SHOP.find(x => x.name === a.gearName);
      // Priced in XP, or in Grit under the Grit-economy rules.
      const cost = gearPrice(state.rules, c, g);
      const out = {
        i, type: 'buyGear', card: g.name, cost, currency: usesGrit(state.rules) ? 'grit' : 'xp',
        time: 1, effect: g.effectDisplay || g.description || '',
        spendableAfter: gearFunds(state.rules, c) - cost,
      };
      const after = effects ? milestoneEffect(state, seat, a) : {};
      if (Object.keys(after).length) out.milestonePSendAfter = after;
      return out;
    }
    case 'endTurn':
      return { i, type: 'endTurn', timeForfeited: c.timeRemaining };
    default:
      return { i, type: a.type };
  }
}

function climbNumbers(c, route, area, attempted, { isMilestone, shift }) {
  const { pSend } = climbSendProbability(c, route, area, attempted, { isMilestone, shift });
  const climb = { route, area, isMilestone };
  const xpSend = computeClimbXp(c, route, true, climb);
  const xpFall = computeClimbXp(c, route, false, climb);
  return {
    time: getEffectiveClimbTimeCost(c, route.time, route, isMilestone, area),
    endurance: getEffectiveClimbEnduranceCost(c, route, route.endurance, area, isMilestone),
    pSend: round3(pSend),
    xp: { send: xpSend, fall: xpFall, expected: round3(pSend * xpSend + (1 - pSend) * xpFall) },
    fallExtraEndurance: getFailureEnduranceExtra(c, climb),
    sendHeal: getSuccessEnduranceHeal(c, climb),
  };
}

// pSend on each unfinished milestone after taking `action`, for the milestones
// whose pSend it changes. Applies the action to a stripped copy of the state
// with the real engine, so it reflects exactly what the purchase / session does.
function milestoneEffect(state, seat, action) {
  const before = state.players[seat].character;
  const copy = { ...state, events: [] };
  const { state: next } = applyAction(copy, action);
  const after = next.players[seat].character;
  const out = {};
  for (const tier of TIERS) {
    if (before.milestonesCompleted[tier]) continue;
    const m = state.milestoneRoutes[tier];
    const p0 = climbSendProbability(before, m.route, m.area, {}, { isMilestone: true }).pSend;
    const p1 = climbSendProbability(after, m.route, m.area, {}, { isMilestone: true }).pSend;
    if (Math.abs(p1 - p0) > 1e-9) out[tier] = { from: round3(p0), to: round3(p1) };
  }
  return out;
}

function pickStats(r) {
  return { strength: r.strength, technique: r.technique, focus: r.focus, flexibility: r.flexibility };
}

function describeDice(r) {
  return (r.rollEffect || []).map(e => ({ stat: e.stat, die: e.modifier === -1 ? 'beta' : 'crux' }));
}

// =============================================================================
// observeText — compact rendering for an LLM prompt or a log line
// =============================================================================

const SHORT = { strength: 'Str', technique: 'Tec', focus: 'Foc', flexibility: 'Flx' };
const fmtStats = (s) => STATS.map(k => `${SHORT[k]}${s[k]}`).join(' ');
const pct = (p) => `${Math.round(p * 100)}%`;
const fmtTrain = (t) => Object.entries(t).map(([k, v]) => `${SHORT[k]}×${v}`).join(' ') || 'none';

export function observeText(obs) {
  const y = obs.you;
  const L = [];
  L.push(`Round ${obs.round} · You: P${y.playerNum} ${y.character} L${y.level} · ${obs.yourTurn ? 'your turn' : 'waiting'}`);
  L.push(`Stats ${fmtStats(y.stats.total)} · End ${y.endurance.current}/${y.endurance.max} (no refill between rounds) · Time ${y.time}`);
  L.push(y.grit !== undefined
    ? `Grit ${y.grit} · XP ${y.xp.total} (${y.xp.toNextLevel ?? '—'} to next Level; XP is never spent)${y.trainingCap !== null ? ` · training cap +${y.trainingCap}/stat` : ''} · Gear: ${y.equipment.join(', ') || 'none'}`
    : `XP ${y.xp.total} (spendable ${y.xp.spendable}, ${y.xp.toNextLevel ?? '—'} to next Level) · Gear: ${y.equipment.join(', ') || 'none'}`);
  L.push(`Ability ${y.ability.name}: ${y.ability.rules}${y.ability.betaBoostActive ? ' [Beta Boost ACTIVE]' : ''}`);
  L.push('Milestones:');
  for (const m of obs.milestones) {
    if (m.done) { L.push(`  ${m.tier}: ${m.route} — DONE`); continue; }
    const acc = m.access === 'open' ? '' : ` · LOCKED, need ${m.access.missing.join(' + ')}`;
    const plan = m.trainingPlan;
    if (!plan) { L.push(`  ${m.tier}: ${m.route} ${m.grade} ${m.wall} · pSend ${pct(m.pSend)}${acc}`); continue; }
    const p50 = plan.to50 ? `${plan.to50.sessions} (${fmtTrain(plan.to50.train)})` : `>${PLAN_CAP}`;
    const p90 = plan.to90 ? `${plan.to90.sessions} (${fmtTrain(plan.to90.train)})` : `>${PLAN_CAP}`;
    L.push(`  ${m.tier}: ${m.route} ${m.grade} ${m.wall} · pSend ${pct(m.pSend)}${acc} · sessions to 50%: ${p50}, to 90%: ${p90}`);
  }
  for (const o of obs.opponents) {
    const threat = Object.entries(o.milestonePSend).map(([t, p]) => `${t[0]}${pct(p)}`).join(' ');
    L.push(`Opp P${o.playerNum} ${o.character} L${o.level} · done ${o.milestonesDone.join(',') || '-'} · pSend ${threat || '-'} · time ${o.time}`);
  }
  L.push(`Setter resets ${obs.setterResetsNext} at round end.`);
  if (obs.actions) {
    L.push('Actions:');
    for (const a of obs.actions) L.push(`  ${a.i}. ${actionLine(a)}`);
  }
  return L.join('\n');
}

function actionLine(a) {
  switch (a.type) {
    case 'climb': return `climb ${a.route} (${a.wall}) pSend ${pct(a.pSend)} · T${a.time} E${a.endurance} · XP ${a.xp.send}/${a.xp.fall}${a.gritOnCard ? ` · ${a.gritOnCard} Grit on card` : ''}${a.shift ? ` · shift ${a.shift.amount} ${SHORT[a.shift.from]}→${SHORT[a.shift.to]}` : ''}`;
    case 'milestone': return `MILESTONE ${a.tier} ${a.route} pSend ${pct(a.pSend)} · T${a.time} E${a.endurance}${a.gritReward ? ` · +${a.gritReward} Grit` : ''}${a.sendWinsGame ? ' · SEND WINS' : ''}`;
    case 'train': return `train ${SHORT[a.stat]} +${a.gain} · T${a.time} E${a.endurance}${a.gritCost !== undefined ? ` · ${a.gritCost} Grit` : ''}${effectLine(a.milestonePSendAfter)}`;
    case 'rest': return `rest → End ${a.enduranceAfter}${a.grantsBetaBoost ? ' · Beta Boost' : ''}`;
    case 'buyGear': return `buy ${a.card} (${a.cost} ${a.currency === 'grit' ? 'grit' : 'XP'} → ${a.spendableAfter} left): ${a.effect}${effectLine(a.milestonePSendAfter)}`;
    case 'endTurn': return `call it a day (forfeit ${a.timeForfeited} Time)`;
    default: return a.type;
  }
}

function effectLine(after) {
  if (!after || !Object.keys(after).length) return '';
  return ' · ' + Object.entries(after).map(([t, v]) => `${t} ${pct(v.from)}→${pct(v.to)}`).join(' ');
}
