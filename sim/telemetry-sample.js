// Play bot games and record each one as a telemetry match record
// (engine/match-record.js, mode 'sim'), so the designer's dashboard
// (dashboard.html) has data before real players arrive, and bot play can be
// compared with human play under the dashboard's Mode filter.
//
//   node sim/telemetry-sample.js [--games=200] [--seed=1] [--agent=planner|heuristic|rollout]
//                                [--out=results/telemetry-sample.jsonl]
//                                [--post=http://127.0.0.1:1999]
//
// Each game picks 2–4 players (evenly) and distinct random characters. The
// default bot is the planner (the playtest bot; it finishes every game). A
// game still running after --max-steps actions is recorded unfinished.
// --out writes one record per line (the dashboard's "Load file" reads it);
// --post sends each record to a telemetry server (the backend host's
// /parties/telemetry/global). Records get finishedAt timestamps spread over
// the last --days days (default 14) so the dashboard's timeline has shape.

import fs from 'node:fs';
import path from 'node:path';
import { createGame } from '../engine/state.js';
import { getLegalActions, applyAction } from '../engine/engine.js';
import { GRIT_RULES } from '../engine/helpers.js';
import { CHARACTERS } from '../engine/data.js';
import { createRng } from '../engine/rng.js';
import { buildMatchRecord } from '../engine/match-record.js';
import { createHeuristicAgent } from './agents/heuristic.js';
import { createRolloutAgent } from './agents/rollout.js';
import { createPlannerAgent } from './agents/planner.js';

function parseArgs(argv) {
  const out = {};
  for (const arg of argv.slice(2)) {
    const m = arg.match(/^--([^=]+)(?:=(.*))?$/);
    if (m) out[m[1]] = m[2] === undefined ? true : m[2];
  }
  return out;
}

const args = parseArgs(process.argv);
const games = Number(args.games || 200);
const baseSeed = Number(args.seed || 1);
const agentName = args.agent || 'planner';
const maxSteps = Number(args['max-steps'] || 3000);
const days = Number(args.days || 14);
const outPath = args.out === undefined && !args.post ? 'results/telemetry-sample.jsonl' : args.out;
const postUrl = args.post ? `${String(args.post).replace(/\/$/, '')}/parties/telemetry/global` : null;

const AGENTS = {
  planner: (seed) => createPlannerAgent({ seed }),
  heuristic: () => createHeuristicAgent(),
  rollout: () => createRolloutAgent({ rolloutsPerAction: 3, maxPlayoutSteps: 300 }),
};
if (!AGENTS[agentName]) throw new Error(`unknown --agent=${agentName} (planner, heuristic or rollout)`);
const characterKeys = Object.keys(CHARACTERS);
const rng = createRng(baseSeed);
const now = Date.now();

const lines = [];
let posted = 0;
for (let g = 0; g < games; g++) {
  const playerCount = 2 + (g % 3);
  const pool = characterKeys.slice();
  const picks = [];
  for (let i = 0; i < playerCount; i++) picks.push(pool.splice(Math.floor(rng.next() * pool.length), 1)[0]);
  const seed = baseSeed * 100003 + g;

  let { state } = createGame({ seed, characterKeys: picks, rules: GRIT_RULES });
  const agents = picks.map((_, i) => AGENTS[agentName](seed * 7 + i));
  for (let step = 0; step < maxSteps && !state.gameEnded; step++) {
    const legal = getLegalActions(state);
    const { actionIndex } = await agents[state.currentPlayerIndex].chooseAction({ state, legalActions: legal });
    ({ state } = applyAction(state, legal[actionIndex]));
  }

  // Spread games over the window; ~4 minutes of table time per round.
  const finishedAt = Math.round(now - (days * 864e5) * (1 - (g + 1) / games));
  const record = buildMatchRecord(state, {
    id: `sim-${baseSeed}-${g}`,
    mode: 'sim',
    startedAt: finishedAt - state.round * 4 * 60e3,
    finishedAt,
    seats: picks.map(() => ({ controller: 'bot', botLevel: agentName })),
  });
  lines.push(JSON.stringify(record));

  if (postUrl) {
    const res = await fetch(postUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(record) });
    if (!res.ok) throw new Error(`POST ${postUrl} → ${res.status} ${await res.text()}`);
    posted++;
  }
  if ((g + 1) % 25 === 0 || g + 1 === games) process.stdout.write(`\r${g + 1}/${games} games`);
}
process.stdout.write('\n');

if (outPath) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, lines.join('\n') + '\n');
  console.log(`wrote ${lines.length} match records to ${outPath}`);
}
if (postUrl) console.log(`posted ${posted} match records to ${postUrl}`);
