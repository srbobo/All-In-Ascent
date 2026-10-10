/* ==========================================================================
   ALL IN ASCENT — GRIT & HOLDS v2 · CARD ART  ("Pastel sandstone print")
   ==========================================================================
   Every card illustration, generated from game data, in one print style:

     • flat printed planes in pastel sandstone (no outlines)
     • two-tone holds — a shade body with a lit pastel face
     • an anatomically proportioned climber in warm umber, with a flat cast
       shadow on the wall
     • grit specks (CSS overlay on .aia-card__art) and chalk dust where
       hands have been

     AIAArt.route(route, area)    wall angle ← routeType, hold shapes ←
                                  holdFeatures, pose ← moveFeatures, rope
                                  system ← area, hold colour ← grade circuit,
                                  setter's tag motif ← route name
     AIAArt.gear(gear)            still life per gear card
     AIAArt.climber(key)          climber portrait
     AIAArt.training(area)        training station
     AIAArt.circuit(grade)        { key, tier, label } grade → hold colour
     AIAArt.icon / iconAt         re-exported from design/icons.js
     AIAArt.mount()               injects shared <defs> once per document

   Art is 200 × 150 (4:3) and decorative (aria-hidden) — card text carries
   every rule. Colours sync from design/tokens.css on mount.
   ========================================================================== */
(function () {
  'use strict';
  const Icons = () => window.AIAIcons;

  // ------------------------------------------------------------------------
  // Palette (mirrors tokens.css; refreshed on mount)
  // ------------------------------------------------------------------------
  const P = {
    lime: '#b6d62d', marigold: '#ffae28', coral: '#ff6845', teal: '#1fb8a6',
    cobalt: '#2a62cc', raspberry: '#c4286c', violet: '#7a48cc', basalt: '#2e2b2f',
    chalk: '#f4ede0', paper: '#f8f0dc', wood: '#c48e55', slate: '#9c9a94', umber: '#7b5a3c',
    // art-only print palette
    sand: '#dcc6a4', sandLt: '#eadbc1', sandSh: '#bf9f78', sandDp: '#8f7052',
    figure: '#6b5038', dust: '#fbf8f2', padArt: '#97a3ab', padSeam: '#7d8a93', floor: '#a88d6f',
  };
  const TOKEN_MAP = {
    lime: '--lime', marigold: '--marigold', coral: '--coral', teal: '--teal', cobalt: '--cobalt',
    raspberry: '--raspberry', violet: '--violet', basalt: '--basalt', chalk: '--chalk', paper: '--paper',
    wood: '--wood', slate: '--wall-slate', umber: '--wall-umber',
    sand: '--art-sand', sandLt: '--art-sand-light', sandSh: '--art-sand-shade', sandDp: '--art-sand-deep',
    figure: '--art-figure', dust: '--art-dust', padArt: '--art-pad',
  };
  function syncPalette() {
    if (typeof getComputedStyle !== 'function' || !document.documentElement) return;
    const cs = getComputedStyle(document.documentElement);
    for (const [k, v] of Object.entries(TOKEN_MAP)) {
      const val = cs.getPropertyValue(v).trim();
      if (/^#[0-9a-f]{6}$/i.test(val)) P[k] = val;
    }
  }

  // ------------------------------------------------------------------------
  // Utilities
  // ------------------------------------------------------------------------
  const r1 = (n) => Math.round(n * 10) / 10;
  const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function hash(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function mix(a, b, t) {
    const pa = [1, 3, 5].map(i => parseInt(a.slice(i, i + 2), 16));
    const pb = [1, 3, 5].map(i => parseInt(b.slice(i, i + 2), 16));
    return '#' + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, '0')).join('');
  }
  // Print inks for a hold colour: lit face, shade body.
  const lit = (k) => mix(P[k] || k, P.chalk, k === 'basalt' ? 0.38 : 0.5);
  const shade = (k) => mix(mix(P[k] || k, P.chalk, k === 'basalt' ? 0.18 : 0.24), P.sandDp, 0.2);
  function closedCurve(pts) {
    const n = pts.length;
    let d = `M${r1(pts[0][0])} ${r1(pts[0][1])}`;
    for (let i = 0; i < n; i++) {
      const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
      d += `C${r1(p1[0] + (p2[0] - p0[0]) / 6)} ${r1(p1[1] + (p2[1] - p0[1]) / 6)} ${r1(p2[0] - (p3[0] - p1[0]) / 6)} ${r1(p2[1] - (p3[1] - p1[1]) / 6)} ${r1(p2[0])} ${r1(p2[1])}`;
    }
    return d + 'Z';
  }
  function blobPts(cx, cy, rx, ry, seed, wobble = 0.16, n = 7) {
    const rnd = rng(seed);
    const off = rnd() * Math.PI;
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = off + (i / n) * Math.PI * 2;
      const k = 1 + (rnd() - 0.5) * 2 * wobble;
      pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
    }
    return pts;
  }
  let uid = 0;
  const nextId = (p) => `aia-${p}-${++uid}`;

  // ------------------------------------------------------------------------
  // Grade circuit — the gym's colour-per-grade system
  // ------------------------------------------------------------------------
  const CIRCUIT = [
    { key: 'lime', label: 'Green circuit' }, { key: 'marigold', label: 'Yellow circuit' },
    { key: 'coral', label: 'Orange circuit' }, { key: 'teal', label: 'Teal circuit' },
    { key: 'cobalt', label: 'Blue circuit' }, { key: 'raspberry', label: 'Pink circuit' },
    { key: 'violet', label: 'Purple circuit' }, { key: 'basalt', label: 'Black circuit' },
  ];
  function gradeScore(grade) {
    const g = String(grade || '').trim();
    const v = /^V(\d+)/i.exec(g);
    if (v) return Math.min(7, [0, 0, 1, 1, 2, 3, 4, 4, 5, 6, 6, 7, 7][+v[1]] ?? 7);
    const y = /^5\.(\d+)([abcd]?)/.exec(g);
    if (y) {
      const n = +y[1], l = 'abcd'.indexOf(y[2] || 'a');
      if (n <= 8) return 0;
      if (n === 9) return 1;
      if (n === 10) return l <= 0 ? 1 : 2;
      if (n === 11) return l <= 1 ? 3 : 4;
      if (n === 12) return l === 0 ? 4 : l <= 2 ? 5 : 6;
      if (n === 13) return l === 0 ? 6 : 7;
      return 7;
    }
    return 2;
  }
  const circuit = (grade) => { const tier = gradeScore(grade); return { tier, ...CIRCUIT[tier] }; };

  // ------------------------------------------------------------------------
  // Shared <defs>: chalk-dust filter, flat-shadow + shade filters for still
  // lifes, T-nut pattern, wood grain.
  // ------------------------------------------------------------------------
  function defsMarkup() {
    return `
      <filter id="aia-dust" x="-50%" y="-50%" width="200%" height="200%">
        <feTurbulence type="fractalNoise" baseFrequency="0.75" numOctaves="3" seed="13" result="n"/>
        <feColorMatrix in="n" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1.5 -0.45" result="m"/>
        <feGaussianBlur in="SourceGraphic" stdDeviation="2.6" result="b"/>
        <feComposite in="b" in2="m" operator="in"/>
      </filter>
      <filter id="aia-flat-shadow" x="-10%" y="-10%" width="120%" height="120%">
        <feFlood flood-color="${P.sandDp}" flood-opacity="0.4"/><feComposite in2="SourceAlpha" operator="in"/>
      </filter>
      <filter id="aia-shade" x="-10%" y="-10%" width="120%" height="120%">
        <feColorMatrix values="0.74 0 0 0 0.02  0 0.72 0 0 0.02  0 0 0.72 0 0.02  0 0 0 1 0"/>
      </filter>
      <pattern id="aia-tnut" width="14" height="14" patternUnits="userSpaceOnUse">
        <circle cx="3.5" cy="3.5" r="0.8" fill="${P.sandDp}" fill-opacity="0.5"/>
        <circle cx="10.5" cy="10.5" r="0.8" fill="${P.sandDp}" fill-opacity="0.5"/>
      </pattern>
      <pattern id="aia-grain" width="60" height="18" patternUnits="userSpaceOnUse">
        <path d="M0 5C15 2 25 8 40 5S55 3 60 5M0 13C12 11 28 16 42 12S56 12 60 13" fill="none" stroke="${P.sandDp}" stroke-opacity="0.28" stroke-width="0.8"/>
      </pattern>`;
  }
  function mount() {
    if (typeof document === 'undefined') return;
    syncPalette();
    let host = document.getElementById('aia-art-defs');
    if (!host) {
      host = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      host.setAttribute('id', 'aia-art-defs');
      host.setAttribute('aria-hidden', 'true');
      host.setAttribute('focusable', 'false');
      host.setAttribute('width', '0');
      host.setAttribute('height', '0');
      host.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
      (document.body || document.documentElement).prepend(host);
    }
    host.innerHTML = `<defs>${defsMarkup()}</defs>`;
  }
  function svgWrap(inner, cls, label) {
    const a11y = label ? `role="img" aria-label="${esc(label)}"` : 'aria-hidden="true"';
    return `<svg class="aia-art ${cls || ''}" viewBox="0 0 200 150" preserveAspectRatio="xMidYMid slice" focusable="false" ${a11y} xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;
  }

  // ------------------------------------------------------------------------
  // Primitives
  // ------------------------------------------------------------------------
  const HOLD_DIMS = {
    jug: [0.95, 0.72], crimp: [1.15, 0.36], pinch: [0.42, 0.95], sloper: [1.15, 0.68],
    pocket: [0.8, 0.7], chip: [0.42, 0.36],
  };
  // Two-tone printed hold: cast shadow, shade body, offset lit face.
  function hold({ x, y, shape = 'jug', size = 9, color = 'coral', seed = 1, rot = 0 }) {
    const [kx, ky] = HOLD_DIMS[shape] || HOLD_DIMS.jug;
    const rx = size * kx, ry = size * ky;
    const pts = blobPts(0, 0, rx, ry, seed, shape === 'crimp' ? 0.1 : 0.17);
    const body = closedCurve(pts);
    const face = closedCurve(pts.map(([px, py]) => [px * 0.76 - rx * 0.1, py * 0.72 - ry * 0.14]));
    let detail = '';
    if (shape === 'pocket') detail = `<ellipse cx="${r1(rx * 0.04)}" cy="${r1(ry * 0.02)}" rx="${r1(rx * 0.36)}" ry="${r1(ry * 0.26)}" fill="${shade(color)}"/>`;
    if (shape === 'jug') detail = `<ellipse cx="${r1(rx * 0.02)}" cy="${r1(-ry * 0.22)}" rx="${r1(rx * 0.5)}" ry="${r1(ry * 0.2)}" fill="${shade(color)}" opacity="0.85"/>`;
    return `<g transform="translate(${r1(x)} ${r1(y)}) rotate(${r1(rot)})">
      <path d="${body}" transform="translate(${r1(size * 0.26)} ${r1(size * 0.34)})" fill="${P.sandDp}" fill-opacity="0.4"/>
      <path d="${body}" fill="${shade(color)}"/>
      <path d="${face}" fill="${lit(color)}"/>${detail}
    </g>`;
  }
  const dustPuff = (x, y, rx, ry, o = 0.6) => `<ellipse cx="${r1(x)}" cy="${r1(y)}" rx="${r1(rx)}" ry="${r1(ry)}" fill="${P.dust}" opacity="${o}"/>`;
  const dustLayer = (puffs) => puffs ? `<g filter="url(#aia-dust)">${puffs}</g>` : '';
  function motes(n, seed, box = [0, 0, 200, 140]) {
    const rnd = rng(seed);
    return Array.from({ length: n }, () => `<circle cx="${r1(box[0] + rnd() * box[2])}" cy="${r1(box[1] + rnd() * box[3])}" r="${r1(0.4 + rnd() * 1)}" fill="${P.dust}" opacity="${r1(0.3 + rnd() * 0.5)}"/>`).join('');
  }
  function tapeMark(x, y, color, rot = -20, w = 7, h = 2.4) {
    return `<rect x="${r1(x - w / 2)}" y="${r1(y - h / 2)}" width="${w}" height="${h}" rx="0.3" fill="${lit(color)}" transform="rotate(${rot} ${r1(x)} ${r1(y)})"/>`;
  }
  function quickdraw(x, y, s = 1) {
    return `<g transform="translate(${r1(x)} ${r1(y)}) scale(${s})">
      <circle r="1.6" fill="${mix(P.slate, P.chalk, 0.2)}"/>
      <ellipse cx="0" cy="3.4" rx="1.4" ry="2.3" fill="none" stroke="${mix(P.slate, P.chalk, 0.45)}" stroke-width="0.9"/>
      <rect x="-1" y="5.2" width="2" height="5.2" rx="0.5" fill="${lit('teal')}"/>
      <ellipse cx="0" cy="12.4" rx="1.5" ry="2.4" fill="none" stroke="${mix(P.slate, P.chalk, 0.45)}" stroke-width="0.9"/>
    </g>`;
  }
  function rope(d, color, w = 2.4) {
    return `<path d="${d}" fill="none" stroke="${P.sandDp}" stroke-opacity="0.35" stroke-width="${w}" stroke-linecap="round" transform="translate(1.6 1.8)"/>
      <path d="${d}" fill="none" stroke="${shade(color)}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="${d}" fill="none" stroke="${lit(color)}" stroke-width="${r1(w * 0.45)}" stroke-linecap="round" transform="translate(-0.4 -0.4)"/>`;
  }

  // ------------------------------------------------------------------------
  // Climber figure — tapered anatomical segments, flat umber, cast shadow.
  // Joint coordinates in body units (hip at 0,0; y down; ~46 units tall).
  // ------------------------------------------------------------------------
  const POSES = {
    reach:    { neck: [1, -15], head: [2, -21], e1: [6, -21], h1: [8, -29], e2: [-7, -9], h2: [-9, -17], k1: [7, 5], f1: [5, 14], k2: [-7, 7], f2: [-9, 15] },
    slab:     { neck: [0, -15], head: [1, -21], e1: [6, -11], h1: [9, -18], e2: [-6, -10], h2: [-9, -15], k1: [4, 8], f1: [3, 17], k2: [-4, 8], f2: [-6, 16] },
    dyno:     { neck: [3, -14], head: [5, -20], e1: [8, -21], h1: [12, -29], e2: [5, -22], h2: [8, -30], k1: [-3, 9], f1: [-8, 17], k2: [2, 10], f2: [-2, 19] },
    heelhook: { neck: [-2, -14], head: [-3, -20], e1: [2, -21], h1: [4, -29], e2: [-7, -17], h2: [-10, -24], k1: [10, -4], f1: [17, -9], k2: [-4, 9], f2: [-3, 18] },
    roof:     { neck: [-15, -1], head: [-21, -2], e1: [-12, -7], h1: [-9, -13], e2: [-19, -7], h2: [-20, -13], k1: [5, -7], f1: [10, -12], k2: [8, -3], f2: [15, -10] },
    traverse: { neck: [0, -15], head: [0, -21], e1: [8, -18], h1: [15, -22], e2: [-8, -17], h2: [-15, -19], k1: [6, 7], f1: [11, 13], k2: [-6, 7], f2: [-11, 14] },
    hang:     { neck: [0, -15], head: [0, -20], e1: [3, -24], h1: [4, -32], e2: [-3, -24], h2: [-4, -32], k1: [1.5, 10], f1: [2, 20], k2: [-1.5, 10], f2: [-2, 20] },
    campus:   { neck: [0, -15], head: [0, -20.5], e1: [4, -25], h1: [5, -35], e2: [-3, -23], h2: [-4, -31], k1: [4, 9], f1: [2, 18], k2: [-1, 10], f2: [-4, 19] },
    standlook:{ neck: [0, -15], head: [1.5, -21], e1: [6, -20], h1: [11, -27], e2: [-5, -9], h2: [0, -10], k1: [3, 9], f1: [4, 19], k2: [-3, 9], f2: [-4, 19] },
    stretch:  { neck: [-6, -14], head: [-9, -19], e1: [-3, -24], h1: [-11, -29], e2: [4, -6], h2: [6, 1], k1: [-6, 9], f1: [-11, 18], k2: [6, 9], f2: [11, 18] },
    balance:  { neck: [0, -15], head: [0.5, -21], e1: [-8, -17], h1: [-16, -21], e2: [8, -16], h2: [16, -19], k1: [-2, 10], f1: [0, 19], k2: [8, 6], f2: [6, 13] },
    spot:     { neck: [-1, -15], head: [-1, -21], e1: [4, -22], h1: [7, -30], e2: [-3, -23], h2: [-1, -31], k1: [-5, 9], f1: [-8, 19], k2: [5, 9], f2: [9, 19] },
    onearm:   { neck: [0, -15], head: [-2.5, -19.5], e1: [0.5, -23], h1: [1, -31], e2: [-7, -12], h2: [-13, -9], k1: [3, 9], f1: [7, 16], k2: [-2, 10], f2: [-2, 19] },
  };
  const pose = (n) => POSES[n] || POSES.reach;
  function jointAt(p, j, o) {
    const [jx, jy] = j === 'hip' ? [0, 0] : p[j];
    return [o.x + (o.flip ? -jx : jx) * o.s, o.y + jy * o.s];
  }
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  function seg(a, b, wa, wb) {
    const [x1, y1] = a, [x2, y2] = b, dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
    return `M${r1(x1 + nx * wa / 2)} ${r1(y1 + ny * wa / 2)}L${r1(x2 + nx * wb / 2)} ${r1(y2 + ny * wb / 2)}A${r1(wb / 2)} ${r1(wb / 2)} 0 0 0 ${r1(x2 - nx * wb / 2)} ${r1(y2 - ny * wb / 2)}L${r1(x1 - nx * wa / 2)} ${r1(y1 - ny * wa / 2)}A${r1(wa / 2)} ${r1(wa / 2)} 0 0 0 ${r1(x1 + nx * wa / 2)} ${r1(y1 + ny * wa / 2)}Z`;
  }
  const disc = ([x, y], rad) => `M${r1(x - rad)} ${r1(y)}a${r1(rad)} ${r1(rad)} 0 1 0 ${r1(rad * 2)} 0a${r1(rad)} ${r1(rad)} 0 1 0 ${r1(-rad * 2)} 0Z`;
  // The figure as separate <path>s (separate so windings never punch holes).
  function figureShapes(poseName, o) {
    const p = pose(poseName), s = o.s || 1;
    const J = (j) => jointAt(p, j, { ...o, s });
    const hip = J('hip'), neck = J('neck'), headRaw = J('head');
    const chest = lerp(hip, neck, 0.7), sh = lerp(hip, neck, 0.9);
    const dl = Math.hypot(headRaw[0] - neck[0], headRaw[1] - neck[1]) || 1;
    const head = [neck[0] + (headRaw[0] - neck[0]) / dl * 3.5 * s, neck[1] + (headRaw[1] - neck[1]) / dl * 3.5 * s];
    const W = (w) => w * s;
    const d = [
      seg(hip, chest, W(6.2), W(7.2)), seg(chest, neck, W(3.6), W(2.6)),
      seg(sh, J('e1'), W(3), W(2.4)), seg(J('e1'), J('h1'), W(2.3), W(1.6)),
      seg(sh, J('e2'), W(3), W(2.4)), seg(J('e2'), J('h2'), W(2.3), W(1.6)),
      seg(hip, J('k1'), W(4.4), W(3.1)), seg(J('k1'), J('f1'), W(2.9), W(1.9)),
      seg(hip, J('k2'), W(4.4), W(3.1)), seg(J('k2'), J('f2'), W(2.9), W(1.9)),
      disc(hip, W(3.2)), disc(chest, W(3.6)), disc(sh, W(1.8)),
      disc(J('e1'), W(1.2)), disc(J('e2'), W(1.2)), disc(J('k1'), W(1.55)), disc(J('k2'), W(1.55)),
      disc(J('h1'), W(1.15)), disc(J('h2'), W(1.15)),
    ];
    const ang = (a, b) => Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI;
    const footEl = (k, f) => `<ellipse cx="${r1(f[0])}" cy="${r1(f[1])}" rx="${r1(W(2.5))}" ry="${r1(W(1.15))}" transform="rotate(${r1(ang(k, f) - 90 + (o.flip ? 180 : 0))} ${r1(f[0])} ${r1(f[1])})"/>`;
    const headEl = `<ellipse cx="${r1(head[0])}" cy="${r1(head[1])}" rx="${r1(W(2.75))}" ry="${r1(W(3.1))}" transform="rotate(${r1(ang(neck, head) + 90)} ${r1(head[0])} ${r1(head[1])})"/>`;
    return { paths: d.map(x => `<path d="${x}"/>`).join('') + headEl + footEl(J('k1'), J('f1')) + footEl(J('k2'), J('f2')), hip };
  }
  function climber(poseName, o) {
    const s = o.s || 1;
    const { paths, hip } = figureShapes(poseName, o);
    const shadowT = `translate(${r1(hip[0])} ${r1(hip[1])}) skewX(${o.flip ? 10 : -10}) translate(${r1(-hip[0] + 5 * s)} ${r1(-hip[1] + 4 * s)})`;
    const shadowEl = o.shadow === false ? '' : `<g fill="${P.sandDp}" opacity="0.36" transform="${shadowT}">${paths}</g>`;
    const n = pose(poseName).neck, Ln = Math.hypot(n[0], n[1]) || 1;
    const torso = [(o.flip ? -n[0] : n[0]) / Ln, n[1] / Ln], perp = [-torso[1], torso[0]];
    const harness = o.harness ? `<path d="M${r1(hip[0] - perp[0] * 3.3 * s)} ${r1(hip[1] - perp[1] * 3.3 * s)}L${r1(hip[0] + perp[0] * 3.3 * s)} ${r1(hip[1] + perp[1] * 3.3 * s)}" stroke="${lit(o.harnessColor || 'marigold')}" stroke-width="${r1(1.8 * s)}" stroke-linecap="round"/>` : '';
    const bagX = hip[0] + (o.flip ? 3.6 : -3.6) * s, bagY = hip[1] + 1.4 * s;
    const bag = o.chalkBag === false ? '' : `<circle cx="${r1(bagX)}" cy="${r1(bagY)}" r="${r1(2.3 * s)}" fill="${shade(o.accent || 'marigold')}"/><circle cx="${r1(bagX - 0.5 * s)}" cy="${r1(bagY - 0.5 * s)}" r="${r1(1.6 * s)}" fill="${lit(o.accent || 'marigold')}"/>`;
    return `<g class="aia-climber">${shadowEl}<g fill="${o.color || P.figure}">${paths}</g>${harness}${bag}</g>`;
  }

  // ------------------------------------------------------------------------
  // ROUTE ART
  // ------------------------------------------------------------------------
  const AREA_WALL = {
    bouldering:   () => ({ base: P.sand, lt: P.sandLt, sh: P.sandSh }),
    topRope:      () => { const b = mix(P.sand, P.slate, 0.42); return { base: b, lt: mix(b, P.chalk, 0.38), sh: mix(b, P.sandDp, 0.3) }; },
    leadClimbing: () => { const b = mix(P.sand, P.umber, 0.3); return { base: b, lt: mix(b, P.chalk, 0.3), sh: mix(b, P.sandDp, 0.4) }; },
  };
  function routePath(type, isRoof, rnd, n, startY) {
    const pts = [];
    if (type === 'Traverse') {
      const baseY = 72 + rnd() * 18;
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        pts.push([20 + t * 160 + (rnd() - 0.5) * 8, baseY + Math.sin(t * Math.PI * 1.6 + rnd()) * 16 + (rnd() - 0.5) * 8]);
      }
      return pts;
    }
    if (isRoof) {
      const wallN = Math.max(3, Math.floor(n / 2));
      let x = 46 + rnd() * 18;
      for (let i = 0; i < wallN; i++) { pts.push([x + (rnd() - 0.5) * 14, startY - (i / wallN) * (startY - 62)]); x += 3; }
      const roofN = n - wallN;
      for (let i = 0; i < roofN; i++) { const t = (i + 1) / roofN; pts.push([62 + t * 104 + (rnd() - 0.5) * 6, 38 - t * 18 + (rnd() - 0.5) * 6]); }
      return pts;
    }
    let x = 70 + rnd() * 60;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      x = Math.max(38, Math.min(162, x + (rnd() - 0.5) * 46));
      pts.push([x, startY - t * (startY - 20) + (rnd() - 0.5) * 6]);
    }
    return pts;
  }

  function route(r, area, opts = {}) {
    const name = r.name || 'Route';
    const seed0 = hash(name + '|' + area);
    const rnd = rng(seed0);
    const circ = circuit(r.grade), hc = circ.key, tier = circ.tier;
    const type = r.routeType || 'Vertical';
    const moves = r.moveFeatures || [];
    const isRoof = moves.includes('Roof');
    const isDyno = moves.some(m => /dyn/i.test(m));
    const isHook = moves.some(m => /hook/i.test(m));
    const W = (AREA_WALL[area] || AREA_WALL.bouldering)();
    const clipId = nextId('w');

    // --- wall planes ---
    let poly, litPoly;
    if (type === 'Slab') { poly = '24,0 176,0 200,150 0,150'; litPoly = '80,0 176,0 200,150 52,150'; }
    else if (type === 'Overhang' && !isRoof) { poly = '0,0 200,0 186,150 14,150'; litPoly = '70,0 200,0 186,150 44,150'; }
    else { poly = '0,0 200,0 200,150 0,150'; litPoly = '74,0 200,0 200,150 48,150'; }
    let out = `<rect width="200" height="150" fill="${W.sh}"/>
      <clipPath id="${clipId}"><polygon points="${poly}"/></clipPath>
      <g clip-path="url(#${clipId})">
        <rect width="200" height="150" fill="${W.base}"/>
        <polygon points="${litPoly}" fill="${W.lt}"/>
        <rect width="200" height="150" fill="url(#aia-tnut)" opacity="0.7"/>
        ${type === 'Overhang' || isRoof ? `<polygon points="0,0 200,0 200,26 0,30" fill="${W.sh}"/>` : ''}
      </g>`;
    if (isRoof) out += `<polygon points="0,0 200,0 176,46 24,46" fill="${W.sh}"/><polygon points="0,0 200,0 176,46 24,46" fill="url(#aia-tnut)" opacity="0.6"/><polygon points="24,46 176,46 178,49 22,49" fill="${W.lt}"/>`;
    if (tier >= 3 && !isRoof && rnd() > 0.35) {
      const vx = 30 + rnd() * 140, vy = 40 + rnd() * 60, vs = 14 + rnd() * 8;
      out += `<polygon points="${r1(vx - vs + 3)},${r1(vy + vs * 0.6 + 4)} ${r1(vx + 3)},${r1(vy - vs + 4)} ${r1(vx + vs + 3)},${r1(vy + vs * 0.6 + 4)}" fill="${P.sandDp}" opacity="0.32"/>
        <polygon points="${r1(vx - vs)},${r1(vy + vs * 0.6)} ${r1(vx)},${r1(vy - vs)} ${r1(vx + vs)},${r1(vy + vs * 0.6)}" fill="${W.lt}"/>
        <polygon points="${r1(vx)},${r1(vy - vs)} ${r1(vx + vs)},${r1(vy + vs * 0.6)} ${r1(vx)},${r1(vy + vs * 0.2)}" fill="${W.sh}"/>`;
    }

    // --- floor ---
    const padTop = area === 'bouldering' ? 134 : 140;
    const startY = area === 'bouldering' ? 118 : 124;
    out += area === 'bouldering'
      ? `<rect x="-2" y="${padTop}" width="204" height="18" fill="${P.padArt}"/><rect x="-2" y="${padTop}" width="204" height="2" fill="${mix(P.padArt, P.chalk, 0.35)}"/><path d="M50 ${padTop}V150M100 ${padTop}V150M150 ${padTop}V150" stroke="${P.padSeam}" stroke-width="1.2"/>`
      : `<rect x="-2" y="${padTop}" width="204" height="12" fill="${P.floor}"/>`;

    // --- holds ---
    const n = 6 + (tier > 3 ? 1 : 0) + Math.floor(rnd() * 2);
    const pts = routePath(type, isRoof, rnd, n, startY);
    const featureShapes = (r.holdFeatures || []).map(f => ({ Jugs: 'jug', Jug: 'jug', Crimp: 'crimp', Pinch: 'pinch', Sloper: 'sloper', Pocket: 'pocket' }[f])).filter(Boolean);
    const easyMix = ['jug', 'jug', 'pocket', 'pinch', 'sloper'], hardMix = ['crimp', 'crimp', 'pinch', 'sloper', 'pocket'];
    const shapeAt = (i) => featureShapes.length && rnd() < 0.75 ? featureShapes[i % featureShapes.length] : (tier >= 4 ? hardMix : easyMix)[Math.floor(rnd() * 5)];
    const baseSize = 9.6 - tier * 0.5;
    const holds = pts.map((p, i) => {
      const shape = shapeAt(i);
      return { x: p[0], y: p[1], shape, size: (shape === 'crimp' ? baseSize * 0.95 : baseSize) * (0.9 + rnd() * 0.25), rot: (rnd() - 0.5) * 50, seed: seed0 + i };
    });

    // --- climber placement ---
    const poseName = isRoof ? 'roof' : isDyno ? 'dyno' : isHook ? 'heelhook' : type === 'Traverse' ? 'traverse' : type === 'Slab' ? 'slab' : 'reach';
    const ci = isRoof ? Math.min(holds.length - 2, Math.floor(n / 2) + 1) : Math.max(1, Math.floor((holds.length - 1) * 0.5));
    const target = holds[ci + 1] || holds[holds.length - 1];
    const prev = holds[ci];
    const flip = target.x < prev.x;
    const s = 1.3;
    const P0 = pose(poseName);
    const gap = isDyno ? 7 : 0;
    const anchor = {
      x: Math.max(28, Math.min(172, target.x - (flip ? -P0.h1[0] : P0.h1[0]) * s - (flip ? -gap : gap) * 0.4)),
      y: Math.max(isRoof ? 42 : 50, Math.min(padTop - 27, target.y - P0.h1[1] * s + gap)),
    };
    const cOpts = { x: anchor.x, y: anchor.y, s, flip, harness: area !== 'bouldering', accent: hc === 'marigold' ? 'coral' : 'marigold' };
    const J = (j) => jointAt(P0, j, cOpts);
    const support = [];
    if (!isDyno) {
      const h2 = J('h2');
      support.push({ x: h2[0], y: h2[1] + 2, shape: tier >= 4 ? 'crimp' : 'jug', size: baseSize * 0.8, rot: (rnd() - 0.5) * 30, seed: seed0 + 40 });
      ['f1', 'f2'].forEach((f, i) => { const p = J(f); support.push({ x: p[0], y: p[1] + 2.2, shape: 'chip', size: 6.5, rot: 0, seed: seed0 + 50 + i }); });
    } else {
      support.push({ x: J('f1')[0] + 4, y: J('f1')[1] + 6, shape: 'chip', size: 6.5, rot: 0, seed: seed0 + 60 });
    }
    for (let i = 0; i < 3; i++) {
      const h = holds[Math.floor(rnd() * holds.length)];
      support.push({ x: h.x + (rnd() - 0.5) * 30, y: Math.min(padTop - 6, h.y + 14 + rnd() * 10), shape: 'chip', size: 6, rot: 0, seed: seed0 + 70 + i });
    }

    // --- rope systems ---
    const ropeC = hc === 'cobalt' || hc === 'violet' ? 'marigold' : 'cobalt';
    const [hipX, hipY] = J('hip');
    let ropeLayer = '', drawsLayer = '';
    const hanger = mix(P.slate, P.chalk, 0.2);
    if (area === 'topRope') {
      const top = holds[holds.length - 1];
      const ax = Math.max(40, Math.min(160, top.x + 6)), ay = 7;
      drawsLayer += `<circle cx="${ax - 4}" cy="${ay}" r="1.7" fill="${hanger}"/><circle cx="${ax + 4}" cy="${ay}" r="1.7" fill="${hanger}"/><path d="M${ax - 4} ${ay}L${ax} ${ay + 6}L${ax + 4} ${ay}" stroke="${mix(P.slate, P.chalk, 0.45)}" stroke-width="1" fill="none"/>`;
      ropeLayer += rope(`M${r1(hipX)} ${r1(hipY)}Q${r1((hipX + ax) / 2 - 8)} ${r1((hipY + ay) / 2)} ${ax} ${ay + 7}`, ropeC);
      ropeLayer += rope(`M${ax} ${ay + 7}Q${ax + 16} ${ay + 60} ${ax + 22} 152`, ropeC);
    } else if (area === 'leadClimbing') {
      const first = holds[0], last = holds[holds.length - 1];
      const bolts = [];
      for (let y = startY - 6; y > 14; y -= 21) { const t = (startY - y) / (startY - 14); bolts.push([first.x + (last.x - first.x) * t + 13, y]); }
      const clipped = bolts.filter(b => b[1] > hipY + 4);
      bolts.forEach(b => { drawsLayer += quickdraw(b[0], b[1]); });
      let d = `M${r1(hipX)} ${r1(hipY)}`, l2 = [hipX, hipY];
      clipped.slice().reverse().forEach(b => { const by = b[1] + 12.4; d += `Q${r1((l2[0] + b[0]) / 2 + 3)} ${r1((l2[1] + by) / 2 + 3)} ${r1(b[0])} ${r1(by)}`; l2 = [b[0], by]; });
      d += `Q${r1(l2[0] + 10)} ${r1((l2[1] + 150) / 2)} ${r1(l2[0] + 18)} 152`;
      ropeLayer += rope(d, ropeC);
      drawsLayer += `<circle cx="${r1(last.x + 6)}" cy="8" r="1.7" fill="${hanger}"/><circle cx="${r1(last.x + 14)}" cy="8" r="1.7" fill="${hanger}"/>`;
    }

    // --- route line, tape, setter's tag ---
    const lineC = hc === 'coral' || hc === 'raspberry' || hc === 'marigold' ? shade('cobalt') : shade('coral');
    const routeLine = `<path d="M${holds.map(h => `${r1(h.x)} ${r1(h.y)}`).join('L')}" fill="none" stroke="${lineC}" stroke-width="1.3" stroke-dasharray="3 3" stroke-linecap="round" opacity="0.85"/>`;
    const s0 = holds[0], fin = holds[holds.length - 1];
    const tape = tapeMark(s0.x - s0.size - 3, s0.y + 4, hc, -28) + tapeMark(s0.x + s0.size + 3, s0.y + 4, hc, 28)
      + tapeMark(fin.x - 4, fin.y - fin.size - 2, hc, -12, 9) + tapeMark(fin.x + 5, fin.y - fin.size - 1, hc, 14, 9);
    const motif = Icons().motifFor(name, r);
    const tagLeft = s0.x > 100;
    const tx = tagLeft ? 9 : 163, ty = padTop - 40, trot = tagLeft ? -4 : 4;
    const tag = `<g transform="rotate(${trot} ${tx + 14} ${ty + 16})">
      <rect x="${tx + 2.5}" y="${ty + 3}" width="28" height="33" rx="1.5" fill="${P.sandDp}" fill-opacity="0.4"/>
      <rect x="${tx}" y="${ty}" width="28" height="33" rx="1.5" fill="${P.paper}"/>
      ${Icons().iconAt(motif, tx + 4, ty + 3, 20, P.figure, 2.1)}
      <text x="${tx + 14}" y="${ty + 30.5}" text-anchor="middle" font-family="Bricolage Grotesque, sans-serif" font-weight="800" font-size="7.2" fill="${P.figure}">${esc(r.grade || '')}</text>
      <rect x="${tx + 6}" y="${ty - 2.5}" width="16" height="5" fill="${lit(hc)}" transform="rotate(-3 ${tx + 14} ${ty})"/>
    </g>`;

    // --- chalk dust on everything the climber has touched ---
    let puffs = holds.slice(0, ci + 2).map((h, i) => dustPuff(h.x - 1, h.y - h.size * 0.25, h.size * 1.3, h.size * 0.75, i === ci + 1 ? 0.75 : 0.5)).join('');
    puffs += dustPuff(target.x + 4, target.y - 6, 16, 10, 0.35);
    if (isDyno) puffs += dustPuff(hipX - (flip ? -10 : 10), hipY + 8, 14, 8, 0.4);

    const holdsLayer = support.map(h => hold({ ...h, color: hc })).join('') + holds.map(h => hold({ ...h, color: hc })).join('');
    out += drawsLayer + routeLine + holdsLayer + tape + ropeLayer + climber(poseName, cOpts) + dustLayer(puffs) + motes(14, seed0 % 997) + tag;
    return svgWrap(out, `aia-art--route aia-art--${area}`, opts.label);
  }

  // ------------------------------------------------------------------------
  // GEAR — flat still lifes. Each drawing is printed three times: a flat cast
  // shadow, a darker "shade" impression offset down-right, and the lit inks.
  // ------------------------------------------------------------------------
  const GEAR_TINT = {
    'Essential Safety Gear': 'cobalt', 'Strategy Gear': 'violet', 'Specialized Gear': 'raspberry',
    'Recovery Gear': 'lime', 'Comfort Gear': 'teal', 'Training Equipment': 'wood',
  };
  const gearCategoryColor = (cat) => GEAR_TINT[cat] || 'cobalt';
  function backdrop(tintKey) {
    const tint = P[tintKey] || P.cobalt;
    return `<rect width="200" height="150" fill="${P.sand}"/>
      <circle cx="102" cy="72" r="62" fill="${mix(P.sandLt, tint, 0.12)}"/>
      <rect width="200" height="150" fill="url(#aia-tnut)" opacity="0.45"/>`;
  }
  function printed(drawing, shadowAt = [6, 8]) {
    return `<g filter="url(#aia-flat-shadow)" transform="translate(${shadowAt[0]} ${shadowAt[1]})">${drawing}</g>
      <g filter="url(#aia-shade)" transform="translate(1.6 1.8)">${drawing}</g>
      ${drawing}`;
  }
  const L = (k) => lit(k), S = (k) => shade(k);
  const INK = () => P.figure;
  const ropeBand = (d, k, w = 7) => `<path d="${d}" fill="none" stroke="${L(k)}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="${S(k)}" stroke-width="${r1(w * 0.3)}" stroke-dasharray="2.5 3.5" stroke-linecap="round"/>`;
  const metal = () => mix(P.slate, P.chalk, 0.35);
  const metalDk = () => mix(P.slate, P.sandDp, 0.2);

  const GEAR_ART = {
    'Belay Device': () => printed(`
      ${ropeBand('M40 6C60 24 84 34 87 56', 'coral')}${ropeBand('M162 6C142 24 116 34 113 56', 'coral')}
      <path d="M86 42C84 22 116 22 114 42" fill="none" stroke="${metal()}" stroke-width="4.5" stroke-linecap="round"/>
      <path d="M70 40H130L138 100H62Z" fill="${L('teal')}"/><path d="M66 86H134L138 100H62Z" fill="${S('teal')}"/>
      <rect x="79" y="52" width="16" height="34" rx="8" fill="${S('teal')}"/><rect x="105" y="52" width="16" height="34" rx="8" fill="${S('teal')}"/>
      ${ropeBand('M87 80C86 112 114 112 113 80', 'coral')}
      <path d="M78 100C70 128 130 128 122 100" fill="none" stroke="${L('marigold')}" stroke-width="6.5" stroke-linecap="round"/>
      <rect x="66" y="104" width="12" height="16" rx="3" fill="${S('marigold')}"/>`),

    'Locking Carabiner': () => printed(`<g transform="rotate(-16 100 76)">
      <path d="M84 28H112A28 28 0 0 1 140 56V84A38 38 0 0 1 102 122H90A26 26 0 0 1 64 96V48A20 20 0 0 1 84 28Z" fill="none" stroke="${L('violet')}" stroke-width="12"/>
      <path d="M100 30H112A26 26 0 0 1 136 54" fill="none" stroke="${mix(L('violet'), P.chalk, 0.5)}" stroke-width="3" stroke-linecap="round"/>
      <rect x="55" y="62" width="18" height="34" rx="4" fill="${L('marigold')}"/><path d="M57 70H71M57 77H71M57 84H71M57 91H71" stroke="${S('marigold')}" stroke-width="1.6"/>
      <rect x="59" y="46" width="10" height="16" rx="2" fill="${metal()}"/></g>`),

    'Lead Rope': () => printed(`
      ${[0, 1, 2, 3, 4, 5].map(i => `<ellipse cx="${100 - i}" cy="${86 - i * 4}" rx="${56 - i * 3}" ry="${30 - i * 2}" fill="none" stroke="${i % 2 ? L('coral') : mix(L('coral'), P.chalk, 0.25)}" stroke-width="7"/><ellipse cx="${100 - i}" cy="${86 - i * 4}" rx="${56 - i * 3}" ry="${30 - i * 2}" fill="none" stroke="${S('coral')}" stroke-width="2.2" stroke-dasharray="2 5"/>`).join('')}
      <rect x="90" y="46" width="20" height="62" rx="6" fill="${S('coral')}"/><path d="M90 58H110M90 70H110M90 82H110M90 94H110" stroke="${L('coral')}" stroke-width="2"/>
      ${ropeBand('M150 92C170 104 176 120 162 136', 'coral')}<rect x="154" y="132" width="14" height="8" rx="2" fill="${INK()}" transform="rotate(30 161 136)"/>`),

    'Crimp Sequence Decoder': () => printed(`
      <rect x="54" y="22" width="84" height="110" rx="6" fill="${L('wood')}"/>
      <rect x="62" y="34" width="68" height="90" rx="2" fill="${P.paper}"/><rect x="80" y="16" width="32" height="14" rx="4" fill="${metal()}"/>
      <path d="M78 110L108 94L82 74L110 54" fill="none" stroke="${S('violet')}" stroke-width="2" stroke-dasharray="3 3"/>
      ${[[78, 110], [108, 94], [82, 74], [110, 54]].map(([x, y], i) => `${hold({ x, y, shape: 'crimp', size: 7, color: 'coral', seed: i + 7 })}<circle cx="${x + 10}" cy="${y - 7}" r="5" fill="${L('violet')}"/><text x="${x + 10}" y="${y - 4.6}" text-anchor="middle" font-family="Geist Mono, monospace" font-weight="700" font-size="7" fill="${INK()}">${i + 1}</text>`).join('')}
      <g transform="rotate(14 156 104)"><rect x="140" y="88" width="32" height="32" rx="7" fill="${P.chalk}"/>${[[148, 96], [164, 96], [156, 104], [148, 112], [164, 112]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.6" fill="${INK()}"/>`).join('')}</g>
      <path d="M176 92A24 24 0 0 0 150 78M150 78l7-5M150 78l6 6" fill="none" stroke="${S('cobalt')}" stroke-width="3.2" stroke-linecap="round"/>`),

    'Trick Foot Manual': () => printed(`
      <rect x="56" y="18" width="88" height="112" rx="5" fill="${L('teal')}"/><rect x="56" y="18" width="12" height="112" rx="3" fill="${S('teal')}"/>
      <rect x="76" y="30" width="56" height="7" rx="2" fill="${P.paper}"/><rect x="76" y="41" width="38" height="5" rx="2" fill="${P.paper}" opacity="0.7"/>
      <g transform="translate(74 58) scale(0.6)"><path d="M3 62C3 46 20 38 34 35L52 18H66L72 40C86 46 100 52 100 62V70H3Z" fill="${P.chalk}"/><path d="M3 70H100V78H3Z" fill="${INK()}"/><path d="M44 34L54 46M54 28L64 40" stroke="${S('teal')}" stroke-width="3"/></g>
      <path d="M118 96C126 86 124 74 114 70M114 70l8 0M114 70l3 7" fill="none" stroke="${S('marigold')}" stroke-width="3.2" stroke-linecap="round"/>
      <path d="M128 130V146L134 141L140 146V130" fill="${L('raspberry')}"/>`),

    'Body Tension Belt': () => printed(`
      <path d="M34 66C66 52 134 52 166 66V98C134 84 66 84 34 98Z" fill="${L('marigold')}"/>
      <path d="M40 72C70 60 130 60 160 72M40 92C70 80 130 80 160 92" fill="none" stroke="${S('marigold')}" stroke-width="1.4" stroke-dasharray="3 3"/>
      <rect x="86" y="58" width="28" height="34" rx="5" fill="none" stroke="${metal()}" stroke-width="5"/><path d="M100 60V90" stroke="${metal()}" stroke-width="3.4"/>
      <path d="M8 80H28M20 72L28 80L20 88M192 80H172M180 72L172 80L180 88" fill="none" stroke="${S('raspberry')}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`),

    'Power Tap Belt': () => printed(`
      <path d="M34 72C66 58 134 58 166 72V100C134 88 66 88 34 100Z" fill="${L('raspberry')}"/>
      <path d="M40 78C70 66 130 66 160 78M40 95C70 84 130 84 160 95" fill="none" stroke="${S('raspberry')}" stroke-width="1.4" stroke-dasharray="3 3"/>
      <path d="M106 50L84 86H100L94 114L120 76H104L112 50Z" fill="${L('marigold')}"/>
      <path d="M60 40l-8-10M140 40l8-10M100 30V16M44 60l-12-4M156 60l12-4" stroke="${S('marigold')}" stroke-width="3.4" stroke-linecap="round"/>
      <path d="M40 122C70 104 130 104 160 122M160 122l-9 1M160 122l-4-8" fill="none" stroke="${S('cobalt')}" stroke-width="2.6" stroke-dasharray="4 4" stroke-linecap="round"/>`),

    'Beta Reading Book': () => printed(`
      <path d="M100 48C80 40 50 38 26 46V124C50 116 80 118 100 126C120 118 150 116 174 124V46C150 38 120 40 100 48Z" fill="${L('cobalt')}"/>
      <path d="M100 44C80 36 54 36 32 42V118C54 112 80 114 100 120Z" fill="${P.paper}"/><path d="M100 44C120 36 146 36 168 42V118C146 112 120 114 100 120Z" fill="${mix(P.paper, P.sandLt, 0.5)}"/>
      <path d="M52 106L60 90L50 74L64 58" fill="none" stroke="${S('raspberry')}" stroke-width="2" stroke-dasharray="3 3"/>
      ${[[52, 106], [60, 90], [50, 74], [64, 58]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3.6" fill="${L('coral')}"/>`).join('')}
      <path d="M76 60H92M74 70H92M78 80H92M112 56H156M112 66H150M112 76H158M112 86H146M112 96H154" stroke="${P.sandSh}" stroke-width="2" stroke-linecap="round"/>
      <g transform="rotate(-32 150 116)"><rect x="112" y="110" width="58" height="9" rx="2" fill="${L('marigold')}"/><path d="M170 110L182 114.5L170 119Z" fill="${P.paper}"/></g>`),

    'Mental Anchor': () => printed(`
      <path d="M30 128q10-7 20 0t20 0 20 0 20 0 20 0 20 0 20 0" fill="none" stroke="${S('teal')}" stroke-width="3" stroke-linecap="round"/>
      <circle cx="100" cy="30" r="10" fill="none" stroke="${L('cobalt')}" stroke-width="6"/>
      <rect x="94" y="40" width="12" height="74" rx="4" fill="${L('cobalt')}"/><rect x="74" y="50" width="52" height="10" rx="4" fill="${L('cobalt')}"/>
      <path d="M58 88C62 120 138 120 142 88" fill="none" stroke="${L('cobalt')}" stroke-width="9" stroke-linecap="round"/>
      <path d="M48 96L58 80L68 96Z M132 96L142 80L152 96Z" fill="${L('cobalt')}"/>
      <path d="M100 74c-4-5-11-2-9 3 1 3 9 8 9 8s8-5 9-8c2-5-5-8-9-3z" fill="${P.chalk}"/>`),

    'Pre-Climb Stretching': () => `<path d="M40 128L64 108H170L146 128Z" fill="${L('lime')}"/><path d="M146 128L170 108L172 112L148 131Z" fill="${S('lime')}"/>
      ${climber('stretch', { x: 104, y: 76, s: 2.4, chalkBag: false })}
      <path d="M128 40C140 54 140 70 130 82M130 82l-1-9M130 82l8-4" fill="none" stroke="${S('teal')}" stroke-width="3" stroke-dasharray="5 4" stroke-linecap="round"/>`,

    'Sequence Memorization': () => printed(`
      ${[[-56, -6], [56, -6], [-44, -40], [44, -40], [0, -58]].map(([dx, dy]) => `<path d="M${100 + dx * 0.78} ${66 + dy * 0.78}L${100 + dx} ${66 + dy}" stroke="${S('marigold')}" stroke-width="4" stroke-linecap="round"/>`).join('')}
      <path d="M100 22C78 22 64 38 64 58C64 72 72 80 78 88C82 93 84 98 84 104H116C116 98 118 93 122 88C128 80 136 72 136 58C136 38 122 22 100 22Z" fill="${mix(L('marigold'), P.chalk, 0.4)}"/>
      <rect x="84" y="104" width="32" height="20" rx="4" fill="${metal()}"/><path d="M84 111H116M84 117H116" stroke="${metalDk()}" stroke-width="1.6"/>
      <path d="M84 84L98 70L88 56L110 44" fill="none" stroke="${S('violet')}" stroke-width="2" stroke-dasharray="3 3"/>
      ${[[84, 84], [98, 70], [88, 56], [110, 44]].map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="5.4" fill="${L('violet')}"/><text x="${x}" y="${y + 2.5}" text-anchor="middle" font-family="Geist Mono, monospace" font-weight="700" font-size="7" fill="${INK()}">${i + 1}</text>`).join('')}`),

    'Confidence Building': () => printed(`
      <rect x="56" y="98" width="88" height="30" rx="5" fill="${L('lime')}"/><rect x="68" y="68" width="64" height="30" rx="5" fill="${L('teal')}"/><rect x="82" y="40" width="36" height="28" rx="5" fill="${L('coral')}"/>
      <text x="100" y="118" text-anchor="middle" font-family="Bricolage Grotesque, sans-serif" font-weight="800" font-size="13" fill="${INK()}">FALL</text>
      <text x="100" y="88" text-anchor="middle" font-family="Bricolage Grotesque, sans-serif" font-weight="800" font-size="13" fill="${INK()}">LEARN</text>
      <text x="100" y="59" text-anchor="middle" font-family="Bricolage Grotesque, sans-serif" font-weight="800" font-size="11" fill="${INK()}">+XP</text>
      <path d="M100 40V12" stroke="${INK()}" stroke-width="2.4"/><path d="M100 13H122L116 20L122 27H100Z" fill="${L('marigold')}"/>
      <path d="M160 116V58M150 70l10-12 10 12" fill="none" stroke="${S('cobalt')}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`),

    'Power Spotting': () => `
      <polygon points="0,0 200,0 200,40 120,40 70,92 0,92" fill="${P.sandSh}"/><polygon points="0,0 200,0 200,40 120,40 70,92 0,92" fill="url(#aia-tnut)"/>
      ${hold({ x: 112, y: 36, shape: 'jug', size: 9, color: 'coral', seed: 3 })}${hold({ x: 84, y: 66, shape: 'sloper', size: 8, color: 'coral', seed: 4 })}${hold({ x: 60, y: 84, shape: 'jug', size: 7, color: 'coral', seed: 9 })}
      <rect x="-2" y="126" width="204" height="26" fill="${P.padArt}"/><rect x="-2" y="126" width="204" height="2" fill="${mix(P.padArt, P.chalk, 0.35)}"/><path d="M100 126V150" stroke="${P.padSeam}" stroke-width="1.6"/>
      ${climber('roof', { x: 98, y: 64, s: 1.45, flip: true })}
      ${climber('spot', { x: 112, y: 104, s: 1.25, color: S('lime'), chalkBag: false })}
      ${dustLayer(dustPuff(112, 34, 12, 7, 0.6) + dustPuff(84, 64, 10, 6, 0.5))}`,

    'Approach Shoes': () => printed(`
      <path d="M36 102H168C168 110 160 116 150 116H50C42 116 36 110 36 102Z" fill="${mix(P.figure, P.sandDp, 0.3)}"/>
      <path d="M40 98C40 80 58 70 74 66L96 50C104 46 112 48 116 54L124 70C142 74 162 82 166 94V102H40Z" fill="${L('teal')}"/>
      <path d="M40 98H166" stroke="${P.chalk}" stroke-width="4"/><path d="M150 80C160 84 166 90 166 98" fill="none" stroke="${S('teal')}" stroke-width="7"/>
      <path d="M98 56L118 72M94 62L114 76M90 68L108 80" stroke="${P.chalk}" stroke-width="3" stroke-linecap="round"/>`, [6, 6]),

    'Old Climbing Journal': () => printed(`<g transform="rotate(-6 100 80)">
      <rect x="56" y="22" width="92" height="110" rx="6" fill="${P.paper}"/><rect x="52" y="20" width="92" height="110" rx="6" fill="${L('wood')}"/>
      <rect x="126" y="20" width="7" height="110" fill="${S('wood')}"/>
      <rect x="144" y="34" width="10" height="12" rx="2" fill="${L('coral')}"/><rect x="144" y="52" width="10" height="12" rx="2" fill="${L('lime')}"/><rect x="144" y="70" width="10" height="12" rx="2" fill="${L('teal')}"/>
      <path d="M76 52C84 44 102 44 106 54C110 64 98 72 88 70C76 68 70 60 76 52Z" fill="none" stroke="${S('wood')}" stroke-width="2.6"/><circle cx="90" cy="58" r="2.2" fill="${S('wood')}"/>
      <path d="M68 92H112M68 102H104" stroke="${P.chalk}" stroke-opacity="0.7" stroke-width="2.4" stroke-linecap="round"/></g>
      <g transform="rotate(28 120 118)"><rect x="96" y="114" width="56" height="8" rx="2" fill="${L('marigold')}"/><path d="M152 114L164 118L152 122Z" fill="${P.paper}"/></g>`),

    'Climbing Coach': () => printed(`
      <path d="M58 66L122 40V116L58 90Z" fill="${L('coral')}"/><ellipse cx="122" cy="78" rx="8" ry="38" fill="${S('coral')}"/>
      <rect x="44" y="64" width="16" height="28" rx="4" fill="${mix(P.figure, P.chalk, 0.2)}"/><path d="M72 88L66 112H82L86 84" fill="${mix(P.figure, P.chalk, 0.2)}"/>
      <path d="M70 70L108 56" stroke="${P.chalk}" stroke-opacity="0.7" stroke-width="3" stroke-linecap="round"/>
      ${[14, 26, 38].map((rr, i) => `<path d="M${140 + i * 2} ${78 - rr}A${rr} ${rr} 0 0 1 ${140 + i * 2} ${78 + rr}" fill="none" stroke="${S('cobalt')}" stroke-width="3.4" stroke-linecap="round" stroke-opacity="${1 - i * 0.2}"/>`).join('')}`),

    'Mountain Mentor': () => `
      <circle cx="150" cy="40" r="16" fill="${L('marigold')}"/>
      ${printed(`<path d="M12 128L76 44L100 74L126 34L190 128Z" fill="${mix(P.umber, P.chalk, 0.25)}"/><path d="M76 44L100 74L126 34L190 128H120Z" fill="${mix(P.umber, P.chalk, 0.12)}"/>
      <path d="M64 60L76 44L88 60L80 56L72 62Z M114 52L126 34L140 54L130 50L122 56Z" fill="${P.chalk}"/>
      <path d="M126 40C118 62 140 76 130 96S112 116 124 128" fill="none" stroke="${L('marigold')}" stroke-width="2.6" stroke-dasharray="4 4" stroke-linecap="round"/>
      <path d="M30 128C30 116 40 112 52 112C64 112 72 118 72 128Z" fill="${P.sandSh}"/>
      <ellipse cx="52" cy="94" rx="15" ry="19" fill="${S('wood')}"/><path d="M39 80L42 70L48 78M65 80L62 70L56 78" fill="${S('wood')}"/>
      <ellipse cx="52" cy="100" rx="9" ry="11" fill="${L('wood')}"/>
      <circle cx="46" cy="88" r="5.6" fill="${P.chalk}"/><circle cx="58" cy="88" r="5.6" fill="${P.chalk}"/><circle cx="46" cy="88" r="2.4" fill="${INK()}"/><circle cx="58" cy="88" r="2.4" fill="${INK()}"/>
      <path d="M50 94L52 98L54 94Z" fill="${L('marigold')}"/>`, [5, 6])}`,

    _default: (g) => printed(`${Icons().iconAt(Icons().ICONS[g.name] ? g.name : 'gear', 60, 30, 80, S('cobalt'), 2)}`),
  };
  function gear(g, opts = {}) {
    const draw = GEAR_ART[g.name] || GEAR_ART._default;
    const puffs = dustPuff(76, 44, 18, 9, 0.45) + dustPuff(142, 104, 12, 7, 0.3);
    return svgWrap(backdrop(gearCategoryColor(g.category)) + draw(g) + dustLayer(puffs) + motes(10, hash(g.name) % 997), 'aia-art--gear', opts.label);
  }

  // ------------------------------------------------------------------------
  // CLIMBER PORTRAITS
  // ------------------------------------------------------------------------
  const CLIMBER_ACCENT = { technician: 'teal', sprinter: 'coral', ironLung: 'marigold', freeSolo: 'raspberry', routeReader: 'violet' };
  const climberAccent = (key) => CLIMBER_ACCENT[key] || 'cobalt';
  function portraitWall(baseHex, overhang) {
    const lt = mix(baseHex, P.chalk, 0.35), sh = mix(baseHex, P.sandDp, 0.3);
    return `<rect width="200" height="150" fill="${baseHex}"/><polygon points="78,0 200,0 200,150 50,150" fill="${lt}"/>
      <rect width="200" height="150" fill="url(#aia-tnut)" opacity="0.6"/>${overhang ? `<polygon points="0,0 200,0 200,24 0,30" fill="${sh}"/>` : ''}`;
  }
  const pad = (y = 138) => `<rect x="-2" y="${y}" width="204" height="${152 - y}" fill="${P.padArt}"/><rect x="-2" y="${y}" width="204" height="2" fill="${mix(P.padArt, P.chalk, 0.35)}"/>`;
  const CLIMBER_ART = {
    technician: () => {
      const a = 'teal';
      return `${portraitWall(P.sand)}
        <circle cx="104" cy="70" r="58" fill="${lit(a)}" opacity="0.28"/>
        ${[[64, 110, 'crimp'], [80, 64, 'crimp'], [150, 92, 'chip'], [60, 40, 'pocket'], [129, 36, 'crimp']].map(([x, y, sh], i) => hold({ x, y, shape: sh, size: 8.5, color: a, seed: 11 + i })).join('')}
        ${climber('reach', { x: 112, y: 92, s: 2.05, accent: 'coral' })}
        <circle cx="129" cy="33" r="13" fill="none" stroke="${shade(a)}" stroke-width="1.6" stroke-dasharray="3 3"/>
        <path d="M129 14v8M129 44v8M110 33h8M140 33h8" stroke="${shade(a)}" stroke-width="1.8" stroke-linecap="round"/>
        ${dustLayer(dustPuff(129, 32, 12, 7, 0.6) + dustPuff(80, 62, 9, 5, 0.4))}${pad()}`;
    },
    sprinter: () => {
      const a = 'coral';
      return `${portraitWall(P.sand, true)}
        <circle cx="96" cy="72" r="58" fill="${lit(a)}" opacity="0.28"/>
        ${[[40, 112, 'jug'], [70, 88, 'jug'], [150, 24, 'jug'], [118, 62, 'sloper']].map(([x, y, sh], i) => hold({ x, y, shape: sh, size: 10, color: a, seed: 21 + i })).join('')}
        ${[0, 1, 2, 3].map(i => `<path d="M${30 + i * 8} ${70 + i * 12}h${34 - i * 6}" stroke="${P.dust}" stroke-width="3" stroke-linecap="round" opacity="${0.85 - i * 0.15}"/>`).join('')}
        ${climber('dyno', { x: 104, y: 92, s: 2.15, accent: 'marigold' })}
        <g transform="translate(152 98)"><circle r="16" fill="${P.paper}"/><circle r="16" fill="none" stroke="${shade(a)}" stroke-width="2.4"/><path d="M0 0V-10M0 0L7 4M-4 -20h8M0 -20v4" stroke="${shade(a)}" stroke-width="2.4" stroke-linecap="round"/></g>
        ${dustLayer(dustPuff(70, 86, 12, 7, 0.55) + dustPuff(84, 112, 18, 9, 0.35))}${pad()}`;
    },
    ironLung: () => {
      const a = 'marigold', base = mix(P.sand, P.umber, 0.3);
      const draws = [128, 104, 80, 56, 32, 10].map((y, i) => quickdraw(118 + (i % 2) * 4, y, 1.4)).join('');
      return `${portraitWall(base)}
        <circle cx="96" cy="74" r="58" fill="${lit(a)}" opacity="0.3"/>
        ${[[86, 128, 'jug'], [102, 104, 'jug'], [80, 84, 'pocket'], [100, 40, 'jug'], [86, 18, 'jug'], [92, 62, 'pinch']].map(([x, y, sh], i) => hold({ x, y, shape: sh, size: 8.5, color: a, seed: 31 + i })).join('')}
        ${draws}
        ${rope('M88 82Q104 92 118 98Q124 112 120 120Q128 132 132 152', 'cobalt', 3.2)}
        ${climber('reach', { x: 88, y: 80, s: 1.75, harness: true, accent: 'coral' })}
        ${[0, 1, 2].map(i => `<path d="M${68 - i * 6} ${38 - i * 3}q-6 -3 -10 2" stroke="${P.dust}" stroke-width="2.4" fill="none" stroke-linecap="round" opacity="${0.9 - i * 0.25}"/>`).join('')}
        ${dustLayer(dustPuff(100, 40, 10, 6, 0.5) + dustPuff(102, 104, 10, 6, 0.4))}`;
    },
    freeSolo: () => {
      const a = 'raspberry';
      return `${portraitWall(P.sand)}
        <circle cx="100" cy="62" r="58" fill="${lit(a)}" opacity="0.26"/>
        ${[[100, 20, 'jug'], [70, 52, 'sloper'], [138, 70, 'crimp'], [86, 96, 'chip'], [120, 104, 'chip']].map(([x, y, sh], i) => hold({ x, y, shape: sh, size: 9, color: a, seed: 41 + i })).join('')}
        ${climber('onearm', { x: 99, y: 52, s: 2.0, accent: 'marigold' })}
        <path d="M22 8V140" stroke="${P.sandDp}" stroke-width="1.4" stroke-dasharray="2 4"/>
        ${[20, 50, 80, 110].map((y, i) => `<path d="M18 ${y}h8" stroke="${P.sandDp}" stroke-width="1.6"/><text x="30" y="${y + 3}" font-family="Geist Mono, monospace" font-size="7" font-weight="700" fill="${P.figure}">${15 - i * 4}m</text>`).join('')}
        <rect x="-2" y="140" width="204" height="12" fill="${P.floor}"/>
        <text x="186" y="148" text-anchor="end" font-family="Geist Mono, monospace" font-size="6.5" font-weight="700" fill="${P.paper}">NO ROPE</text>
        ${dustLayer(dustPuff(104, 16, 16, 10, 0.75) + dustPuff(112, 10, 10, 6, 0.5))}`;
    },
    routeReader: () => {
      const a = 'violet', pts = [[70, 104], [96, 80], [74, 56], [112, 34], [140, 16]];
      return `${portraitWall(mix(P.sand, P.slate, 0.42))}
        <circle cx="104" cy="70" r="58" fill="${lit(a)}" opacity="0.26"/>
        ${pts.map(([x, y], i) => hold({ x, y, shape: 'jug', size: 8, color: a, seed: 51 + i })).join('')}
        <path d="M${pts.map(p => p.join(' ')).join('L')}" fill="none" stroke="${shade(a)}" stroke-width="1.8" stroke-dasharray="3 4"/>
        ${pts.map(([x, y], i) => `<circle cx="${x + 12}" cy="${y - 8}" r="6" fill="${P.paper}"/><text x="${x + 12}" y="${y - 5.2}" text-anchor="middle" font-family="Geist Mono, monospace" font-weight="700" font-size="8" fill="${P.figure}">${i + 1}</text>`).join('')}
        <rect x="-2" y="134" width="204" height="18" fill="${P.floor}"/>
        ${climber('standlook', { x: 150, y: 96, s: 1.9, flip: true, accent: 'teal' })}
        <rect x="142" y="73" width="12" height="9" rx="1.5" fill="${lit(a)}"/>`;
    },
  };
  function climberArt(key, opts = {}) {
    const draw = CLIMBER_ART[key] || CLIMBER_ART.technician;
    return svgWrap(draw() + motes(12, hash(key) % 997), 'aia-art--climber', opts.label);
  }

  // ------------------------------------------------------------------------
  // TRAINING STATIONS
  // ------------------------------------------------------------------------
  function plywood() {
    const b = mix(P.wood, P.chalk, 0.5);
    return `<rect width="200" height="150" fill="${b}"/><polygon points="78,0 200,0 200,150 50,150" fill="${mix(b, P.chalk, 0.3)}"/>
      <rect width="200" height="150" fill="url(#aia-grain)"/><rect width="200" height="150" fill="url(#aia-tnut)" opacity="0.5"/>`;
  }
  const TRAINING_ART = {
    'Grip Board': () => `${plywood()}
      ${printed(`<rect x="38" y="26" width="124" height="36" rx="12" fill="${lit('wood')}"/><path d="M44 38H156" stroke="${shade('wood')}" stroke-width="3"/>
      ${[58, 80, 120, 142].map(x => `<ellipse cx="${x}" cy="50" rx="7" ry="4.5" fill="${shade('wood')}"/>`).join('')}<rect x="92" y="44" width="16" height="10" rx="4" fill="${shade('wood')}"/>`, [4, 5])}
      ${climber('hang', { x: 100, y: 108, s: 1.75, accent: 'violet' })}
      ${dustLayer(dustPuff(92, 48, 12, 6, 0.6) + dustPuff(108, 48, 12, 6, 0.6))}${pad(140)}`,
    'Campus Board': () => `${plywood()}
      <polygon points="36,4 176,4 158,146 54,146" fill="${mix(P.wood, P.chalk, 0.25)}"/><polygon points="36,4 176,4 174,12 38,12" fill="${shade('wood')}"/>
      ${[20, 40, 60, 80, 100, 120].map((y, i) => `<rect x="${44 + y * 0.12 + 1.5}" y="${y + 2}" width="${124 - y * 0.24}" height="7" rx="2" fill="${P.sandDp}" opacity="0.35"/><rect x="${44 + y * 0.12}" y="${y}" width="${124 - y * 0.24}" height="7" rx="2" fill="${lit('wood')}"/><rect x="${44 + y * 0.12}" y="${y + 4.5}" width="${124 - y * 0.24}" height="2.5" rx="1" fill="${shade('wood')}"/><text x="${40 + y * 0.12}" y="${y + 6}" text-anchor="end" font-family="Geist Mono, monospace" font-size="7" font-weight="700" fill="${P.figure}">${6 - i}</text>`).join('')}
      ${climber('campus', { x: 104, y: 92, s: 1.65, accent: 'coral' })}
      ${dustLayer(dustPuff(108, 34, 12, 6, 0.6) + dustPuff(98, 62, 10, 5, 0.5))}`,
    'Continuous MoonBoard': () => {
      const rnd = rng(77);
      let holds = '';
      const litMap = { '2,9': 'lime', '4,7': 'cobalt', '6,6': 'cobalt', '3,4': 'cobalt', '7,3': 'cobalt', '5,1': 'raspberry' };
      for (let c = 0; c < 9; c++) for (let rr = 0; rr < 10; rr++) {
        const x = 32 + c * 17, y = 18 + rr * 12.4, k = `${c},${rr}`;
        if (rnd() < 0.42) holds += hold({ x, y, shape: ['jug', 'crimp', 'pinch', 'sloper', 'pocket'][Math.floor(rnd() * 5)], size: 4.2, color: ['marigold', 'chalk', 'basalt'][Math.floor(rnd() * 3)], seed: c * 31 + rr });
        if (litMap[k]) holds += `<circle cx="${x}" cy="${y}" r="6.8" fill="none" stroke="${lit(litMap[k])}" stroke-width="2.4"/>`;
      }
      const board = mix(P.basalt, P.sand, 0.32);
      const letters = 'ABCDEFGHI'.split('').map((l, i) => `<text x="${32 + i * 17}" y="10" text-anchor="middle" font-family="Geist Mono, monospace" font-size="6.5" font-weight="700" fill="${P.paper}" opacity="0.85">${l}</text>`).join('');
      return `${plywood()}<rect x="21" y="5" width="164" height="136" rx="3" fill="${P.sandDp}" opacity="0.4"/>
        <rect x="18" y="2" width="164" height="136" rx="3" fill="${board}"/><polygon points="90,2 182,2 182,138 70,138" fill="${mix(board, P.chalk, 0.08)}"/>
        ${letters}${holds}${pad(140)}`;
    },
    'Balance and Core': () => `${plywood()}${pad(128)}
      ${printed(`<rect x="22" y="80" width="12" height="50" rx="2" fill="${lit('wood')}"/><rect x="166" y="80" width="12" height="50" rx="2" fill="${lit('wood')}"/>`, [4, 3])}
      <path d="M28 86Q100 110 172 86" fill="none" stroke="${shade('lime')}" stroke-width="4" stroke-linecap="round"/><path d="M28 85Q100 109 172 85" fill="none" stroke="${lit('lime')}" stroke-width="1.6" stroke-linecap="round"/>
      ${climber('balance', { x: 100, y: 59, s: 1.85, chalkBag: false })}
      <path d="M60 50q-6 6 0 12M140 48q6 6 0 12" fill="none" stroke="${shade('teal')}" stroke-width="2.6" stroke-linecap="round"/>`,
  };
  function training(area, opts = {}) {
    const name = typeof area === 'string' ? area : area.name;
    const draw = TRAINING_ART[name] || TRAINING_ART['Grip Board'];
    return svgWrap(draw() + motes(10, hash(name) % 997), 'aia-art--training', opts.label);
  }

  const api = {
    mount, syncPalette, circuit, gradeTier: circuit, route, gear, climber: climberArt, training, milestone: route,
    icon: (...a) => Icons().icon(...a), iconAt: (...a) => Icons().iconAt(...a), motifFor: (...a) => Icons().motifFor(...a),
    hold, climberFigure: climber, climberAccent, gearCategoryColor, palette: P, POSES: Object.keys(POSES), lit, shade,
  };
  if (typeof window !== 'undefined') window.AIAArt = api;
})();
