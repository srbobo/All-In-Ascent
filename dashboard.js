// All In Ascent — playtest telemetry dashboard (dashboard.html).
//
// Loads every stored match record from the telemetry party
// (party/telemetry.js), or from a JSONL file (sim/telemetry-sample.js
// output, or an export from this page), and lays out the report that
// engine/match-report.js aggregateMatches computes. The page computes no
// statistics of its own.
//
// Where it reads from:
//   ?source=<host>             that PartyKit host (e.g. 127.0.0.1:1999)
//   served from localhost or a *.partykit.dev host → the same origin
//   anywhere else (file://, Netlify)                → the production PartyKit host
// If the server sets TELEMETRY_READ_TOKEN the page asks for it once and keeps
// it in this browser.
//
// ES module: open it over http(s) (PartyKit serves it next to the game);
// browsers block module imports from file://.

import { aggregateMatches, MATCH_FILTER_DEFAULTS } from './engine/match-report.js';
import { CHARACTERS } from './engine/data.js';

const PRODUCTION_PARTYKIT_HOST = 'all-in-ascent.srbobo.partykit.dev';
const PATH = '/parties/telemetry/global';
const TOKEN_KEY = 'all-in-ascent.telemetry-token';
const MIN_N = 5;
const STATS = ['strength', 'technique', 'focus', 'flexibility'];
const TIME_BUCKETS = [
  ['climbing', 'Climbing', ['bouldering', 'topRope', 'leadClimbing']],
  ['training', 'Training', ['training']],
  ['milestone', 'Milestones', ['milestone']],
  ['gear', 'Gear shop', ['gearShop']],
  ['rest', 'Rest', ['rest']],
];
const WALLS = [['bouldering', 'Bouldering'], ['topRope', 'Top Rope'], ['leadClimbing', 'Lead']];
const TIERS = [['beginner', 'Beginner'], ['intermediate', 'Intermediate'], ['expert', 'Expert']];
const MODE_LABELS = { local: 'Local', online: 'Online', sim: 'Bot sim' };

const shortName = (key) => (CHARACTERS[key]?.name || key).replace(/^The /, '');
const pct = (v, digits = 0) => (v === null || v === undefined ? '—' : `${(v * 100).toFixed(digits)}%`);
const num = (v, digits = 1) => (v === null || v === undefined ? '—' : v.toFixed(digits));
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
function duration(ms) {
  if (!ms) return '—';
  const min = Math.round(ms / 60000);
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60} min`;
}

// ---------------------------------------------------------------------------
// DOM helpers — data strings always become text nodes, never markup.
// ---------------------------------------------------------------------------
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) node.append(c instanceof Node ? c : String(c));
  return node;
}
const SVG_NS = 'http://www.w3.org/2000/svg';
function s(tag, attrs = {}, ...children) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined) node.setAttribute(k, v);
  for (const c of children.flat()) if (c !== null && c !== undefined) node.append(c instanceof Node ? c : String(c));
  return node;
}
// Charts are drawn at their container's pixel width (1 SVG unit = 1px), so
// text stays at its CSS size on any screen; the page redraws on resize.
function widthOf(id) {
  return Math.max(300, Math.floor(document.getElementById(id).clientWidth || 560));
}
function mount(id, ...nodes) {
  const host = document.getElementById(id);
  host.replaceChildren(...nodes);
}

// One tooltip for every mark. A mark is a <g data-tip> with tabindex; its
// lines are stored on the node (never parsed as HTML).
const tooltip = document.getElementById('tooltip');
function tipGroup(lines, ...children) {
  const g = s('g', { 'data-tip': '', tabindex: 0, role: 'img', 'aria-label': lines.join(', ') }, ...children);
  g.tipLines = lines;
  return g;
}
function showTip(target, x, y) {
  const [head, ...rest] = target.tipLines;
  tooltip.replaceChildren(el('b', {}, head), ...rest.map(l => el('div', {}, l)));
  tooltip.style.display = 'block';
  const w = tooltip.offsetWidth;
  const h = tooltip.offsetHeight;
  tooltip.style.left = `${Math.min(window.innerWidth - w - 8, Math.max(8, x + 14))}px`;
  tooltip.style.top = `${Math.max(8, y - h - 10)}px`;
}
document.addEventListener('pointermove', (e) => {
  const t = e.target.closest?.('[data-tip]');
  if (t && t.tipLines) showTip(t, e.clientX, e.clientY);
  else tooltip.style.display = 'none';
});
document.addEventListener('focusin', (e) => {
  const t = e.target.closest?.('[data-tip]');
  if (t && t.tipLines) {
    const r = t.getBoundingClientRect();
    showTip(t, r.left + r.width / 2, r.top);
  }
});
document.addEventListener('focusout', () => { tooltip.style.display = 'none'; });

// ---------------------------------------------------------------------------
// Colour helpers
// ---------------------------------------------------------------------------
const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const charColor = (key) => `var(--c-char-${key})`;
function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
}
function mix(a, b, t) {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',')})`;
}
// Diverging fill for a value whose neutral point is `mid` and whose extremes
// are mid ± spread: blue above, red below, paper at the midpoint.
function diverging(value, mid, spread) {
  if (value === null || value === undefined) return cssVar('--c-mid');
  const t = Math.max(-1, Math.min(1, (value - mid) / spread));
  return mix(cssVar('--c-mid'), cssVar(t >= 0 ? '--c-pos' : '--c-neg'), Math.abs(t) * 0.85);
}
function inkOn(fill) {
  const m = fill.match(/\d+/g);
  if (!m) return 'var(--ink)';
  const [r, g, b] = m.map(Number);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.55 ? 'var(--ink)' : '#fff';
}

// ---------------------------------------------------------------------------
// Charts (inline SVG)
// ---------------------------------------------------------------------------

// Horizontal bars from a zero baseline. rows: { label, value, text, color, tip, dim, swatch }
function barChart(rows, { max = null, ref = null, refLabel = null, labelWidth = 110, valueWidth = 110, width = 560 } = {}) {
  const W = width;
  const row = 30;
  const bar = 16;
  const H = rows.length * row + 8;
  const top = Math.max(0, ...rows.map(r => r.value || 0));
  const scaleMax = max ?? (top || 1);
  const plotW = W - labelWidth - valueWidth;
  const x = (v) => labelWidth + (Math.max(0, v) / scaleMax) * plotW;
  const svg = s('svg', { class: 'chart', viewBox: `0 0 ${W} ${H}`, role: 'group' });
  svg.append(s('line', { class: 'axis', x1: labelWidth, x2: labelWidth, y1: 0, y2: H - 4 }));
  rows.forEach((r, i) => {
    const y = i * row + 4;
    const w = Math.max(0, x(r.value || 0) - labelWidth);
    const cy = y + (row - bar) / 2;
    const label = s('text', { x: r.swatch ? labelWidth - 22 : labelWidth - 8, y: y + row / 2 + 4, 'text-anchor': 'end', class: 'strong' }, r.label);
    const parts = [
      s('rect', { class: 'hit', x: 0, y, width: W, height: row, fill: 'transparent' }),
      r.swatch ? s('rect', { x: labelWidth - 16, y: y + row / 2 - 5, width: 10, height: 10, rx: 3, fill: r.swatch }) : null,
      label,
      w > 0 ? s('path', { class: 'mark', d: roundedBar(labelWidth, cy, w, bar), fill: r.color || 'var(--c-bar)', opacity: r.dim ? 0.35 : 1 }) : null,
      s('text', { x: labelWidth + w + 6, y: y + row / 2 + 4, class: r.dim ? '' : 'strong' }, r.text ?? String(r.value)),
    ];
    svg.append(tipGroup(r.tip || [r.label, r.text ?? String(r.value)], ...parts));
  });
  if (ref !== null) {
    svg.append(s('line', { class: 'ref', x1: x(ref), x2: x(ref), y1: 0, y2: H - 4 }));
    if (refLabel) svg.append(s('text', { x: x(ref) + 4, y: H + 10 }, refLabel));
  }
  return svg;
}
// A bar with a 4px rounded data end, square at the baseline.
function roundedBar(x0, y, w, h, r = 4) {
  const rr = Math.min(r, w, h / 2);
  return `M${x0},${y}H${x0 + w - rr}Q${x0 + w},${y} ${x0 + w},${y + rr}V${y + h - rr}Q${x0 + w},${y + h} ${x0 + w - rr},${y + h}H${x0}Z`;
}

// Bars that grow left or right from a reference value (win index around 1.00).
function divergingBars(rows, { mid = 1, labelWidth = 110, width = 560 } = {}) {
  const W = width;
  const row = 30;
  const bar = 16;
  const H = rows.length * row + 22;
  const spread = Math.max(0.25, ...rows.map(r => Math.abs((r.value ?? mid) - mid))) * 1.1;
  const plotW = W - labelWidth - 60;
  const cx = labelWidth + plotW / 2 + 20;
  const x = (v) => cx + ((v - mid) / spread) * (plotW / 2);
  const svg = s('svg', { class: 'chart', viewBox: `0 0 ${W} ${H}`, role: 'group' });
  // A win index can't go below 0, so the left tick stops there.
  for (const t of [Math.max(0, mid - spread / 1.1), mid, mid + spread / 1.1]) {
    svg.append(s('line', { class: t === mid ? 'axis' : 'gridline', x1: x(t), x2: x(t), y1: 0, y2: H - 18 }));
    svg.append(s('text', { x: x(t), y: H - 4, 'text-anchor': 'middle' }, t.toFixed(2)));
  }
  rows.forEach((r, i) => {
    const y = i * row + 2;
    const cy = y + (row - bar) / 2;
    const parts = [
      s('rect', { class: 'hit', x: 0, y, width: W, height: row, fill: 'transparent' }),
      s('rect', { x: labelWidth - 16, y: y + row / 2 - 5, width: 10, height: 10, rx: 3, fill: r.swatch }),
      s('text', { x: labelWidth - 22, y: y + row / 2 + 4, 'text-anchor': 'end', class: 'strong' }, r.label),
    ];
    if (r.value !== null) {
      const x1 = x(r.value);
      const left = Math.min(cx, x1);
      const w = Math.abs(x1 - cx);
      const up = r.value >= mid;
      parts.push(s('path', {
        class: 'mark',
        d: up ? roundedBar(left, cy, Math.max(w, 0.5), bar) : mirrorBar(left, cy, Math.max(w, 0.5), bar),
        fill: up ? 'var(--c-pos)' : 'var(--c-neg)',
        opacity: r.dim ? 0.35 : 1,
      }));
      // Values sit right of their bar (above par) or right of the axis (below
      // par), so they never run into the names on the left.
      parts.push(s('text', { x: up ? x1 + 6 : cx + 6, y: y + row / 2 + 4, class: r.dim ? '' : 'strong' }, r.text));
    } else {
      parts.push(s('text', { x: cx + 6, y: y + row / 2 + 4 }, 'no games'));
    }
    svg.append(tipGroup(r.tip, ...parts));
  });
  return svg;
}
function mirrorBar(x0, y, w, h, r = 4) {
  const rr = Math.min(r, w, h / 2);
  const x1 = x0 + w;
  return `M${x1},${y}H${x0 + rr}Q${x0},${y} ${x0},${y + rr}V${y + h - rr}Q${x0},${y + h} ${x0 + rr},${y + h}H${x1}Z`;
}

// Vertical columns over an ordered axis (histograms, games per day).
function columnChart(points, { xLabel = (p) => String(p.value), tip, every = 1, height = 180, width = 560 } = {}) {
  const W = width;
  const padL = 34;
  const padB = 26;
  const H = height;
  const max = Math.max(1, ...points.map(p => p.count));
  const step = niceStep(max);
  const top = Math.ceil(max / step) * step;
  const slot = (W - padL) / Math.max(1, points.length);
  const bw = Math.min(24, Math.max(2, slot - 2));
  const y = (v) => (H - padB) - (v / top) * (H - padB - 8);
  const svg = s('svg', { class: 'chart', viewBox: `0 0 ${W} ${H}`, role: 'group' });
  for (let t = 0; t <= top; t += step) {
    svg.append(s('line', { class: t === 0 ? 'axis' : 'gridline', x1: padL, x2: W, y1: y(t), y2: y(t) }));
    svg.append(s('text', { x: padL - 6, y: y(t) + 4, 'text-anchor': 'end' }, String(t)));
  }
  points.forEach((p, i) => {
    const cx = padL + slot * i + slot / 2;
    const h = (H - padB) - y(p.count);
    const parts = [s('rect', { class: 'hit', x: cx - slot / 2, y: 0, width: slot, height: H - padB, fill: 'transparent' })];
    if (h > 0) parts.push(s('path', { class: 'mark', d: columnPath(cx - bw / 2, y(p.count), bw, h), fill: 'var(--c-bar)' }));
    svg.append(tipGroup(tip(p), ...parts));
    if (i % every === 0) svg.append(s('text', { x: cx, y: H - 8, 'text-anchor': 'middle' }, xLabel(p)));
  });
  return svg;
}
function columnPath(x, y, w, h, r = 4) {
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}
function niceStep(max) {
  const raw = max / 4;
  const pow = 10 ** Math.floor(Math.log10(raw || 1));
  const m = raw / pow;
  return Math.max(1, (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * pow);
}

// 100% stacked bars, one per row; segments separated by a 2px surface gap.
function stackedChart(rows, keys, { labelWidth = 110, width = 560 } = {}) {
  const W = width;
  const row = 30;
  const bar = 16;
  const H = rows.length * row + 4;
  const plotW = W - labelWidth - 8;
  const svg = s('svg', { class: 'chart', viewBox: `0 0 ${W} ${H}`, role: 'group' });
  rows.forEach((r, i) => {
    const y = i * row + 2;
    const cy = y + (row - bar) / 2;
    svg.append(s('text', { x: labelWidth - 8, y: y + row / 2 + 4, 'text-anchor': 'end', class: 'strong' }, r.label));
    const total = keys.reduce((n, k) => n + (r.values[k.key] || 0), 0);
    if (!total) {
      svg.append(s('text', { x: labelWidth, y: y + row / 2 + 4 }, 'no data'));
      return;
    }
    let x = labelWidth;
    const segs = keys.filter(k => r.values[k.key] > 0);
    segs.forEach((k, j) => {
      const w = (r.values[k.key] / total) * plotW;
      const last = j === segs.length - 1;
      const drawW = Math.max(0.5, w - (last ? 0 : 2));
      const share = r.values[k.key] / total;
      const parts = [
        s('rect', { class: 'hit', x, y, width: w, height: row, fill: 'transparent' }),
        last ? s('path', { class: 'mark', d: roundedBar(x, cy, drawW, bar), fill: k.color })
          : s('rect', { class: 'mark', x, y: cy, width: drawW, height: bar, fill: k.color }),
      ];
      if (w > 38) parts.push(s('text', { x: x + drawW / 2, y: cy + bar - 4, 'text-anchor': 'middle', style: `fill:${k.ink || '#fff'};font-size:11px;font-weight:600` }, pct(share)));
      svg.append(tipGroup([`${pct(share)} ${k.label}`, r.label], ...parts));
      x += w;
    });
  });
  return svg;
}
function legend(items) {
  return el('div', { class: 'legend' }, items.map(i => el('span', {}, el('i', { style: { background: i.color } }), i.label)));
}

// Square heat-map of match-ups.
function matchupChart(report, keys) {
  const cell = 64;
  const labelW = 110;
  const top = 34;
  const W = labelW + keys.length * cell;
  const H = top + keys.length * cell;
  const svg = s('svg', { class: 'chart', viewBox: `0 0 ${W} ${H}`, role: 'group', style: `max-width:${W}px` });
  keys.forEach((k, j) => svg.append(s('text', { x: labelW + j * cell + cell / 2, y: top - 10, 'text-anchor': 'middle', class: 'strong' }, shortName(k))));
  keys.forEach((a, i) => {
    svg.append(s('text', { x: labelW - 8, y: top + i * cell + cell / 2 + 4, 'text-anchor': 'end', class: 'strong' }, shortName(a)));
    keys.forEach((b, j) => {
      const x = labelW + j * cell;
      const y = top + i * cell;
      if (a === b) {
        svg.append(s('rect', { x: x + 1, y: y + 1, width: cell - 2, height: cell - 2, rx: 4, fill: 'var(--surface-2)' }));
        return;
      }
      const m = report.matchups[a][b];
      const enough = m.games >= MIN_N;
      const fill = enough ? diverging(m.rate, 0.5, 0.35) : cssVar('--c-mid');
      const ink = enough ? inkOn(fill) : 'var(--ink-muted)';
      svg.append(tipGroup(
        [m.rate === null ? 'No shared games' : `${pct(m.rate)} ahead`, `${shortName(a)} vs ${shortName(b)}`, `${m.ahead} of ${m.games} shared games`],
        s('rect', { class: 'mark hit', x: x + 1, y: y + 1, width: cell - 2, height: cell - 2, rx: 4, fill }),
        s('text', { x: x + cell / 2, y: y + cell / 2 + 1, 'text-anchor': 'middle', style: `fill:${ink};font-weight:700;font-size:13px` }, m.rate === null ? '—' : pct(m.rate)),
        s('text', { x: x + cell / 2, y: y + cell / 2 + 16, 'text-anchor': 'middle', style: `fill:${ink};font-size:10px` }, `n=${m.games}`),
      ));
    });
  });
  return svg;
}

// Sortable table. columns: { key, label, value(row) → sortable, cell(row) → node|string, left }
function sortableTable(rows, columns, { initial = null, testid = null } = {}) {
  let sortKey = initial?.key ?? null;
  let dir = initial?.dir ?? 'desc';
  const table = el('table', testid ? { 'data-testid': testid } : {});
  const render = () => {
    const sorted = rows.slice();
    const col = columns.find(c => c.key === sortKey);
    if (col?.value) {
      sorted.sort((a, b) => {
        const va = col.value(a);
        const vb = col.value(b);
        if (va === vb) return 0;
        if (va === null || va === undefined) return 1;
        if (vb === null || vb === undefined) return -1;
        return (va < vb ? -1 : 1) * (dir === 'asc' ? 1 : -1);
      });
    }
    const head = el('tr', {}, columns.map(c => el('th', {
      class: c.left ? 'left' : null,
      scope: 'col',
      'data-sort': c.value ? c.key : null,
      'aria-sort': c.key === sortKey ? (dir === 'asc' ? 'ascending' : 'descending') : null,
      tabindex: c.value ? 0 : null,
      onclick: c.value ? () => { dir = sortKey === c.key && dir === 'desc' ? 'asc' : 'desc'; sortKey = c.key; render(); } : null,
      onkeydown: c.value ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.target.click(); } } : null,
    }, c.label)));
    const body = sorted.map(r => el('tr', {}, columns.map(c => {
      const v = c.cell(r);
      return v instanceof Node && v.tagName === 'TD' ? v : el('td', { class: c.left ? 'left' : null }, v);
    })));
    table.replaceChildren(el('thead', {}, head), el('tbody', {}, body));
  };
  render();
  return table;
}
const rateCell = (rate, n, extra = {}) => el('td', { class: n < MIN_N ? 'low' : null, ...extra }, pct(rate), el('span', { class: 'n' }, `n=${n}`));

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------
const params = new URLSearchParams(window.location.search);
function sourceUrl() {
  const override = params.get('source');
  if (override) {
    const host = override.trim();
    return `${/^(127\.0\.0\.1|localhost|0\.0\.0\.0)(:|$)/.test(host) ? 'http' : 'https'}://${host}${PATH}`;
  }
  const h = window.location.hostname;
  if (window.location.protocol.startsWith('http') && (h === 'localhost' || h === '127.0.0.1' || h === '0.0.0.0' || h.endsWith('.partykit.dev'))) {
    return window.location.origin + PATH;
  }
  return `https://${PRODUCTION_PARTYKIT_HOST}${PATH}`;
}
function storedToken() {
  try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
}

async function fetchAllRecords() {
  const base = sourceUrl();
  const token = storedToken();
  const records = [];
  let after = null;
  for (let page = 0; page < 1000; page++) {
    const q = new URLSearchParams({ records: '1' });
    if (after) q.set('after', after);
    if (token) q.set('token', token);
    const res = await fetch(`${base}?${q}`);
    if (res.status === 401) { const err = new Error('token'); err.code = 401; throw err; }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json();
    records.push(...body.records);
    if (!body.next) break;
    after = body.next;
  }
  return records;
}

function parseRecordsFile(text) {
  const trimmed = text.trim();
  let items;
  if (trimmed.startsWith('[')) items = JSON.parse(trimmed);
  else items = trimmed.split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  return items.filter(r => r && r.schema === 'aia-match-record/1' && Array.isArray(r.players));
}

let allRecords = [];
let sourceText = '';

function showBanner(...nodes) { mount('banner', ...(nodes.length ? [el('div', { class: 'banner' }, ...nodes)] : [])); }

async function loadFromServer() {
  document.body.classList.add('loading');
  showBanner();
  const url = sourceUrl();
  try {
    allRecords = await fetchAllRecords();
    sourceText = `${allRecords.length} games from ${new URL(url).host}`;
  } catch (err) {
    if (err.code === 401) {
      const input = el('input', { type: 'password', placeholder: 'Read token', 'aria-label': 'Read token', autocomplete: 'off' });
      showBanner('This telemetry store needs a read token (TELEMETRY_READ_TOKEN).',
        el('form', { onsubmit: (e) => { e.preventDefault(); try { localStorage.setItem(TOKEN_KEY, input.value.trim()); } catch { /* ignore */ } loadFromServer(); } },
          input, el('button', { class: 'btn', type: 'submit' }, 'Unlock')));
    } else {
      showBanner(`Could not reach the telemetry server (${new URL(url).host}): ${err.message}. You can still load a JSONL file.`);
    }
    allRecords = [];
    sourceText = 'No data loaded';
  }
  document.body.classList.remove('loading');
  refreshVersions();
  render();
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------
const controls = {
  since: document.getElementById('fSince'),
  playerCount: document.getElementById('fPlayers'),
  mode: document.getElementById('fMode'),
  seats: document.getElementById('fSeats'),
  engineVersion: document.getElementById('fVersion'),
};
function currentFilters() {
  const days = controls.since.value;
  return {
    ...MATCH_FILTER_DEFAULTS,
    playerCount: controls.playerCount.value === 'multi' || controls.playerCount.value === 'all' ? controls.playerCount.value : Number(controls.playerCount.value),
    mode: controls.mode.value,
    seats: controls.seats.value,
    engineVersion: controls.engineVersion.value,
    since: days === 'all' ? null : Date.now() - Number(days) * 864e5,
  };
}
function refreshVersions() {
  const versions = aggregateMatches(allRecords, { playerCount: 'all' }).engineVersions;
  const keep = controls.engineVersion.value;
  controls.engineVersion.replaceChildren(el('option', { value: 'all' }, 'All versions'), ...versions.map(v => el('option', { value: v }, `v${v}`)));
  controls.engineVersion.value = versions.includes(keep) ? keep : 'all';
}
Object.values(controls).forEach(c => c.addEventListener('change', render));

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------
let buildChar = Object.keys(CHARACTERS)[0];
let routeWall = 'bouldering';

function render() {
  const report = aggregateMatches(allRecords, currentFilters());
  document.getElementById('sourceLabel').textContent = sourceText;
  document.getElementById('filterCount').textContent = `${report.overview.games} of ${report.overview.totalGames} games`;
  const empty = report.overview.games === 0;
  document.getElementById('emptyState').hidden = !empty;
  document.getElementById('emptyState').textContent = allRecords.length ? 'No games match these filters.' : 'No games recorded yet. Finished games appear here automatically.';
  document.getElementById('report').hidden = empty;
  if (empty) return;
  renderOverview(report);
  renderCharacters(report);
  renderMatchups(report);
  renderBuilds(report);
  renderCards(report);
  renderProgression(report);
  renderRecent(report);
}

function renderOverview(report) {
  const o = report.overview;
  const split = [1, 2, 3, 4].filter(n => o.byPlayerCount[n]).map(n => `${n === 1 ? 'solo' : `${n}p`} ${o.byPlayerCount[n]}`).join(' · ');
  const modes = Object.entries(o.byMode).map(([m, n]) => `${MODE_LABELS[m] || m} ${n}`).join(' · ');
  const unfinished = o.endReasons.unfinished || 0;
  const tile = (label, value, detail, hero = false) => el('div', { class: `tile${hero ? ' hero' : ''}` },
    el('div', { class: 'label' }, label), el('div', { class: 'value' }, value), detail ? el('div', { class: 'detail' }, detail) : null);
  mount('tiles',
    tile('Games', o.games.toLocaleString(), split, true),
    tile('Median game length', duration(o.medianDurationMs), modes),
    tile('Average rounds', num(o.avgRounds), unfinished ? `${unfinished} unfinished` : 'all finished'),
    tile('Seats played', o.seats.toLocaleString(), `${o.humanSeats} human · ${o.botSeats} bot`),
    tile('Average winning Level', num(report.levels.avgWinningLevel), `all climbers ${num(report.levels.avgFinalLevel)}`),
  );
  const days = o.byDay;
  mount('chartDays', days.length
    ? columnChart(days.map(d => ({ ...d, count: d.games })), {
      width: widthOf('chartDays'),
      xLabel: (p) => p.day.slice(5),
      every: Math.max(1, Math.ceil(days.length / 10)),
      tip: (p) => [`${p.games} games`, p.day],
    })
    : el('p', { class: 'note' }, 'These games have no finish times.'));
}

function renderCharacters(report) {
  const rows = report.characters.slice().sort((a, b) => (b.winIndex ?? -1) - (a.winIndex ?? -1));
  mount('chartWinIndex', divergingBars(rows.map(c => ({
    label: shortName(c.key),
    swatch: charColor(c.key),
    value: c.winIndex,
    dim: c.games < MIN_N,
    text: c.winIndex === null ? '' : `${c.winIndex.toFixed(2)}  (n=${c.games})`,
    tip: [c.winIndex === null ? 'No games' : `Win index ${c.winIndex.toFixed(2)}`, c.name, `${c.wins} wins of ${c.games} games`, `fair share ${c.expectedWins.toFixed(1)} wins`],
  })), { width: widthOf('chartWinIndex') }));
  const picks = report.characters.slice().sort((a, b) => b.games - a.games);
  mount('chartPicks', barChart(picks.map(c => ({
    label: shortName(c.key),
    swatch: charColor(c.key),
    value: c.pickRate || 0,
    color: charColor(c.key),
    text: `${pct(c.pickRate)}  (${c.games})`,
    tip: [pct(c.pickRate), c.name, `in ${c.games} of ${report.overview.games} games`],
  })), { max: 1, width: widthOf('chartPicks') }));

  const counts = [2, 3, 4].filter(n => report.overview.byPlayerCount[n]);
  const columns = [
    { key: 'name', label: 'Character', left: true, value: c => c.name, cell: c => el('span', {}, el('span', { class: 'swatch', style: { background: charColor(c.key) } }), c.name) },
    { key: 'games', label: 'Games', value: c => c.games, cell: c => String(c.games) },
    { key: 'pick', label: 'Pick rate', value: c => c.pickRate, cell: c => pct(c.pickRate) },
    { key: 'wins', label: 'Wins', value: c => c.wins, cell: c => String(c.wins) },
    { key: 'win', label: 'Win rate', value: c => c.winRate, cell: c => rateCell(c.winRate, c.games) },
    { key: 'index', label: 'Win index', value: c => c.winIndex, cell: c => el('td', { class: c.games < MIN_N ? 'low' : null }, num(c.winIndex, 2)) },
    ...counts.map(n => ({
      key: `p${n}`, label: `${n}p win %`,
      value: c => c.byPlayerCount[n]?.winRate ?? null,
      cell: c => {
        const v = c.byPlayerCount[n];
        if (!v) return el('td', { class: 'low' }, '—');
        const fill = v.games >= MIN_N ? diverging(v.winRate, 1 / n, 0.35) : null;
        return rateCell(v.winRate, v.games, fill ? { style: { background: fill, color: inkOn(fill) } } : {});
      },
    })),
    { key: 'place', label: 'Avg place', value: c => c.avgPlacement, cell: c => num(c.avgPlacement, 2) },
    { key: 'level', label: 'Avg final Lvl', value: c => c.avgFinalLevel, cell: c => num(c.avgFinalLevel) },
    { key: 'winlevel', label: 'Lvl at win', value: c => c.avgWinningLevel, cell: c => num(c.avgWinningLevel) },
    { key: 'ms', label: 'Milestones', value: c => c.avgMilestones, cell: c => num(c.avgMilestones, 2) },
    { key: 'rounds', label: 'Rounds to win', value: c => c.avgRoundsToWin, cell: c => num(c.avgRoundsToWin) },
  ];
  mount('tableCharacters', sortableTable(report.characters, columns, { initial: { key: 'index', dir: 'desc' }, testid: 'character-table' }));
}

function renderMatchups(report) {
  const keys = Object.keys(CHARACTERS);
  mount('chartMatchups',
    el('div', { class: 'legend' }, el('span', {}, 'behind'), el('span', {}, el('i', { class: 'ramp', style: { background: `linear-gradient(90deg, ${diverging(0.15, 0.5, 0.35)}, ${cssVar('--c-mid')}, ${diverging(0.85, 0.5, 0.35)})` } })), el('span', {}, 'ahead · grey under 5 games')),
    matchupChart(report, keys));
  const blocks = Object.entries(report.seatOrder).filter(([n]) => Number(n) >= 2).map(([n, row]) => el('div', {},
    el('p', { class: 'sub', style: { margin: '8px 0 2px', fontWeight: 600 } }, `${n} players · ${row.games} games`),
    barChart(row.seats.map(st => ({
      label: `Seat ${st.seat}`,
      value: st.winRate || 0,
      dim: row.games < MIN_N,
      text: `${pct(st.winRate)}  (${st.wins})`,
      tip: [`${pct(st.winRate)} wins`, `Seat ${st.seat} of ${n}`, `${st.wins} of ${row.games} games · fair share ${pct(st.fairShare)}`],
    })), { max: Math.max(0.6, ...row.seats.map(st => st.winRate || 0)), ref: 1 / Number(n), width: widthOf('chartSeats') })));
  mount('chartSeats', ...(blocks.length ? blocks : [el('p', { class: 'note' }, 'No multiplayer games in this filter.')]));
}

function renderBuilds(report) {
  const statKeys = STATS.map(k => ({ key: k, label: cap(k), color: `var(--c-stat-${k})` }));
  mount('chartTraining', legend(statKeys), stackedChart(report.characters.map(c => ({
    label: shortName(c.key),
    values: Object.fromEntries(STATS.map(k => [k, c.trainingShare[k] || 0])),
  })), statKeys, { width: widthOf('chartTraining') }));
  const timeKeys = TIME_BUCKETS.map(([key, label]) => ({ key, label, color: `var(--c-time-${key})`, ink: key === 'milestone' ? 'var(--ink)' : '#fff' }));
  mount('chartTime', legend(timeKeys), stackedChart(report.characters.map(c => ({
    label: shortName(c.key),
    values: Object.fromEntries(TIME_BUCKETS.map(([key, , areas]) => [key, areas.reduce((n, a) => n + (c.timeShare[a] || 0), 0)])),
  })), timeKeys, { width: widthOf('chartTime') }));

  mount('buildChars', ...Object.keys(CHARACTERS).map(k => el('button', {
    type: 'button', 'aria-pressed': String(k === buildChar),
    onclick: () => { buildChar = k; renderBuilds(report); },
  }, shortName(k))));
  const b = report.builds[buildChar];
  const focusRows = Object.entries(b.focus).sort((x, y) => y[1].games - x[1].games);
  const focusLine = el('p', { class: 'note', style: { margin: '0 0 8px' } }, 'Win rate by training focus: ',
    ...focusRows.map(([k, v]) => el('span', { class: 'pill' }, `${k === 'none' ? 'no training' : cap(k)} ${pct(v.winRate)} (n=${v.games})`)));
  mount('tableBuilds', focusLine, b.top.length ? sortableTable(b.top, [
    { key: 'focus', label: 'Training focus', left: true, value: t => t.focus || '', cell: t => (t.focus ? cap(t.focus) : 'none') },
    { key: 'gear', label: 'Gear', left: true, cell: t => el('td', { class: 'left', style: { whiteSpace: 'normal' } }, t.gear.length ? t.gear.map(g => el('span', { class: 'pill' }, g)) : 'no gear') },
    { key: 'games', label: 'Games', value: t => t.games, cell: t => String(t.games) },
    { key: 'win', label: 'Win rate', value: t => t.winRate, cell: t => rateCell(t.winRate, t.games) },
    { key: 'level', label: 'Avg final Lvl', value: t => t.avgFinalLevel, cell: t => num(t.avgFinalLevel) },
  ], { initial: { key: 'games', dir: 'desc' }, testid: 'build-table' }) : el('p', { class: 'note' }, `No ${shortName(buildChar)} games in this filter.`));
}

function renderCards(report) {
  const gear = report.gear;
  const bought = gear.filter(g => g.buyers > 0);
  const never = gear.filter(g => g.buyers === 0);
  const mostBought = bought[0];
  const leastBought = bought.slice().sort((a, b) => a.buyers - b.buyers)[0];
  const qualified = bought.filter(g => g.buyers >= MIN_N && g.winRateWith !== null && g.winRateWithout !== null);
  const bestLift = qualified.slice().sort((a, b) => (b.winRateWith - b.winRateWithout) - (a.winRateWith - a.winRateWithout))[0];
  const routes = report.routes;
  const climbed = routes.filter(r => r.attempts > 0).sort((a, b) => b.attempts - a.attempts);
  const unclimbed = routes.filter(r => r.attempts === 0);
  const callout = (title, ...body) => el('div', { class: 'callout' }, el('strong', {}, title), ...body);
  mount('cardCallouts',
    callout('Most bought gear', mostBought ? `${mostBought.name}: ${pct(mostBought.buyRate)} of seats` : '—'),
    callout('Least bought gear', never.length ? `Never bought: ${never.map(g => g.name).join(', ')}` : leastBought ? `${leastBought.name}: ${pct(leastBought.buyRate)} of seats` : '—'),
    callout('Biggest win-rate lift', bestLift ? `${bestLift.name}: ${pct(bestLift.winRateWith)} with vs ${pct(bestLift.winRateWithout)} without` : `Needs ${MIN_N}+ buyers per card`),
    callout('Route cards', `${climbed.length} of ${routes.length} attempted. Most climbed: ${climbed[0] ? `${climbed[0].name} (${climbed[0].attempts})` : '—'}. ${unclimbed.length} never attempted.`),
  );

  const maxRate = Math.max(0.01, ...gear.map(g => g.buyRate || 0));
  mount('tableGear', sortableTable(gear, [
    { key: 'name', label: 'Card', left: true, value: g => g.name, cell: g => g.name },
    { key: 'cat', label: 'Category', left: true, value: g => g.category, cell: g => g.category },
    { key: 'price', label: 'Avg price', value: g => g.avgPricePaid, cell: g => (g.avgPricePaid === null ? '—' : `${num(g.avgPricePaid)}${g.priceCurrency ? ` ${g.priceCurrency === 'grit' ? 'Grit' : 'XP'}` : ''}`) },
    { key: 'rate', label: 'Bought by', value: g => g.buyRate, cell: g => el('td', {}, el('span', { class: 'inline-bar', style: { width: `${Math.round(((g.buyRate || 0) / maxRate) * 80)}px` } }), pct(g.buyRate, 1)) },
    { key: 'buyers', label: 'Seats', value: g => g.buyers, cell: g => String(g.buyers) },
    { key: 'round', label: 'Avg round', value: g => g.avgRoundBought, cell: g => num(g.avgRoundBought) },
    { key: 'with', label: 'Win % with', value: g => g.winRateWith, cell: g => rateCell(g.winRateWith, g.buyers) },
    { key: 'without', label: 'Win % without', value: g => g.winRateWithout, cell: g => pct(g.winRateWithout) },
    { key: 'trig', label: 'Climb effect uses / buyer', value: g => g.triggersPerBuyer, cell: g => (g.hasEffect ? num(g.triggersPerBuyer) : el('td', { class: 'low', title: 'Not a climb-effect card' }, '—')) },
    { key: 'top', label: 'Top buyer', left: true, cell: g => {
      const top = Object.entries(g.byCharacter).sort((a, b) => b[1] - a[1])[0];
      return top && top[1] > 0 ? `${shortName(top[0])} (${top[1]})` : '—';
    } },
  ], { initial: { key: 'rate', dir: 'desc' }, testid: 'gear-table' }));

  mount('routeWalls', ...WALLS.map(([k, label]) => el('button', {
    type: 'button', 'aria-pressed': String(k === routeWall),
    onclick: () => { routeWall = k; renderCards(report); },
  }, label)));
  const wall = routes.filter(r => r.area === routeWall).sort((a, b) => b.attempts - a.attempts || a.name.localeCompare(b.name));
  mount('chartRoutes', barChart(wall.map(r => ({
    label: r.grade,
    value: r.attempts,
    text: r.attempts ? `${r.name} · ${r.attempts} · ${pct(r.sendRate)} sent` : `${r.name} · never attempted`,
    dim: r.attempts === 0,
    tip: [`${r.attempts} attempts`, `${r.name} (${r.grade})`, `${r.sends} sends · ${pct(r.sendRate)} send rate`, `climbed by ${r.climbers} seats`,
      r.milestoneGames ? `milestone in ${r.milestoneGames} games · ${pct(r.milestoneSendRate)} of those attempts sent` : 'never dealt as a milestone'],
  })), { labelWidth: 60, valueWidth: 250, width: widthOf('chartRoutes') }));
}

function renderProgression(report) {
  const win = report.levels.winningLevelHistogram;
  mount('chartWinLevel', win.length
    ? columnChart(win, { width: widthOf('chartWinLevel'), xLabel: p => `L${p.value}`, tip: p => [`${p.count} wins`, `at Level ${p.value}`] })
    : el('p', { class: 'note' }, 'No finished games.'));
  const rounds = report.overview.roundsHistogram;
  mount('chartRounds', columnChart(rounds, {
    width: widthOf('chartRounds'),
    xLabel: p => String(p.value),
    every: Math.max(1, Math.ceil(rounds.length / 12)),
    tip: p => [`${p.count} games`, `${p.value} rounds`],
  }));
  mount('tableMilestones', el('table', {},
    el('thead', {}, el('tr', {}, ['Tier', 'Attempts', 'Sends', 'Send rate', 'Avg send round', 'Seats that sent it'].map((h, i) => el('th', { class: i ? null : 'left' }, h)))),
    el('tbody', {}, TIERS.map(([k, label]) => {
      const m = report.milestones[k];
      return el('tr', {}, el('td', {}, label), el('td', {}, String(m.attempts)), el('td', {}, String(m.sends)),
        el('td', {}, pct(m.sendRate)), el('td', {}, num(m.avgSendRound)), el('td', {}, pct(m.reachedBy)));
    }))));
}

function renderRecent(report) {
  mount('tableRecent', el('table', { 'data-testid': 'recent-table' },
    el('thead', {}, el('tr', {}, ['Finished', 'Mode', 'Players', 'Rounds', 'Length', 'Winner', 'Standings (Level · milestones)', 'Engine'].map((h, i) => el('th', { class: [0, 1, 5, 6].includes(i) ? 'left' : null }, h)))),
    el('tbody', {}, report.recent.map(g => el('tr', {},
      el('td', { class: 'left' }, g.finishedAt ? new Date(g.finishedAt).toLocaleString() : '—'),
      el('td', { class: 'left' }, MODE_LABELS[g.mode] || g.mode),
      el('td', {}, String(g.playerCount)),
      el('td', {}, String(g.rounds)),
      el('td', {}, duration(g.durationMs)),
      el('td', { class: 'left' }, g.winnerCharacter ? shortName(g.winnerCharacter) : 'unfinished'),
      el('td', { class: 'left', style: { whiteSpace: 'normal' } }, g.players.slice().sort((a, b) => a.placement - b.placement).map(p => el('span', { class: 'pill' },
        `${p.placement}. ${shortName(p.characterKey)}${p.controller === 'bot' ? ` (bot${p.botLevel ? ` ${p.botLevel}` : ''})` : ''} · L${p.level} · ${p.milestones}`))),
      el('td', {}, `v${g.engineVersion}`),
    )))));
}

// ---------------------------------------------------------------------------
// Toolbar
// ---------------------------------------------------------------------------
document.getElementById('reloadBtn').addEventListener('click', loadFromServer);
document.getElementById('fileInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    allRecords = parseRecordsFile(await file.text());
    sourceText = `${allRecords.length} games from ${file.name}`;
    showBanner();
  } catch (err) {
    showBanner(`Could not read ${file.name}: ${err.message}`);
  }
  e.target.value = '';
  refreshVersions();
  render();
});
document.getElementById('exportBtn').addEventListener('click', () => {
  if (!allRecords.length) return;
  const blob = new Blob([allRecords.map(r => JSON.stringify(r)).join('\n') + '\n'], { type: 'application/x-ndjson' });
  const a = el('a', { href: URL.createObjectURL(blob), download: `all-in-ascent-telemetry-${new Date().toISOString().slice(0, 10)}.jsonl` });
  document.body.append(a);
  a.click();
  a.remove();
});

let lastWidth = window.innerWidth;
let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { if (window.innerWidth !== lastWidth) { lastWidth = window.innerWidth; render(); } }, 150);
});

window.AscentDashboard = { render, get records() { return allRecords; } };
loadFromServer();
