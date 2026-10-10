// Tests for engine/observe.js — the structured observation API.
//
// Run:  npm run test:engine  (runs all engine tests in sequence)
// Plays real games with the heuristic agent and checks, at every decision:
//   - one annotated action per legal action, indices aligned
//   - every climb/milestone pSend equals climbSendProbability
//   - observe() never mutates the state
//   - train/buy "milestonePSendAfter" matches applying the action for real
// plus a few targeted cases (locked Lead milestone, opponent view, text form).

import { createGame } from './state.js';
import { getLegalActions, applyAction } from './engine.js';
import { observe, observeText, OBSERVATION_SCHEMA } from './observe.js';
import { climbSendProbability } from './helpers.js';
import { createHeuristicAgent } from '../sim/agents/heuristic.js';

const results = [];
function check(label, cond, detail) {
  results.push({ label, pass: !!cond });
  console.log(`${cond ? '✓' : '✗'} ${label}${!cond && detail ? ` — ${detail}` : ''}`);
}

const heuristic = createHeuristicAgent();
const TIERS = ['beginner', 'intermediate', 'expert'];

// =============================================================================
// Invariants across real games
// =============================================================================
{
  const games = [
    { seed: 3, chars: ['technician', 'routeReader', 'sprinter'] },
    { seed: 8, chars: ['ironLung', 'freeSolo'] },
    { seed: 21, chars: ['routeReader'] },
  ];
  let decisions = 0;
  let misaligned = 0;
  let pMismatch = 0;
  let mutated = 0;
  let afterMismatch = 0;
  let firstErr = '';
  for (const g of games) {
    let { state: s } = createGame({ seed: g.seed, characterKeys: g.chars });
    for (let step = 0; step < 150 && !s.gameEnded; step++) {
      const legal = getLegalActions(s);
      const snapshot = JSON.stringify(s);
      const obs = observe(s, { legalActions: legal });
      decisions++;
      if (JSON.stringify(s) !== snapshot) mutated++;
      if (obs.actions.length !== legal.length || obs.actions.some((a, i) => a.i !== i || a.type !== legal[i].type)) {
        misaligned++;
        if (!firstErr) firstErr = `step ${step}: ${obs.actions.length} vs ${legal.length}`;
      }
      const me = s.players[s.currentPlayerIndex];
      const attempted = s.attemptedRoutes[me.playerNum] || {};
      for (const a of obs.actions) {
        const act = legal[a.i];
        let expected = null;
        if (act.type === 'climb') {
          const route = s.availableRoutes[act.area].find(r => r.name === act.routeName);
          expected = climbSendProbability(me.character, route, act.area, attempted, { shift: act.shift || null }).pSend;
        } else if (act.type === 'milestone') {
          const m = s.milestoneRoutes[act.difficulty];
          expected = climbSendProbability(me.character, m.route, m.area, attempted, { isMilestone: true }).pSend;
        }
        if (expected !== null && Math.abs(a.pSend - expected) > 0.0005) {
          pMismatch++;
          if (!firstErr) firstErr = `${act.type} ${act.routeName}: ${a.pSend} vs ${expected}`;
        }
        if ((act.type === 'train' || act.type === 'buyGear') && a.milestonePSendAfter) {
          const { state: next } = applyAction({ ...s, events: [] }, act);
          const c2 = next.players[s.currentPlayerIndex].character;
          for (const [tier, v] of Object.entries(a.milestonePSendAfter)) {
            const m = s.milestoneRoutes[tier];
            const p = climbSendProbability(c2, m.route, m.area, {}, { isMilestone: true }).pSend;
            if (Math.abs(p - v.to) > 0.0005) afterMismatch++;
          }
        }
      }
      const pick = await heuristic.chooseAction({ state: s, legalActions: legal });
      ({ state: s } = applyAction(s, legal[pick.actionIndex]));
      s.events.length = 0;
    }
  }
  check(`observed ${decisions} decisions`, decisions > 300);
  check('one annotated action per legal action, indices aligned', misaligned === 0, firstErr);
  check('every climb/milestone pSend equals climbSendProbability', pMismatch === 0, firstErr);
  check('observe() never mutates the state', mutated === 0, `${mutated} mutations`);
  check('train/buy milestonePSendAfter matches applying the action', afterMismatch === 0, `${afterMismatch} mismatches`);
}

// =============================================================================
// Targeted cases
// =============================================================================
{
  const { state } = createGame({ seed: 4, characterKeys: ['ironLung', 'technician'] });
  const obs = observe(state);
  check('schema tag', obs.schema === OBSERVATION_SCHEMA);
  check('three milestones described', obs.milestones.length === 3 && TIERS.every((t, i) => obs.milestones[i].tier === t));
  const lead = obs.milestones.find(m => m.wall === 'leadClimbing');
  check('Lead milestone is locked without access cards',
    lead && lead.access !== 'open' && lead.access.missing.length === 3, JSON.stringify(lead && lead.access));
  check('every open milestone has a training plan',
    obs.milestones.every(m => m.done || (m.trainingPlan && m.trainingPlan.perSession === 5)));
  check('opponent view has milestone pSend but no action list',
    obs.opponents.length === 1 && typeof obs.opponents[0].milestonePSend === 'object' && !('xp' in obs.opponents[0]));
  check('xp breakdown present', obs.you.xp.total === 0 && obs.you.xp.spendable === 0 && obs.you.xp.toNextLevel === 100);
  check('Setter starts on Lead', obs.setterResetsNext === 'leadClimbing');

  const waiting = observe(state, { seat: 1 });
  check('observing an idle seat: yourTurn false, actions null', waiting.yourTurn === false && waiting.actions === null);

  // Free Solo needs no Lead access.
  const { state: fs } = createGame({ seed: 4, characterKeys: ['freeSolo'] });
  const fsLead = observe(fs).milestones.find(m => m.wall === 'leadClimbing');
  check('Free Solo Lead milestone is open', fsLead && fsLead.access === 'open');

  // Training toward a milestone shows up as a pSend gain.
  const { state: tr } = createGame({ seed: 4, characterKeys: ['ironLung'] });
  const c = tr.players[0].character;
  const m = tr.milestoneRoutes.beginner;
  // Every stat comfortably clear except one, sitting 2 below its worst-case
  // requirement (printed + 6 per red die): one +5 session makes it certain.
  const STATS = ['strength', 'technique', 'focus', 'flexibility'];
  for (const k of STATS) c.trainingBonuses[k] = m.route[k] - c.stats[k] + 20;
  const weakStat = STATS[0];
  const reds = (m.route.rollEffect || []).filter(e => e.stat === weakStat && e.modifier === 1).length;
  c.trainingBonuses[weakStat] = m.route[weakStat] + 6 * reds - 2 - c.stats[weakStat];
  const o2 = observe(tr);
  const trainWeak = o2.actions.find(a => a.type === 'train' && a.stat === weakStat);
  if (trainWeak) {
    const eff = trainWeak.milestonePSendAfter.beginner;
    check('training the short stat raises the milestone pSend', eff && eff.to > eff.from, JSON.stringify(trainWeak.milestonePSendAfter));
  } else {
    check('training the short stat raises the milestone pSend (station available)', false, 'no train action for ' + weakStat);
  }

  const text = observeText(obs);
  check('observeText renders milestones and actions', text.includes('Milestones:') && text.includes('Actions:'));
  check('observeText is compact (< 3,000 chars)', text.length < 3000, `${text.length} chars`);
}

const failed = results.filter(r => !r.pass);
if (failed.length) {
  console.error(`\n${failed.length} of ${results.length} observe assertions FAILED.`);
  process.exit(1);
}
console.log(`\nAll ${results.length} observe assertions passed.`);
