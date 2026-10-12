// End-of-game statistics — the numbers behind the post-game summary.
//
//   summarizeGame(state) → plain JSON object (schema GAME_SUMMARY_SCHEMA)
//
// Read-only and derived ONLY from state.events (the engine's complete event
// log) plus the final players, so local play, online play (the server sends
// clients the full state) and offline analysis all get identical numbers from
// one function. The UI only lays these numbers out; it never counts events
// itself.
//
// "step" is the number of actions taken so far in the whole game (every
// action_chosen event is one step), so a progression chart can place a
// level-up or a milestone send exactly where it happened; roundStarts maps
// steps back to rounds for the axis.

import { usesGrit } from './helpers.js';
import { routesForArea } from './content.js';

export const GAME_SUMMARY_SCHEMA = 'aia-game-summary/1';

const SUMMARY_STATS = ['strength', 'technique', 'focus', 'flexibility'];
const SUMMARY_TIERS = ['beginner', 'intermediate', 'expert'];
// Where a climber spent their Time, in board order: the three walls, the
// milestone projects (a separate board section, whatever wall they hang on),
// the training floor, the gear shop and the rest area.
export const SUMMARY_AREAS = ['bouldering', 'topRope', 'leadClimbing', 'milestone', 'training', 'gearShop', 'rest'];

// A route's difficulty for "hardest send": the sum of its printed stat
// requirements (V-grades and YDS grades can't be compared with each other).
// Custom routes (state.content) count like printed ones.
function routeDifficulty(state, area, routeName) {
  const route = (routesForArea(state.content, area) || []).find(r => r.name === routeName);
  return route ? SUMMARY_STATS.reduce((sum, k) => sum + (route[k] || 0), 0) : 0;
}

function newPlayerSummary(p) {
  const c = p.character;
  const timeByArea = {};
  for (const a of SUMMARY_AREAS) timeByArea[a] = 0;
  const training = {};
  for (const s of SUMMARY_STATS) training[s] = { sessions: 0, gain: 0 };
  const climbsByArea = {};
  for (const a of ['bouldering', 'topRope', 'leadClimbing']) climbsByArea[a] = { attempts: 0, sends: 0 };
  return {
    playerNum: p.playerNum,
    characterKey: c.key,
    characterName: c.name,
    turns: 0,
    actions: 0,
    climbs: { attempts: 0, sends: 0, falls: 0, byArea: climbsByArea },
    milestoneAttempts: { beginner: 0, intermediate: 0, expert: 0 },
    milestones: [],              // { tier, step, round, routeName, area, grade }, in send order
    hardestSend: null,           // { routeName, grade, area, isMilestone, round }
    training,
    trainingSessions: 0,
    rests: 0,
    enduranceRecovered: 0,
    turnsEndedEarly: 0,          // endTurn with Time still left
    timeUnused: 0,               // Time given up by ending a turn early
    timeByArea,
    favouriteArea: null,
    gear: [],                    // { name, round, cost, currency }
    spentOnGear: { xp: 0, grit: 0 },
    xpEarned: 0,
    gritEarned: 0,
    levelUps: [],                // { level, step, round }
    progression: [{ step: 0, round: 1, level: 1, xp: 0 }],
    final: null,
  };
}

export function summarizeGame(state) {
  const players = {};
  const order = [];
  for (const p of state.players) {
    players[p.playerNum] = newPlayerSummary(p);
    order.push(p.playerNum);
  }
  const roundStarts = [{ round: 1, step: 0 }];
  let step = 0;
  let round = 1;
  const bestDifficulty = {};     // playerNum → difficulty of hardestSend

  for (const e of state.events || []) {
    const p = e.payload || {};
    switch (e.type) {
      case 'action_chosen':
        step++;
        round = p.round;
        if (players[p.playerNum]) players[p.playerNum].actions++;
        break;
      case 'turn_start':
        if (players[p.playerNum]) players[p.playerNum].turns++;
        break;
      case 'round_start':
        round = p.round;
        roundStarts.push({ round: p.round, step });
        break;
      case 'climb_resolved': {
        const s = players[p.playerNum];
        if (!s) break;
        const time = -(p.resourcesDelta?.time?.delta ?? -(p.timeCost || 0));
        if (p.isMilestone) {
          s.timeByArea.milestone += time;
          if (s.milestoneAttempts[p.difficulty] !== undefined) s.milestoneAttempts[p.difficulty]++;
          if (p.success) {
            s.milestones.push({ tier: p.difficulty, step, round, routeName: p.routeName, area: p.area, grade: p.grade });
          }
        } else {
          s.timeByArea[p.area] = (s.timeByArea[p.area] || 0) + time;
          s.climbs.attempts++;
          if (s.climbs.byArea[p.area]) s.climbs.byArea[p.area].attempts++;
          if (p.success) {
            s.climbs.sends++;
            if (s.climbs.byArea[p.area]) s.climbs.byArea[p.area].sends++;
          } else {
            s.climbs.falls++;
          }
        }
        if (p.success) {
          const d = routeDifficulty(state, p.area, p.routeName);
          if (s.hardestSend === null || d > bestDifficulty[p.playerNum]) {
            bestDifficulty[p.playerNum] = d;
            s.hardestSend = { routeName: p.routeName, grade: p.grade, area: p.area, isMilestone: !!p.isMilestone, round };
          }
        }
        s.xpEarned += p.xpGained || 0;
        s.gritEarned += p.gritGained || 0;
        break;
      }
      case 'train_action': {
        const s = players[p.playerNum];
        if (!s) break;
        s.trainingSessions++;
        if (s.training[p.stat]) {
          s.training[p.stat].sessions++;
          s.training[p.stat].gain += p.bonus || 0;
        }
        s.timeByArea.training += -(p.resourcesDelta?.time?.delta || 0);
        break;
      }
      case 'rest_action': {
        const s = players[p.playerNum];
        if (!s) break;
        s.rests++;
        s.enduranceRecovered += Math.max(0, p.enduranceRecovered || 0);
        s.timeByArea.rest += -(p.resourcesDelta?.time?.delta || 0);
        break;
      }
      case 'gear_purchased': {
        const s = players[p.playerNum];
        if (!s) break;
        const currency = p.currency === 'grit' ? 'grit' : 'xp';
        s.gear.push({ name: p.gearName, round, cost: p.cost, currency });
        s.spentOnGear[currency] += p.cost || 0;
        s.timeByArea.gearShop += p.timeCost || 0;
        break;
      }
      case 'end_turn_chosen': {
        const s = players[p.playerNum];
        if (!s) break;
        if (p.timeSurrendered > 0) {
          s.turnsEndedEarly++;
          s.timeUnused += p.timeSurrendered;
        }
        break;
      }
      case 'level_up': {
        const s = players[p.playerNum];
        if (s) s.levelUps.push({ level: p.newLevel, step, round });
        break;
      }
      case 'resource_update': {
        const s = players[p.playerNum];
        if (!s) break;
        const last = s.progression[s.progression.length - 1];
        if (p.level !== last.level || p.xp !== last.xp) {
          s.progression.push({ step, round, level: p.level, xp: p.xp });
        }
        break;
      }
      default:
        break;
    }
  }

  for (const p of state.players) {
    const s = players[p.playerNum];
    const c = p.character;
    let best = null;
    for (const a of SUMMARY_AREAS) if (s.timeByArea[a] > 0 && (best === null || s.timeByArea[a] > s.timeByArea[best])) best = a;
    s.favouriteArea = best;
    s.final = {
      level: c.level,
      xp: c.xp,
      ...(typeof c.grit === 'number' ? { grit: c.grit } : {}),
      maxEndurance: c.maxEndurance,
      milestonesCompleted: SUMMARY_TIERS.filter(t => c.milestonesCompleted && c.milestonesCompleted[t]).length,
      stats: Object.fromEntries(SUMMARY_STATS.map(k => [k,
        (c.stats?.[k] || 0) + (c.trainingBonuses?.[k] || 0) + (c.gearBonuses?.[k] || 0)])),
      equipment: [...(c.equipment || [])],
    };
    // Close each line at the last step so every player's chart spans the game.
    const last = s.progression[s.progression.length - 1];
    if (last.step < step) s.progression.push({ step, round, level: last.level, xp: last.xp });
  }

  // Final standings: the winner, then milestones sent, Level, XP, seat order.
  const standings = order.slice().sort((a, b) => {
    const A = players[a];
    const B = players[b];
    return (b === state.winner) - (a === state.winner)
      || B.final.milestonesCompleted - A.final.milestonesCompleted
      || B.final.level - A.final.level
      || B.final.xp - A.final.xp
      || a - b;
  });

  return {
    schema: GAME_SUMMARY_SCHEMA,
    engineVersion: state.engineVersion,
    seed: state.seed,
    ended: !!state.gameEnded,
    winner: state.winner ?? null,
    endReason: state.endReason || null,
    rounds: state.round,
    totalSteps: step,
    currency: usesGrit(state.rules) ? 'grit' : 'xp',
    milestoneRoutes: Object.fromEntries(SUMMARY_TIERS.map(t => {
      const m = state.milestoneRoutes && state.milestoneRoutes[t];
      return [t, m ? { area: m.area, routeName: m.route.name, grade: m.route.grade } : null];
    })),
    roundStarts,
    standings,
    players: order.map(n => players[n]),
  };
}
