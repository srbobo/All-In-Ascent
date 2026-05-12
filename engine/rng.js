// Seeded pseudo-random number generator (mulberry32 algorithm).
//
// WHY we need this instead of Math.random():
//   The pipeline must be REPRODUCIBLE. When an agent does something weird on
//   game seed=4242 (say, the Sprinter loses every match), we need to replay
//   that exact sequence of dice rolls, milestone selections, and shop
//   randomizations to debug it. Math.random() is not seedable, so you can
//   never reproduce a run. mulberry32 is a tiny, fast, well-distributed
//   32-bit PRNG that we can seed and replay.
//
// WHAT it replaces:
//   Every Math.random() call inside engine/ should go through createRng().
//   The UI layer (ui/*.js) may still use Math.random() for cosmetic things
//   like shimmer animations — those don't affect game outcomes.

// Create a new RNG. Callers get a stateful object with rolling methods.
// Each call to next()/rollDie() advances the internal state.
export function createRng(seed) {
  // Coerce to a 32-bit unsigned integer — mulberry32 operates on 32-bit state.
  let state = seed >>> 0;

  // Return a float in [0, 1). Same contract as Math.random().
  const next = () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,

    // Roll an integer die with `sides` faces (result is 1..sides inclusive).
    // Used for the 2d6 dice in climb attempts.
    rollDie: (sides = 6) => Math.floor(next() * sides) + 1,

    // Uniformly pick one element from an array.
    pick: (arr) => arr[Math.floor(next() * arr.length)],

    // Fisher-Yates shuffle that returns a COPY (does not mutate input).
    // Used for milestone-route selection and shop randomization.
    shuffle: (arr) => {
      const out = arr.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },

    // Pick N distinct elements from an array (without replacement).
    // Used e.g. to pick 5 bouldering routes from the pool of available ones.
    pickN: function (arr, n) {
      return this.shuffle(arr).slice(0, Math.min(n, arr.length));
    },

    // Expose internal state for debug/serialization. Two RNGs with equal
    // state will produce identical streams going forward.
    getState: () => state,
  };
}

// Derive a deterministic seed from (matchup_id, repetition_index).
//
// Used by the matrix orchestrator: the pipeline runs many matchups, each
// repeated N times. We want every (matchup, rep) pair to always yield the
// same game, so resumed or re-run matrices reproduce exactly. We hash the
// two integers together using a splitmix32-style mix.
export function deriveSeed(matchupId, repIndex) {
  let h = ((matchupId | 0) * 2654435761) ^ ((repIndex | 0) * 40503);
  h = (h ^ (h >>> 16)) >>> 0;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h >>> 0;
}
