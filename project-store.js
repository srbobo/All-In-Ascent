// All In Ascent — the Project Mode workshop (classic script, works from file://).
//
// Keeps the player's own cards in this browser (localStorage) and turns them
// into the content pack a local game is created with. The builder
// (project.html / project.js) edits the workshop; the game (index.html /
// game.js) reads it when the projectMode flag is on.
//
//   AscentWorkshop.load()                → { characters: [], routes: [], gear: [] } (raw definitions)
//   AscentWorkshop.save(kind, def)       → the saved definition (with its workshop id)
//   AscentWorkshop.remove(kind, id)
//   AscentWorkshop.get(kind, id)
//   AscentWorkshop.contentPack()         → { pack, errors }: every card that compiles, as one pack
//   AscentWorkshop.submission(kind, def, { author, note }) → a submission record (engine/content.js)
//
// The compiler is the engine's (window.AscentEngine, from engine/engine.browser.js).

(function () {
  const STORAGE_KEY = 'all-in-ascent.workshop';
  const KINDS = ['characters', 'routes', 'gear'];
  const KIND_OF = { character: 'characters', route: 'routes', gear: 'gear' };

  function empty() {
    return { characters: [], routes: [], gear: [] };
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (!parsed || typeof parsed !== 'object') return empty();
      const out = empty();
      for (const k of KINDS) if (Array.isArray(parsed[k])) out[k] = parsed[k];
      return out;
    } catch {
      return empty();
    }
  }

  function persist(data) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch { /* storage blocked */ }
  }

  function newId(prefix) {
    const rand = (window.crypto && window.crypto.randomUUID)
      ? window.crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
    return `${prefix}-${rand}`;
  }

  const listOf = (kind) => KIND_OF[kind] || kind;

  function save(kind, def) {
    const data = load();
    const list = data[listOf(kind)];
    const saved = { ...def, workshopId: def.workshopId || newId(kind), savedAt: Date.now() };
    const i = list.findIndex(x => x.workshopId === saved.workshopId);
    if (i >= 0) list[i] = saved; else list.push(saved);
    persist(data);
    return saved;
  }

  function remove(kind, id) {
    const data = load();
    data[listOf(kind)] = data[listOf(kind)].filter(x => x.workshopId !== id);
    persist(data);
  }

  function get(kind, id) {
    return load()[listOf(kind)].find(x => x.workshopId === id) || null;
  }

  function replaceAll(data) {
    const out = empty();
    for (const k of KINDS) if (data && Array.isArray(data[k])) out[k] = data[k];
    persist(out);
    return out;
  }

  // Strip workshop bookkeeping before handing a card to the engine.
  function definitionOf(card) {
    const def = { ...card };
    delete def.workshopId;
    delete def.savedAt;
    return def;
  }

  // Every card in the workshop that compiles, as one pack for createGame.
  // Cards with errors are left out and reported.
  function contentPack() {
    const E = window.AscentEngine;
    const data = load();
    const errors = [];
    const raw = { schema: E.CONTENT_SCHEMA, characters: [], routes: [], gear: [] };
    const tryAdd = (kind, list, compile) => {
      for (const card of list) {
        const def = definitionOf(card);
        const r = compile(def);
        if (r.ok) raw[listOf(kind)].push(def);
        else errors.push({ kind, workshopId: card.workshopId, name: card.name, errors: r.errors });
      }
    };
    tryAdd('character', data.characters, E.compileCharacter);
    tryAdd('route', data.routes, E.compileRoute);
    tryAdd('gear', data.gear, E.compileGear);
    const compiled = E.compileContentPack(raw);
    if (!compiled.ok) {
      // A clash between cards (two with one name): report and play without the pack.
      errors.push({ kind: 'pack', errors: compiled.errors });
      return { pack: null, errors };
    }
    return { pack: E.hasCustomContent(compiled.value) ? raw : null, errors };
  }

  function submission(kind, def, { author = null, note = null } = {}) {
    const E = window.AscentEngine;
    return {
      schema: E.SUBMISSION_SCHEMA,
      id: newId(`sub-${kind}`),
      kind,
      engineVersion: E.ENGINE_VERSION_STRING,
      author: author || null,
      note: note || null,
      submittedAt: Date.now(),
      definition: definitionOf(def),
    };
  }

  window.AscentWorkshop = { load, save, remove, get, replaceAll, definitionOf, contentPack, submission, KINDS, STORAGE_KEY };
})();
