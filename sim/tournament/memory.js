// Tournament memory: per-character JSON file that accumulates score, strategy,
// and reflection data across multiple games in the same tournament.
//
// Lifecycle:
//   - At tournament start: loadMemory() either reads an existing file or
//     returns an empty memory object.
//   - During each game: the agent reads the formatted memory as context (via
//     formatMemoryForPrompt) so it can reference its own prior reasoning.
//   - At game end: appendGameToMemory() adds the game's score/strategy/
//     reflection; saveMemory() writes the updated file to disk.
//
// File format (JSON, per-character, per-tournament):
//   {
//     "characterKey": "ironLung",
//     "model": "deepseek-r1:7b",
//     "createdAt": "<ISO timestamp>",
//     "games": [
//       {
//         "gameNum": 1,
//         "seed": 1,
//         "scoreData": { score, win, milestonesCompleted, abilityTriggers,
//                        fallbackCount, scoreBreakdown },
//         "initialStrategy": { summary, bottleneckStat, milestonePriority,
//                              openingMoves, anticipatedRisks },
//         "strategyShifts": [{ round, changeReason, previousSummary,
//                              newSummary, previousBottleneckStat,
//                              newBottleneckStat, ... }],
//         "reflection": { summary, what_worked, what_failed,
//                         strategy_history, score_reflection,
//                         advice_for_next_game }
//       },
//       ...
//     ]
//   }

import fs from 'node:fs';
import path from 'node:path';

const MEMORY_FILENAME = (characterKey) => `memory-${characterKey}.json`;

export function memoryPath(dir, characterKey) {
  return path.join(dir, MEMORY_FILENAME(characterKey));
}

export function loadMemory(dir, characterKey) {
  const p = memoryPath(dir, characterKey);
  if (!fs.existsSync(p)) {
    return {
      characterKey,
      model: null,
      createdAt: null,
      games: [],
    };
  }
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (err) {
    throw new Error(`failed to load memory at ${p}: ${err.message}`);
  }
}

export function saveMemory(dir, memory) {
  fs.mkdirSync(dir, { recursive: true });
  const p = memoryPath(dir, memory.characterKey);
  fs.writeFileSync(p, JSON.stringify(memory, null, 2));
  return p;
}

export function appendGameToMemory(memory, gameRecord) {
  memory.games.push({
    gameNum: memory.games.length + 1,
    ...gameRecord,
  });
  return memory;
}

// Build a prompt-ready summary of the memory for inclusion in the next game's
// system / user prompt. Compact by design — full reflection text is included
// but bounded by the per-game cap from the reflectOnGame schema.
export function formatMemoryForPrompt(memory) {
  if (!memory || !memory.games?.length) return null;

  const lines = [];
  const n = memory.games.length;
  const scores = memory.games.map(g => g.scoreData?.score ?? 0);
  const wins = memory.games.filter(g => g.scoreData?.win).length;
  const best = Math.max(...scores);
  const avg = (scores.reduce((a, b) => a + b, 0) / n).toFixed(1);
  // Find the BEST game — the model should treat it as the baseline to repeat.
  // Tiebreak: earliest game wins (more conservative; longer-tested approach).
  const bestIdx = scores.indexOf(best);
  const bestGame = memory.games[bestIdx];

  lines.push(`══════════════════════════════════════════════════════════════════════`);
  lines.push(`PRIOR GAMES — YOU HAVE PLAYED THIS GAME ${n} TIME${n === 1 ? '' : 'S'} BEFORE.`);
  lines.push(`══════════════════════════════════════════════════════════════════════`);
  lines.push(`Score history: [${scores.join(', ')}]`);
  lines.push(`Best: ${best} (game ${bestGame.gameNum})     Average: ${avg}     Wins: ${wins} / ${n}`);
  lines.push(``);

  // (Fix 2) BEST-GAME PROFILE: lead with the highest-scoring run as the
  // baseline to replicate. Targets the regression observed in the 5-iter
  // tournament where reflection-driven advice eroded a working strategy.
  if (bestGame) {
    const bsd = bestGame.scoreData || {};
    const binit = bestGame.initialStrategy || {};
    const bref = bestGame.reflection || {};
    lines.push(`──────── BEST GAME SO FAR — REPLICATE THIS ────────`);
    lines.push(`Game ${bestGame.gameNum}: score ${bsd.score}, ${bsd.milestonesCompleted ?? '?'}/3 milestones, ${bsd.abilityTriggers ?? '?'} ability triggers`);
    lines.push(`Plan that scored best: ${binit.summary || '(none recorded)'}`);
    lines.push(`Bottleneck identified: ${binit.bottleneckStat || '(none)'}`);
    if (bref.what_worked) lines.push(`What worked in this game: ${bref.what_worked}`);
    lines.push(`KEEP THIS APPROACH. Change only what specifically failed in the games below.`);
    lines.push(``);
  }

  for (const g of memory.games) {
    const sd = g.scoreData || {};
    const ref = g.reflection || {};
    const init = g.initialStrategy || {};
    const shifts = g.strategyShifts || [];
    const isBest = (g.gameNum === bestGame?.gameNum);
    lines.push(`──────── GAME ${g.gameNum} (seed=${g.seed})${isBest ? ' [BEST]' : ''} ────────`);
    lines.push(`SCORE: ${sd.score ?? '?'}    Win: ${sd.win ? 'YES' : 'no'}    Milestones: ${sd.milestonesCompleted ?? '?'}/3    Ability uses: ${sd.abilityTriggers ?? '?'}`);
    lines.push(`Initial plan: ${init.summary || '(none recorded)'}`);
    lines.push(`Declared bottleneck stat: ${init.bottleneckStat || '(none)'}`);
    if (shifts.length) {
      lines.push(`Strategy shifts (${shifts.length}): ${shifts.map(s => `round ${s.round} → "${(s.newSummary || '').slice(0, 80)}..."`).join('; ')}`);
    } else {
      lines.push(`Strategy shifts: none (stayed on initial plan)`);
    }
    if (ref.what_worked) lines.push(`What worked: ${ref.what_worked}`);
    if (ref.what_failed) lines.push(`Specific gap to address (factual, not prescriptive): ${ref.what_failed}`);
    if (ref.score_reflection) lines.push(`Score gap: ${ref.score_reflection}`);
    // (Fix 3) The prescriptive `advice_for_next_game` field is the most
    // damaging — it carries "diversify" / "do more X" instructions that
    // compound across iterations and erode working strategies. Omitted.
    lines.push(``);
  }

  // (Fix 1) Flip framing from "form a NEW strategy" (which biased the model
  // toward deviation regardless of whether deviation was warranted) to
  // "repeat what worked, change only what failed."
  lines.push(`══════════════════════════════════════════════════════════════════════`);
  lines.push(`YOUR TASK NOW: REPEAT what worked. Your best score so far is ${best} (game ${bestGame?.gameNum}).`);
  lines.push(`What that game DID is your baseline — keep that approach. Change ONLY the specific`);
  lines.push(`mechanic that failed (see "Specific gap to address" lines above). Do NOT abandon a`);
  lines.push(`successful approach to "try something different" — diversification without cause`);
  lines.push(`makes scores REGRESS. A strategy that scored ${best} is your floor; beat it by`);
  lines.push(`adding to it, not by replacing it.`);
  lines.push(`══════════════════════════════════════════════════════════════════════`);
  return lines.join('\n');
}
