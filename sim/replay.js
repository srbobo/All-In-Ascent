// JSONL replay viewer (text mode).
//
// Reads a game log file produced by run-one-game.js / run-matrix.js and
// prints a human-readable transcript to stdout. Intended for spot-checking
// games when the dashboard is overkill.
//
// USAGE:
//   node sim/replay.js results/2026-04-22/m0001_p2_all_heuristic_technician-sprinter_r0.jsonl
//   node sim/replay.js <file> --filter=climb_resolved,milestone_progress  # only show certain event types
//   node sim/replay.js <file> --since=120                                  # skip events with t<120
//   node sim/replay.js <file> --pretty                                     # extra spacing

import fs from 'node:fs';

function parseArgs(argv) {
  const out = { positional: [] };
  for (const a of argv.slice(2)) {
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq === -1) out[a.slice(2)] = true;
      else out[a.slice(2, eq)] = a.slice(eq + 1);
    } else {
      out.positional.push(a);
    }
  }
  return out;
}

const args = parseArgs(process.argv);
const inputPath = args.positional[0];
if (!inputPath) {
  console.error('usage: node sim/replay.js <jsonl-file> [--filter=type1,type2] [--since=N] [--pretty]');
  process.exit(1);
}

const filter = args.filter ? new Set(String(args.filter).split(',')) : null;
const since = args.since ? Number(args.since) : 0;
const pretty = !!args.pretty;

const lines = fs.readFileSync(inputPath, 'utf8').trim().split('\n');

for (const line of lines) {
  let obj; try { obj = JSON.parse(line); } catch { continue; }

  // Meta records (run_meta, run_summary) — always print.
  if (obj.kind === 'run_meta') {
    console.log(`=== ${obj.kind} ===`);
    console.log(`  characters: ${obj.characters.join(', ')}`);
    console.log(`  agents:     ${obj.agents.join(', ')}`);
    console.log(`  seed:       ${obj.seed} | policySeed: ${obj.policySeed} | maxRounds: ${obj.maxRounds}`);
    console.log(`  engine:     ${obj.engineVersion}`);
    console.log();
    continue;
  }
  if (obj.kind === 'run_summary') {
    console.log();
    console.log(`=== ${obj.kind} ===`);
    console.log(`  winner:    P${obj.winner ?? '—'} (${obj.winnerCharacter ?? '—'} via ${obj.winnerAgent ?? '—'})`);
    console.log(`  reason:    ${obj.reason}`);
    console.log(`  rounds:    ${obj.rounds} | actions: ${obj.actions} | events: ${obj.events} | fallbacks: ${obj.fallbackCount}`);
    for (const p of obj.finalPlayers) {
      const ms = ['B','I','E'].filter((_, i) => [p.milestonesCompleted.beginner, p.milestonesCompleted.intermediate, p.milestonesCompleted.expert][i]).join('') || '-';
      console.log(`  P${p.playerNum} (${p.characterKey}): L${p.level} | XP ${p.xpTotal} | gear ${p.gearBought} | milestones ${ms}`);
    }
    continue;
  }

  // Engine events.
  if (typeof obj.t !== 'number') continue;
  if (obj.t < since) continue;
  if (filter && !filter.has(obj.type)) continue;

  const formatted = formatEvent(obj);
  if (formatted === null) continue; // event opted out (e.g. resource_update without --filter)
  console.log(formatted);
  if (pretty) console.log();
}

function formatEvent(e) {
  const head = `[t=${String(e.t).padStart(4)}] ${e.type}`;
  const p = e.payload || {};
  switch (e.type) {
    case 'game_start':
      return `${head}\n  milestones: B=${p.milestoneRoutes.beginner.routeName} (${p.milestoneRoutes.beginner.grade}) | I=${p.milestoneRoutes.intermediate.routeName} (${p.milestoneRoutes.intermediate.grade}) | E=${p.milestoneRoutes.expert.routeName} (${p.milestoneRoutes.expert.grade})`;
    case 'turn_start':
      return `${head}  P${p.playerNum} round ${p.round} (time ${p.timeRemaining}, end ${p.endurance})`;
    case 'turn_end':
      return `${head}    P${p.playerNum} ends round ${p.round}`;
    case 'action_chosen':
      return `${head} P${p.playerNum} → ${p.action.type} ${actionTail(p.action)}${p.rationale ? ` // ${p.rationale}` : ''}`;
    case 'dice_rolled':
      return `${head}    P${p.playerNum} rolled [${p.dice.join(',')}] (modifiers: ${p.modifiers.map(m => `${m.modifier > 0 ? '+' : m.modifier < 0 ? '-' : '='}${Math.abs(m.modifier * m.die)}${m.stat[0].toUpperCase()}`).join(', ')})`;
    case 'climb_resolved': {
      const ps = Object.entries(p.perStatPass).map(([k, v]) => `${v ? '✓' : '✗'}${k[0].toUpperCase()}`).join(' ');
      return `${head} P${p.playerNum} ${p.success ? 'CLEARED' : 'FAILED'} ${p.routeName} (${p.grade})  ${ps}  +${p.xpGained}xp  -${p.enduranceCost}end -${p.timeCost}t`;
    }
    case 'milestone_progress':
      return `${head}  ★ P${p.playerNum} completed ${p.tier} milestone (${p.totalCompleted}/3)`;
    case 'level_up':
      return `${head}      ↑ P${p.playerNum} leveled to ${p.newLevel}`;
    case 'rest_action':
      return `${head}    P${p.playerNum} rested → ${p.newEndurance} end (+${p.enduranceRecovered})${p.betaBoostActivated ? ' + Beta Boost!' : ''}`;
    case 'train_action':
      return `${head}   P${p.playerNum} trained ${p.areaName} (+${p.bonus} ${p.stat})`;
    case 'gear_purchased':
      return `${head} P${p.playerNum} bought ${p.gearName} for ${p.cost}xp`;
    case 'end_turn_chosen':
      return `${head} P${p.playerNum} skipped (${p.timeSurrendered}t left)`;
    case 'belayer_unlocked':
      return `${head} now ${p.newCount} belayers (round ${p.round})`;
    case 'round_end':
      return `${head} round ${p.round} ended; cleared ${p.routesCleared}; next: ${p.nextRound}`;
    case 'round_start':
      return `${head} round ${p.round} begins`;
    case 'ability_activated':
      return `${head} P${p.playerNum} ★ activated ${p.ability} (${p.character}) — ${p.effect}`;
    case 'resource_update':
      // Skip unless --filter explicitly asks for it; high-frequency, low-info.
      return filter && filter.has('resource_update')
        ? `${head} P${p.playerNum} t=${p.timeRemaining} end=${p.currentEndurance}/${p.maxEndurance} xp=${p.xp} L${p.level}`
        : null;
    case 'game_end':
      return `${head} ${p.winner ? `Player ${p.winner} wins (${p.characterKey})` : 'no winner'} — ${p.reason}`;
    default:
      return `${head} ${JSON.stringify(p).slice(0, 200)}`;
  }
}

function actionTail(a) {
  switch (a.type) {
    case 'climb':     return `${a.area}/${a.routeName}`;
    case 'milestone': return `${a.difficulty} (${a.area}/${a.routeName})`;
    case 'train':     return a.areaName;
    case 'buyGear':   return a.gearName;
    case 'rest':      return '';
    case 'endTurn':   return '';
    default:          return '';
  }
}

// Filter out null returns from formatEvent (e.g. resource_update when not requested).
// Above we already iterated and printed; the null case bypasses console.log if
// returned by formatEvent. Quick fix: wrap the print in a guard.
