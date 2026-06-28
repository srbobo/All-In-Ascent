// Per-game scoring for the in-context tournament experiment.
//
// USAGE:
//   node analysis/score-game.js <path-to-jsonl>            # one game
//   node analysis/score-game.js results/<dir>/             # all games in dir
//   node analysis/score-game.js results/<dir>/ --json      # JSON-only output
//
// REWARD FUNCTION (locked-in design — logarithmic ability scoring):
//   SCORE = 100 × WIN
//         +  25 × MILESTONES_COMPLETED
//         +  10 × ln(1 + ABILITY_TRIGGERS_THAT_MATTERED)
//         −   1 × FALLBACK_COUNT
//
// Why logarithmic for ability triggers:
//   First ability use is the most valuable signal — it shows the model
//   recognizes its character's edge. The marginal value of each additional
//   trigger diminishes, preventing "spam the ability to inflate score"
//   gameability. At 10 triggers the ability bonus is ~24 pts; at 50 it's
//   ~39 pts (so going from 10 to 50 is only +15 pts vs 100 for a win).
//
// "ABILITY_TRIGGERS_THAT_MATTERED" is computed per-character. The detectors
// are intentionally character-specific because the abilities work differently:
//
//   Iron Lung   — Relentless         : failed climb count (XP-on-fail triggers)
//   Technician  — Perfect Beta       : climbs that succeeded because of −5 to
//                                       stat reqs (would have failed at base)
//   Sprinter    — Flash Speed        : climbs whose time cost was reduced
//                                       (the reduction enabled the climb to fit)
//   Free Solo   — Life or Die        : climbs in Top Rope or Lead where the
//                                       player did NOT own the access cards
//   Route Reader — Versatility       : climbs that fired Beta Boost from a
//                                       prior rest (rest immediately before)
//
// SCRIPT OUTPUT:
//   By default a human-readable summary. With --json the script emits one JSON
//   object per LLM seat per game, suitable for piping into the tournament
//   harness to record memory.

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const SCORE_WEIGHTS = {
  WIN: 100,
  PER_MILESTONE: 25,
  ABILITY_COEFFICIENT: 10,    // log curve: pts = 10 * ln(1 + triggers)
  FALLBACK_PENALTY: -1,
};

// Logarithmic ability point computation. Rounds to integer for legibility in
// score-comparison loops where the LLM is reasoning about its own score.
function abilityPoints(triggerCount) {
  if (!triggerCount || triggerCount < 0) return 0;
  return Math.round(SCORE_WEIGHTS.ABILITY_COEFFICIENT * Math.log(1 + triggerCount));
}

// ---------------------------------------------------------------------------
// Per-character ability-trigger detectors. Each takes (events, playerNum) and
// returns { count, details: [...] }. Details surfaced so reflection prompts
// can describe specific moments the model leveraged the ability.
// ---------------------------------------------------------------------------

function detectIronLungTriggers(events, playerNum) {
  // Relentless: +50% XP on failed climbs (+ extra endurance cost). Every fail
  // is a trigger; whether it "mattered" requires the model winning to net out.
  // The reward function pairs ability_triggers with milestones+win, so deliberate
  // failure-as-strategy is captured by the combined signal.
  const failedClimbs = events.filter(e =>
    e.type === 'climb_resolved'
    && e.payload.playerNum === playerNum
    && e.payload.success === false
    && !e.payload.isMilestone   // milestone fails are also Relentless-triggered
  );
  const failedMilestones = events.filter(e =>
    e.type === 'climb_resolved'
    && e.payload.playerNum === playerNum
    && e.payload.success === false
    && e.payload.isMilestone
  );
  return {
    count: failedClimbs.length + failedMilestones.length,
    details: [
      ...failedClimbs.map(e => ({ kind: 'failed_climb', route: e.payload.routeName, round: e.t })),
      ...failedMilestones.map(e => ({ kind: 'failed_milestone', route: e.payload.routeName, round: e.t })),
    ],
  };
}

function detectTechnicianTriggers(events, playerNum) {
  // Perfect Beta: -5 to all stat requirements (passive). "Mattered" = the
  // climb succeeded but at least one stat would have FAILED without the -5.
  // i.e. effectiveStats[s] in [req[s]-5, req[s]) for some stat that the player
  // passed in perStatPass.
  const out = [];
  for (const e of events) {
    if (e.type !== 'climb_resolved') continue;
    if (e.payload.playerNum !== playerNum) continue;
    if (!e.payload.success) continue;
    const eff = e.payload.effectiveStats || {};
    const req = e.payload.requirements || {};
    const mattered = ['strength','technique','focus','flexibility'].some(s =>
      eff[s] !== undefined && req[s] !== undefined
      && eff[s] < req[s]              // would have failed at base
      && eff[s] >= req[s] - 5         // succeeded due to -5
    );
    if (mattered) out.push({ kind: 'beta_save', route: e.payload.routeName });
  }
  return { count: out.length, details: out };
}

function detectSprinterTriggers(events, playerNum) {
  // Flash Speed: -1 time cost on climbs (passive). "Mattered" is hard to
  // measure without re-simulating the time budget. As a proxy we count climbs
  // where the player's timeRemaining-BEFORE was exactly 1 — that climb could
  // only fit because of Flash Speed (base cost = 2, effective = 1).
  const out = [];
  let lastTimeRemaining = {};
  for (const e of events) {
    if (e.type === 'resource_update' && e.payload.playerNum === playerNum) {
      lastTimeRemaining[playerNum] = e.payload.timeRemaining;
    }
    if (e.type === 'climb_resolved' && e.payload.playerNum === playerNum) {
      // Climbs cost 2 time normally; if the player had exactly 1 time before
      // the climb and the climb fit, Flash Speed enabled it.
      // Note: this is approximate — we'd need pre-climb state to be exact.
      // Listed here for completeness; we'll refine in a later pass.
      // For now, count climbs where post-climb time is 0 or 1.
      if (lastTimeRemaining[playerNum] === 0) {
        out.push({ kind: 'flash_fit', route: e.payload.routeName });
      }
    }
  }
  return { count: out.length, details: out };
}

function detectFreeSoloTriggers(events, playerNum) {
  // Life or Die: bypasses access cards. Since RuleModifications, Top Rope is
  // open to everyone, so only LEAD bypasses count as a meaningful trigger:
  // a Lead climb while the player lacked the three Lead access cards. The
  // engine wouldn't surface that climb as legal for a non-FreeSolo player, so
  // any such climb event is an ability trigger.
  // We track equipment over time via gear_purchased events.
  const owned = new Set();
  const out = [];
  const REQ_LEAD = ['Belay Device', 'Locking Carabiner', 'Lead Rope'];
  for (const e of events) {
    if (e.type === 'gear_purchased' && e.payload.playerNum === playerNum) {
      owned.add(e.payload.gearName);
    }
    if (e.type === 'climb_resolved' && e.payload.playerNum === playerNum) {
      const area = e.payload.area;
      if (area === 'leadClimbing' && !REQ_LEAD.every(c => owned.has(c))) {
        out.push({ kind: 'bypass_lead', route: e.payload.routeName });
      }
    }
  }
  return { count: out.length, details: out };
}

function detectRouteReaderTriggers(events, playerNum) {
  // Versatility: resting activates Beta Boost (+3 all stats next climb).
  // "Mattered" = climb immediately following a rest within the same round.
  // We approximate by tracking the action sequence: rest_action followed by
  // climb_resolved with no other actions between for the same player.
  const out = [];
  let lastWasRest = false;
  for (const e of events) {
    if (e.payload?.playerNum !== playerNum) continue;
    if (e.type === 'rest') lastWasRest = true;
    else if (e.type === 'climb_resolved') {
      if (lastWasRest && e.payload.success) {
        out.push({ kind: 'beta_boost_climb', route: e.payload.routeName });
      }
      lastWasRest = false;
    } else if (e.type === 'action_chosen') {
      // Anything other than rest/climb breaks the chain.
      if (e.payload.action?.type !== 'rest' && e.payload.action?.type !== 'climb' && e.payload.action?.type !== 'milestone') {
        lastWasRest = false;
      }
    }
  }
  return { count: out.length, details: out };
}

const ABILITY_DETECTORS = {
  ironLung:    detectIronLungTriggers,
  technician:  detectTechnicianTriggers,
  sprinter:    detectSprinterTriggers,
  freeSolo:    detectFreeSoloTriggers,
  routeReader: detectRouteReaderTriggers,
};

// ---------------------------------------------------------------------------
// Main scoring
// ---------------------------------------------------------------------------

export function scoreGame(filePath) {
  const lines = fs.readFileSync(filePath, 'utf8').trim().split('\n');
  const events = [];
  let meta = null, summary = null;
  for (const line of lines) {
    let obj;
    try { obj = JSON.parse(line); } catch { continue; }
    if (obj.kind === 'run_meta')     meta = obj;
    else if (obj.kind === 'run_summary') summary = obj;
    else events.push(obj);
  }
  if (!meta) throw new Error(`no run_meta in ${filePath}`);
  if (!summary) throw new Error(`no run_summary in ${filePath} (incomplete game)`);

  // Identify LLM seats — agents whose name starts with "ollama".
  const llmSeats = meta.agents
    .map((a, i) => a.startsWith('ollama') ? i + 1 : null)
    .filter(s => s !== null);

  const scores = llmSeats.map(seat => {
    const idx = seat - 1;
    const characterKey = meta.characters[idx];
    const finalPlayer = summary.finalPlayers[idx] || {};

    const win = summary.winner === seat;
    const milestonesCompleted = finalPlayer.milestonesDone || 0;

    const detector = ABILITY_DETECTORS[characterKey];
    const triggers = detector
      ? detector(events, seat)
      : { count: 0, details: [], unsupported: true };

    const fallbackCount = summary.perAgentStats?.[idx]?.fallbacks || 0;

    const winPoints       = SCORE_WEIGHTS.WIN              * (win ? 1 : 0);
    const milestonePoints = SCORE_WEIGHTS.PER_MILESTONE    * milestonesCompleted;
    const abilityScore    = abilityPoints(triggers.count);
    const fallbackPenalty = SCORE_WEIGHTS.FALLBACK_PENALTY * fallbackCount;
    const total = winPoints + milestonePoints + abilityScore + fallbackPenalty;

    return {
      filename: path.basename(filePath),
      seed: meta.seed,
      seat,
      characterKey,
      agent: meta.agents[idx],
      win,
      milestonesCompleted,
      abilityTriggers: triggers.count,
      abilityTriggerDetails: triggers.details,
      fallbackCount,
      scoreBreakdown: {
        win: winPoints,
        milestones: milestonePoints,
        ability: abilityScore,
        fallbackPenalty,
      },
      score: total,
    };
  });

  return { meta: { seed: meta.seed, agents: meta.agents, characters: meta.characters }, summary: { rounds: summary.rounds, winner: summary.winner }, scores };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function formatHuman({ meta, summary, scores }) {
  const lines = [];
  lines.push('');
  lines.push(`Game: seed=${meta.seed}, rounds=${summary.rounds}, winner=${summary.winner ? `P${summary.winner}` : '—'}`);
  lines.push(`Characters: ${meta.characters.join(' / ')}`);
  lines.push(`Agents:     ${meta.agents.join(' / ')}`);
  for (const s of scores) {
    lines.push('');
    lines.push(`  ── Seat ${s.seat} (${s.characterKey}, ${s.agent}) ──`);
    lines.push(`    Win:                  ${s.win}`);
    lines.push(`    Milestones:           ${s.milestonesCompleted}/3`);
    lines.push(`    Ability triggers:     ${s.abilityTriggers}`);
    lines.push(`    Fallbacks:            ${s.fallbackCount}`);
    lines.push('');
    lines.push(`    Score breakdown:`);
    lines.push(`      Win (100 if won):       ${s.scoreBreakdown.win}`);
    lines.push(`      Milestones × 25:        ${s.scoreBreakdown.milestones}`);
    lines.push(`      10 × ln(1 + ability):   ${s.scoreBreakdown.ability}  (from ${s.abilityTriggers} triggers)`);
    lines.push(`      Fallback × −1:          ${s.scoreBreakdown.fallbackPenalty}`);
    lines.push(`      ──────────────────────────`);
    lines.push(`      TOTAL:                  ${s.score}`);
    if (s.abilityTriggerDetails?.length && s.abilityTriggerDetails.length <= 6) {
      lines.push('');
      lines.push(`    Ability trigger details:`);
      for (const d of s.abilityTriggerDetails) lines.push(`      - ${d.kind}: ${d.route}`);
    } else if (s.abilityTriggerDetails?.length) {
      lines.push(`    (${s.abilityTriggerDetails.length} ability triggers — see --json for full list)`);
    }
  }
  return lines.join('\n');
}

// CLI guard: only run if invoked directly, not when imported.
const invokedDirectly = import.meta.url === pathToFileURL(process.argv[1] || '').href;
if (!invokedDirectly) {
  // when imported, just export scoreGame above and stop.
  // (Top-level await in this file would prevent this guard from working;
  //  the CLI body below is synchronous-up-to-the-print so we're safe.)
} else {
const args = process.argv.slice(2);
const flagJson = args.includes('--json');
const inputs = args.filter(a => !a.startsWith('--'));
if (inputs.length === 0) {
  console.error('usage: node analysis/score-game.js <jsonl-or-dir> [--json]');
  process.exit(1);
}

const files = [];
for (const input of inputs) {
  const stat = fs.statSync(input);
  if (stat.isDirectory()) {
    for (const f of fs.readdirSync(input)) {
      if (f.endsWith('.jsonl')) files.push(path.join(input, f));
    }
  } else {
    files.push(input);
  }
}
files.sort();

const allResults = [];
for (const file of files) {
  try {
    const result = scoreGame(file);
    allResults.push(result);
    if (!flagJson) console.log(formatHuman(result));
  } catch (e) {
    console.error(`SKIP ${file}: ${e.message}`);
  }
}

if (flagJson) {
  process.stdout.write(JSON.stringify(allResults, null, 2));
  process.stdout.write('\n');
}

// Aggregate summary (always shown, even in JSON mode via stderr)
if (allResults.length > 1 && !flagJson) {
  console.log('');
  console.log('═══════════════════════════════════════');
  console.log(`AGGREGATE across ${allResults.length} games`);
  console.log('═══════════════════════════════════════');
  const flat = allResults.flatMap(r => r.scores);
  const bySeed = new Map();
  for (const s of flat) {
    if (!bySeed.has(s.seed)) bySeed.set(s.seed, []);
    bySeed.get(s.seed).push(s);
  }
  for (const [seed, scs] of [...bySeed.entries()].sort((a, b) => a[0] - b[0])) {
    for (const s of scs) {
      console.log(`  seed=${seed} seat=${s.seat} ${s.characterKey}: score=${s.score} (win=${s.win?'Y':'N'}, ms=${s.milestonesCompleted}/3, ability=${s.abilityTriggers}, fb=${s.fallbackCount})`);
    }
  }
  const total = flat.reduce((a, s) => a + s.score, 0);
  const mean = flat.length ? (total / flat.length).toFixed(1) : 0;
  console.log(`  mean score: ${mean}`);
}
} // close invokedDirectly guard
