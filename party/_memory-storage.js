// In-memory stand-in for a Durable Object's `ctx.storage`, for running the
// rooms outside the Workers runtime (party/_test-server.js).
// Covers the calls the parties make: get, put, delete (one key or many) and
// list({ prefix, limit, startAfter }) in key order. Not deployed.

export function createMemoryStorage() {
  const data = new Map();
  const clone = (v) => (v === undefined ? undefined : structuredClone(v));
  return {
    data,
    async get(key) { return clone(data.get(key)); },
    async put(key, value) { data.set(key, clone(value)); },
    async delete(keys) {
      if (Array.isArray(keys)) return keys.filter(k => data.delete(k)).length;
      return data.delete(keys);
    },
    async list({ prefix = '', limit = Infinity, startAfter = null } = {}) {
      const keys = [...data.keys()].filter(k => k.startsWith(prefix) && (startAfter === null || k > startAfter)).sort();
      return new Map(keys.slice(0, limit).map(k => [k, clone(data.get(k))]));
    },
  };
}
