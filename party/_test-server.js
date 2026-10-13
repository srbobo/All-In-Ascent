// Stand-in for PartyServer's `Server` base, for running the rooms outside the
// Workers runtime (party/_smoke.js, the party tests, tests/e2e). Provides what
// the rooms use: this.name, this.env, this.ctx.storage (in memory unless one
// is given) and broadcast() to the connections added with connect(). Not
// deployed.

import { createMemoryStorage } from './_memory-storage.js';

export class TestServer {
  constructor({ name, env = {}, storage = createMemoryStorage() } = {}) {
    this.name = name;
    this.env = env;
    this.ctx = { storage };
    this.connections = new Map();
  }

  // Track a fake connection ({ id, send(), close() }) so broadcasts reach it.
  connect(conn) {
    this.connections.set(conn.id, conn);
  }

  disconnect(conn) {
    this.connections.delete(conn.id);
  }

  broadcast(msg, without) {
    for (const conn of this.connections.values()) if (!without || !without.includes(conn.id)) conn.send(msg);
  }

  getConnection(id) {
    return this.connections.get(id);
  }

  getConnections() {
    return this.connections.values();
  }
}
