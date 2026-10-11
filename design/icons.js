/* ==========================================================================
   ALL IN ASCENT — GRIT & HOLDS v2 · ICONS + ROUTE MOTIFS
   ==========================================================================
   24 × 24 line icons (stroke = currentColor) for stats, costs, areas, gear and
   the route-setter's tag motif that matches every route name.

     AIAIcons.icon(name, { label, className, strokeWidth })  → inline <svg>
     AIAIcons.iconAt(name, x, y, size, color, sw)            → <g> for SVG art
     AIAIcons.motifFor(routeName, route)                     → motif icon name
   ========================================================================== */
(function () {
  'use strict';
  const r1 = (n) => Math.round(n * 10) / 10;
  const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function hash(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  // Route-setter tag motifs — every route name maps to a motif icon.
  // ------------------------------------------------------------------------
  const ROUTE_MOTIFS = {
    // Bouldering
    "Beginner's Fortune": 'clover', 'Power Pulley': 'pulley', 'Open Door': 'door', 'Brute Start': 'fist',
    'Warm-Up Wonder': 'sun', 'Crimson Ladder': 'ladder', 'Toe Hook Traverse': 'shoe', "Crimper's Delight": 'heart',
    'Dyno Dilemma': 'fork', 'Heel Hook Heaven': 'halo', 'The Roof of Doom': 'skull', 'Shoulder Shredder': 'saw',
    'Dyno Chain': 'chain', 'Precision Impossible': 'crosshair', 'The Impossible Pinch': 'pinch', 'Project Zero': 'zero',
    'Strength Silo': 'silo', 'Focus Gauntlet': 'eye', 'The Triple Down': 'dice3', 'Spray Wall Chaos': 'spray',
    'The Clean Line': 'arrowUp', 'Static Control': 'level', 'Redemption Arc': 'arc', 'Hail Mary': 'football',
    'Speed Crimp': 'stopwatch', 'The Gauntlet Opener': 'flag',
    // Top rope
    "First Timer's Friend": 'smile', 'Learning Curve': 'curve', 'The Standard': 'ruler', 'Crimson Wall': 'bricks',
    'Overhang Initiation': 'overhang', 'Crimp Central': 'target', 'Power Climb': 'fist', 'Sustained Difficulty': 'infinity',
    'Dynamic Moves': 'bolt', 'The Power Endurance': 'battery', 'Micro Hold Heaven': 'magnifier', 'The Upper Echelon': 'crown',
    'Professional Grade': 'medal', 'The Wall Flower': 'flower', 'Hip Opener': 'lotus', 'The Fear Factor': 'ghost',
    'The Punishment Wall': 'hammer', 'The Sure Thing': 'checkCircle', 'The Dialed Rope': 'dial', 'Win or Learn': 'book',
    'The Big Gamble': 'dice2', 'Quick Clip': 'stopwatch', 'The Grind': 'cog',
    // Lead
    'Lead Introduction': 'mortarboard', 'Clip and Climb': 'carabiner', 'First Overhang Lead': 'overhang',
    'Pump Management': 'gauge', 'Power Lead': 'fist', 'The Steep Lead': 'peak', 'Runout Section': 'runout',
    'Overhang Lead Challenge': 'overhang', 'Advanced Clipping': 'quickdraw', 'The Compression Lead': 'compress',
    'Endurance Lead': 'infinity', 'The Elite Lead': 'star', 'World Class Leading': 'globe', 'Reach Specialist': 'reach',
    'Clench Mode': 'clench', 'The Runout Nightmare': 'moon', 'The Crux Gauntlet': 'gauntlet', 'The Dialed Lead': 'dial',
    'The Known Route': 'map', "Gambler's Ascent": 'dice2', 'All In': 'chips', 'The Sprint Lead': 'stopwatch',
    'The Quick Send': 'plane',
  };
  function motifFor(name, route) {
    if (ROUTE_MOTIFS[name]) return ROUTE_MOTIFS[name];
    const m = route && route.moveFeatures || [];
    if (m.some(x => /dyn/i.test(x))) return 'bolt';
    if (m.some(x => /hook/i.test(x))) return 'shoe';
    if (m.includes('Roof')) return 'overhang';
    return ['flag', 'star', 'target', 'peak'][hash(name) % 4];
  }

  // 24×24 stroke icons. currentColor; stroke-width set on the wrapper.
  const ICONS = {
    // — stats & costs —
    strength: '<path d="M4 15c1-5 4-8 7-8l2-3h3l1 3-3 2v2c3 0 5 2 5 5 0 3-3 5-7 5H8c-2 0-4-2-4-6z"/><path d="M11 13c1 1 3 1 4 0"/>',
    technique: '<path d="M3 17c0-3 3-5 6-6l3-4h3l1 5c2 1 5 2 5 4v2H3z"/><path d="M3 19h18"/><circle cx="18" cy="6" r="2.2"/>',
    focus: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4.2"/><circle cx="12" cy="12" r="1" fill="currentColor"/>',
    flexibility: '<circle cx="15.5" cy="4.5" r="2"/><path d="M15 8l-3 5 5 3M12 13l-7 2M15 8l4 4M5 15l-2 4M17 16l1 5"/>',
    endurance: '<path d="M13 2L5 13h6l-1 9 8-11h-6z"/>',
    time: '<circle cx="12" cy="13" r="8"/><path d="M12 13V8.5M12 13l3 2M10 2h4"/>',
    xp: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
    grit: '<path d="M7 4h10l4 5-9 11L3 9z"/><path d="M3 9h18M10 4l-1.5 5L12 20l3.5-11L14 4"/>',
    die: '<rect x="3.5" y="3.5" width="17" height="17" rx="3.5"/><circle cx="8.5" cy="8.5" r="1.2" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/>',
    lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/><path d="M12 14.5v2.5"/>',
    check: '<path d="M4.5 12.5l4.5 4.5 10-10"/>',
    cross: '<path d="M6 6l12 12M18 6L6 18"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
    rest: '<path d="M4 16h16M6 16v-3a3 3 0 0 1 3-3h9a2 2 0 0 1 2 2v4M4 19v-9"/><circle cx="8" cy="8" r="2"/>',
    log: '<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4M9 11h7M9 15h7M9 19h4"/>',
    location: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
    users: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6"/><path d="M16 5.2a3 3 0 0 1 0 5.6M18 14.4c1.8.8 3 2.8 3 5.6"/>',
    cards: '<rect x="3" y="6" width="11" height="15" rx="2"/><path d="M8 3h11a2 2 0 0 1 2 2v13"/>',
    // — areas —
    bouldering: '<path d="M3 20l3-9 5-5 6 2 4 6v6z"/><path d="M2 21h20"/><circle cx="12" cy="11" r="1.4" fill="currentColor"/>',
    topRope: '<path d="M7 3h10M9 3v3M15 3v3"/><path d="M9 6c0 5-3 9-3 15M15 6c0 5 2 9 2 15"/><path d="M9 6a3 3 0 0 0 6 0"/>',
    leadClimbing: '<circle cx="12" cy="3.5" r="1.5"/><path d="M12 5v2"/><ellipse cx="12" cy="9.5" rx="2" ry="2.8"/><path d="M12 12.3v4"/><ellipse cx="12" cy="18.8" rx="2" ry="2.8"/><path d="M5 22c3-6 3-9 5-12"/>',
    training: '<rect x="3" y="6" width="18" height="6" rx="2.5"/><path d="M7 9h1M11 9h2M16 9h1M8 12v5M16 12v5M6 20h4M14 20h4"/>',
    gear: '<path d="M8 3h5a5 5 0 0 1 5 5v8a5 5 0 0 1-5 5H9a4 4 0 0 1-4-4V6a3 3 0 0 1 3-3z"/><path d="M5 9l4 6"/>',
    milestone: '<path d="M5 21V3"/><path d="M5 4h12l-2.5 4L17 12H5"/>',
    climber: '<circle cx="13" cy="4" r="2"/><path d="M12 7l-2 6 4 2 1 6M10 13l-4 1M12 7l5 2 2-3M14 15l4-1"/>',
    // — legacy gear names used by route gearModifiers —
    'Climbing Shoes': '<path d="M3 17c0-3 3-5 6-6l3-4h3l1 5c2 1 5 2 5 4v2H3z"/><path d="M3 19h18M9 11l2 2M12 9l2 2"/>',
    'Chalk Bag': '<path d="M6 8h12l-1 11a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2z"/><path d="M6 8c0-2 3-3 6-3s6 1 6 3"/><path d="M4 12h2M18 12h2"/>',
    'Finger Tape': '<circle cx="11" cy="12" r="7"/><circle cx="11" cy="12" r="3"/><path d="M18 12h4v4"/>',
    Harness: '<path d="M4 8c4 2 12 2 16 0M4 8l2 6M20 8l-2 6M6 14c2 1 4 1 6 0 2 1 4 1 6 0M12 14v3"/><circle cx="12" cy="19" r="2"/>',
    // — motifs —
    clover: '<circle cx="12" cy="7.5" r="3.2"/><circle cx="16.5" cy="12" r="3.2"/><circle cx="12" cy="16.5" r="3.2"/><circle cx="7.5" cy="12" r="3.2"/><path d="M14 14c3 3 4 5 6 7"/>',
    pulley: '<path d="M12 2v3"/><circle cx="12" cy="9" r="4"/><circle cx="12" cy="9" r="1" fill="currentColor"/><path d="M8 9v12M16 9v7"/><rect x="14" y="16" width="4" height="4" rx="1"/>',
    door: '<path d="M5 3h10v18H5z"/><path d="M15 3l5 2.5v17L15 21"/><circle cx="12" cy="12.5" r="0.9" fill="currentColor"/><path d="M2 21h20"/>',
    fist: '<path d="M6 11h11a2 2 0 0 1 2 2v3a5 5 0 0 1-5 5h-4a4 4 0 0 1-4-4z"/><path d="M8 11V7.5a1.5 1.5 0 0 1 3 0V11M11 11V6.5a1.5 1.5 0 0 1 3 0V11M14 11V7.5a1.5 1.5 0 0 1 3 0V12M6 14h5"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
    ladder: '<path d="M7 2v20M17 2v20M7 6h10M7 11h10M7 16h10"/>',
    shoe: '<path d="M3 17c0-3 3-5 6-6l3-4h3l1 5c2 1 5 2 5 4v2H3z"/><path d="M3 19h18"/><path d="M14 4h6M18 2l2 2-2 2"/>',
    halo: '<ellipse cx="12" cy="5" rx="6" ry="2"/><path d="M3 19c0-3 3-5 6-6l3-4h3l1 5c2 1 5 2 5 4v1H3z"/>',
    heart: '<path d="M12 20s-7.5-4.6-7.5-10.2A4.2 4.2 0 0 1 12 7.4a4.2 4.2 0 0 1 7.5 2.4C19.5 15.4 12 20 12 20z"/>',
    fork: '<path d="M12 22v-9M12 13L6 6M12 13l6-7M6 6V9.5M6 6h3.5M18 6v3.5M18 6h-3.5"/>',
    skull: '<path d="M5 11a7 7 0 0 1 14 0v3l-2 1v4H7v-4l-2-1z"/><circle cx="9.2" cy="11.5" r="1.7"/><circle cx="14.8" cy="11.5" r="1.7"/><path d="M10 19v-2M12 19v-2M14 19v-2"/>',
    saw: '<path d="M12 2l1.8 3 3.4-.9.3 3.5 3.3 1.3-1.6 3.1 1.6 3.1-3.3 1.3-.3 3.5-3.4-.9L12 22l-1.8-3-3.4.9-.3-3.5-3.3-1.3 1.6-3.1L3.2 9.9l3.3-1.3.3-3.5 3.4.9z"/><circle cx="12" cy="12" r="2.5"/>',
    chain: '<rect x="2.5" y="8.5" width="10" height="7" rx="3.5" transform="rotate(-25 7.5 12)"/><rect x="11.5" y="8.5" width="10" height="7" rx="3.5" transform="rotate(-25 16.5 12)"/>',
    crosshair: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/>',
    pinch: '<path d="M7 3c-3.5 5-3.5 11 1.5 17M17 3c3.5 5 3.5 11-1.5 17"/><rect x="9.5" y="7" width="5" height="10" rx="2.2"/>',
    zero: '<ellipse cx="12" cy="12" rx="6" ry="9"/><path d="M8 19L16 5"/>',
    silo: '<path d="M6 21V10a6 5 0 0 1 12 0v11z"/><path d="M6 14h12M6 18h12M3 21h18M12 5V3"/>',
    eye: '<path d="M2 12s4-6.5 10-6.5S22 12 22 12s-4 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="0.8" fill="currentColor"/>',
    dice3: '<rect x="3.5" y="3.5" width="17" height="17" rx="3.5"/><circle cx="8" cy="8" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="16" cy="16" r="1.3" fill="currentColor"/>',
    dice2: '<rect x="2.5" y="8.5" width="11" height="11" rx="2.5"/><rect x="11" y="3.5" width="10.5" height="10.5" rx="2.5" transform="rotate(12 16 9)"/><circle cx="6" cy="12" r="1" fill="currentColor"/><circle cx="10" cy="16" r="1" fill="currentColor"/><circle cx="16.3" cy="8.8" r="1" fill="currentColor"/>',
    spray: '<rect x="7" y="9" width="8" height="12.5" rx="2"/><path d="M9 9V6h4v3M13 6h2"/><circle cx="18.5" cy="4" r="0.8" fill="currentColor"/><circle cx="20.5" cy="6.5" r="0.8" fill="currentColor"/><circle cx="18" cy="8" r="0.8" fill="currentColor"/><circle cx="21" cy="3" r="0.8" fill="currentColor"/>',
    arrowUp: '<path d="M12 21V4M6.5 9.5L12 4l5.5 5.5M5 21h14"/>',
    level: '<rect x="2" y="8.5" width="20" height="7" rx="3"/><circle cx="12" cy="12" r="1.6"/><path d="M9.5 8.5v7M14.5 8.5v7"/>',
    arc: '<path d="M4 20C5 10 14 5 19 9"/><path d="M19 9l.5-5M19 9l-5 .5"/><circle cx="4" cy="20" r="1.2" fill="currentColor"/>',
    football: '<ellipse cx="12" cy="12" rx="9.5" ry="5.5" transform="rotate(-35 12 12)"/><path d="M9 15l6-6M10.2 11.8l2 2M12 10l2 2"/>',
    stopwatch: '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 13.5V9M10 2.5h4M12 2.5V6M18.5 6.5l1.5-1.5"/>',
    flag: '<path d="M6 22V3"/><path d="M6 4h12l-2.5 3.5L18 11H6"/><path d="M3 22h7"/>',
    smile: '<circle cx="12" cy="12" r="9"/><circle cx="9" cy="10" r="1" fill="currentColor"/><circle cx="15" cy="10" r="1" fill="currentColor"/><path d="M8 14.5c2 2.5 6 2.5 8 0"/>',
    curve: '<path d="M4 3v17h17"/><path d="M6 18c5-1 7-10 14-12"/>',
    ruler: '<rect x="2" y="8" width="20" height="8" rx="1.5"/><path d="M6 8v3M10 8v4M14 8v3M18 8v4"/>',
    bricks: '<rect x="3" y="5" width="18" height="14" rx="1"/><path d="M3 9.7h18M3 14.3h18M9 5v4.7M15 5v4.7M6 9.7v4.6M12 9.7v4.6M18 9.7v4.6M9 14.3V19M15 14.3V19"/>',
    overhang: '<path d="M4 21V12L20 4"/><path d="M8 10l1.5 2M12 8l1.5 2M16 6l1.5 2"/><path d="M2 21h8"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/>',
    infinity: '<path d="M12 12C9 7 3 8 3 12s6 5 9 0 9-5 9 0-6 4-9 0z"/>',
    bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
    battery: '<rect x="2.5" y="7" width="17" height="10" rx="2"/><path d="M19.5 10.5h2v3h-2"/><path d="M6 10v4M9.5 10v4M13 10v4"/>',
    magnifier: '<circle cx="10" cy="10" r="6.5"/><path d="M15 15l6 6M7.5 10.5h5"/>',
    crown: '<path d="M3 18L5 7l4.5 5L12 5l2.5 7L19 7l2 11z"/><path d="M3 21h18"/>',
    medal: '<path d="M8 2l4 7 4-7"/><circle cx="12" cy="15" r="6"/><path d="M12 12l.9 1.9 2 .3-1.5 1.4.4 2-1.8-1-1.8 1 .4-2-1.5-1.4 2-.3z"/>',
    flower: '<circle cx="12" cy="8" r="2.2"/><circle cx="12" cy="4.2" r="2"/><circle cx="15.7" cy="7" r="2"/><circle cx="14.3" cy="11.3" r="2"/><circle cx="9.7" cy="11.3" r="2"/><circle cx="8.3" cy="7" r="2"/><path d="M12 13v9M12 18c-2-2-4-2-5-1M12 17c2-2 4-2 5-1"/>',
    lotus: '<path d="M12 19c-4-4-4-9 0-13 4 4 4 9 0 13z"/><path d="M12 19c-5 0-9-3-9-7 4 0 7 3 9 7zM12 19c5 0 9-3 9-7-4 0-7 3-9 7z"/>',
    ghost: '<path d="M6 21V10a6 6 0 0 1 12 0v11l-2-2-2 2-2-2-2 2-2-2z"/><circle cx="9.5" cy="10.5" r="1.2" fill="currentColor"/><circle cx="14.5" cy="10.5" r="1.2" fill="currentColor"/>',
    hammer: '<path d="M4 7l5-4 4 4-5 4z"/><path d="M10 9l10 10-2 2L8 11"/>',
    checkCircle: '<circle cx="12" cy="12" r="9"/><path d="M7.5 12.5l3 3 6-6.5"/>',
    dial: '<circle cx="12" cy="13" r="8"/><path d="M12 13l4.5-4.5M12 2v2M3 13h2M19 13h2M5.6 6.6l1.4 1.4M18.4 6.6L17 8"/>',
    book: '<path d="M12 6C9 4 5 4 3 5v14c2-1 6-1 9 1 3-2 7-2 9-1V5c-2-1-6-1-9 1z"/><path d="M12 6v14"/>',
    cog: '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/><circle cx="12" cy="12" r="6.5"/>',
    mortarboard: '<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c3 2 9 2 12 0v-5M21 9.5v6"/>',
    carabiner: '<path d="M9 3h5a5 5 0 0 1 5 5v8a5 5 0 0 1-5 5h-5a5 5 0 0 1-5-5V8a5 5 0 0 1 5-5z"/><path d="M4 9.5l4.5 6"/>',
    quickdraw: '<ellipse cx="12" cy="5" rx="3" ry="3.5"/><path d="M11 8.5h2v6h-2z"/><ellipse cx="12" cy="18.5" rx="3" ry="3.5"/>',
    gauge: '<path d="M3.5 17a8.5 8.5 0 0 1 17 0"/><path d="M12 17l5-6M6 13l1 .6M12 9v1M18 13l-1 .6"/><circle cx="12" cy="17" r="1.3" fill="currentColor"/>',
    peak: '<path d="M2 20l7-13 3 5 3-6 7 14z"/><path d="M9 7l1.5 3M15 6l1.4 2.8"/>',
    runout: '<circle cx="12" cy="4" r="2"/><circle cx="12" cy="20" r="2"/><path d="M12 6v12" stroke-dasharray="2 3"/>',
    compress: '<path d="M2 12h6M5.5 9.5L8 12l-2.5 2.5M22 12h-6M18.5 9.5L16 12l2.5 2.5M12 4v16"/>',
    star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
    globe: '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18M4.5 7.5h15M4.5 16.5h15"/>',
    reach: '<path d="M4 20L20 4M4 20v-5M4 20h5M20 4v5M20 4h-5"/>',
    clench: '<rect x="3" y="7" width="18" height="10" rx="4"/><path d="M3 12h18M7.5 7v10M12 7v10M16.5 7v10"/>',
    moon: '<path d="M15 3a9 9 0 1 0 6 13A7 7 0 0 1 15 3z"/><path d="M5 4l.5 1.5L7 6l-1.5.5L5 8l-.5-1.5L3 6l1.5-.5z"/>',
    gauntlet: '<path d="M2 12h17M16 8.5l3.5 3.5-3.5 3.5M7 5v14M12 5v14"/>',
    map: '<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/><path d="M17 10l2 2M19 10l-2 2"/>',
    chips: '<ellipse cx="12" cy="7" rx="8" ry="3"/><path d="M4 7v4c0 1.7 3.6 3 8 3s8-1.3 8-3V7M4 11v4c0 1.7 3.6 3 8 3s8-1.3 8-3v-4"/><path d="M8 9.6v2M12 10v2M16 9.6v2"/>',
    plane: '<path d="M3 11L21 3l-7 18-3-8z"/><path d="M11 13L21 3"/>',
  };
  function icon(name, opts = {}) {
    const body = ICONS[name] || ICONS.star;
    const sw = opts.strokeWidth || 2;
    const label = opts.label ? ` role="img" aria-label="${esc(opts.label)}"` : ' aria-hidden="true"';
    return `<svg class="aia-icon${opts.className ? ' ' + opts.className : ''}" viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" focusable="false"${label}>${body}</svg>`;
  }
  // icon body for embedding inside another SVG at (x, y) with size px
  function iconAt(name, x, y, size, color, sw = 2) {
    const k = size / 24;
    return `<g transform="translate(${r1(x)} ${r1(y)}) scale(${r1(k * 100) / 100})" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" color="${color}">${ICONS[name] || ICONS.star}</g>`;
  }

  // ------------------------------------------------------------------------

  const api = { icon, iconAt, motifFor, ICONS, ROUTE_MOTIFS, names: Object.keys(ICONS) };
  if (typeof window !== 'undefined') window.AIAIcons = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
