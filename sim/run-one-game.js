// Play ONE game between agents and write the full structured event log to
// disk as JSONL (one JSON object per line).
//
// USAGE (plain English summary at end of file):
//   node sim/run-one-game.js \
//     --seed=42 \
//     --characters=technician,sprinter \
//     --agents=heuristic,heuristic \
//     --output=results/demo.jsonl \
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
import { createRolloutAgent } from './agents/rollout.js';
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
    // R2 pure search agent: full-width rollout evaluation, no LLM. The
    // search-strength ceiling that LLM priors get measured against.
    case 'rollout':   return createRolloutAgent();
  }
  // "ollama:<model-name>" syntax — e.g. "ollama:deepseek-r1:7b".
  // We split on the FIRST colon only so the model tag keeps its own colons.
  if (name.startsWith('ollama:')) {
    const model = name.slice('ollama:'.length);
    return createOllamaAgent({
      model,
      host: opts.ollamaHost || 'http://localhost:11434',
      timeoutMs: opts.turnTimeoutMs || 15000,
      // Lite CPP: 'index' (numbered LEGAL ACTIONS + action_index) or 'tools'
      // (semantic tool calls dispatched via dispatchToolCall in helpers.js).
      // Default 'index' preserves the baseline for A/B comparisons.
      agentMode: opts.agentMode || 'index',
      // Temp-ablation: near-greedy action decisions while planning keeps
      // its default. null = inherit (legacy baselines unchanged).
      decisionTemperature: opts.decisionTemperature ?? null,
      // Reasoning-effort for thinking models (gpt-oss). null = field omitted.
      thinkLevel: opts.thinkLevel ?? null,
    });
  }
  throw new Error(`unknown agent: ${name}. Available: random, heuristic, rollout, ollama:<model>`);
}

// ---------- Main runner ----------

export async function runOneGame({
  seed,
  characterKeys,
  agentNames,
  policySeed = 1,
  turnTimeoutMs = 15000,
  gameTimeoutMs = null,   // optional game-level wall-clock cap (Track 1.3)
  writer = null,   // optional: object with { write(obj), close() } to stream events
  logDecisions = false,
  onProgress = null,           // optional callback invoked at intervals during play
  progressIntervalMs = 60000,  // throttle: at most one progress callback this often
  seatMemoryContexts = null,   // optional: array indexed by seat (0-based) — formatted
                               // memory string passed into planStrategy() for that seat
                               // (Phase 3 of the tournament experiment).
  agentMode = 'index',         // Lite CPP: 'index' (default) or 'tools'.
                               // Applies to ALL ollama seats — the heuristic
                               // baseline is unaffected. See sim/agents/ollama.js.
  decisionTemperature = null,  // Temp-ablation: per-turn decision temperature
                               // for ollama seats (null = model default 0.3).
  thinkLevel = null,           // Reasoning effort for thinking models
                               // (gpt-oss: low|medium|high). null = omitted.
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
  // BUG FIX (v0.5.0): turnTimeoutMs was being dropped here — buildAgent's
  // Ollama branch then defaulted to its own 15000ms cap regardless of what
  // the caller passed to runOneGame. With the larger v0.5.0 prompts, that
  // 15s default fires on ~50% of decisions. Plumbing the caller's value
  // through fixes the timeout-fallback explosion.
  const agents = agentNames.map((n, i) =>
    buildAgent(n, { policySeed: policySeed + i * 1000, turnTimeoutMs, agentMode, decisionTemperature, thinkLevel }));

  // Write the run_meta record first. It's everything a future reader needs
  // to interpret the events without re-running the game.
  const runMeta = {
    kind: 'run_meta',
    startedAt: new Date().toISOString(),
    seed, policySeed,
    characters: characterKeys,
    agents: agentNames,
    // Lite CPP marker: 'index' vs 'tools'. Recorded so measure-drift and
    // build-report can categorize traces without needing to inspect events.
    agentMode,
    // Temp-ablation marker: null = legacy 0.3 baseline.
    decisionTemperature,
    // Reasoning-effort marker for thinking models (null for non-thinking).
    thinkLevel,
    engineVersion: null, // filled in after createGame
  };

  // Create the initial state.
  const { state: s0, events: bootEvents } = createGame({
    seed, characterKeys,
  });
  runMeta.engineVersion = s0.engineVersion;

  if (writer) writer.write(runMeta);
  if (writer) for (const e of bootEvents) writer.write(e);

  let state = s0;
  let steps = 0;
  let fallbackCount = 0;
  const perAgentStats = agentNames.map(() => ({ actions: 0, fallbacks: 0 }));

  // PHASE 1: Strategy planning at game start. For each LLM agent, ask for an
  // initial strategy and stream it as a `strategy_initial` event. Stored per
  // seat so the per-decision call can include it as context (Phase 2).
  const seatStrategies = agentNames.map(() => null);
  for (let i = 0; i < agents.length; i++) {
    const ag = agents[i];
    if (typeof ag.planStrategy !== 'function') continue; // heuristic/random skip
    const seatPlayer = s0.players[i];
    const planLegal = getLegalActions(s0); // legal actions from the seat that
                                           // currently has the turn — close
                                           // enough for opening-move planning.
    const t0 = Date.now();
    let outcome = 'success';
    let errMsg = null;
    let planResult = null;
    try {
      planResult = await ag.planStrategy({
        state: s0,
        legalActions: planLegal,
        player: seatPlayer,
        memoryContext: seatMemoryContexts ? seatMemoryContexts[i] : null,
      });
      seatStrategies[i] = planResult.strategy;
    } catch (err) {
      outcome = err.outcome || 'other_error';
      errMsg = (err.message || String(err)).slice(0, 200);
    }
    const latencyMs = Date.now() - t0;
    if (writer) writer.write({
      type: 'strategy_initial',
      payload: {
        seat: i + 1,
        playerNum: seatPlayer.playerNum,
        agent: agentNames[i],
        characterKey: characterKeys[i],
        round: s0.round,
        latencyMs,
        outcome,
        errorMessage: errMsg,
        promptTokens: planResult?.promptTokens ?? null,
        responseTokens: planResult?.responseTokens ?? null,
        strategy: seatStrategies[i],
      },
    });
    if (logDecisions) {
      const tag = seatStrategies[i] ? 'planned' : `failed:${outcome}`;
      console.log(`[strategy] seat ${i + 1} (${ag.name}): ${tag} in ${(latencyMs/1000).toFixed(1)}s`);
    }
  }
  const MAX_STEPS = 10000; // programming-bug safety net (no engine round cap as of v0.5.0)

  // Game-level watchdog (Track 1.3). If the caller sets gameTimeoutMs, we
  // raise an error after that wall-clock budget regardless of what the
  // agent or engine are doing. Saves us from 11-hour runaway runs when
  // Ollama hangs or thermal-throttles past recovery.
  const gameStartedAt = Date.now();
  const gameWatchdogFired = () => gameTimeoutMs !== null
    && (Date.now() - gameStartedAt) > gameTimeoutMs;

  // Progress reporting (throttled). Caller supplies an onProgress callback;
  // we invoke it at most once per `progressIntervalMs` at round boundaries
  // so the smoke harness can confirm the run is alive without spamming.
  let lastProgressAt = Date.now();
  let lastRoundReported = 0;
  function maybeReportProgress() {
    if (!onProgress) return;
    const now = Date.now();
    if (now - lastProgressAt < progressIntervalMs) return;
    if (state.round === lastRoundReported) return;
    lastProgressAt = now;
    lastRoundReported = state.round;
    try {
      onProgress({
        round: state.round,
        step: steps,
        elapsedMs: now - gameStartedAt,
        watchdogBudgetMs: gameTimeoutMs,
        fallbackCount,
        perAgentStats: perAgentStats.map((p, i) => ({
          seat: i + 1,
          agent: agentNames[i],
          actions: p.actions,
          fallbacks: p.fallbacks,
          avgLatencyMs: p.actions > 0 ? Math.round((p.totalLatencyMs || 0) / p.actions) : 0,
          outcomes: p.outcomes ? { ...p.outcomes } : {},
        })),
        milestoneProgress: state.players.map(pl => ({
          seat: pl.playerNum,
          done: ['beginner', 'intermediate', 'expert'].filter(k => pl.character.milestonesCompleted[k]).length,
        })),
      });
    } catch (e) { /* never let progress reporting break the run */ }
  }

  // Watchdog termination doesn't throw — it breaks the loop with a flag,
  // and the post-loop code synthesizes a run_summary with reason='game_watchdog'.
  // This preserves partial data (milestones scored, ability triggers, per-decision
  // telemetry) which would otherwise be dropped by the caller's error handler.
  let watchdogFired = false;
  while (true) {
    if (gameWatchdogFired()) {
      watchdogFired = true;
      break;
    }
    maybeReportProgress();
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

    // Per-decision telemetry (Track 1.1). The runner times every
    // chooseAction, classifies its outcome, and emits an `agent_decision`
    // event into the JSONL stream. This is what makes "why did the LLM
    // fail" answerable in analysis: every fallback has a structured
    // outcome (timeout / parse_error / out_of_range / http_error / aborted /
    // network_error / other_error) rather than a free-form message.
    const decisionT0 = Date.now();
    const decisionController = new AbortController();
    const decisionTimer = setTimeout(() => decisionController.abort(), turnTimeoutMs);
    let picked;
    let outcome = 'success';
    let errorMsg = null;
    let promptTokens = null;
    let responseTokens = null;
    let usedFallback = false;
    try {
      picked = await agent.chooseAction({
        state, legalActions: legal, player: currentPlayer, round: state.round,
        abortSignal: decisionController.signal,
        currentStrategy: seatStrategies[seatIndex],   // Phase 2: pass current plan as context
      });
      promptTokens = picked.promptTokens ?? null;
      responseTokens = picked.responseTokens ?? null;
      // Sanity: actionIndex must be a valid integer index into `legal`.
      if (!Number.isInteger(picked.actionIndex) ||
          picked.actionIndex < 0 ||
          picked.actionIndex >= legal.length) {
        const e = new Error(`invalid actionIndex ${picked.actionIndex} for ${legal.length} legal actions`);
        e.outcome = 'out_of_range';
        throw e;
      }
    } catch (err) {
      // Classify the outcome. The Ollama agent attaches err.outcome
      // directly; for other agents we infer from message patterns. Anything
      // unclassified is bucketed as 'other_error' so it stays visible.
      outcome = err.outcome || classifyErrorMessage(err.message);
      errorMsg = (err.message || String(err)).slice(0, 200);
      fallbackCount++;
      perAgentStats[seatIndex].fallbacks++;
      usedFallback = true;
      picked = engineFallback(state, legal);
      picked.rationale = `FALLBACK: ${errorMsg}`;
      if (!picked.__silent && logDecisions) {
        console.warn(`[fallback:${outcome}] seat ${seatIndex + 1} (${agent.name}): ${errorMsg}`);
      }
    } finally {
      clearTimeout(decisionTimer);
    }

    const latencyMs = Date.now() - decisionT0;
    const ps = perAgentStats[seatIndex];
    ps.outcomes = ps.outcomes || {};
    ps.outcomes[outcome] = (ps.outcomes[outcome] || 0) + 1;
    ps.totalLatencyMs = (ps.totalLatencyMs || 0) + latencyMs;
    if (promptTokens) ps.totalPromptTokens = (ps.totalPromptTokens || 0) + promptTokens;
    if (responseTokens) ps.totalResponseTokens = (ps.totalResponseTokens || 0) + responseTokens;

    // PHASE 2: Strategy-shift detection. If the LLM declared a strategy change
    // this turn, emit a `strategy_update` event AND swap the seat's stored
    // strategy so future decisions see the new plan. The agent's internal
    // closure was already updated by chooseAction; we sync our copy.
    if (!usedFallback && picked.strategyChanged && picked.strategyUpdate) {
      const prevStrategy = seatStrategies[seatIndex];
      seatStrategies[seatIndex] = picked.strategyUpdate;
      ps.strategyUpdates = (ps.strategyUpdates || 0) + 1;
      if (writer) writer.write({
        type: 'strategy_update',
        payload: {
          seat: seatIndex + 1,
          playerNum: currentPlayer.playerNum,
          agent: agentNames[seatIndex],
          round: state.round,
          step: steps,
          changeReason: picked.strategyUpdate.changeReason || '(no reason given)',
          previousSummary: prevStrategy?.summary || null,
          newSummary: picked.strategyUpdate.summary,
          previousMilestonePriority: prevStrategy?.milestonePriority || [],
          newMilestonePriority: picked.strategyUpdate.milestonePriority || [],
          previousBottleneckStat: prevStrategy?.bottleneckStat || null,
          newBottleneckStat: picked.strategyUpdate.bottleneckStat || null,
        },
      });
      if (logDecisions) {
        console.log(`[strategy-shift] seat ${seatIndex + 1} round ${state.round}: ${picked.strategyUpdate.changeReason || '(no reason)'}`);
      }
    }

    // Lite CPP Phase 3: emit per-retry tool_error events BEFORE the
    // agent_decision so the sequence in the JSONL matches the causal order
    // (each failed attempt happened before the final action). retryTrail is
    // populated by the tools-mode agent on both success (empty if first-try)
    // and final failure. Absent for index-mode agents.
    if (writer && Array.isArray(picked.retryTrail) && picked.retryTrail.length > 0) {
      for (const t of picked.retryTrail) {
        writer.write({
          type: 'tool_error',
          payload: {
            playerNum: currentPlayer.playerNum,
            seat: seatIndex + 1,
            round: state.round,
            agent: agentNames[seatIndex],
            attempt: t.attempt,
            tool: t.tool,
            args: t.args,
            reason: t.reason,
            detail: t.detail,
          },
        });
      }
    }

    // Lite CPP Phase 3: emit note_added when the LLM captured a notebook
    // entry alongside its action call. Intra-game scratchpad — game-scoped.
    if (writer && picked.noteAdded) {
      writer.write({
        type: 'note_added',
        payload: {
          playerNum: currentPlayer.playerNum,
          seat: seatIndex + 1,
          round: state.round,
          agent: agentNames[seatIndex],
          text: picked.noteAdded,
        },
      });
    }

    if (writer) writer.write({
      type: 'agent_decision',
      payload: {
        playerNum: currentPlayer.playerNum,
        seat: seatIndex + 1,
        round: state.round,
        agent: agentNames[seatIndex],
        latencyMs,
        outcome,
        errorMessage: errorMsg,
        promptTokens,
        responseTokens,
        actionType: legal[picked.actionIndex]?.type,
        rationale: picked.rationale,
        usedFallback,
        // PHASE 2: Snapshot of which strategy was active when this decision
        // was made. Captured as a summary-only reference (full strategy is
        // available via the most recent strategy_initial / strategy_update
        // event for this seat).
        activeStrategy: seatStrategies[seatIndex]?.summary || null,
        strategyChanged: picked.strategyChanged === true,
        // Lite CPP tools-mode telemetry. Null on index-mode / heuristic / random.
        toolCall: picked.toolCall ?? null,
        attemptsUsed: picked.attemptsUsed ?? null,
        noteAdded: picked.noteAdded ?? null,
        // R2 rollout-mode instrumentation: the LLM's prior vs the search's
        // choice. priorAgreement is the experiment's primary metric.
        llmActionIndex: picked.llmActionIndex ?? null,
        rolloutBestIndex: picked.rolloutBestIndex ?? null,
        priorAgreement: picked.priorAgreement ?? null,
        priorOutcome: picked.priorOutcome ?? null,
        rolloutEvBest: picked.rolloutEvBest ?? null,
        rolloutEvLlm: picked.rolloutEvLlm ?? null,
        rolloutTimeMs: picked.rolloutTimeMs ?? null,
      },
    });

    const chosen = legal[picked.actionIndex];
    const action = { ...chosen, rationale: picked.rationale };

    const { state: s1, events } = applyAction(state, action);
    if (writer) for (const e of events) writer.write(e);
    state = s1;
  }

  // If the watchdog fired, synthesize a term object so the summary still
  // gets written (with reason='game_watchdog'). Downstream scoring/reflection
  // can then treat it like any other game — just one that ran out of time
  // before natural termination.
  const term = watchdogFired
    ? { done: true, winner: null, reason: 'game_watchdog' }
    : isTerminal(state);
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
// Classify an agent-thrown error into a fixed-vocabulary outcome label.
// The Ollama agent attaches err.outcome directly (we check that first in
// the runner). This helper handles agents that don't tag — heuristic /
// random or the legacy interface — by pattern-matching the message.
function classifyErrorMessage(msg) {
  if (!msg) return 'other_error';
  const m = String(msg).toLowerCase();
  if (m.includes('timed out') || m.includes('timeout')) return 'timeout';
  if (m.includes('aborted') || m.includes('abort')) return 'aborted';
  if (m.includes('json parse') || m.includes('missing message.content')) return 'parse_error';
  if (m.includes('out-of-range') || m.includes('invalid actionindex')) return 'out_of_range';
  // Lite CPP tools-mode: after MAX_TOOL_RETRIES exhausted, the agent throws
  // an error tagged 'invalid_tool' (via err.outcome, checked before this
  // fallback classifier). Message-pattern fallback for defensive coverage.
  if (m.includes('dispatch failed') || m.includes('invalid_tool')) return 'invalid_tool';
  if (m.includes('http ') && /\b[45]\d\d\b/.test(m)) return 'http_error';
  if (m.includes('network') || m.includes('econnrefused') || m.includes('fetch failed')) return 'network_error';
  return 'other_error';
}

// ---------- JSONL writer helper ----------

// Simple append-mode JSONL writer. Each object becomes one line.
//
// IMPORTANT: close() returns a Promise that resolves only after the stream
// has fully flushed to disk. Callers that immediately read the file (e.g.
// the tournament harness scoring the just-written game) MUST `await` this
// promise — `stream.end()` is asynchronous and the file can still be
// buffered when readFileSync() runs.
export function createJsonlWriter(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const stream = fs.createWriteStream(filePath, { flags: 'w' });
  return {
    write(obj) { stream.write(JSON.stringify(obj) + '\n'); },
    close() {
      return new Promise((resolve, reject) => {
        stream.once('error', reject);
        stream.end(() => resolve());
      });
    },
  };
}

// ---------- CLI entrypoint ----------

// Only runs when invoked as `node sim/run-one-game.js`, not when imported.
// Comparison via pathToFileURL handles relative vs absolute argv[1] and
// cross-platform path separators. The `|| ''` fallback prevents a crash
// when the module is imported via `node -e "import('...')"` (no argv[1]).
const invokedDirectly = process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  const args = parseArgs(process.argv);
  const seed = Number(args.seed ?? 1);
  const characterKeys = String(args.characters ?? 'technician,sprinter').split(',');
  const agentNames = String(args.agents ?? 'heuristic,heuristic').split(',');
  const policySeed = Number(args['policy-seed'] ?? 1);
  const outputPath = args.output
    ? String(args.output)
    : `results/${new Date().toISOString().slice(0, 10)}/run-${seed}-${agentNames.join('_vs_')}.jsonl`;
  const quiet = !!args.quiet;

  const writer = createJsonlWriter(outputPath);
  try {
    const { summary } = await runOneGame({
      seed, characterKeys, agentNames, policySeed,
      writer, logDecisions: !quiet,
    });
    await writer.close();
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
    await writer.close();
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
 *   --policy-seed=12345
 *       Makes the agents' random choices reproducible too.
 *
 *   --quiet
 *       Suppress the summary print at the end (useful for batch runs).
 */
