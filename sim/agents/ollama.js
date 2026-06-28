// LLM agent backed by Ollama (local LLM runtime).
//
// PREREQUISITE (runs on your M5):
//   1. Install Ollama: brew install ollama
//   2. Start it:      brew services start ollama
//   3. Pull a model:  ollama pull qwen2.5:14b-instruct
//
// HOW IT WORKS:
//   Each turn, we send the model a compact natural-language description of
//   the current state and a numbered list of the legal actions. The model
//   replies with JSON: { "action_index": <int>, "rationale": "<string>" }.
//   That JSON is parsed; action_index is validated against the list
//   length; rationale is recorded in telemetry as the agent's free-form
//   explanation. If anything goes wrong (timeout, invalid JSON, out-of-
//   range index), the runner catches it and uses the engine fallback.
//
// DESIGN NOTES:
//   - Temperature 0.3: we want deterministic-ish play with enough variety
//     to see creative lines.
//   - format: 'json' tells Ollama to constrain output to valid JSON.
//   - We send only the information a human would see from this player's
//     seat: full self info, shared state, and only the CURRENT legal
//     actions enumerated. Full observation history is NOT sent per turn —
//     the model has no memory across turns. This is a deliberate design
//     choice for the first version; adding a short recent-events window
//     would be the first thing to try if play is weak.

import { CHARACTERS, GEAR_SHOP } from '../../engine/data.js';
import { computeEffectiveStats, checkAreaAccess } from '../../engine/helpers.js';

export function createOllamaAgent({
  model,
  host = 'http://localhost:11434',
  temperature = 0.3,
  timeoutMs = 15000,
  rewardCreativity = true,  // include "prefer creative lines" in system prompt
}) {
  if (!model) throw new Error('ollama agent: `model` is required (e.g. "qwen2.5:14b-instruct")');

  // Per-agent strategic memory. Set by planStrategy() at game start, updated
  // by chooseAction() when the model declares a strategy shift. Used as
  // context in subsequent decisions so the model can reference its own plan.
  let currentStrategy = null;

  return {
    name: `ollama:${model}`,
    getCurrentStrategy() { return currentStrategy; },

    // PHASE 1: Strategic planning call — invoked ONCE at game start by the
    // runner. The model surveys its character, the drawn milestones, and
    // the opening board state, and produces a structured strategy. Costs
    // one extra ~10-15s LLM call per LLM seat per game.
    async planStrategy({ state, legalActions, player, abortSignal, memoryContext }) {
      const char = player.character;
      const systemPrompt = buildStrategySystemPrompt(char.key, rewardCreativity, !!memoryContext);
      const userPrompt = buildStrategyUserPrompt(state, legalActions, player, memoryContext);

      const body = {
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userPrompt },
        ],
        stream: false,
        format: 'json',
        options: { temperature },
      };

      const res = await fetchWithTimeout(
        `${host}/api/chat`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
        timeoutMs,
        abortSignal,
      );
      if (!res.ok) throw tagged('http_error', `ollama HTTP ${res.status}: ${await res.text().catch(() => '')}`);

      const data = await res.json();
      const content = data?.message?.content;
      if (!content) throw tagged('parse_error', 'ollama response missing message.content');

      let parsed;
      try { parsed = JSON.parse(content); }
      catch (e) { throw tagged('parse_error', `ollama strategy JSON parse failed: ${content.slice(0, 120)}`); }

      // Validate the shape — surface a useful error if any required field is missing.
      const strategy = {
        summary: stringField(parsed.summary, 600) || '(no summary)',
        milestonePriority: Array.isArray(parsed.milestone_priority)
          ? parsed.milestone_priority.filter(t => ['beginner', 'intermediate', 'expert'].includes(t))
          : [],
        bottleneckStat: stringField(parsed.bottleneck_stat, 50) || 'unknown',
        openingMoves: Array.isArray(parsed.opening_moves)
          ? parsed.opening_moves.slice(0, 6).map(s => stringField(s, 200))
          : [],
        anticipatedRisks: Array.isArray(parsed.anticipated_risks)
          ? parsed.anticipated_risks.slice(0, 4).map(s => stringField(s, 200))
          : [],
      };
      currentStrategy = strategy;
      return {
        strategy,
        promptTokens: data.prompt_eval_count ?? null,
        responseTokens: data.eval_count ?? null,
      };
    },

    // Allow the runner to inject an externally-set strategy (used when the
    // runner reads a strategy_update event and needs to keep the agent in sync).
    setCurrentStrategy(s) { currentStrategy = s; },

    // PHASE 2 (tournament experiment): Self-reflection at game end. The model
    // surveys what just happened — its initial plan, every strategy shift, the
    // final outcome, and the computed score — and writes structured notes that
    // can be fed back into the next game's context (tournament memory).
    //
    // Output schema is a hybrid: structured outer fields for machine indexing
    // + free-text inner fields so the model can articulate nuance.
    async reflectOnGame({ finalState, player, scoreData, initialStrategy, strategyUpdates, abortSignal }) {
      const char = player.character;
      const systemPrompt = buildReflectionSystemPrompt(char.key);
      const userPrompt = buildReflectionUserPrompt({
        finalState, player, scoreData, initialStrategy, strategyUpdates,
      });

      const body = {
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userPrompt },
        ],
        stream: false,
        format: 'json',
        options: { temperature },
      };

      const res = await fetchWithTimeout(
        `${host}/api/chat`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
        timeoutMs,
        abortSignal,
      );
      if (!res.ok) throw tagged('http_error', `ollama HTTP ${res.status}: ${await res.text().catch(() => '')}`);

      const data = await res.json();
      const content = data?.message?.content;
      if (!content) throw tagged('parse_error', 'ollama reflection response missing content');

      let parsed;
      try { parsed = JSON.parse(content); }
      catch (e) { throw tagged('parse_error', `ollama reflection JSON parse failed: ${content.slice(0, 120)}`); }

      const reflection = {
        summary: stringField(parsed.summary, 800) || '(no summary)',
        what_worked: stringField(parsed.what_worked, 600) || '',
        what_failed: stringField(parsed.what_failed, 600) || '',
        // Per-strategy commentary: for each strategy (initial + each update),
        // did it succeed and why we pivoted (or stayed).
        strategy_history: Array.isArray(parsed.strategy_history)
          ? parsed.strategy_history.slice(0, 10).map(entry => ({
              round: typeof entry.round === 'number' ? entry.round : null,
              plan: stringField(entry.plan, 300) || '',
              outcome: stringField(entry.outcome, 300) || '',
              why_shifted_or_kept: stringField(entry.why_shifted_or_kept, 400) || '',
            }))
          : [],
        score_reflection: stringField(parsed.score_reflection, 600) || '',
        advice_for_next_game: stringField(parsed.advice_for_next_game, 800) || '',
      };

      return {
        reflection,
        promptTokens: data.prompt_eval_count ?? null,
        responseTokens: data.eval_count ?? null,
      };
    },

    async chooseAction({ state, legalActions, player, abortSignal, currentStrategy: externalStrategy }) {
      // Use the explicit strategy passed by the caller if provided; else fall
      // back to the agent's internal memory. This makes the runner the source
      // of truth and avoids races if the same agent is used across games.
      const strategyForPrompt = externalStrategy || currentStrategy;
      const char = player.character;
      const systemPrompt = buildSystemPrompt(char.key, rewardCreativity);
      // Recent-actions history: pull this player's last few actions THIS round
      // so the LLM can avoid repeating attempts that already failed. Without
      // this, qwen2.5:7b kept smashing into the same expert milestone every
      // turn — it had no memory of the prior turn's outcome.
      const recentHistory = extractRecentHistory(state, player.playerNum, 8);
      const userPrompt = buildUserPrompt(state, legalActions, player, recentHistory, strategyForPrompt);

      const body = {
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userPrompt },
        ],
        stream: false,
        format: 'json',
        options: { temperature },
      };

      const res = await fetchWithTimeout(
        `${host}/api/chat`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
        timeoutMs,
        abortSignal,
      );

      if (!res.ok) {
        throw tagged('http_error', `ollama HTTP ${res.status}: ${await res.text().catch(() => '')}`);
      }

      const data = await res.json();
      const content = data?.message?.content;
      if (!content) throw tagged('parse_error', 'ollama response missing message.content');

      let parsed;
      try { parsed = JSON.parse(content); }
      catch (e) { throw tagged('parse_error', `ollama JSON parse failed: ${content.slice(0, 120)}`); }

      const idx = parsed.action_index;
      if (!Number.isInteger(idx) || idx < 0 || idx >= legalActions.length) {
        throw tagged('out_of_range', `ollama returned out-of-range action_index ${idx} (legal: 0..${legalActions.length - 1})`);
      }

      const rationale = typeof parsed.rationale === 'string'
        ? parsed.rationale.slice(0, 500)
        : '(no rationale)';

      // PHASE 2: Strategy-shift detection. The model can declare a strategy
      // change at any turn via three optional fields. We validate them
      // strictly — missing or malformed fields are treated as "no change"
      // rather than failing the whole decision.
      const strategyChanged = parsed.strategy_changed === true;
      let strategyUpdate = null;
      if (strategyChanged) {
        const newSummary = stringField(parsed.new_strategy_summary, 600);
        const changeReason = stringField(parsed.change_reason, 400);
        if (newSummary) {
          // Build a "shallow update" strategy: carry forward the prior plan's
          // structural fields, swap in the new summary. Anchored bookkeeping
          // (priority order, bottleneck stat) can also be updated if the
          // model provides them.
          strategyUpdate = {
            summary: newSummary,
            changeReason: changeReason || '(no reason given)',
            milestonePriority: Array.isArray(parsed.new_milestone_priority)
              ? parsed.new_milestone_priority.filter(t => ['beginner', 'intermediate', 'expert'].includes(t))
              : (strategyForPrompt?.milestonePriority || []),
            bottleneckStat: stringField(parsed.new_bottleneck_stat, 50)
              || strategyForPrompt?.bottleneckStat || 'unknown',
            // Open carries the prior openingMoves / risks unchanged — those
            // are game-start artifacts, not per-turn revisions.
            openingMoves: strategyForPrompt?.openingMoves || [],
            anticipatedRisks: strategyForPrompt?.anticipatedRisks || [],
          };
          // Persist into the agent's internal memory so subsequent turns get
          // the updated context even if the caller forgets to pass it.
          currentStrategy = strategyUpdate;
        }
      }

      // Ollama returns `prompt_eval_count` (input tokens) and `eval_count`
      // (output tokens) at the top level of the chat response. Capture both
      // as part of per-decision telemetry.
      return {
        actionIndex: idx,
        rationale,
        strategyChanged,
        strategyUpdate,                  // null if no change; full object if changed
        promptTokens: data.prompt_eval_count ?? null,
        responseTokens: data.eval_count ?? null,
      };
    },
  };
}

// Attach an `outcome` tag to thrown errors so the harness can classify
// without parsing the message string downstream.
function tagged(outcome, message) {
  const err = new Error(message);
  err.outcome = outcome;
  return err;
}

// Coerce + length-cap an arbitrary value into a safe string field. Used when
// validating LLM JSON output where the model may return numbers, nulls, or
// objects where strings are expected.
function stringField(v, maxLen) {
  if (v == null) return null;
  return String(v).slice(0, maxLen);
}

// --- Prompt builders ---

// --- Reflection prompt builders (Phase 2 — tournament experiment) ---
//
// The reflection prompt is the model's chance to look back at a complete game
// and articulate what worked, what didn't, and what to do differently next
// time. It receives BOTH the structured outcome (score, milestones, win/lose,
// ability triggers) AND its own prior strategic intent (initial plan + every
// shift), so it can compare intent vs reality and explain pivots.
//
// The structured output becomes the "lesson learned" entry in the per-character
// memory file that the next game in the same tournament reads as context.

function buildReflectionSystemPrompt(characterKey) {
  const tmpl = CHARACTERS[characterKey];
  return [
    `You are playing the board game "All In Ascent" as ${tmpl.name} (${tmpl.archetype}).`,
    ``,
    `A game just ended. You will now reflect on what happened so that you can play better next time.`,
    ``,
    `YOUR SCORING SYSTEM:`,
    `  - Winning the game: +100 points (the big prize)`,
    `  - Each milestone completed: +25 points`,
    `  - Creative use of your ${tmpl.specialAbility.name} ability: +10 × ln(1 + triggers) points (diminishing returns; first uses worth most)`,
    `  - Each fallback (failed response): −1 point`,
    `  Total possible: ~200+ in a strong winning game. The win bonus is by far the biggest single contributor.`,
    ``,
    `REFLECTION TASK:`,
    `Look at the final state, your score breakdown, and the strategy history. Write a structured reflection that:`,
    `  1. Summarizes what happened in the game`,
    `  2. Identifies what worked (decisions or plans that paid off)`,
    `  3. Identifies what failed (decisions or plans that backfired)`,
    `  4. Walks through each strategy you had during the game — your initial plan and every shift — and says whether each strategy succeeded and why you pivoted (or kept it)`,
    `  5. Reflects on the score — what was the biggest gap between your score and a higher score?`,
    `  6. Gives ADVICE TO YOUR FUTURE SELF for the next game: 2-3 concrete recommendations`,
    ``,
    `Be honest. If your plan was wrong, say so. If you executed poorly despite a good plan, say that. The point is to learn.`,
    ``,
    `OUTPUT FORMAT — respond with EXACTLY one JSON object, no other text:`,
    `{`,
    `  "summary": "<3-5 sentences describing what happened>",`,
    `  "what_worked": "<concrete moments where a decision or plan paid off>",`,
    `  "what_failed": "<concrete moments where things went wrong>",`,
    `  "strategy_history": [`,
    `    {`,
    `      "round": <number, when this strategy was active>,`,
    `      "plan": "<short — what this strategy intended>",`,
    `      "outcome": "<did it succeed, partially succeed, or fail>",`,
    `      "why_shifted_or_kept": "<why I pivoted away from this OR why I stuck with it>"`,
    `    },`,
    `    ...one entry per strategy you had during the game...`,
    `  ],`,
    `  "score_reflection": "<your honest assessment of the final score and what the biggest gap was>",`,
    `  "advice_for_next_game": "<2-3 sentences of concrete recommendations to your future self>"`,
    `}`,
  ].join('\n');
}

function buildReflectionUserPrompt({ finalState, player, scoreData, initialStrategy, strategyUpdates }) {
  const char = player.character;
  const lines = [];

  lines.push(`The game just ended. You played ${char.name}.`);
  lines.push(``);
  lines.push(`FINAL OUTCOME:`);
  lines.push(`  Result:              ${scoreData.win ? 'WIN' : 'LOSS'}`);
  lines.push(`  Milestones cleared:  ${scoreData.milestonesCompleted}/3`);
  lines.push(`  Ability triggers:    ${scoreData.abilityTriggers} (the ${char.specialAbility.name})`);
  lines.push(`  Fallback count:      ${scoreData.fallbackCount}`);
  lines.push(`  Game length:         ${finalState.round} rounds`);
  lines.push(``);
  lines.push(`FINAL SCORE: ${scoreData.score} points`);
  lines.push(`  ${scoreData.scoreBreakdown.win} from win`);
  lines.push(`  ${scoreData.scoreBreakdown.milestones} from milestones`);
  lines.push(`  ${scoreData.scoreBreakdown.ability} from ability triggers (logarithmic)`);
  lines.push(`  ${scoreData.scoreBreakdown.fallbackPenalty} from fallback penalty`);
  lines.push(``);
  lines.push(`FINAL CHARACTER STATE:`);
  lines.push(`  Level:        ${char.level}`);
  lines.push(`  Total XP:     ${char.xp}`);
  lines.push(`  Stats:        Str ${char.stats.strength} (+${char.trainingBonuses.strength} trained, +${char.gearBonuses.strength} gear) | Tech ${char.stats.technique} | Focus ${char.stats.focus} | Flex ${char.stats.flexibility}`);
  lines.push(`  Endurance:    ${char.currentEndurance} / ${char.maxEndurance}`);
  lines.push(`  Equipment:    ${char.equipment.length ? char.equipment.join(', ') : '(none)'}`);
  lines.push(`  Milestones done: ${Object.entries(char.milestonesCompleted).filter(([, v]) => v).map(([k]) => k).join(', ') || '(none)'}`);
  lines.push(``);

  lines.push(`OPPONENTS' FINAL STATE:`);
  for (const p of finalState.players) {
    if (p.playerNum === player.playerNum) continue;
    const done = Object.entries(p.character.milestonesCompleted).filter(([, v]) => v).map(([k]) => k).join(', ') || 'none';
    lines.push(`  Player ${p.playerNum} (${p.character.name}, L${p.character.level}): milestones [${done}]`);
  }
  lines.push(``);

  lines.push(`YOUR INITIAL STRATEGY (round 1):`);
  if (initialStrategy) {
    lines.push(`  Plan: ${initialStrategy.summary}`);
    lines.push(`  Bottleneck stat (your call): ${initialStrategy.bottleneckStat}`);
    if (initialStrategy.milestonePriority?.length) {
      lines.push(`  Milestone order: ${initialStrategy.milestonePriority.join(' → ')}`);
    }
    if (initialStrategy.openingMoves?.length) {
      lines.push(`  Opening moves planned:`);
      for (const m of initialStrategy.openingMoves) lines.push(`    - ${m}`);
    }
  } else {
    lines.push(`  (no initial strategy recorded)`);
  }
  lines.push(``);

  if (strategyUpdates?.length) {
    lines.push(`STRATEGY SHIFTS DURING THE GAME (${strategyUpdates.length} total):`);
    for (const u of strategyUpdates) {
      lines.push(`  Round ${u.round} — trigger: ${u.changeReason}`);
      lines.push(`    From: ${u.previousSummary || '(none)'}`);
      lines.push(`    To:   ${u.newSummary}`);
      if (u.previousBottleneckStat !== u.newBottleneckStat) {
        lines.push(`    Bottleneck stat: ${u.previousBottleneckStat || '?'} → ${u.newBottleneckStat || '?'}`);
      }
    }
  } else {
    lines.push(`STRATEGY SHIFTS: none — you stayed on the initial plan throughout.`);
  }
  lines.push(``);

  lines.push(`Now reflect — produce the structured JSON described above.`);
  return lines.join('\n');
}

// --- Strategy prompt builders (Phase 1) ---
//
// The strategic-planning call uses the SAME system context as decisions
// (identity + rules + scoring rubric) but asks for a *plan* instead of an
// action. The output schema is structured so downstream analysis can compare
// plans across games and characters without hand-parsing free text.

function buildStrategySystemPrompt(characterKey, rewardCreativity, hasMemory = false) {
  const tmpl = CHARACTERS[characterKey];
  const ability = tmpl.specialAbility;
  return [
    `You are playing the board game "All In Ascent" as ${tmpl.name} (${tmpl.archetype}).`,
    ``,
    hasMemory
      ? `IMPORTANT: You have played this exact starting position (same seed) before. Your prior games — including your strategy, the outcome, and your own reflection on what worked and failed — are provided below. Your task is to FORM A NEW STRATEGY that scores HIGHER than your best prior score. Learn from your past games. Don't just repeat what failed.`
      : null,
    hasMemory ? `` : null,
    `HOW TO WIN: Complete ALL THREE milestone routes (beginner, intermediate, expert) before any opponent does. The game continues until someone completes all three — there is no round limit.`,
    ``,
    `YOUR UNIQUE ABILITY — ${ability.name}:`,
    `  ${ability.description}`,
    `  This ability is what sets your character apart. Your strategy should explicitly account for how it gives you an edge.`,
    ``,
    `GAME MECHANICS (the same rules apply throughout the game):`,
    `- Training: +5 to one stat (permanent). Costs 2 time + endurance.`,
    `- Rest: restores endurance to max. Costs 1 time.`,
    `- Climbing: dice + stats vs requirements. Failed climbs earn reduced XP. Same route cannot be retried within a round.`,
    `- Areas: Bouldering and Top Rope are OPEN (no gear needed). Lead Climbing needs Belay Device + Locking Carabiner + Lead Rope. Free Solo bypasses gear access.`,
    `- Top Rope belayers: there are (players - 1) belayer stations, each with 2 routes and room for only ONE climber. A station another player is using is blocked for you until routes clear.`,
    `- Route clearing: at end of every round, ONE area's regular routes are wiped AND all players return to the Lobby (freeing belayers). Milestones are never wiped.`,
    ``,
    `TASK: This is the very beginning of the game. You have just seen the milestone routes drawn, the opening route rotation, the gear shop, and your opponents. Like any thoughtful player, you form an OVERALL STRATEGY before making any moves — what you intend to do and why.`,
    ``,
    // Tournament-only: explain the score so the model can plan with the
    // reward function in mind. Without this the model wouldn't know that
    // ability use is logarithmic, etc.
    hasMemory ? `YOUR SCORING SYSTEM (you are optimizing for a higher score than your prior games):` : null,
    hasMemory ? `  - Winning the game: +100 points (by far the largest single contributor)` : null,
    hasMemory ? `  - Each milestone completed: +25 points (so 3/3 milestones = +75)` : null,
    hasMemory ? `  - Each creative use of your ${ability.name} ability: +10 × ln(1 + uses) points (diminishing returns: first uses are most valuable, beyond ~10 uses extra triggers give very little)` : null,
    hasMemory ? `  - Each fallback (failed response): −1 point` : null,
    hasMemory ? `  A strong winning game (won, 3/3 milestones, ~10 ability uses) scores around 200. A typical losing game in your prior runs scored 60-95.` : null,
    hasMemory ? `` : null,
    rewardCreativity
      ? `Your strategy will also be scored on CREATIVE USE OF YOUR ABILITY: lines that turn your character's quirk into a real advantage outscore mechanical wins. Articulate where your ability will matter.`
      : `Your strategy is scored solely on whether it lets you complete all 3 milestones first.`,
    ``,
    `OUTPUT FORMAT — respond with EXACTLY one JSON object, no other text:`,
    `{`,
    `  "summary": "<2-3 sentences describing your overall plan to win>",`,
    `  "milestone_priority": ["beginner" | "intermediate" | "expert", ...],  // the order you intend to attempt the 3 milestones`,
    `  "bottleneck_stat": "strength" | "technique" | "focus" | "flexibility",  // which stat is your worst gap vs the milestones drawn`,
    `  "opening_moves": ["<short description of move 1>", "<move 2>", ...],  // up to 6 concrete actions you plan to take in early rounds`,
    `  "anticipated_risks": ["<risk 1>", "<risk 2>"]  // 1-3 things that could derail this plan and what you'll do about them`,
    `}`,
  ].filter(Boolean).join('\n');
}

function buildStrategyUserPrompt(state, legalActions, player, memoryContext = null) {
  const char = player.character;
  const lines = [];

  // PHASE 3: Tournament memory. If the runner provided a memory block (a
  // string formatted by sim/tournament/memory.js), insert it at the very
  // top so the model reads its prior games before seeing the current state.
  if (memoryContext) {
    lines.push(memoryContext);
    lines.push(``);
  }

  lines.push(`Round 1. You are Player ${player.playerNum} — ${char.name} (Level ${char.level}).`);
  lines.push(``);
  lines.push(`YOUR STARTING STATE:`);
  lines.push(`  Base stats: Str ${char.stats.strength} | Tech ${char.stats.technique} | Focus ${char.stats.focus} | Flex ${char.stats.flexibility}`);
  lines.push(`  Endurance:  ${char.currentEndurance} / ${char.maxEndurance}`);
  lines.push(`  Special ability: ${char.specialAbility.name} — ${char.specialAbility.description}`);
  lines.push(``);

  // Milestone targets WITH the per-stat gap from current effective stats.
  // The gap is the most actionable input for forming a strategy.
  lines.push(`MILESTONE TARGETS (this is what you must win — pay attention to the gaps):`);
  for (const tier of ['beginner', 'intermediate', 'expert']) {
    const m = state.milestoneRoutes[tier];
    if (!m) continue;
    const r = m.route;
    const tagStr = r.tag ? ` [tag: ${r.tag}]` : ' [untagged]';
    const access = checkAreaAccess(char, m.area);
    const accessNote = access.hasAccess ? 'OPEN' : `BLOCKED (need ${access.missingItems.join(', ')})`;
    const eff = computeEffectiveStats(char, r, m.area, {});
    const gaps = `Str${eff.strength - r.strength >= 0 ? '+' : ''}${eff.strength - r.strength} `
              + `Tec${eff.technique - r.technique >= 0 ? '+' : ''}${eff.technique - r.technique} `
              + `Foc${eff.focus - r.focus >= 0 ? '+' : ''}${eff.focus - r.focus} `
              + `Fle${eff.flexibility - r.flexibility >= 0 ? '+' : ''}${eff.flexibility - r.flexibility}`;
    lines.push(`  ${tier}: ${r.name} (${r.grade}, ${m.area})${tagStr}`);
    lines.push(`    req Str ${r.strength} / Tech ${r.technique} / Focus ${r.focus} / Flex ${r.flexibility}, Endurance ${r.endurance}`);
    lines.push(`    your current gaps: ${gaps}`);
    lines.push(`    access: ${accessNote}`);
  }
  lines.push(``);

  lines.push(`OPPONENTS:`);
  for (const p of state.players) {
    if (p.playerNum === player.playerNum) continue;
    lines.push(`  Player ${p.playerNum} — ${p.character.name} (${p.character.archetype})`);
    lines.push(`    Base stats: S${p.character.stats.strength} T${p.character.stats.technique} F${p.character.stats.focus} X${p.character.stats.flexibility}, ability: ${p.character.specialAbility.name}`);
  }
  lines.push(``);

  // Surface what's available in the gear shop NOW since it informs the
  // opening-moves plan (which gear to prioritize buying).
  const accessGear = ['Belay Device', 'Locking Carabiner', 'Lead Rope'];
  const inShop = (state.availableGear || []).map(g => g.name).join(', ') || '(none)';
  lines.push(`SHOP (rotating slots): ${inShop}`);
  lines.push(`SHOP (Lead access cards always available): ${accessGear.join(', ')}`);
  lines.push(``);

  lines.push(`Form your strategy now. Respond with exactly one JSON object matching the schema above.`);
  return lines.join('\n');
}

function buildSystemPrompt(characterKey, rewardCreativity) {
  const tmpl = CHARACTERS[characterKey];
  const ability = tmpl.specialAbility;
  // The prompt is intentionally LIGHT on prescriptive strategy. The user's
  // design goal is to have the LLM NATURALLY find a strategic path to
  // victory, not follow a checklist. We give it: the win condition, its
  // unique advantage, the scoring rubric (win + creative ability use),
  // the game state, and the legal actions. Strategy is its job, not ours.
  return [
    `You are playing the board game "All In Ascent" as ${tmpl.name} (${tmpl.archetype}).`,
    ``,
    `HOW TO WIN: Complete ALL THREE milestone routes (beginner, intermediate, expert) before any opponent does. The game continues until someone completes all three — there is no round limit.`,
    ``,
    `YOUR UNIQUE ABILITY — ${ability.name}:`,
    `  ${ability.description}`,
    `  This ability is what sets your character apart. Lean into it. Find moments where it gives you an edge other players don't have.`,
    ``,
    `ROUTE TAGS: Each climb is tagged as one of {Pinch/Crimp, Toe/Heel Hook, Roof/Sloper, Dynamic}, or untagged. Some gear cards in the shop target specific tags. Notice patterns in your milestones — if multiple share a tag, gear that targets that tag may be especially valuable.`,
    ``,
    // A1: Mechanical rules block — give the model concrete knowledge about
    // how each action type works so it's not guessing at training/rest/
    // access mechanics. Kept compact (~150 tokens).
    `GAME MECHANICS:`,
    `- Training: +5 to one stat (permanent). Costs 2 time + endurance (per-station cost is shown in the action list). One player per training station per round.`,
    `- Rest: restores endurance to max. Costs 1 time. No other side effect.`,
    `- Climbing: dice + stats vs requirements. Failed climbs still earn reduced XP. The same route cannot be retried within the same round.`,
    `- Access cards: Bouldering and Top Rope are OPEN (no gear required). Lead Climbing needs Belay Device + Locking Carabiner + Lead Rope. Free Solo bypasses gear access requirements.`,
    `- Top Rope belayers: the area is split into (players - 1) belayer stations, each holding 2 routes and admitting only ONE climber. You occupy a station by climbing one of its routes; switching to another station's routes is fine if that station is free, but a station an opponent holds blocks BOTH its routes for you until routes clear. Lead Climbing has a single belayer — only one climber there at a time. Bouldering is unlimited.`,
    `- Route clearing: at end of every round, ONE climbing area's regular routes are wiped and replaced (all Top Rope stations refresh together), and every player returns to the Lobby. The cycle is Lead Climbing -> Top Rope -> Bouldering. Milestone routes are NOT affected.`,
    ``,
    // A3: Access-card priority primer — flag the structural decision that
    // the model has been blind to across every prior LLM playtest.
    `ACCESS CARDS PRIORITY: If any of your milestone routes is in Lead Climbing, you cannot attempt it without the three access cards (Belay Device, Locking Carabiner, Lead Rope). Buying them early is often more valuable than incremental training. Top Rope needs no gear.`,
    ``,
    rewardCreativity
      ? `HOW YOU ARE SCORED — TWO things, both equally:
  1. WINNING the game (completing all 3 milestones first).
  2. CREATIVE USE OF YOUR ABILITY — using it in unexpected, risky, or non-obvious ways that turn your character's quirk into an advantage. A creative loss can outscore a mechanical win.

  We track every activation of your ability and every climb where it mattered. Express in your rationale when you are deliberately leveraging your character's identity.`
      : `You are scored only on completing all 3 milestones first.`,
    ``,
    `ON EACH TURN you will see: your current state (stats, endurance, XP, gear, time remaining), the three milestone routes, your opponents' progress, your recent actions, YOUR CURRENT STRATEGY (the plan you formed at game start, possibly updated since), and a numbered list of every legal action — each with the relevant numbers (requirements, your effective stats, costs, rewards). Use those numbers and your judgment.`,
    ``,
    // PHASE 2: Strategy-shift evaluation as part of every decision.
    `STRATEGY EVALUATION (every turn): Before picking an action, compare what's happening to your current strategy. If new information (opponent progress, a failed climb, a route you needed got cleared, an unforeseen gear opportunity) materially changes what the best plan is, declare a strategy shift. If your plan still fits, keep it.`,
    ``,
    `OUTPUT FORMAT — respond with EXACTLY one JSON object, no other text:`,
    `{`,
    `  "action_index": <integer, 0-based>,`,
    `  "rationale": "<one short sentence — what you are trying and why>",`,
    `  "strategy_changed": <true | false>,    // true ONLY if you are declaring a strategy shift this turn`,
    `  "change_reason": "<short — what new info forced the shift>",   // omit or empty string when strategy_changed is false`,
    `  "new_strategy_summary": "<2-3 sentences describing the updated plan>",   // required when strategy_changed is true`,
    `  "new_milestone_priority": ["beginner" | "intermediate" | "expert", ...],   // optional, only when the priority order itself changed`,
    `  "new_bottleneck_stat": "strength" | "technique" | "focus" | "flexibility"   // optional, only when your bottleneck stat changed`,
    `}`,
  ].filter(Boolean).join('\n');
}

// Pull the last K relevant events for THIS player so the LLM has memory of
// what it just tried. Without this, the model would re-attempt the same
// failed milestone every turn because each turn was a fresh prompt.
function extractRecentHistory(state, playerNum, k) {
  const out = [];
  // Walk events in REVERSE so we pick up the most recent first, then reverse
  // again before returning so chronological order is preserved.
  for (let i = state.events.length - 1; i >= 0 && out.length < k; i--) {
    const e = state.events[i];
    if (e.type === 'climb_resolved' && e.payload.playerNum === playerNum) {
      const tag = e.payload.isMilestone ? `MILESTONE-${e.payload.difficulty}` : 'climb';
      out.push(`${tag} "${e.payload.routeName}" → ${e.payload.success ? 'SUCCESS' : 'FAIL'} (cost: ${e.payload.enduranceCost} endurance, ${e.payload.timeCost} time, +${e.payload.xpGained} XP)`);
    } else if (e.type === 'gear_purchased' && e.payload.playerNum === playerNum) {
      out.push(`bought ${e.payload.gearName} for ${e.payload.cost} XP`);
    } else if (e.type === 'level_up' && e.payload.playerNum === playerNum) {
      out.push(`leveled up to L${e.payload.newLevel}`);
    } else if (e.type === 'milestone_progress' && e.payload.playerNum === playerNum) {
      out.push(`completed ${e.payload.tier} MILESTONE (${e.payload.totalCompleted}/3 done)`);
    }
  }
  return out.reverse();
}

function buildUserPrompt(state, legalActions, player, recentHistory = [], currentStrategy = null) {
  const char = player.character;
  const lines = [];
  lines.push(`Round ${state.round}. You are Player ${player.playerNum} — ${char.name} (Level ${char.level}).`);
  lines.push(``);

  // PHASE 2: Current strategy block. Shown to the model on every turn so it
  // can evaluate whether the plan still fits before picking an action.
  if (currentStrategy) {
    lines.push(`YOUR CURRENT STRATEGY (decide whether to keep or update it):`);
    lines.push(`  Plan: ${currentStrategy.summary}`);
    if (currentStrategy.milestonePriority?.length) {
      lines.push(`  Milestone order: ${currentStrategy.milestonePriority.join(' → ')}`);
    }
    if (currentStrategy.bottleneckStat) {
      lines.push(`  Bottleneck stat: ${currentStrategy.bottleneckStat}`);
    }
    if (currentStrategy.openingMoves?.length) {
      lines.push(`  Original opening moves: ${currentStrategy.openingMoves.join(' | ')}`);
    }
    if (currentStrategy.anticipatedRisks?.length) {
      lines.push(`  Anticipated risks: ${currentStrategy.anticipatedRisks.join(' | ')}`);
    }
    lines.push(``);
  } else {
    lines.push(`YOUR CURRENT STRATEGY: (none recorded yet — treat this turn as a fresh planning moment.)`);
    lines.push(``);
  }

  lines.push(`YOUR STATE:`);
  lines.push(`  Stats:        Str ${char.stats.strength} | Tech ${char.stats.technique} | Focus ${char.stats.focus} | Flex ${char.stats.flexibility}`);
  lines.push(`  Training:     +${char.trainingBonuses.strength} / +${char.trainingBonuses.technique} / +${char.trainingBonuses.focus} / +${char.trainingBonuses.flexibility}`);
  lines.push(`  Gear bonus:   +${char.gearBonuses.strength} / +${char.gearBonuses.technique} / +${char.gearBonuses.focus} / +${char.gearBonuses.flexibility}`);
  lines.push(`  Endurance:    ${char.currentEndurance} / ${char.maxEndurance}`);
  lines.push(`  Time this turn: ${char.timeRemaining}`);
  lines.push(`  XP total:     ${char.xp}`);
  lines.push(`  Equipment:    ${char.equipment.length ? char.equipment.join(', ') : '(none)'}`);
  lines.push(`  Milestones done: ${Object.entries(char.milestonesCompleted).filter(([, v]) => v).map(([k]) => k).join(', ') || '(none yet)'}`);
  if (char.betaBoostActive) lines.push(`  Beta Boost: ACTIVE (next climb: +3 all stats)`);
  lines.push(``);

  lines.push(`MILESTONE TARGETS:`);
  for (const tier of ['beginner', 'intermediate', 'expert']) {
    const m = state.milestoneRoutes[tier];
    const r = m.route;
    const tagStr = r.tag ? ` [tag: ${r.tag}]` : ' [untagged]';
    lines.push(`  ${tier}: ${r.name} (${r.grade}, ${m.area})${tagStr} — req Str ${r.strength} / Tech ${r.technique} / Focus ${r.focus} / Flex ${r.flexibility}, Endurance ${r.endurance}`);
  }
  lines.push(``);

  // B2: Milestone access readout — explicitly surface which milestones the
  // player is locked out of due to missing access cards. Targets the
  // access-card-blindness bug.
  lines.push(`MILESTONE ACCESS:`);
  const accessCardNames = ['Belay Device', 'Locking Carabiner', 'Lead Rope'];
  for (const tier of ['beginner', 'intermediate', 'expert']) {
    const m = state.milestoneRoutes[tier];
    if (!m) continue;
    const a = checkAreaAccess(char, m.area);
    const tierLabel = tier.padEnd(13);
    if (a.hasAccess) {
      lines.push(`  ${tierLabel} (${m.area}) OPEN`);
    } else {
      const haveCards = char.equipment.filter(e => accessCardNames.includes(e));
      const haveStr = haveCards.length ? `have: ${haveCards.join(', ')}` : 'have: none';
      lines.push(`  ${tierLabel} (${m.area}) BLOCKED — need: ${a.missingItems.join(', ')} (${haveStr})`);
    }
  }
  lines.push(``);

  lines.push(`OPPONENTS:`);
  for (const p of state.players) {
    if (p.playerNum === player.playerNum) continue;
    const done = Object.entries(p.character.milestonesCompleted).filter(([, v]) => v).map(([k]) => k[0].toUpperCase()).join('') || '-';
    lines.push(`  Player ${p.playerNum} (${p.character.name}, L${p.character.level}): milestones ${done}`);
  }
  lines.push(``);

  // RECENT HISTORY block — gives the model memory across turns within a game.
  // Without this, the model has no idea it just failed the same milestone
  // five turns in a row.
  if (recentHistory.length > 0) {
    lines.push(`YOUR RECENT ACTIONS (most recent last):`);
    for (const h of recentHistory) lines.push(`  - ${h}`);
    lines.push(``);
  }

  // B3: Round-clearing warning — tell the model which climbing area's 5
  // regular routes are about to be wiped. Last chance to attempt them this
  // rotation. Milestone routes are NOT cleared.
  const clearingMap = { 0: 'Lead Climbing', 1: 'Top Rope', 2: 'Bouldering' };
  const clearingAreaLabel = clearingMap[state.routeClearingPosition] || 'unknown';
  lines.push(`ROUND CLEARING: at end of this round, ${clearingAreaLabel}'s regular routes will be wiped and replaced, and all players return to the Lobby (freeing belayers). This is your last chance this rotation to attempt them. (Milestone routes are not affected.)`);
  lines.push(``);

  lines.push(`LEGAL ACTIONS (pick one by index):`);
  // Pass the full player (not just char) through so formatAction has access
  // to the playerNum for looking up the attemptedRoutes map.
  for (let i = 0; i < legalActions.length; i++) {
    lines.push(`  ${i}. ${formatAction(legalActions[i], state, player)}`);
  }
  lines.push(``);
  lines.push(`Respond with exactly: {"action_index": <0..${legalActions.length - 1}>, "rationale": "<why>"}`);
  return lines.join('\n');
}

// Compute and format the per-stat gap between effective stats and a route's
// requirements. Returns a string like "GAPS: Str+5 Tech-3 Focus-12 Flex+2".
// Worst-stat gap is also returned numerically for quick rule application.
function gapsLabel(eff, req) {
  const gaps = {
    Str:  eff.strength    - req.strength,
    Tech: eff.technique   - req.technique,
    Focus: eff.focus      - req.focus,
    Flex: eff.flexibility - req.flexibility,
  };
  const fmt = Object.entries(gaps).map(([k, v]) => `${k}${v >= 0 ? '+' : ''}${v}`).join(' ');
  const worst = Math.min(...Object.values(gaps));
  return { label: fmt, worst };
}

// Short human-readable description of an action. Keeps the prompt compact.
function formatAction(a, state, player) {
  const char = player.character;
  const attempted = state.attemptedRoutes[player.playerNum] || {};
  switch (a.type) {
    case 'climb': {
      const route = state.availableRoutes[a.area].find(r => r.name === a.routeName);
      const eff = computeEffectiveStats(char, route, a.area, attempted);
      const { label } = gapsLabel(eff, route);
      const tagStr = route.tag ? ` [${route.tag}]` : '';
      // Top Rope routes belong to a belayer station; surface it so the model
      // can reason about which station a climb commits it to.
      const belayerStr = (a.area === 'topRope' && route.belayer !== undefined)
        ? ` {belayer ${route.belayer + 1}}` : '';
      return `CLIMB ${a.routeName} (${route.grade}, ${a.area})${tagStr}${belayerStr} — req Str${route.strength}/Tech${route.technique}/Focus${route.focus}/Flex${route.flexibility}, you have ${eff.strength}/${eff.technique}/${eff.focus}/${eff.flexibility} (gaps: ${label}); time ${route.time}, endurance ${route.endurance}; +${route.xpSuccess} XP success / +${route.xpFail} fail`;
    }
    case 'milestone': {
      const m = state.milestoneRoutes[a.difficulty];
      const r = m.route;
      const eff = computeEffectiveStats(char, r, m.area, attempted);
      const { label } = gapsLabel(eff, r);
      const tagStr = r.tag ? ` [${r.tag}]` : '';
      return `MILESTONE — ${a.difficulty}: ${r.name} (${r.grade}, ${m.area})${tagStr}; req Str${r.strength}/Tech${r.technique}/Focus${r.focus}/Flex${r.flexibility}, you have ${eff.strength}/${eff.technique}/${eff.focus}/${eff.flexibility} (gaps: ${label}); time ${r.time}, endurance ${r.endurance}`;
    }
    case 'train':
      return `TRAIN at ${a.areaName}`;
    case 'rest':
      return `REST (recover endurance)`;
    case 'buyGear': {
      // Surface the card's actual effect — the LLM can't reason about a name like
      // "Mountain Mentor" without seeing what it does.
      const g = GEAR_SHOP.find(x => x.name === a.gearName);
      const desc = g ? ` — ${g.effectDisplay || g.description || ''}` : '';
      const cost = g ? ` (${g.cost} XP)` : '';
      return `BUY ${a.gearName}${cost}${desc}`;
    }
    case 'endTurn':
      return `END TURN (pass)`;
    default:
      return `(unknown: ${JSON.stringify(a)})`;
  }
}

// --- HTTP helper ---

async function fetchWithTimeout(url, options, timeoutMs, externalSignal) {
  // Node 18+ has a global `fetch`. AbortSignal.timeout is a cleaner API but
  // not universally available in older LTS — this pattern is portable.
  // Accepts an optional externalSignal so a higher-level watchdog can abort
  // mid-request (see Track 1.3 game-level watchdog).
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort('timeout'), timeoutMs);
  let extListener = null;
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort('external');
    else {
      extListener = () => controller.abort('external');
      externalSignal.addEventListener('abort', extListener);
    }
  }
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') {
      const reason = controller.signal.reason;
      if (reason === 'external') {
        const e = new Error('ollama request aborted by external watchdog');
        e.outcome = 'aborted';
        throw e;
      }
      const e = new Error(`ollama request timed out after ${timeoutMs}ms`);
      e.outcome = 'timeout';
      throw e;
    }
    if (!err.outcome) err.outcome = 'network_error';
    throw err;
  } finally {
    clearTimeout(timer);
    if (externalSignal && extListener) externalSignal.removeEventListener('abort', extListener);
  }
}
