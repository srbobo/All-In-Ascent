// Matrix orchestrator — runs the full batch described in sim/config.json.
//
// It does three things:
//   1. Reads the config and expands it into a list of MATCHUPS.
//      A matchup = (player_count, character_combo, agent_assignment).
//      Within each matchup it runs `repetitions` games, each with a
//      different deterministic seed derived from (matchup_id, rep_index).
//   2. Runs those games with bounded parallelism (config.parallelism) so
//      your M5 doesn't get overwhelmed.
//   3. Writes one JSONL file per game under results/<date>/ and a
//      manifest.json describing the run. Safe to Ctrl-C mid-run; resume
//      simply re-runs — games that completed (file exists) are skipped.
//
// USAGE (plain English at the bottom):
//   node sim/run-matrix.js                         # use defaults from config.json
//   node sim/run-matrix.js --config=path/to.json   # custom config
//   node sim/run-matrix.js --dry-run               # print plan only, run nothing
//   node sim/run-matrix.js --repetitions=3         # override any config field

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { CHARACTERS } from '../engine/data.js';
import { createRng, deriveSeed } from '../engine/rng.js';
import { runOneGame, createJsonlWriter } from './run-one-game.js';

// ---------- CLI ----------

function parseArgs(argv) {
  const out = {};
  for (const a of argv.slice(2)) {
    if (!a.startsWith('--')) continue;
    const eq = a.indexOf('=');
    if (eq === -1) out[a.slice(2)] = true;
    else out[a.slice(2, eq)] = a.slice(eq + 1);
  }
  return out;
}

// ---------- Matchup generation ----------

// Enumerate all unordered K-element subsets of `arr`.
// e.g. combinations(['a','b','c'], 2) = [['a','b'],['a','c'],['b','c']].
function combinations(arr, k) {
  const result = [];
  function rec(start, pick) {
    if (pick.length === k) { result.push(pick.slice()); return; }
    for (let i = start; i < arr.length; i++) {
      pick.push(arr[i]);
      rec(i + 1, pick);
      pick.pop();
    }
  }
  rec(0, []);
  return result;
}

// Generate the character combos to test for a given player count.
// `characterSampling` values:
//   "all"         → every unordered C(N, count) combo
//   "sample:K"    → K randomly chosen combos (deterministic via a fixed seed)
//   "curated"     → ONLY the ones listed in config.curatedMatchups
// Curated matchups matching the player count are ALWAYS added on top of
// sampled/all (and deduplicated by sorted-names key).
function generateCharacterCombos(count, config) {
  const allKeys = Object.keys(CHARACTERS);
  const out = [];

  // 1. Curated matchups matching this count.
  for (const m of config.curatedMatchups || []) {
    if (m.length !== count) continue;
    if (new Set(m).size !== m.length) continue; // enforce no duplicates
    if (!m.every(k => allKeys.includes(k))) {
      throw new Error(`curated matchup references unknown character(s): ${m.join(',')}`);
    }
    out.push(m);
  }

  const mode = config.characterSampling || 'sample:15';
  if (mode === 'all') {
    out.push(...combinations(allKeys, count));
  } else if (mode.startsWith('sample:')) {
    const k = Number(mode.split(':')[1]);
    // Deterministic sampling: fixed seed for sampling so resumed runs hit
    // the same character combos, regardless of which were completed last time.
    const rng = createRng(0xC0DE + count);
    const pool = combinations(allKeys, count);
    const shuffled = rng.shuffle(pool);
    out.push(...shuffled.slice(0, k));
  } else if (mode === 'curated') {
    // already handled
  } else {
    throw new Error(`unknown characterSampling mode: ${mode}`);
  }

  // Deduplicate by sorted-names key (order within the combo doesn't matter).
  const seen = new Set();
  const deduped = [];
  for (const c of out) {
    const k = c.slice().sort().join(',');
    if (seen.has(k)) continue;
    seen.add(k);
    deduped.push(c);
  }
  return deduped;
}

// Generate the distinct agent seat-assignments for a given player count.
// Strategy (per the 2026-04-21 decision to mix up to 2 models within a game):
//   - All seats = agents[0]                       (single-model control: model A)
//   - All seats = agents[1]                       (single-model control: model B)
//   - Mixed: seat i = agents[i % agents.length]   (multi-model, realistic play)
//   - For each baseline, all seats = baseline     (heuristic/random ground truth)
// Callers can drop patterns by editing config.agents / config.baselines.
function generateAgentAssignments(count, agents, baselines) {
  const out = [];
  if (agents.length > 0) out.push({ kind: 'all_' + agentShortName(agents[0]),  seats: Array(count).fill(agents[0]) });
  if (agents.length > 1) out.push({ kind: 'all_' + agentShortName(agents[1]),  seats: Array(count).fill(agents[1]) });
  if (agents.length > 1) out.push({
    kind: 'mixed_' + agents.map(agentShortName).join('_'),
    seats: Array.from({ length: count }, (_, i) => agents[i % agents.length]),
  });
  for (const b of (baselines || [])) {
    out.push({ kind: 'all_' + agentShortName(b), seats: Array(count).fill(b) });
  }
  return out;
}

// Short, filesystem-safe name for an agent (no colons, slashes).
function agentShortName(name) {
  return name.replace(/^ollama:/, 'ol-').replace(/[^a-zA-Z0-9_-]/g, '_');
}

// Build the full matchup list.
function buildMatrix(config) {
  const matchups = [];
  let id = 0;
  for (const count of config.playerCounts) {
    const combos = generateCharacterCombos(count, config);
    for (const combo of combos) {
      const assignments = generateAgentAssignments(count, config.agents, config.baselines);
      for (const asg of assignments) {
        matchups.push({
          id: id++,
          playerCount: count,
          characters: combo,
          assignmentKind: asg.kind,
          agents: asg.seats,
        });
      }
    }
  }
  return matchups;
}

// ---------- Output path helpers ----------

function matchupOutputPath(outputDir, matchup, repIndex) {
  const charStr = matchup.characters.join('-');
  const fname = `m${String(matchup.id).padStart(4, '0')}_p${matchup.playerCount}_${matchup.assignmentKind}_${charStr}_r${repIndex}.jsonl`;
  return path.join(outputDir, fname);
}

// ---------- Parallelism ----------

// Simple async pool: at most `concurrency` `task()` invocations outstanding.
// Preserves order of completion in the yielded results; errors from one task
// do NOT abort the others (matches what we want for a playtest batch — one
// bad game shouldn't halt the other 800 games).
async function runWithConcurrency(tasks, concurrency, onDone) {
  let idx = 0;
  let completed = 0;
  const total = tasks.length;
  const results = new Array(total);

  async function worker() {
    while (true) {
      const myIdx = idx++;
      if (myIdx >= total) return;
      try {
        results[myIdx] = { ok: true, value: await tasks[myIdx]() };
      } catch (err) {
        results[myIdx] = { ok: false, error: err };
      }
      completed++;
      if (onDone) onDone({ completed, total, last: results[myIdx], index: myIdx });
    }
  }

  const workers = Array.from({ length: Math.max(1, concurrency) }, () => worker());
  await Promise.all(workers);
  return results;
}

// ---------- Main ----------

async function main() {
  const args = parseArgs(process.argv);
  const configPath = args.config || path.join('sim', 'config.json');
  if (!fs.existsSync(configPath)) throw new Error(`config not found: ${configPath}`);
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

  // CLI overrides (every numeric field of interest can be forced from the command line).
  if (args.repetitions)  config.repetitions  = Number(args.repetitions);
  if (args.parallelism)  config.parallelism  = Number(args.parallelism);
  if (args.characterSampling) config.characterSampling = String(args.characterSampling);

  const dateSlug = new Date().toISOString().slice(0, 10);
  const outputDir = path.join(config.outputDir || 'results', dateSlug);
  fs.mkdirSync(outputDir, { recursive: true });

  // Expand matrix.
  const matchups = buildMatrix(config);
  const totalGames = matchups.length * config.repetitions;

  console.log(`Playtest matrix:`);
  console.log(`  player counts:    ${config.playerCounts.join(', ')}`);
  console.log(`  character sample: ${config.characterSampling}`);
  console.log(`  agents:           ${config.agents.join(', ')}`);
  console.log(`  baselines:        ${(config.baselines || []).join(', ') || '(none)'}`);
  console.log(`  matchups:         ${matchups.length}`);
  console.log(`  reps/matchup:     ${config.repetitions}`);
  console.log(`  total games:      ${totalGames}`);
  console.log(`  parallelism:      ${config.parallelism}`);
  console.log(`  output dir:       ${outputDir}`);
  console.log();

  if (args['dry-run']) {
    console.log('--dry-run set — not running any games.');
    return;
  }

  // Write manifest up front (useful if the run is interrupted).
  const manifest = {
    startedAt: new Date().toISOString(),
    config,
    matchupCount: matchups.length,
    totalGames,
    outputDir,
  };
  fs.writeFileSync(path.join(outputDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

  // Build the full task list. Each task runs ONE game and writes one JSONL.
  // Tasks check for existing output files and skip (resumability).
  const tasks = [];
  for (const m of matchups) {
    for (let rep = 0; rep < config.repetitions; rep++) {
      tasks.push(() => runOneTask(m, rep, outputDir, config));
    }
  }

  let skippedExisting = 0;
  let winsByCharacter = {};
  let winsByAgent = {};
  let reasons = {};
  const startMs = Date.now();

  await runWithConcurrency(tasks, config.parallelism || 1, ({ completed, total, last }) => {
    if (!last) return;
    if (!last.ok) {
      console.error(`[${completed}/${total}] ERROR: ${last.error.message}`);
      return;
    }
    if (last.value?.skipped) {
      skippedExisting++;
      return;
    }
    const s = last.value.summary;
    if (s.winnerCharacter) winsByCharacter[s.winnerCharacter] = (winsByCharacter[s.winnerCharacter] || 0) + 1;
    if (s.winnerAgent)     winsByAgent[s.winnerAgent]     = (winsByAgent[s.winnerAgent] || 0) + 1;
    reasons[s.reason] = (reasons[s.reason] || 0) + 1;
    if (completed % 10 === 0 || completed === total) {
      const elapsedMin = ((Date.now() - startMs) / 60000).toFixed(1);
      console.log(`[${completed}/${total}] elapsed ${elapsedMin}m | last: ${s.reason} round ${s.rounds} winner=${s.winner ?? '-'}`);
    }
  });

  const elapsedMin = ((Date.now() - startMs) / 60000).toFixed(1);
  const summary = {
    finishedAt: new Date().toISOString(),
    elapsedMinutes: Number(elapsedMin),
    totalGames,
    skippedExisting,
    winsByCharacter,
    winsByAgent,
    endReasons: reasons,
  };
  fs.writeFileSync(path.join(outputDir, 'summary.json'), JSON.stringify(summary, null, 2));

  console.log();
  console.log(`Matrix complete in ${elapsedMin} minutes.`);
  console.log(`  games run:       ${totalGames - skippedExisting}`);
  console.log(`  games skipped:   ${skippedExisting}  (output file already existed)`);
  console.log(`  end reasons:     ${Object.entries(reasons).map(([k, v]) => `${k}=${v}`).join(', ')}`);
  console.log(`  wins by char:    ${Object.entries(winsByCharacter).map(([k, v]) => `${k}=${v}`).join(', ') || '(none)'}`);
  console.log(`  wins by agent:   ${Object.entries(winsByAgent).map(([k, v]) => `${k}=${v}`).join(', ') || '(none)'}`);
  console.log(`  output:          ${outputDir}/`);
}

// Run a single (matchup, rep) task. Returns a summary or {skipped:true}.
async function runOneTask(matchup, repIndex, outputDir, config) {
  const outPath = matchupOutputPath(outputDir, matchup, repIndex);
  // Resumability: if the file exists and its last line is a run_summary,
  // this game is already done; skip.
  if (fs.existsSync(outPath)) {
    try {
      const content = fs.readFileSync(outPath, 'utf8').trim();
      if (content.length) {
        const lines = content.split('\n');
        const last = JSON.parse(lines[lines.length - 1]);
        if (last?.kind === 'run_summary') return { skipped: true };
      }
    } catch { /* corrupt file — re-run */ }
  }

  const gameSeed = deriveSeed(matchup.id, repIndex);
  const policySeed = deriveSeed(matchup.id ^ 0xA5A5, repIndex);
  const writer = createJsonlWriter(outPath);

  try {
    const result = await runOneGame({
      seed: gameSeed,
      policySeed,
      characterKeys: matchup.characters,
      agentNames: matchup.agents,
      turnTimeoutMs: (config.turnTimeoutSeconds || 15) * 1000,
      writer,
    });
    await writer.close();
    return result;
  } catch (err) {
    await writer.close();
    // Leave the partial file on disk for post-mortem; the resume check
    // above treats files without a run_summary line as incomplete and reruns.
    throw err;
  }
}

// ---------- Entrypoint ----------

const invokedDirectly = import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch(err => {
    console.error('Matrix run failed:', err);
    process.exit(1);
  });
}

/* PLAIN-ENGLISH CLI SUMMARY (for non-developers):
 *
 * The command below reads sim/config.json and runs EVERY game it describes,
 * writing one detailed log file per game into results/<today's date>/.
 *
 *   node sim/run-matrix.js
 *
 * Before running, you can preview the plan without actually running anything:
 *
 *   node sim/run-matrix.js --dry-run
 *
 * You can override any config value on the command line:
 *
 *   node sim/run-matrix.js --repetitions=3      # fewer reps for a smoke test
 *   node sim/run-matrix.js --parallelism=1      # run games one at a time
 *   node sim/run-matrix.js --characterSampling=curated  # only curated matchups
 *
 * The run is safely resumable — press Ctrl+C, come back later, run the same
 * command, and it will pick up where it left off (games that already
 * produced a complete log file are skipped).
 */
