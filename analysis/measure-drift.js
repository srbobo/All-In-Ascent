// Rationale-action drift analysis.
//
// For each LLM decision in a game log, compare what the model SAID in its
// rationale text vs what it actually did. Three drift categories:
//
//   stat_drift     — rationale named a stat different from the one trained
//                    (e.g. "Strength" said, "focus" trained)
//   area_drift     — rationale named a training area different from used
//                    (e.g. "Campus Board" said, Grip Board used)
//   type_drift     — rationale used a verb for a different action type
//                    (e.g. "I should rest" said, train executed)
//
// Drift rate tells us whether the model's reasoning translates faithfully
// into the action_index it picks. High drift (>30%) implies a structural
// problem with index-based action encoding; low drift (<10%) means the
// reasoning itself is wrong and the encoding is fine.
//
// USAGE:
//   node analysis/measure-drift.js results/tournament-*/iter-1.jsonl
//   node analysis/measure-drift.js <file> --examples=20

import fs from 'node:fs';

const inputPath = process.argv[2];
const exMatch = process.argv.find(a => a.startsWith('--examples='));
const exampleCount = exMatch ? Number(exMatch.split('=')[1]) : 8;

if (!inputPath) {
  console.error('usage: node analysis/measure-drift.js <jsonl-file> [--examples=N]');
  process.exit(1);
}

const events = fs.readFileSync(inputPath, 'utf8')
  .split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; }})
  .filter(Boolean);

// --- Identify the LLM seat ---
const meta = events.find(e => e.kind === 'run_meta');
if (!meta) { console.error('no run_meta in file'); process.exit(1); }
const llmIdx = meta.agents.findIndex(a => typeof a === 'string' && a.startsWith('ollama:'));
if (llmIdx === -1) { console.error('no LLM seat in this game'); process.exit(1); }
const llmPlayer = llmIdx + 1;

console.log(`Analyzing rationale-action drift for player ${llmPlayer} (${meta.characters[llmIdx]} / ${meta.agents[llmIdx]})`);

// --- Build area->stat map from observed train_action events ---
const areaToStat = {};
for (const e of events) {
  if (e.type === 'train_action') areaToStat[e.payload.areaName] = e.payload.stat;
}

// --- Pair agent_decision with the action_chosen + effect that followed ---
const STATS = ['strength', 'technique', 'focus', 'flexibility'];
const ACTION_VERBS = {
  train:   /\btrain(?:ing)?\b/i,
  rest:    /\brest(?:ing)?\b/i,
  climb:   /\bclimb(?:ing)?\b/i,
  buyGear: /\bbuy\b|\bpurchas|\bshop\b|\bgear card\b/i,
  milestone: /\bmilestone\b|\battempt\s+(?:the\s+)?(?:beginner|intermediate|expert)\b/i,
};

const cases = [];
let pending = null;
for (const e of events) {
  if (e.type === 'agent_decision' && e.payload.playerNum === llmPlayer) {
    pending = { decision: e, action: null, train: null };
    continue;
  }
  if (!pending) continue;
  if (e.type === 'action_chosen' && e.payload.playerNum === llmPlayer) {
    pending.action = e;
    continue;
  }
  if (e.type === 'train_action' && e.payload.playerNum === llmPlayer) {
    pending.train = e;
    continue;
  }
  if (e.type === 'turn_end' && e.payload.playerNum === llmPlayer) {
    cases.push(pending);
    pending = null;
  }
}

// --- Analyze ---
const buckets = { no_drift: 0, stat_drift: 0, area_drift: 0, type_drift: 0, both_st_area: 0 };
const examples = { stat_drift: [], area_drift: [], type_drift: [], both_st_area: [] };
let skipped = 0;

for (const c of cases) {
  if (!c.action || c.decision.payload.usedFallback) { skipped++; continue; }

  const rationale = String(c.decision.payload.rationale || '').toLowerCase();
  const actionType = c.action.payload.action.type;
  const round = c.decision.payload.round;

  // --- Type drift: did the rationale name a different action verb? ---
  // Only flag when the rationale verb-mentions another type AND DOES NOT
  // mention its own type (avoids false positives from comparative rationales
  // like "I'll train instead of resting").
  let typeDrift = false;
  let typeDriftDetail = '';
  const ownVerbHits = ACTION_VERBS[actionType]?.test(rationale) ?? false;
  for (const [otherType, regex] of Object.entries(ACTION_VERBS)) {
    if (otherType === actionType) continue;
    if (regex.test(rationale) && !ownVerbHits) {
      typeDrift = true;
      typeDriftDetail = `said "${otherType}", did "${actionType}"`;
      break;
    }
  }

  // --- For train actions: stat drift + area drift ---
  let statDrift = false, areaDrift = false;
  let driftDetail = '';
  if (actionType === 'train' && c.train) {
    const actualStat = c.train.payload.stat;
    const actualArea = c.train.payload.areaName;
    const mentionedStats = STATS.filter(s => rationale.includes(s));
    const mentionedAreas = Object.keys(areaToStat)
      .filter(a => rationale.includes(a.toLowerCase()));

    if (mentionedStats.length > 0 && !mentionedStats.includes(actualStat)) {
      statDrift = true;
      driftDetail += `said stat=${mentionedStats.join('/')}, trained=${actualStat}`;
    }
    if (mentionedAreas.length > 0 && !mentionedAreas.includes(actualArea)) {
      const mentionedStatsViaArea = mentionedAreas.map(a => areaToStat[a]).filter(Boolean);
      if (!mentionedStatsViaArea.includes(actualStat)) {
        areaDrift = true;
        driftDetail += (driftDetail ? '; ' : '') +
          `said area=${mentionedAreas.join('/')}(${mentionedStatsViaArea.join('/')}), used=${actualArea}(${actualStat})`;
      }
    }
  }

  let bucket;
  if (typeDrift) bucket = 'type_drift';
  else if (statDrift && areaDrift) bucket = 'both_st_area';
  else if (statDrift) bucket = 'stat_drift';
  else if (areaDrift) bucket = 'area_drift';
  else bucket = 'no_drift';

  buckets[bucket]++;

  if (bucket !== 'no_drift' && examples[bucket].length < exampleCount) {
    examples[bucket].push({
      round,
      actionType,
      detail: typeDrift ? typeDriftDetail : driftDetail,
      rationale: c.decision.payload.rationale?.slice(0, 220),
    });
  }
}

// --- Report ---
const total = cases.length - skipped;
const drift = buckets.stat_drift + buckets.area_drift + buckets.type_drift + buckets.both_st_area;
const pct = (n) => total ? (n / total * 100).toFixed(1) + '%' : '0%';

console.log(``);
console.log(`=== Drift summary (${total} non-fallback decisions analyzed; ${skipped} skipped) ===`);
console.log(`  no drift:        ${buckets.no_drift} (${pct(buckets.no_drift)})`);
console.log(`  type drift:      ${buckets.type_drift} (${pct(buckets.type_drift)})`);
console.log(`  stat drift:      ${buckets.stat_drift} (${pct(buckets.stat_drift)})`);
console.log(`  area drift:      ${buckets.area_drift} (${pct(buckets.area_drift)})`);
console.log(`  stat + area:     ${buckets.both_st_area} (${pct(buckets.both_st_area)})`);
console.log(`  ─────────────────────────────────────────`);
console.log(`  TOTAL DRIFT:     ${drift} (${pct(drift)})`);
console.log(``);

console.log(`=== Drift interpretation ===`);
if (drift / total > 0.30) {
  console.log(`  >30% drift — the action-index encoding is structurally broken.`);
  console.log(`  CPP-style tool-based dispatch likely fixes the dominant bug.`);
} else if (drift / total > 0.10) {
  console.log(`  10-30% drift — real architecture issue, but cheaper partial fix may`);
  console.log(`  suffice (e.g. structured {type, stat} output instead of action_index).`);
} else {
  console.log(`  <10% drift — rationale and action mostly align. The Focus-bias is in`);
  console.log(`  the model's strategic understanding, not the action-encoding layer.`);
  console.log(`  Prompt fix (explicit bottleneck hint) or in-context learning is likely`);
  console.log(`  the right next step, not a CPP-style refactor.`);
}
console.log(``);

for (const [bucket, exs] of Object.entries(examples)) {
  if (!exs.length) continue;
  console.log(`=== Examples: ${bucket} ===`);
  for (const ex of exs) {
    console.log(`  r${ex.round} [${ex.actionType}] — ${ex.detail}`);
    console.log(`    rationale: "${ex.rationale}"`);
  }
  console.log(``);
}
