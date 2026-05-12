// Structured event emitter for the engine.
//
// WHY:
//   The existing game.js has a free-form text log of the last 20 entries.
//   That's fine for a human watching the sidebar, but useless for
//   aggregating across thousands of games or replaying a game. We replace
//   it with a structured event stream that:
//     (a) captures every significant state change with typed data,
//     (b) retains the full history (no 20-entry FIFO cap),
//     (c) is JSON-serializable so it can be written to JSONL, loaded into
//         analysis tools, and consumed by both the browser UI and the
//         simulation pipeline.
//
// DESIGN:
//   - Event shape: { t: <sequence number>, type: <snake_case string>, payload: <plain object> }
//   - `t` is a monotonic sequence number across the entire game. It is NOT
//     a wall-clock timestamp — wall-clock would break reproducibility
//     (two runs of the same seed must produce byte-identical event
//     streams). The writer layer can annotate with wall-clock at write
//     time if desired.
//   - Payloads are plain JSON-able objects. We do NOT deep-clone on emit
//     because that's hot-path expensive; callers pass values, not refs.
//
// USAGE:
//   createGame() and applyAction() each build a fresh emitter, emit events
//   in order, then return the collected events so callers can stream them.
//   The full running log is kept on state.events.

// Create a new emitter. `startingT` is the first sequence number to use —
// applyAction passes state.events.length so numbering continues across calls.
export function makeEmitter(startingT = 0) {
  const events = [];
  let nextT = startingT;
  return {
    events,
    emit(type, payload = {}) {
      events.push({ t: nextT++, type, payload });
    },
  };
}
