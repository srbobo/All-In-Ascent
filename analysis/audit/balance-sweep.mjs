import { fileURLToPath } from 'node:url';
const R = fileURLToPath(new URL('../..', import.meta.url)).replace(/\/$/, '');
const { createGame } = await import(R + '/engine/state.js');
const { getLegalActions, applyAction, isTerminal } = await import(R + '/engine/engine.js');
const { createHeuristicAgent } = await import(process.argv.includes('--fixed') ? './heuristic-fixed.mjs' : R + '/sim/agents/heuristic.js');
const { createRandomAgent } = await import(R + '/sim/agents/random.js');
const CHARS = ['ironLung','technician','sprinter','routeReader','freeSolo'];
const mode = process.argv[2] || 'solo';
const N = +process.argv[3] || 200;
async function play(chars, seed, agents, maxSteps = 4000) {
  let { state: s } = createGame({ seed, characterKeys: chars });
  let steps = 0, t = isTerminal(s);
  const counts = chars.map(() => ({}));
  while (!t.done && steps < maxSteps) {
    const legal = getLegalActions(s);
    const i = s.currentPlayerIndex;
    const p = await agents[i].chooseAction({ state: s, legalActions: legal });
    const a = legal[p.actionIndex];
    counts[i][a.type] = (counts[i][a.type] || 0) + 1;
    ({ state: s } = applyAction(s, a)); s.events.length = 0; steps++; t = isTerminal(s);
  }
  const ms = s.players.map(p => Object.values(p.character.milestonesCompleted).filter(Boolean).length);
  return { done: t.done, winnerIdx: t.done ? s.players.findIndex(p => p.playerNum === t.winner) : -1, round: s.round, ms, counts, levels: s.players.map(p=>p.character.level) };
}
const h = createHeuristicAgent();
if (mode === 'solo') {
  for (const c of CHARS) {
    const rounds = []; let fails = 0; const msHist=[0,0,0,0];
    for (let seed = 1; seed <= N; seed++) {
      const r = await play([c], seed, [h], 3000);
      if (r.done) rounds.push(r.round); else fails++;
      msHist[r.ms[0]]++;
    }
    rounds.sort((a,b)=>a-b);
    console.log(c.padEnd(12), 'finished', rounds.length+'/'+N, 'median rounds', rounds[Math.floor(rounds.length/2)], 'p90', rounds[Math.floor(rounds.length*0.9)], 'msHist(unfinished incl)', msHist.join(','));
  }
} else if (mode === 'pairs') {
  const wins = Object.fromEntries(CHARS.map(c => [c, { w: 0, g: 0 }]));
  const seat = [0,0]; let draws = 0; const mat = {};
  for (let a = 0; a < CHARS.length; a++) for (let b = 0; b < CHARS.length; b++) {
    if (a === b) continue;
    let aw = 0, n = 0;
    for (let seed = 1; seed <= N; seed++) {
      const r = await play([CHARS[a], CHARS[b]], seed * 31 + a * 7 + b, [h, h]);
      n++; wins[CHARS[a]].g++; wins[CHARS[b]].g++;
      if (r.winnerIdx === 0) { aw++; wins[CHARS[a]].w++; seat[0]++; }
      else if (r.winnerIdx === 1) { wins[CHARS[b]].w++; seat[1]++; }
      else draws++;
    }
    mat[CHARS[a]+'>'+CHARS[b]] = (aw/n).toFixed(2);
  }
  for (const c of CHARS) console.log(c.padEnd(12), 'winrate', (wins[c].w / wins[c].g).toFixed(3));
  console.log('seat wins', seat, 'unfinished', draws);
  console.log(mat);
}
