// Play ONE game between agents and write the full structured event log to
// disk as JSONL (one JSON object per line).
//
// USAGE (plain English summary at end of file):
//   node sim/run-one-game.js \
//     --seed=42 \
//     --characters=technician,sprinter \
//     --agents=heuristic,heuristic \
//     --output=results/demo.jsonl \
//     [--maxRounds=30] \
//     [--policy-seed=12345] \
//     [--quiet]
//
// The outputs a JSONL file where:
//   - line 1 is a "run_meta" record with agents, characters, seed, etc.
//   - lines 2..N-1 are the engine event stream
//   - line N is a "run_summary" record with winner, reason, stats.
// This format makes the file both streamable and self-describing.

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createGame } from '../engine/state.js';
import { getLegalActions, applyAction, isTerminal } from '../engine/engine.js';
import { createRandomAgent } from './agents/random.js';
import { createHeuristicAgent } from './agents/heuristic.js';
import { createOllamaAgent } from './agents/ollama.js';

// ---------- CLI argument parsing ----------

// Minimal --flag=value parser. We avoid a dependency for this one use case.
function parseArgs(argv) {
  const out = {};
  for (const arg of argv.slice(2)) {
    if (arg.startsWith('--')) {
      const eq = arg.indexOf('=');
      if (eq === -1) { out[arg.slice(2)] = true; }
      else { out[arg.slice(2, eq)] = arg.slice(eq + 1); }
    }
  }
  return out;
}

// ---------- Agent factory ----------

// Build an agent from its short name. For ollama we'll add the factory in a
// later commit; for now the pipeline runs on random + heuristic.
function buildAgent(name, opts) {
  switch (name) {
    case 'random':    return createRandomAgent({ seed: opts.policySeed });
    case 'heuristic': return createHeuristicAgent();
  }
  // "ollama:<model-name>" syntax — e.g. "ollama:qwen2.5:14b-instruct".
  // We split on the FIRST colon only so the model tag keeps its own colons.
  if (name.startsWith('ollama:')) {
    const model = name.slice('ollama:'.length);
    return createOllamaAgent({
      model,
      host: opts.ollamaHost || 'http://localhost:11434',
      timeoutMs: opts.turnTimeoutMs || 15000,
    });
  }
  throw new Error(`unknown agent: ${name}. Available: random, heuristic, ollama:<model>`);
}

// ---------- Main runner ----------

export async function runOneGame({
  seed,
  characterKeys,
  agentNames,
  maxRounds = 45,
  policySeed = 1,
  turnTimeoutMs = 15000,
  writer = null,   // optional: object with { write(obj), close() } to stream events
  logDecisions = false,
}) {
  // Basic input validation so misconfigs fail fast instead of silently running bad games.
  if (characterKeys.length !== agentNames.length) {
    throw new Error(
      `characters (${characterKeys.length}) and agents (${agentNames.length}) must have the same length`
    );
  }
  if (characterKeys.length < 2 || characterKeys.length > 4) {
    throw new Error('this pipeline requires 2–4 players');
  }
  if (new Set(characterKeys).size !== characterKeys.length) {
    throw new Error('duplicate characters are not allowed in a game');
  }

  // Build one agent instance per seat. Each agent gets its OWN policy seed
  // derived from the base policy seed + seat index — so two agents of the
  // same type don't make identical choices on every turn.
  const agents = agentNames.map((n, i) =>
    buildAgent(n, { policySeed: policySeed + i * 1000 }));

  // Write the run_meta record first. It's everything a future reader needs
  // to interpret the events without re-running the game.
  const runMeta = {
    kind: 'run_meta',
    startedAt: new Date().toISOString(),
    seed, policySeed, maxRounds,
    characters: characterKeys,
    agents: agentNames,
    engineVersion: null, // filled in after createGame
  };

  // Create the initial state.
  const { state: s0, events: bootEvents } = createGame({
    seed, characterKeys,
  });
  // Inject maxRounds into state; the engine uses it as the safety cap.
  s0.maxRounds = maxRounds;
  runMeta.engineVersion = s0.engineVersion;

  if (writer) writer.write(runMeta);
  if (writer) for (const e of bootEvents) writer.write(e);

  let state = s0;
  let steps = 0;
  let fallbackCount = 0;
  const perAgentStats = agentNames.map(() => ({ actions: 0, fallbacks: 0 }));
  const MAX_STEPS = 10000; // harder cap than maxRounds; just in case

  while (true) {
    const term = isTerminal(state);
    if (term.done) break;
    if (steps++ > MAX_STEPS) {
      throw new Error(`exceeded ${MAX_STEPS} actions; engine loop may be stuck`);
    }

    const legal = getLegalActions(state);
    if (!legal.length) throw new Error('no legal actions but game not terminal');

    const seatIndex = state.currentPlayerIndex;
    const agent = agents[seatIndex];
    const currentPlayer = state.players[seatIndex];
    perAgentStats[seatIndex].actions++;

    let picked;
    try {
      picked = await withTimeout(
        agent.chooseAction({
          state, legalActions: legal, player: currentPlayer, round: state.round,
        }),
        turnTimeoutMs
      );
      // Sanity: actionIndex must be a valid integer index into `legal`.
      if (!Number.isInteger(picked.actionIndex) ||
          picked.actionIndex < 0 ||
          picked.actionIndex >= legal.length) {
        throw new Error(`invalid actionIndex ${picked.actionIndex} for ${legal.length} legal actions`);
      }
    } catch (err) {
      // Fall back to the engine's canonical fallback: highest-XP legal climb,
      // or endTurn if no climb is available. This keeps games progressing
      // even when an agent is broken.
      fallbackCount++;
      perAgentStats[seatIndex].fallbacks++;
      picked = engineFallback(state, legal);
      picked.rationale = `FALLBACK: ${err.message.slice(0, 100)}`;
      if (!picked.__silent && logDecisions) {
        console.warn(`[fallback] seat ${seatIndex + 1} (${agent.name}): ${err.message}`);
      }
    }

    const chosen = legal[picked.actionIndex];
    const action = { ...chosen, rationale: picked.rationale };

    const { state: s1, events } = applyAction(state, action);
    if (writer) for (const e of events) writer.write(e);
    state = s1;
  }

  const term = isTerminal(state);
  const finalPlayers = state.players.map(p => ({
    playerNum: p.playerNum,
    characterKey: p.character.key,
    agent: agentNames[p.playerNum - 1],
    level: p.character.level,
    xpTotal: p.character.xp,
    milestonesCompleted: { ...p.character.milestonesCompleted },
    milestonesDone:
      (p.character.milestonesCompleted.beginner ? 1 : 0) +
      (p.character.milestonesCompleted.intermediate ? 1 : 0) +
      (p.character.milestonesCompleted.expert ? 1 : 0),
    gearBought: p.character.equipment.length,
  }));

  const runSummary = {
    kind: 'run_summary',
    endedAt: new Date().toISOString(),
    winner: term.winner,
    winnerAgent: term.winner ? agentNames[term.winner - 1] : null,
    winnerCharacter: term.winner ? characterKeys[term.winner - 1] : null,
    reason: term.reason,
    rounds: state.round,
    actions: steps,
    events: state.events.length,
    fallbackCount,
    perAgentStats: perAgentStats.map((s, i) => ({
      agent: agentNames[i], seat: i + 1, character: characterKeys[i], ...s,
    })),
    finalPlayers,
  };

  if (writer) writer.write(runSummary);

  return { finalState: state, summary: runSummary };
}

// Engine-canonical fallback: picks the highest-XP legal climb, or endTurn.
// This matches what was described in the playtest plan as the "safe" default.
function engineFallback(state, legal) {
  let bestIdx = -1; let bestXp = -Infinity;
  for (let i = 0; i < legal.length; i++) {
    if (legal[i].type !== 'climb') continue;
    const a = legal[i];
    const route = state.availableRoutes[a.area].find(r => r.name === a.routeName);
    if (route && route.xpSuccess > bestXp) { bestXp = route.xpSuccess; bestIdx = i; }
  }
  if (bestIdx !== -1) return { actionIndex: bestIdx, rationale: 'engine fallback: highest-XP climb' };
  const endTurnIdx = legal.findIndex(a => a.type === 'endTurn');
  return { actionIndex: endTurnIdx, rationale: 'engine fallback: endTurn' };
}

// Wrap a promise with a timeout. Rejects with a descriptive error if the
// promise doesn't settle in time. Used to cap per-turn latency, critical
// for LLM agents where 30-second hangs are a real failure mode.
function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`agent timeout after ${ms}ms`)), ms);
    promise.then(
      v => { clearTimeout(timer); resolve(v); },
      e => { clearTimeout(timer); reject(e); }
    );
  });
}

// ---------- JSONL writer helper ----------

// Simple append-mode JSONL writer. Each object becomes one line.
export function createJsonlWriter(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const stream = fs.createWriteStream(filePath, { flags: 'w' });
  return {
    write(obj) { stream.write(JSON.stringify(obj) + '\n'); },
    close() { stream.end(); },
  };
}

// ---------- CLI entrypoint ----------

// Only runs when invoked as `node sim/run-one-game.js`, not when imported.
// Comparison via pathToFileURL handles relative vs absolute argv[1] and
// cross-platform path separators.
const invokedDirectly = import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  const args = parseArgs(process.argv);
  const seed = Number(args.seed ?? 1);
  const characterKeys = String(args.characters ?? 'technician,sprinter').split(',');
  const agentNames = String(args.agents ?? 'heuristic,heuristic').split(',');
  const maxRounds = Number(args.maxRounds ?? 45);
  const policySeed = Number(args['policy-seed'] ?? 1);
  const outputPath = args.output
    ? String(args.output)
    : `results/${new Date().toISOString().slice(0, 10)}/run-${seed}-${agentNames.join('_vs_')}.jsonl`;
  const quiet = !!args.quiet;

  const writer = createJsonlWriter(outputPath);
  try {
    const { summary } = await runOneGame({
      seed, characterKeys, agentNames, maxRounds, policySeed,
      writer, logDecisions: !quiet,
    });
    writer.close();
    if (!quiet) {
      console.log(`\nGame complete.`);
      console.log(`  winner:    Player ${summary.winner ?? '—'} (${summary.winnerAgent ?? 'none'} / ${summary.winnerCharacter ?? 'none'})`);
      console.log(`  reason:    ${summary.reason}`);
      console.log(`  rounds:    ${summary.rounds}`);
      console.log(`  actions:   ${summary.actions}`);
      console.log(`  events:    ${summary.events}`);
      console.log(`  fallbacks: ${summary.fallbackCount}`);
      console.log(`  output:    ${outputPath}`);
    }
  } catch (err) {
    writer.close();
    console.error(`ERROR: ${err.message}`);
    process.exit(1);
  }
}

/* PLAIN-ENGLISH CLI SUMMARY (for non-developers):
 *
 * You run the command below in a terminal. It plays ONE game between two
 * (or three, or four) computer players, using the characters and strategies
 * you choose, and saves a detailed record of every dice roll and decision
 * to a file on disk.
 *
 *   node sim/run-one-game.js
 *
 * Flags you can add, separated by spaces:
 *
 *   --seed=42
 *       A number. Same number = same game, every time (reproducibility).
 *
 *   --characters=technician,sprinter
 *       Comma-separated list of the characters playing. One name per seat.
 *       Allowed names: technician, sprinter, ironLung, freeSolo, routeReader.
 *
 *   --agents=heuristic,heuristic
 *       Comma-separated list of WHO is playing each seat. Must match the
 *       length of --characters. Allowed values for now: random, heuristic.
 *       (The LLM agent will be added next.)
 *
 *   --output=results/my-game.jsonl
 *       Where to save the event log. Defaults to results/YYYY-MM-DD/...
 *
 *   --maxRounds=30
 *       Safety cap — stop the game if nobody's won after this many rounds.
 *
 *   --policy-seed=12345
 *       Makes the agents' random choices reproducible too.
 *
 *   --quiet
 *       Suppress the summary print at the end (useful for batch runs).
 */
