// Tests for engine/stats.js — the post-game summary (summarizeGame).
//
// Run:  npm run test:engine  (runs all engine tests in sequence)
// Plays complete games with the heuristic agent and checks every number in
// the summary against an independent count of the event log or the final
// state: actions, climbs, milestones (and when they were sent), training,
// gear, XP/Grit, Time per area, the progression line and the standings.

import { createGame } from './state.js';
import { getLegalActions, applyAction } from './engine.js';
import { summarizeGame, GAME_SUMMARY_SCHEMA, SUMMARY_AREAS } from './stats.js';
import { GRIT_RULES } from './helpers.js';
import { createHeuristicAgent } from '../sim/agents/heuristic.js';

const results = [];
function check(label, cond, detail) {
  results.push({ label, pass: !!cond });
  console.log(`${cond ? '✓' : '✗'} ${label}${!cond && detail ? ` — ${detail}` : ''}`);
}

const heuristic = createHeuristicAgent();
const TIERS = ['beginner', 'intermediate', 'expert'];
const STATS = ['strength', 'technique', 'focus', 'flexibility'];

async function playToEnd(seed, characterKeys, rules = null, maxSteps = 4000) {
  let { state } = createGame({ seed, characterKeys, rules });
  for (let i = 0; i < maxSteps && !state.gameEnded; i++) {
    const legal = getLegalActions(state);
    const { actionIndex } = await heuristic.chooseAction({ state, legalActions: legal });
    ({ state } = applyAction(state, legal[actionIndex]));
  }
  return state;
}

const byType = (state, type, playerNum) =>
  state.events.filter(e => e.type === type && (playerNum === undefined || e.payload.playerNum === playerNum));

// Every summary number, checked against the raw log / final state.
function checkGame(label, state) {
  const before = JSON.stringify(state);
  const sum = summarizeGame(state);
  check(`${label}: summarizeGame does not mutate the state`, JSON.stringify(state) === before);
  check(`${label}: schema, seed and end`, sum.schema === GAME_SUMMARY_SCHEMA && sum.seed === state.seed
    && sum.ended === true && sum.winner === state.winner && sum.endReason === 'all_milestones' && sum.rounds === state.round);
  check(`${label}: summary is plain JSON`, JSON.stringify(JSON.parse(JSON.stringify(sum))) === JSON.stringify(sum));

  const actions = byType(state, 'action_chosen');
  check(`${label}: totalSteps counts every action`, sum.totalSteps === actions.length);
  check(`${label}: one roundStart per round, in order`, sum.roundStarts.length === state.round
    && sum.roundStarts.every((r, i) => r.round === i + 1 && (i === 0 || r.step > sum.roundStarts[i - 1].step)));
  check(`${label}: standings start with the winner and list everyone once`,
    sum.standings[0] === state.winner && new Set(sum.standings).size === state.players.length);

  for (const p of state.players) {
    const n = p.playerNum;
    const c = p.character;
    const s = sum.players.find(x => x.playerNum === n);
    const tag = `${label} P${n} ${c.key}`;
    const mine = actions.filter(e => e.payload.playerNum === n).map(e => e.payload.action);
    const climbs = byType(state, 'climb_resolved', n);
    const regular = climbs.filter(e => !e.payload.isMilestone);
    const milestoneClimbs = climbs.filter(e => e.payload.isMilestone);

    check(`${tag}: action and turn counts`, s.actions === mine.length && s.turns === byType(state, 'turn_start', n).length);
    check(`${tag}: climbs = climb actions, sends + falls = attempts`,
      s.climbs.attempts === mine.filter(a => a.type === 'climb').length
      && s.climbs.sends + s.climbs.falls === s.climbs.attempts
      && s.climbs.sends === regular.filter(e => e.payload.success).length);
    check(`${tag}: per-wall climbs add up`,
      Object.values(s.climbs.byArea).reduce((t, a) => t + a.attempts, 0) === s.climbs.attempts
      && Object.values(s.climbs.byArea).reduce((t, a) => t + a.sends, 0) === s.climbs.sends);
    check(`${tag}: milestone attempts = milestone actions`,
      TIERS.reduce((t, k) => t + s.milestoneAttempts[k], 0) === mine.filter(a => a.type === 'milestone').length
      && TIERS.reduce((t, k) => t + s.milestoneAttempts[k], 0) === milestoneClimbs.length);
    check(`${tag}: milestones sent match the final state`,
      s.milestones.length === TIERS.filter(t => c.milestonesCompleted[t]).length
      && s.milestones.every(m => c.milestonesCompleted[m.tier] && state.milestoneRoutes[m.tier].route.name === m.routeName)
      && s.final.milestonesCompleted === s.milestones.length);
    check(`${tag}: each milestone send is placed at its action`, s.milestones.every(m => {
      const a = actions[m.step - 1];
      return a && a.payload.playerNum === n && a.payload.action.type === 'milestone' && a.payload.action.difficulty === m.tier
        && a.payload.round === m.round;
    }));
    check(`${tag}: training by stat adds up to the final training bonuses`,
      s.trainingSessions === mine.filter(a => a.type === 'train').length
      && STATS.reduce((t, k) => t + s.training[k].sessions, 0) === s.trainingSessions
      && STATS.every(k => s.training[k].gain === c.trainingBonuses[k]));
    check(`${tag}: rests and gear`, s.rests === mine.filter(a => a.type === 'rest').length
      && s.gear.map(g => g.name).join('|') === c.equipment.join('|'));
    check(`${tag}: turns ended early`,
      s.turnsEndedEarly === byType(state, 'end_turn_chosen', n).filter(e => e.payload.timeSurrendered > 0).length);
    if (sum.currency === 'xp') {
      check(`${tag}: XP earned − XP spent on gear = final XP`, s.xpEarned - s.spentOnGear.xp === c.xp && s.spentOnGear.grit === 0);
    } else {
      check(`${tag}: Grit game spends Grit, not XP`, s.spentOnGear.xp === 0 && s.xpEarned === c.xp
        && s.spentOnGear.grit === byType(state, 'gear_purchased', n).reduce((t, e) => t + e.payload.cost, 0)
        && s.gritEarned === climbs.reduce((t, e) => t + (e.payload.gritGained || 0), 0));
    }
    const used = SUMMARY_AREAS.reduce((t, a) => t + s.timeByArea[a], 0);
    check(`${tag}: Time per area fits in the rounds played`, used > 0 && used + s.timeUnused <= state.round * 11
      && SUMMARY_AREAS.every(a => s.timeByArea[a] >= 0));
    check(`${tag}: favourite area is the one with most Time`,
      SUMMARY_AREAS.every(a => s.timeByArea[a] <= s.timeByArea[s.favouriteArea]));
    check(`${tag}: one level-up per Level gained`, s.levelUps.length === c.level - 1
      && s.levelUps.every((l, i) => l.level === i + 2));
    const prog = s.progression;
    check(`${tag}: progression runs from step 0 to the end, ending at the final Level and XP`,
      prog[0].step === 0 && prog[0].level === 1 && prog[0].xp === 0
      && prog[prog.length - 1].step === sum.totalSteps
      && prog[prog.length - 1].level === c.level && prog[prog.length - 1].xp === c.xp
      && prog.every((pt, i) => i === 0 || (pt.step >= prog[i - 1].step && pt.level >= prog[i - 1].level)));
    check(`${tag}: hardest send is a route this climber sent`, s.hardestSend === null
      || climbs.some(e => e.payload.success && e.payload.routeName === s.hardestSend.routeName));
    check(`${tag}: final stats include training and gear`, STATS.every(k =>
      s.final.stats[k] === c.stats[k] + c.trainingBonuses[k] + c.gearBonuses[k]));
  }
  const winner = sum.players.find(x => x.playerNum === state.winner);
  check(`${label}: the winner's last milestone is the game's last action`,
    winner.milestones.length === 3 && winner.milestones[2].step === sum.totalSteps);
  return sum;
}

// Complete games: standard rules (XP buys gear), solo, and the Grit economy.
await (async () => {
  checkGame('3p seed 4', await playToEnd(4, ['technician', 'ironLung', 'sprinter']));
  checkGame('4p seed 11', await playToEnd(11, ['routeReader', 'freeSolo', 'technician', 'ironLung']));
  checkGame('solo seed 5', await playToEnd(5, ['sprinter']));
  const grit = checkGame('grit 2p seed 9', await playToEnd(9, ['ironLung', 'freeSolo'], GRIT_RULES));
  check('grit game: currency is grit', grit.currency === 'grit');
})();

// A game still in progress: no winner yet, every line ends at the latest step.
{
  let { state } = createGame({ seed: 31, characterKeys: ['technician', 'sprinter'] });
  for (let i = 0; i < 40; i++) {
    const legal = getLegalActions(state);
    const { actionIndex } = await heuristic.chooseAction({ state, legalActions: legal });
    ({ state } = applyAction(state, legal[actionIndex]));
  }
  const sum = summarizeGame(state);
  check('mid-game: not ended, no winner', sum.ended === false && sum.winner === null && sum.totalSteps === 40);
  check('mid-game: every progression line reaches the latest step',
    sum.players.every(p => p.progression[p.progression.length - 1].step === 40));
}

// A fresh game: all zeroes, no favourite area.
{
  const { state } = createGame({ seed: 1, characterKeys: ['ironLung'] });
  const sum = summarizeGame(state);
  const p = sum.players[0];
  check('fresh game: nothing counted yet', sum.totalSteps === 0 && p.actions === 0 && p.climbs.attempts === 0
    && p.favouriteArea === null && p.hardestSend === null && p.progression.length === 1);
}

const failed = results.filter(r => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} stats checks passed`);
if (failed.length) process.exit(1);
