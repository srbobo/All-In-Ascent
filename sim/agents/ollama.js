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
import { computeEffectiveStats } from '../../engine/helpers.js';

export function createOllamaAgent({
  model,
  host = 'http://localhost:11434',
  temperature = 0.3,
  timeoutMs = 15000,
  rewardCreativity = true,  // include "prefer creative lines" in system prompt
}) {
  if (!model) throw new Error('ollama agent: `model` is required (e.g. "qwen2.5:14b-instruct")');

  return {
    name: `ollama:${model}`,

    async chooseAction({ state, legalActions, player }) {
      const char = player.character;
      const systemPrompt = buildSystemPrompt(char.key, rewardCreativity);
      // Recent-actions history: pull this player's last few actions THIS round
      // so the LLM can avoid repeating attempts that already failed. Without
      // this, qwen2.5:7b kept smashing into the same expert milestone every
      // turn — it had no memory of the prior turn's outcome.
      const recentHistory = extractRecentHistory(state, player.playerNum, 8);
      const userPrompt = buildUserPrompt(state, legalActions, player, recentHistory);

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
      );

      if (!res.ok) {
        throw new Error(`ollama HTTP ${res.status}: ${await res.text().catch(() => '')}`);
      }

      const data = await res.json();
      const content = data?.message?.content;
      if (!content) throw new Error('ollama response missing message.content');

      let parsed;
      try { parsed = JSON.parse(content); }
      catch (e) { throw new Error(`ollama JSON parse failed: ${content.slice(0, 120)}`); }

      const idx = parsed.action_index;
      if (!Number.isInteger(idx) || idx < 0 || idx >= legalActions.length) {
        throw new Error(`ollama returned out-of-range action_index ${idx} (legal: 0..${legalActions.length - 1})`);
      }

      const rationale = typeof parsed.rationale === 'string'
        ? parsed.rationale.slice(0, 500)
        : '(no rationale)';

      return { actionIndex: idx, rationale };
    },
  };
}

// --- Prompt builders ---

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
    `HOW TO WIN: Complete ALL THREE milestone routes (beginner, intermediate, expert) before any opponent does. The game ends after 45 rounds; if no one has all three by then, no one wins.`,
    ``,
    `YOUR UNIQUE ABILITY — ${ability.name}:`,
    `  ${ability.description}`,
    `  This ability is what sets your character apart. Lean into it. Find moments where it gives you an edge other players don't have.`,
    ``,
    `ROUTE TAGS: Each climb is tagged as one of {Pinch/Crimp, Toe/Heel Hook, Roof/Sloper, Dynamic}, or untagged. Some gear cards in the shop target specific tags. Notice patterns in your milestones — if multiple share a tag, gear that targets that tag may be especially valuable.`,
    ``,
    rewardCreativity
      ? `HOW YOU ARE SCORED — TWO things, both equally:
  1. WINNING the game (completing all 3 milestones first).
  2. CREATIVE USE OF YOUR ABILITY — using it in unexpected, risky, or non-obvious ways that turn your character's quirk into an advantage. A creative loss can outscore a mechanical win.

  We track every activation of your ability and every climb where it mattered. Express in your rationale when you are deliberately leveraging your character's identity.`
      : `You are scored only on completing all 3 milestones first.`,
    ``,
    `ON EACH TURN you will see: your current state (stats, endurance, XP, gear, time remaining), the three milestone routes, your opponents' progress, your recent actions, and a numbered list of every legal action — each with the relevant numbers (requirements, your effective stats, costs, rewards). Use those numbers and your judgment.`,
    ``,
    `OUTPUT FORMAT — respond with EXACTLY one JSON object, no other text:`,
    `  {"action_index": <integer, 0-based>, "rationale": "<one short sentence — what you are trying and why>"}`,
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

function buildUserPrompt(state, legalActions, player, recentHistory = []) {
  const char = player.character;
  const lines = [];
  lines.push(`Round ${state.round}. You are Player ${player.playerNum} — ${char.name} (Level ${char.level}).`);
  lines.push(``);
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
      return `CLIMB ${a.routeName} (${route.grade}, ${a.area})${tagStr} — req Str${route.strength}/Tech${route.technique}/Focus${route.focus}/Flex${route.flexibility}, you have ${eff.strength}/${eff.technique}/${eff.focus}/${eff.flexibility} (gaps: ${label}); time ${route.time}, endurance ${route.endurance}; +${route.xpSuccess} XP success / +${route.xpFail} fail`;
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

async function fetchWithTimeout(url, options, timeoutMs) {
  // Node 18+ has a global `fetch`. AbortSignal.timeout is a cleaner API but
  // not universally available in older LTS — this pattern is portable.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`ollama request timed out after ${timeoutMs}ms`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
