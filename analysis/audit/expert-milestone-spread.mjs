import { fileURLToPath } from 'node:url';
const R = fileURLToPath(new URL('../..', import.meta.url)).replace(/\/$/, '');
const { ROUTES, CHARACTERS } = await import(R + '/engine/data.js');
const EXP = { bouldering: ['V8','V9','V10','V11','V12'], topRope: ['5.12a','5.12b','5.12d','5.13a','5.13c'], leadClimbing: ['5.12a','5.12b','5.12d','5.13a','5.13c','5.14a'] };
const S = ['strength','technique','focus','flexibility'];
const experts = [];
for (const a of Object.keys(EXP)) for (const r of ROUTES[a]) if (EXP[a].includes(r.grade)) experts.push({ a, r });
const L = 10;
// expected die = 3.5; nerf die adds, buff subtracts (ignored for freeSolo; nerf ignored for technician)
function trainsNeeded(key, r) {
  const c = CHARACTERS[key];
  const req = Object.fromEntries(S.map(s => [s, r[s]]));
  for (const e of [...(r.rollEffect||[]), ...(key==='sprinter'?[{stat:'focus',modifier:1}]:[])]) {
    let m = e.modifier; if (key==='freeSolo') m = 0; if (key==='technician' && m===1) m = 0;
    req[e.stat] += m * 3.5;
  }
  if (key === 'technician') for (const s of S) req[s] -= 5;
  const gaps = S.map(s => Math.max(0, Math.ceil((req[s] - Math.round(c.startingStats[s] + c.growth[s]*(L-1)))/5)));
  if (key === 'routeReader') { gaps.sort((x,y)=>y-x); gaps[0] = 0; }
  return gaps.reduce((x,y)=>x+y,0);
}
console.log(`Training sessions (+5 each, 2 Time) needed at Level ${L} to meet expected requirement, per expert milestone`);
console.log('route'.padEnd(28), 'area'.padEnd(13), Object.keys(CHARACTERS).map(k=>k.slice(0,8).padStart(9)).join(''));
const rows = experts.map(({a,r}) => ({ a, r, t: Object.keys(CHARACTERS).map(k => trainsNeeded(k, r)) })).sort((x,y)=>x.t.reduce((p,q)=>p+q)-y.t.reduce((p,q)=>p+q));
for (const x of rows) console.log((x.r.name+' '+x.r.grade).padEnd(28), x.a.padEnd(13), x.t.map(v=>String(v).padStart(9)).join(''));
