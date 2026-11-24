// Train the value model (engine/value-model.js) on self-play samples.
//
//   node sim/learn/train.js [--data=sim/learn/data/hard.jsonl,...] [--hidden=24]
//                           [--epochs=60] [--out=sim/learn/out/candidate.json] [--seed=1]
//
// Target: the residual y − ttf, where y is the Time a climber actually used
// to finish and ttf the planner's estimate (feature 0). The network plus the
// per-character adapters learn that residual; a zero model is the planner.
// Split by game seed (every 7th seed is validation) so correlated decisions
// from one game never sit on both sides. Early-stops on validation MSE.
//
// Prints how well each estimate predicts the real finish time on validation
// games: the raw planner, the planner with the best affine rescale (what any
// calibration could do), and the learned model. Only the arena
// (sim/learn/arena.js) decides whether the model plays better.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { VALUE_FEATURES, VALUE_MODEL_SCHEMA, valueResidual } from '../../engine/value-model.js';
import { ENGINE_VERSION_STRING } from '../../engine/version.js';
import { createRng } from '../../engine/rng.js';

const arg = (name, dflt) => {
  const hit = process.argv.slice(2).find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : dflt;
};
const files = arg('data', 'sim/learn/data/hard.jsonl').split(',');
const H = Number(arg('hidden', 24));
const EPOCHS = Number(arg('epochs', 60));
const out = arg('out', 'sim/learn/out/candidate.json');
const rng = createRng(Number(arg('seed', 1)));
const SCALE = 100; // residuals are learned in units of 100 Time

// --features=a,b,...: the features the network reads (default: the planner's
// estimate parts, progress and traits — not raw resources like Grit or Level,
// which a greedy player learns to hoard when they merely correlate with being
// near the end in the training games).
const DEFAULT_USE = ['ttf', 'plan', 'access', 'endurance', 'levelCredit', 'gearCredit', 'pending', 'timeNow', 'startStats', 'growth', 'startEndurance'];
const useNames = arg('features', DEFAULT_USE.join(',')).split(',');
// --no-scale: no per-character scale on the estimate (adapters are a bias
// only), so the estimate keeps slope 1 unless the network reads ttf/plan.
const noScale = process.argv.includes('--no-scale');
const use = useNames.map(n => {
  const i = VALUE_FEATURES.indexOf(n);
  if (i < 0) throw new Error(`unknown feature ${n}`);
  return i;
});
const rows = files.flatMap(f => readFileSync(f, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)));
const train = rows.filter(r => r.seed % 7 !== 0);
const val = rows.filter(r => r.seed % 7 === 0);
const D = use.length;
const keys = [...new Set(rows.map(r => r.key))].sort();
console.log(`${rows.length} samples (${train.length} train / ${val.length} validation), features: ${useNames.join(', ')}; characters: ${keys.join(', ')}`);

// Standardisation from the training split.
const mean = new Array(D).fill(0);
const std = new Array(D).fill(0);
for (const r of train) for (let i = 0; i < D; i++) mean[i] += r.f[use[i]] / train.length;
for (const r of train) for (let i = 0; i < D; i++) std[i] += (r.f[use[i]] - mean[i]) ** 2 / train.length;
for (let i = 0; i < D; i++) std[i] = Math.sqrt(std[i]) || 1;

// Parameters (scaled units). W1 small random, the rest zero → starts as the planner.
const gauss = () => Math.sqrt(-2 * Math.log(rng.next() + 1e-12)) * Math.cos(2 * Math.PI * rng.next());
const P = {
  W1: Array.from({ length: H }, () => Array.from({ length: D }, () => gauss() * 0.3 / Math.sqrt(D))),
  b1: new Array(H).fill(0),
  W2: new Array(H).fill(0),
  b2: [0],
  ab: Object.fromEntries(keys.map(k => [k, [0]])), // adapter bias
  as: Object.fromEntries(keys.map(k => [k, [0]])), // adapter scale on ttf
};
// Adam state mirrors P.
const zeroLike = (x) => (Array.isArray(x) ? x.map(zeroLike) : typeof x === 'object' ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, zeroLike(v)])) : 0);
const M = zeroLike(P);
const V = zeroLike(P);
const LR = 2e-3;
const L2 = 1e-5;
const B1 = 0.9;
const B2 = 0.999;
let step = 0;

const xs = (r) => use.map((fi, i) => (r.f[fi] - mean[i]) / std[i]);
const ttfScaled = (r) => r.f[0] / SCALE;

function forward(r) {
  const x = xs(r);
  const a = new Array(H);
  const h = new Array(H);
  let o = P.b2[0];
  for (let j = 0; j < H; j++) {
    let s = P.b1[j];
    const row = P.W1[j];
    for (let i = 0; i < D; i++) s += row[i] * x[i];
    a[j] = s;
    h[j] = Math.tanh(s);
    o += P.W2[j] * h[j];
  }
  o += P.ab[r.key][0] + P.as[r.key][0] * ttfScaled(r);
  return { x, h, o };
}

function adam(param, grad, m, v, i) {
  m[i] = B1 * m[i] + (1 - B1) * grad;
  v[i] = B2 * v[i] + (1 - B2) * grad * grad;
  const mh = m[i] / (1 - B1 ** step);
  const vh = v[i] / (1 - B2 ** step);
  param[i] -= LR * mh / (Math.sqrt(vh) + 1e-8);
}

function trainBatch(batch) {
  const gW1 = Array.from({ length: H }, () => new Array(D).fill(0));
  const gb1 = new Array(H).fill(0);
  const gW2 = new Array(H).fill(0);
  let gb2 = 0;
  const gab = {};
  const gas = {};
  for (const r of batch) {
    const { x, h, o } = forward(r);
    const target = (r.y - r.f[0]) / SCALE;
    const d = 2 * (o - target) / batch.length;
    gb2 += d;
    gab[r.key] = (gab[r.key] || 0) + d;
    gas[r.key] = (gas[r.key] || 0) + d * ttfScaled(r);
    for (let j = 0; j < H; j++) {
      gW2[j] += d * h[j];
      const dh = d * P.W2[j] * (1 - h[j] * h[j]);
      gb1[j] += dh;
      const row = gW1[j];
      for (let i = 0; i < D; i++) row[i] += dh * x[i];
    }
  }
  step++;
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < D; i++) adam(P.W1[j], gW1[j][i] + L2 * P.W1[j][i], M.W1[j], V.W1[j], i);
    adam(P.b1, gb1[j], M.b1, V.b1, j);
    adam(P.W2, gW2[j] + L2 * P.W2[j], M.W2, V.W2, j);
  }
  adam(P.b2, gb2, M.b2, V.b2, 0);
  for (const k of Object.keys(gab)) {
    adam(P.ab[k], gab[k] + L2 * P.ab[k][0], M.ab[k], V.ab[k], 0);
    if (!noScale) adam(P.as[k], gas[k] + 10 * L2 * P.as[k][0], M.as[k], V.as[k], 0);
  }
}

// Export in engine units (value-model.js valueResidual): undo the residual scale.
function exportWeights(meta) {
  return {
    schema: VALUE_MODEL_SCHEMA,
    engineVersion: ENGINE_VERSION_STRING,
    features: VALUE_FEATURES,
    use,
    mean, std,
    W1: P.W1.map(row => row.slice()),
    b1: P.b1.slice(),
    W2: P.W2.map(w => w * SCALE),
    b2: P.b2[0] * SCALE,
    adapters: Object.fromEntries(keys.map(k => [k, { bias: P.ab[k][0] * SCALE, scale: P.as[k][0] }])),
    meta,
  };
}

const charOf = (r) => ({ key: r.key });
function evaluate(w, set) {
  let se = 0;
  let ae = 0;
  for (const r of set) {
    const pred = r.f[0] + valueResidual(w, charOf(r), r.f);
    se += (pred - r.y) ** 2;
    ae += Math.abs(pred - r.y);
  }
  return { rmse: Math.sqrt(se / set.length), mae: ae / set.length };
}

// Baselines on validation: the raw planner, and its best affine rescale.
const rawRmse = Math.sqrt(val.reduce((a, r) => a + (r.f[0] - r.y) ** 2, 0) / val.length);
const n = train.length;
const sx = train.reduce((a, r) => a + r.f[0], 0) / n;
const sy = train.reduce((a, r) => a + r.y, 0) / n;
const cov = train.reduce((a, r) => a + (r.f[0] - sx) * (r.y - sy), 0) / n;
const vx = train.reduce((a, r) => a + (r.f[0] - sx) ** 2, 0) / n;
const slope = cov / vx;
const affRmse = Math.sqrt(val.reduce((a, r) => a + (sy + slope * (r.f[0] - sx) - r.y) ** 2, 0) / val.length);
const valVar = val.reduce((a, r) => a + r.y, 0) / val.length;
const sdY = Math.sqrt(val.reduce((a, r) => a + (r.y - valVar) ** 2, 0) / val.length);
console.log(`validation: finish-time spread (sd) ${sdY.toFixed(1)} · planner RMSE ${rawRmse.toFixed(1)} · planner rescaled (y = ${sy.toFixed(0)} + ${slope.toFixed(3)}·(ttf − ${sx.toFixed(0)})) RMSE ${affRmse.toFixed(1)}`);

let best = null;
let bestRmse = Infinity;
let since = 0;
const BATCH = 256;
const t0 = Date.now();
for (let epoch = 1; epoch <= EPOCHS; epoch++) {
  const order = rng.shuffle([...train.keys()]);
  for (let b = 0; b < order.length; b += BATCH) trainBatch(order.slice(b, b + BATCH).map(i => train[i]));
  const w = exportWeights({});
  const v = evaluate(w, val);
  const mark = v.rmse < bestRmse - 0.01 ? '*' : '';
  console.log(`epoch ${String(epoch).padStart(2)}  val RMSE ${v.rmse.toFixed(2)}  MAE ${v.mae.toFixed(2)} ${mark}  [${((Date.now() - t0) / 1000).toFixed(0)}s]`);
  if (mark) { best = w; bestRmse = v.rmse; since = 0; } else if (++since >= 6) break;
}
const tr = evaluate(best, train);
best.meta = {
  data: files, samples: rows.length, hidden: H, trainedAt: new Date().toISOString(),
  validation: { rmse: +bestRmse.toFixed(2), plannerRmse: +rawRmse.toFixed(2), rescaledPlannerRmse: +affRmse.toFixed(2), sd: +sdY.toFixed(2) },
  trainRmse: +tr.rmse.toFixed(2),
};
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(best));
console.log(`best val RMSE ${bestRmse.toFixed(2)} (planner ${rawRmse.toFixed(1)}, rescaled ${affRmse.toFixed(1)}) → ${out}`);
console.log('adapters:', Object.entries(best.adapters).map(([k, a]) => `${k} ${a.bias.toFixed(1)} ${a.scale >= 0 ? '+' : ''}${a.scale.toFixed(3)}·ttf`).join(' · '));
