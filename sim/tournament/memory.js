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
//     "model": "qwen2.5:7b-instruct",
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

  lines.push(`══════════════════════════════════════════════════════════════════════`);
  lines.push(`PRIOR GAMES — YOU HAVE PLAYED THIS GAME ${n} TIME${n === 1 ? '' : 'S'} BEFORE.`);
  lines.push(`══════════════════════════════════════════════════════════════════════`);
  lines.push(`Score history: [${scores.join(', ')}]`);
  lines.push(`Best score so far: ${best}     Average: ${avg}     Wins: ${wins} / ${n}`);
  lines.push(``);

  for (const g of memory.games) {
    const sd = g.scoreData || {};
    const ref = g.reflection || {};
    const init = g.initialStrategy || {};
    const shifts = g.strategyShifts || [];
    lines.push(`──────── GAME ${g.gameNum} (seed=${g.seed}) ────────`);
    lines.push(`SCORE: ${sd.score ?? '?'}    Win: ${sd.win ? 'YES' : 'no'}    Milestones: ${sd.milestonesCompleted ?? '?'}/3    Ability uses: ${sd.abilityTriggers ?? '?'}`);
    lines.push(`Initial plan: ${init.summary || '(none recorded)'}`);
    lines.push(`Declared bottleneck stat: ${init.bottleneckStat || '(none)'}`);
    if (shifts.length) {
      lines.push(`Strategy shifts (${shifts.length}): ${shifts.map(s => `round ${s.round} → "${(s.newSummary || '').slice(0, 80)}..."`).join('; ')}`);
    } else {
      lines.push(`Strategy shifts: none (stayed on initial plan)`);
    }
    if (ref.what_worked)         lines.push(`What worked: ${ref.what_worked}`);
    if (ref.what_failed)         lines.push(`What failed: ${ref.what_failed}`);
    if (ref.score_reflection)    lines.push(`Score gap: ${ref.score_reflection}`);
    if (ref.advice_for_next_game) lines.push(`Your advice to yourself: ${ref.advice_for_next_game}`);
    lines.push(``);
  }

  lines.push(`══════════════════════════════════════════════════════════════════════`);
  lines.push(`YOUR TASK NOW: Form a NEW strategy that aims for a HIGHER score than ${best}.`);
  lines.push(`Use the lessons from your prior games. The board state below is the SAME starting`);
  lines.push(`position as the games above (same seed) — so you can plan with knowledge of how`);
  lines.push(`the game tends to unfold and which approaches worked vs. failed.`);
  lines.push(`══════════════════════════════════════════════════════════════════════`);
  return lines.join('\n');
}
