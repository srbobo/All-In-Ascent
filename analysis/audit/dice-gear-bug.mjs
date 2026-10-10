import { fileURLToPath } from 'node:url';
const R = fileURLToPath(new URL('../..', import.meta.url)).replace(/\/$/, '');
const { rollClimbDice, applyDiceToRequirements } = await import(R + '/engine/helpers.js');
const seq = (vals) => { let i = 0; return { rollDie: () => vals[i++] }; };
const route = { strength: 30, technique: 20, focus: 20, flexibility: 20, tag: 'Pinch/Crimp',
  rollEffect: [{ stat: 'strength', modifier: -1 }, { stat: 'focus', modifier: 1 }] };
const base = { key: 'ironLung', equipment: [] };
for (const [label, gear, vals] of [
  ['no gear', [], [6, 2]],
  ['Sequence Memorization', ['Sequence Memorization'], [6, 2]],
  ['Crimp Sequence Decoder', ['Crimp Sequence Decoder'], [6, 2, 1]],
]) {
  const char = { ...base, equipment: gear };
  const eff = route.rollEffect.map(e => ({ ...e }));
  const dice = rollClimbDice(seq(vals), eff, char, route, false);
  const { requirements } = applyDiceToRequirements(char, route, eff, dice);
  console.log(label.padEnd(24), 'dice', dice, '→ Str req', requirements.strength, 'Focus req', requirements.focus);
}
