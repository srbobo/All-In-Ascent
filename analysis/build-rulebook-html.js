// Convert RULEBOOK.md → RULEBOOK.html with the Grit & Holds visual language
// (sandstone + tape-cream, polychrome holds, Bricolage Grotesque + Hanken
// Grotesk + Geist Mono).
//
// RULEBOOK.md stays readable as plain Markdown. A few extensions turn into
// graphics here:
//   > **Label:** …            → styled callout (Lore, Remember, Example, …)
//   <!-- figure:NAME -->       → inline SVG diagram (see FIGURES below)
//   ### Name + <!-- climber:KEY --> → climber card built from engine/data.js,
//                                and the section below it becomes a spread
//
// USAGE:  node analysis/build-rulebook-html.js
// Output: writes RULEBOOK.html to the project root.

import fs from 'node:fs';
import { CHARACTERS } from '../engine/data.js';

const source = fs.readFileSync('RULEBOOK.md', 'utf8');

// The block before the first horizontal rule is the cover: title, tagline,
// and an italic strapline. It goes into the <header>, not the body.
const coverEnd = source.search(/^---+\s*$/m);
const cover = source.slice(0, coverEnd);
const md = source.slice(coverEnd).replace(/^---+\s*\n/, '');
const tagline = (cover.match(/^##\s+(.+)$/m) || [, ''])[1].trim();
const strapline = (cover.match(/^\*(.+)\*\s*$/m) || [, ''])[1].trim();

// --- Climber presentation (colour + complexity aren't game data) ---
const CLIMBER_STYLE = {
  ironLung:    { color: 'var(--teal)',      complexity: 1 },
  technician:  { color: 'var(--cobalt)',    complexity: 1 },
  sprinter:    { color: 'var(--coral)',     complexity: 2 },
  routeReader: { color: 'var(--violet)',    complexity: 2 },
  freeSolo:    { color: 'var(--raspberry)', complexity: 3 },
};
const COMPLEXITY_LABEL = ['', 'Low', 'Medium', 'High'];

// --- Callout types, keyed by the bold label that opens a blockquote ---
const CALLOUTS = [
  { match: /^lore$/i,                      cls: 'lore',     label: null },
  { match: /^golden rule$/i,               cls: 'golden',   label: 'Golden Rule' },
  { match: /^remember$/i,                  cls: 'remember', label: 'Remember' },
  { match: /^example$/i,                   cls: 'example',  label: 'Example' },
  { match: /^off the wall$/i,              cls: 'offwall',  label: 'Off the Wall' },
  { match: /^coach's tip$/i,               cls: 'coach',    label: "Coach's Tip" },
  { match: /^commonly forgotten rules$/i,  cls: 'forgot',   label: 'Commonly Forgotten Rules' },
  { match: /^solo game$/i,                 cls: 'variant',  label: 'Solo Game' },
  { match: /^first game\??$/i,             cls: 'variant',  label: 'First Game' },
];

// --- Inline formatting ---
function inlineFormat(text) {
  return text
    .replace(/&(?![a-z#0-9]+;)/gi, '&amp;')
    .replace(/<(?!\/?(?:br|span|strong|em|a|code)\b)/g, '&lt;')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/✓/g, '<span class="ok">✓</span>')
    .replace(/✗/g, '<span class="no">✗</span>');
}

function slugify(text) {
  return text
    .replace(/\*\*/g, '')
    .replace(/`/g, '')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function parseTable(lines) {
  if (lines.length < 2) return '';
  const cells = (line) => line.split('|').slice(1, -1).map(c => c.trim());
  const headers = cells(lines[0]);
  const rows = lines.slice(2).map(cells);
  return `<div class="table-wrap"><table>
<thead><tr>${headers.map(h => `<th>${inlineFormat(h)}</th>`).join('')}</tr></thead>
<tbody>${rows.map(r => `<tr>${r.map(c => `<td>${inlineFormat(c)}</td>`).join('')}</tr>`).join('\n')}</tbody>
</table></div>`;
}

// List items: "+" and "–" ability lines get edge/price chips.
function listItem(html) {
  const m = html.match(/^<strong>([+–-])<\/strong>\s*/);
  if (!m) return `<li>${html}</li>`;
  const plus = m[1] === '+';
  return `<li class="${plus ? 'edge' : 'price'}"><span class="pm">${plus ? '+' : '–'}</span><span>${html.slice(m[0].length)}</span></li>`;
}

// Gather a list (ordered or not). Indented lines that follow an item belong
// to it and are rendered recursively (nested lists).
function parseList(lines, i, ordered) {
  const itemRe = ordered ? /^\d+\.\s+/ : /^-\s+/;
  const start = ordered ? parseInt(lines[i], 10) : 1;
  const items = [];
  while (i < lines.length && itemRe.test(lines[i])) {
    const first = lines[i].replace(itemRe, '');
    i++;
    const nested = [];
    while (i < lines.length && /^\s{2,}\S/.test(lines[i])) {
      nested.push(lines[i].replace(/^\s{2,4}/, ''));
      i++;
    }
    const inner = inlineFormat(first) + (nested.length ? blocksToHtml(nested.join('\n')) : '');
    items.push(listItem(inner));
  }
  const tag = ordered ? 'ol' : 'ul';
  const startAttr = start > 1 ? ` start="${start}"` : '';
  return { html: `<${tag}${startAttr}>${items.join('')}</${tag}>`, i };
}

function renderCallout(blockLines) {
  const first = blockLines.find(l => l.trim()) || '';
  const m = first.match(/^\*\*([^*]+?):?\*\*:?\s*/);
  let type = null;
  if (m) type = CALLOUTS.find(c => c.match.test(m[1].trim()));
  if (!type) {
    return `<blockquote class="callout plain">${blocksToHtml(blockLines.join('\n'), { lineBreaks: true })}</blockquote>`;
  }
  const idx = blockLines.indexOf(first);
  const rest = [...blockLines];
  rest[idx] = first.slice(m[0].length);
  const label = type.label ? `<span class="tape">${type.label}</span>` : '';
  return `<aside class="callout ${type.cls}">${label}${blocksToHtml(rest.join('\n'), { lineBreaks: true })}</aside>`;
}

function renderClimberCard(key, headingText) {
  const c = CHARACTERS[key];
  const st = CLIMBER_STYLE[key];
  if (!c || !st) throw new Error(`unknown climber key in RULEBOOK.md: ${key}`);
  const rows = [
    ['STR', 'Strength', c.startingStats.strength, c.growth.strength, 30],
    ['TEC', 'Technique', c.startingStats.technique, c.growth.technique, 30],
    ['FOC', 'Focus', c.startingStats.focus, c.growth.focus, 30],
    ['FLX', 'Flexibility', c.startingStats.flexibility, c.growth.flexibility, 30],
    ['END', 'Endurance', c.startingEndurance, c.growth.endurance, 130],
  ];
  const pips = [1, 2, 3].map(n => `<span class="pip${n <= st.complexity ? ' on' : ''}"></span>`).join('');
  return `<div class="climber-card">
  <div class="cc-head">
    <span class="hold cc-hold" aria-hidden="true"></span>
    <div class="cc-title">
      <div class="cc-arch">${c.archetype}</div>
      <h3 id="${slugify(headingText)}" class="cc-name">${inlineFormat(headingText)}</h3>
    </div>
    <div class="cc-cx" title="Complexity: how hard to play well">
      <span class="cc-cx-label">Complexity</span>
      <span class="pips">${pips}</span>
      <span class="cc-cx-word">${COMPLEXITY_LABEL[st.complexity]}</span>
    </div>
  </div>
  <div class="cc-stats">
    ${rows.map(([abbr, name, val, grow, max]) => `
    <div class="cc-row${abbr === 'END' ? ' end' : ''}">
      <span class="cc-abbr" title="${name}">${abbr}</span>
      <span class="cc-bar"><span style="width:${Math.min(100, (val / max) * 100).toFixed(1)}%"></span></span>
      <span class="cc-val">${val}</span>
      <span class="cc-grow">+${grow}<small>/lvl</small></span>
    </div>`).join('')}
  </div>
</div>`;
}

function blocksToHtml(text, opts = {}) {
  const lines = text.split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    const fig = line.match(/^<!--\s*figure:([\w-]+)\s*-->/);
    if (fig) {
      if (!FIGURES[fig[1]]) throw new Error(`unknown figure in RULEBOOK.md: ${fig[1]}`);
      out.push(`<figure class="fig fig-${fig[1]}">${FIGURES[fig[1]]()}</figure>`);
      i++; continue;
    }
    if (/^<!--.*-->\s*$/.test(line)) { i++; continue; }

    const head = line.match(/^(#{1,6})\s+(.+)$/);
    if (head) {
      const lvl = head[1].length;
      const textH = head[2].trim();
      // Climber spread: heading followed by a climber marker.
      let j = i + 1;
      while (j < lines.length && !lines[j].trim()) j++;
      const cm = (lines[j] || '').match(/^<!--\s*climber:(\w+)\s*-->/);
      if (cm) {
        let k = j + 1;
        while (k < lines.length && !/^#{1,3}\s/.test(lines[k]) && !/^---+\s*$/.test(lines[k])) k++;
        const body = blocksToHtml(lines.slice(j + 1, k).join('\n'));
        out.push(`<section class="climber" style="--c:${CLIMBER_STYLE[cm[1]].color}">${renderClimberCard(cm[1], textH)}<div class="climber-body">${body}</div></section>`);
        i = k; continue;
      }
      out.push(`<h${lvl} id="${slugify(textH)}">${inlineFormat(textH)}</h${lvl}>`);
      i++; continue;
    }
    if (/^---+\s*$/.test(line)) { out.push('<hr>'); i++; continue; }
    if (/^>\s?/.test(line)) {
      const block = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        block.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      out.push(renderCallout(block));
      continue;
    }
    if (line.startsWith('|')) {
      const tbl = [];
      while (i < lines.length && lines[i].startsWith('|')) { tbl.push(lines[i]); i++; }
      out.push(parseTable(tbl));
      continue;
    }
    if (/^-\s+/.test(line)) { const r = parseList(lines, i, false); out.push(r.html); i = r.i; continue; }
    if (/^\d+\.\s+/.test(line)) { const r = parseList(lines, i, true); out.push(r.html); i = r.i; continue; }

    const para = [];
    while (
      i < lines.length && lines[i].trim() &&
      !/^#{1,6}\s+/.test(lines[i]) &&
      !/^---+\s*$/.test(lines[i]) &&
      !/^>\s?/.test(lines[i]) &&
      !/^<!--/.test(lines[i]) &&
      !lines[i].startsWith('|') &&
      !/^-\s+/.test(lines[i]) &&
      !/^\d+\.\s+/.test(lines[i])
    ) {
      para.push(lines[i]);
      i++;
    }
    if (para.length) out.push(`<p>${para.map(inlineFormat).join(opts.lineBreaks ? '<br>' : ' ')}</p>`);
  }
  return out.join('\n');
}

// =============================================================================
// FIGURES — inline SVG, drawn with the Grit & Holds palette
// =============================================================================

const F = `font-family="Hanken Grotesk, sans-serif"`;
const FB = `font-family="Bricolage Grotesque, sans-serif" font-weight="800"`;
const FM = `font-family="Geist Mono, monospace"`;

function letter(x, y, ch) {
  return `<g><circle cx="${x}" cy="${y}" r="13" fill="#2a1d12"/><text x="${x}" y="${y + 5}" text-anchor="middle" ${FB} font-size="14" fill="#f4ede0">${ch}</text></g>`;
}
function zone(x, y, w, h, fill, title, sub, ch) {
  return `<g>
  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="${fill}" stroke="#2a1d12" stroke-width="2"/>
  ${letter(x + 4, y + 4, ch)}
  <text x="${x + 24}" y="${y + 24}" ${FB} font-size="15" fill="#2a1d12">${title}</text>
  ${sub ? `<text x="${x + 24}" y="${y + 40}" ${F} font-size="11.5" fill="#5a4530">${sub}</text>` : ''}
</g>`;
}
function cardSlot(x, y, color, w = 34, h = 46) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="#fffaf0" stroke="#2a1d12" stroke-width="1.5"/><rect x="${x}" y="${y}" width="${w}" height="9" rx="2" fill="${color}"/>`;
}
function standee(x, y, color) {
  return `<g><circle cx="${x}" cy="${y - 14}" r="7" fill="${color}" stroke="#2a1d12" stroke-width="1.5"/><path d="M${x - 9} ${y + 6} Q${x} ${y - 14} ${x + 9} ${y + 6} Z" fill="${color}" stroke="#2a1d12" stroke-width="1.5"/></g>`;
}

const FIGURES = {
  // Setup diagram: the gym board, lettered A–H.
  'gym-map': () => {
    const slots = (x, y, n, color, gap = 40) =>
      Array.from({ length: n }, (_, k) => cardSlot(x + k * gap, y, color)).join('');
    return `<div class="fig-scroll"><svg viewBox="0 0 800 470" role="img" aria-label="Setup diagram of the gym board, lettered A to H">
  <rect x="2" y="2" width="796" height="466" rx="14" fill="#d8bf95" stroke="#2a1d12" stroke-width="2"/>
  ${zone(20, 20, 236, 120, '#f8f0dc', 'Bouldering', '5 routes · anyone · unlimited', 'A')}
  ${slots(36, 78, 5, '#ff6845', 42)}
  ${zone(282, 20, 236, 120, '#f8f0dc', 'Top Rope', 'belayer stations · 1 climber each', 'B')}
  <rect x="298" y="70" width="96" height="66" rx="6" fill="none" stroke="#1fb8a6" stroke-width="2" stroke-dasharray="5 3"/>
  <text x="346" y="132" text-anchor="middle" ${FM} font-size="9" fill="#5a4530">STATION 1</text>
  ${cardSlot(306, 76, '#1fb8a6')}${cardSlot(352, 76, '#1fb8a6')}
  <rect x="406" y="70" width="96" height="66" rx="6" fill="none" stroke="#1fb8a6" stroke-width="2" stroke-dasharray="5 3"/>
  <text x="454" y="132" text-anchor="middle" ${FM} font-size="9" fill="#5a4530">STATION 2</text>
  ${cardSlot(414, 76, '#1fb8a6')}${cardSlot(460, 76, '#1fb8a6')}
  ${zone(544, 20, 236, 120, '#f8f0dc', 'Lead', '5 routes · 3 access cards · 1 climber', 'C')}
  ${slots(560, 78, 5, '#2c66cf', 42)}
  ${zone(20, 166, 236, 118, '#f8f0dc', 'Training Area', '4 stations · 1 climber each', 'D')}
  ${['Campus', 'Moon', 'Grip', 'Core'].map((n, k) => `<rect x="${34 + k * 55}" y="222" width="48" height="48" rx="8" fill="#ffae28" stroke="#2a1d12" stroke-width="1.5"/><text x="${58 + k * 55}" y="250" text-anchor="middle" ${FM} font-size="10" font-weight="700" fill="#2a1d12">${n}</text>`).join('')}
  ${zone(282, 166, 236, 118, '#2a1d12', '', '', 'E')}
  <text x="400" y="214" text-anchor="middle" ${FB} font-size="22" fill="#f4ede0">Lobby</text>
  <text x="400" y="234" text-anchor="middle" ${F} font-size="11.5" fill="#d8bf95">every round starts here</text>
  ${standee(376, 270, '#1fb8a6')}${standee(400, 270, '#2c66cf')}${standee(424, 270, '#ff6845')}
  ${zone(544, 166, 236, 118, '#f8f0dc', 'Gear Shop', '3 access cards + 3-card market', 'F')}
  ${slots(560, 222, 3, '#2a1d12', 38)}<line x1="676" y1="222" x2="676" y2="268" stroke="#5a4530" stroke-dasharray="3 3"/>${slots(684, 222, 3, '#b6d62d', 30)}
  ${zone(20, 310, 236, 140, '#f8f0dc', 'Rest Area', '1 Time · refill Endurance · unlimited', 'G')}
  <path d="M60 410 q20 -26 40 0 t40 0 t40 0" fill="none" stroke="#1fb8a6" stroke-width="4" stroke-linecap="round"/>
  ${zone(282, 310, 236, 140, '#f8f0dc', 'Milestones', 'the three routes everyone races', 'H')}
  ${['BEG', 'INT', 'EXP'].map((t, k) => `${cardSlot(308 + k * 66, 362, '#d8347d', 46, 62)}<text x="${331 + k * 66}" y="406" text-anchor="middle" ${FM} font-size="10" font-weight="700" fill="#2a1d12">${t}</text>`).join('')}
  ${zone(544, 310, 236, 140, '#f8f0dc', "Setter's Track", 'resets one wall each round', 'I')}
  ${['Lead', 'Top Rope', 'Boulder'].map((t, k) => `<rect x="${560 + k * 72}" y="376" width="62" height="30" rx="15" fill="${k === 0 ? '#ff6845' : '#fffaf0'}" stroke="#2a1d12" stroke-width="1.5"/><text x="${591 + k * 72}" y="395" text-anchor="middle" ${FM} font-size="10" font-weight="700" fill="#2a1d12">${t}</text>`).join('')}
  <path d="M622 391 h8 M694 391 h8" stroke="#2a1d12" stroke-width="2"/>
  <path d="M735 410 q0 22 -72 22 q-72 0 -72 -22" fill="none" stroke="#2a1d12" stroke-width="1.5" stroke-dasharray="4 3" marker-end="url(#arr)"/>
  <defs><marker id="arr" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="#2a1d12"/></marker></defs>
  <text x="663" y="447" text-anchor="middle" ${F} font-size="10.5" fill="#5a4530">token starts on Lead</text>
</svg></div>
<figcaption>The gym board for a 3-player game: <strong>2</strong> Top Rope belayer stations (one fewer than the number of players).</figcaption>`;
  },

  // Anatomy of a route card with numbered callouts.
  'route-card': () => {
    const num = (x, y, n) => `<g><circle cx="${x}" cy="${y}" r="11" fill="#ff6845" stroke="#2a1d12" stroke-width="1.5"/><text x="${x}" y="${y + 4}" text-anchor="middle" ${FB} font-size="12" fill="#2a1d12">${n}</text></g>`;
    const req = (y, abbr, val, die) => `
      <text x="72" y="${y}" ${FM} font-size="12" font-weight="700" fill="#5a4530">${abbr}</text>
      <text x="170" y="${y}" text-anchor="end" ${FB} font-size="20" fill="#2a1d12">${val}</text>
      ${die ? `<rect x="182" y="${y - 16}" width="20" height="20" rx="4" fill="${die === 'g' ? '#b6d62d' : '#ff6845'}" stroke="#2a1d12" stroke-width="1.5"/><text x="192" y="${y - 1}" text-anchor="middle" ${FB} font-size="13" fill="#2a1d12">${die === 'g' ? '−' : '+'}</text>` : ''}`;
    return `<div class="fig-split"><svg viewBox="0 0 290 380" role="img" aria-label="Anatomy of the Power Pulley route card">
  <rect x="50" y="14" width="190" height="352" rx="14" fill="#fffaf0" stroke="#2a1d12" stroke-width="2.5"/>
  <rect x="50" y="14" width="190" height="64" rx="14" fill="#ff6845"/><rect x="50" y="62" width="190" height="16" fill="#ff6845"/>
  <text x="66" y="42" ${FB} font-size="18" fill="#2a1d12">Power Pulley</text>
  <text x="66" y="64" ${FM} font-size="11" font-weight="700" fill="#2a1d12">BOULDERING · V0</text>
  <circle cx="218" cy="40" r="13" fill="#fffaf0" stroke="#2a1d12" stroke-width="1.5"/><text x="218" y="45" text-anchor="middle" ${FB} font-size="12" fill="#2a1d12">B</text>
  <rect x="66" y="88" width="88" height="20" rx="10" fill="#8857d4"/><text x="110" y="102" text-anchor="middle" ${FM} font-size="10" font-weight="700" fill="#fff">PINCH/CRIMP</text>
  ${req(140, 'STR', 22, 'g')}${req(172, 'TEC', 14, 'g')}${req(204, 'FOC', 10)}${req(236, 'FLX', 12)}
  <line x1="66" y1="258" x2="224" y2="258" stroke="#2a1d12" stroke-opacity="0.25" stroke-dasharray="4 3"/>
  <text x="72" y="284" ${FM} font-size="11" fill="#5a4530">TIME</text><text x="170" y="285" text-anchor="end" ${FB} font-size="18" fill="#2a1d12">2</text>
  <text x="72" y="310" ${FM} font-size="11" fill="#5a4530">ENDURANCE</text><text x="170" y="311" text-anchor="end" ${FB} font-size="18" fill="#2a1d12">14</text>
  <rect x="66" y="324" width="76" height="30" rx="6" fill="#b6d62d" stroke="#2a1d12" stroke-width="1.5"/><text x="104" y="344" text-anchor="middle" ${FM} font-size="11" font-weight="700" fill="#2a1d12">SEND 28</text>
  <rect x="150" y="324" width="74" height="30" rx="6" fill="#f4ede0" stroke="#2a1d12" stroke-width="1.5"/><text x="187" y="344" text-anchor="middle" ${FM} font-size="11" font-weight="700" fill="#2a1d12">FALL 10</text>
  <circle cx="206" cy="296" r="15" fill="#c4286c" stroke="#2a1d12" stroke-width="1.5"/><text x="206" y="301" text-anchor="middle" ${FB} font-size="14" fill="#fff">2</text>
  ${num(30, 46, 1)}${num(262, 40, 2)}${num(30, 98, 3)}${num(30, 186, 4)}${num(262, 160, 5)}${num(30, 296, 6)}${num(262, 339, 7)}${num(262, 280, 8)}
</svg>
<ol class="anatomy">
  <li><strong>Name, wall, and grade.</strong></li>
  <li><strong>Milestone badge.</strong> B, I, or E — only on routes that can be Milestones.</li>
  <li><strong>Tag.</strong> Matters only for specialty gear.</li>
  <li><strong>Requirements.</strong> Meet or beat all four to send.</li>
  <li><strong>Dice icons.</strong> Roll one die per icon. Green subtracts; red adds.</li>
  <li><strong>Costs.</strong> Time and Endurance, paid before you roll.</li>
  <li><strong>XP.</strong> Send XP if you succeed, Fall XP if you don't.</li>
  <li><strong>Grit.</strong> Tokens placed when the card is dealt (2 here, for a V0). The first climber to send it takes them.</li>
</ol></div>`;
  },

  // Beta die vs Crux die.
  dice: () => {
    const die = (x, y, color, pips) => {
      const pos = { 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]] }[pips];
      return `<rect x="${x}" y="${y}" width="56" height="56" rx="10" fill="${color}" stroke="#2a1d12" stroke-width="2.5"/>${pos.map(([dx, dy]) => `<circle cx="${x + 28 + dx * 14}" cy="${y + 28 + dy * 14}" r="5" fill="#2a1d12"/>`).join('')}`;
    };
    const row = (y, color, pips, label, stat, from, op, to, note) => `
      ${die(20, y, color, pips)}
      <text x="96" y="${y + 22}" ${FB} font-size="16" fill="#2a1d12">${label}</text>
      <text x="96" y="${y + 42}" ${F} font-size="12.5" fill="#5a4530">${note}</text>
      <text x="420" y="${y + 36}" ${FM} font-size="14" font-weight="700" fill="#5a4530">${stat}</text>
      <text x="470" y="${y + 38}" ${FB} font-size="24" fill="#2a1d12">${from}</text>
      <text x="512" y="${y + 38}" ${FB} font-size="24" fill="${op === '−' ? '#5c7a00' : '#c23a1c'}">${op} ${pips}</text>
      <text x="570" y="${y + 38}" ${FB} font-size="24" fill="#2a1d12">→ ${to}</text>`;
    return `<div class="fig-scroll"><svg viewBox="0 0 680 160" role="img" aria-label="A green Beta die subtracts from a requirement; a red Crux die adds to it">
  ${row(12, '#b6d62d', 4, 'Beta die (green)', 'STR', 22, '−', 18, 'Subtract. The route gets easier.')}
  ${row(88, '#ff6845', 5, 'Crux die (red)', 'FOC', 10, '+', 15, 'Add. The route gets harder.')}
</svg></div>`;
  },

  // Time track: most Time left acts next.
  'round-flow': () => {
    const xFor = (t) => 40 + (10 - t) * 60;
    const ticks = Array.from({ length: 11 }, (_, k) => 10 - k).map(t =>
      `<line x1="${xFor(t)}" y1="70" x2="${xFor(t)}" y2="82" stroke="#2a1d12" stroke-width="2"/><text x="${xFor(t)}" y="100" text-anchor="middle" ${FM} font-size="12" fill="#5a4530">${t}</text>`).join('');
    const tok = (t, color, name, y = 54) => `${standee(xFor(t), y, color)}<text x="${xFor(t)}" y="${y - 28}" text-anchor="middle" ${FB} font-size="13" fill="#2a1d12">${name}</text>`;
    return `<div class="fig-scroll"><svg viewBox="0 0 700 150" role="img" aria-label="Time track: Cal has 9 Time, Ben 8, Ana 6, so Cal acts next">
  <rect x="30" y="72" width="620" height="8" rx="4" fill="#d8bf95" stroke="#2a1d12" stroke-width="1.5"/>
  ${ticks}
  ${tok(9, '#8857d4', 'Cal')}${tok(8, '#2c66cf', 'Ben')}${tok(6, '#1fb8a6', 'Ana')}
  <text x="${xFor(9)}" y="132" text-anchor="middle" ${FB} font-size="13" fill="#c23a1c">▲ acts next</text>
  <text x="650" y="132" text-anchor="end" ${F} font-size="12" fill="#5a4530">← more Time · TIME LEFT · less Time →</text>
</svg></div>
<figcaption>The Time track after three actions from the example below. Whoever is furthest left acts next.</figcaption>`;
  },
};

// =============================================================================

const bodyHtml = blocksToHtml(md);

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>All-In Ascent Rulebook</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,500;12..96,700;12..96,800&family=Hanken+Grotesk:ital,wght@0,400;0,500;0,700;1,400;1,500&family=Geist+Mono:wght@400;500;700&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html { scroll-behavior: smooth; }

  :root {
    --wall-base: #c2a07a;
    --wall-shade: #8a6440;
    --wall-light: #d8bf95;
    --wall-deep:  #5a3f28;
    --coral:    #ff6845;
    --marigold: #ffae28;
    --lime:     #b6d62d;
    --teal:     #1fb8a6;
    --cobalt:   #2c66cf;
    --raspberry:#d8347d;
    --violet:   #8857d4;
    --chalk:    #f4ede0;
    --ink:        #2a1d12;
    --ink-soft:   #5a4530;
    --tape-cream: #f8f0dc;
    --paper:      #fffaf0;
  }

  body {
    font-family: 'Hanken Grotesk', sans-serif;
    color: var(--ink);
    background-color: var(--wall-base);
    background-image:
      radial-gradient(circle at 50% 50%, rgba(36,20,8,0.45) 1px, rgba(36,20,8,0.18) 2px, transparent 3px),
      radial-gradient(ellipse 80% 60% at 20% 10%, rgba(255,220,170,0.22), transparent 60%),
      radial-gradient(ellipse 70% 70% at 90% 95%, rgba(60,35,15,0.28), transparent 70%),
      radial-gradient(ellipse 40% 30% at 35% 60%, rgba(180,140,90,0.25), transparent 70%);
    background-size: 72px 72px, auto, auto, auto;
    background-attachment: fixed, fixed, fixed, fixed;
    line-height: 1.6;
    -webkit-font-smoothing: antialiased;
    padding: 24px;
    position: relative;
  }
  body::before {
    content: ""; position: fixed; inset: 0; pointer-events: none; z-index: 0;
    background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 240 240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='1.6' numOctaves='3' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.15  0 0 0 0 0.1  0 0 0 0 0.05  0 0 0 0.55 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>");
    mix-blend-mode: multiply; opacity: 0.6;
  }

  .page {
    position: relative; z-index: 1;
    max-width: 900px; margin: 0 auto;
    background: var(--tape-cream);
    border-radius: 12px;
    box-shadow: 0 12px 32px rgba(40,20,10,0.32), 0 24px 48px rgba(40,20,10,0.16), inset 0 1px 0 rgba(255,255,255,0.5);
    overflow: hidden;
  }
  .page::before {
    content: ""; position: absolute; inset: 0;
    background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'><filter id='p'><feTurbulence type='fractalNoise' baseFrequency='1.2' numOctaves='2'/><feColorMatrix values='0 0 0 0 0.5 0 0 0 0 0.4 0 0 0 0 0.25 0 0 0 0.18 0'/></filter><rect width='100%25' height='100%25' filter='url(%23p)'/></svg>");
    mix-blend-mode: multiply; opacity: 0.35; pointer-events: none;
  }
  .page > * { position: relative; }

  /* ---------- Holds (from the Grit & Holds system) ---------- */
  .hold {
    display: inline-block;
    border-radius: 58% 42% 55% 45% / 48% 60% 40% 52%;
    --hc: var(--c, var(--coral));
    background: radial-gradient(ellipse at 30% 28%, color-mix(in srgb, var(--hc) 55%, white) 0%, var(--hc) 45%, color-mix(in srgb, var(--hc) 70%, black) 100%);
    box-shadow: inset 3px 6px 12px rgba(255,255,255,0.35), inset -5px -8px 14px rgba(0,0,0,0.35), 4px 5px 10px rgba(40,20,10,0.4);
    position: relative;
  }
  .hold::after {
    content: ""; position: absolute; width: 18%; height: 18%; left: 41%; top: 41%;
    border-radius: 50%; background: rgba(20,10,4,0.75);
    box-shadow: inset 0 1px 2px rgba(0,0,0,0.8), 0 1px 0 rgba(255,255,255,0.25);
  }

  /* ---------- Cover ---------- */
  header {
    background: var(--ink); color: var(--chalk);
    padding: 64px 56px 48px; text-align: center;
    position: relative; overflow: hidden;
  }
  header::after {
    content: ""; position: absolute; inset: 0;
    background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 240 240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='1.6' numOctaves='3' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1 0 0 0 0 0.95 0 0 0 0 0.85 0 0 0 0.06 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>");
    pointer-events: none; opacity: 0.85;
  }
  header > * { position: relative; z-index: 1; }
  header .deco { position: absolute; z-index: 0; }
  header h1 {
    font-family: 'Bricolage Grotesque', sans-serif; font-weight: 800;
    font-variation-settings: "wdth" 110, "opsz" 96;
    font-size: clamp(2.6rem, 7vw, 4.6rem); line-height: 0.9; letter-spacing: -0.04em;
    color: var(--chalk); margin-bottom: 14px;
  }
  header h1 em { font-style: italic; font-weight: 500; color: var(--coral); }
  header .tagline {
    font-family: 'Bricolage Grotesque', sans-serif; font-weight: 700;
    font-size: clamp(1.05rem, 2.6vw, 1.4rem); color: var(--marigold); letter-spacing: 0.01em;
  }
  header .strap { margin-top: 10px; color: rgba(244,237,224,0.8); font-style: italic; }
  header .eyebrow {
    font-family: 'Geist Mono', monospace; font-size: 0.72rem; letter-spacing: 0.32em;
    text-transform: uppercase; color: rgba(244,237,224,0.6); margin-top: 22px;
  }
  header .nav-links { margin-top: 22px; display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; }
  header .nav-link {
    display: inline-block; padding: 8px 18px;
    background: var(--chalk); color: var(--ink); border: 2px solid var(--chalk); border-radius: 100px;
    text-decoration: none; font-family: 'Bricolage Grotesque', sans-serif; font-weight: 700; font-size: 0.92em;
    box-shadow: 2px 3px 0 rgba(0,0,0,0.4); transition: transform 0.15s, box-shadow 0.15s;
  }
  header .nav-link:hover { transform: translate(-1px, -1px); box-shadow: 3px 4px 0 rgba(0,0,0,0.45); }

  /* ---------- Body type ---------- */
  main { padding: 48px 56px 56px; }
  h1, h2, h3, h4 {
    font-family: 'Bricolage Grotesque', sans-serif; color: var(--ink);
    margin-top: 1.8em; margin-bottom: 0.5em; line-height: 1.15; letter-spacing: -0.02em; font-weight: 800;
  }
  main > h2:first-child { margin-top: 0; }
  h2 {
    font-size: 1.7em; padding-bottom: 6px;
    border-bottom: 3px solid var(--ink);
    display: flex; align-items: center; gap: 12px;
  }
  h2::before {
    content: ""; flex: none; width: 22px; height: 22px;
    border-radius: 58% 42% 55% 45% / 48% 60% 40% 52%;
    background: radial-gradient(ellipse at 30% 28%, #ffd2c4 0%, var(--coral) 45%, #a83a20 100%);
    box-shadow: inset 2px 3px 5px rgba(255,255,255,0.35), inset -2px -3px 5px rgba(0,0,0,0.35), 2px 2px 4px rgba(40,20,10,0.35);
  }
  h3 { font-size: 1.2em; font-weight: 700; }
  p { margin: 0.7em 0; }
  ul, ol { margin: 0.7em 0 0.7em 1.6em; }
  li { margin: 0.3em 0; }
  li > ul, li > ol { margin-top: 0.3em; }
  a { color: var(--cobalt); text-decoration: none; border-bottom: 1px solid rgba(44,102,207,0.4); }
  a:hover { border-bottom-color: var(--cobalt); }
  hr { border: none; border-top: 1px dashed rgba(40,20,10,0.25); margin: 2.4em 0; }
  code { background: rgba(40,20,10,0.08); padding: 1px 7px; border-radius: 4px; font-family: 'Geist Mono', monospace; font-size: 0.85em; color: var(--raspberry); }
  .ok { color: #3f7a10; font-weight: 700; }
  .no { color: #c23a1c; font-weight: 700; }

  /* ---------- Tables ---------- */
  .table-wrap { overflow-x: auto; margin: 1.2em 0; padding: 0 5px 6px 0; }
  table {
    width: 100%; border-collapse: collapse; font-size: 0.92em; background: white;
    border: 2px solid var(--ink); border-radius: 8px; overflow: hidden; box-shadow: 3px 4px 0 var(--ink);
  }
  th, td { padding: 9px 13px; border: 1px solid rgba(40,20,10,0.12); text-align: left; vertical-align: top; }
  th { background: var(--ink); color: var(--chalk); font-family: 'Bricolage Grotesque', sans-serif; font-weight: 700; font-size: 0.88em; letter-spacing: 0.02em; }
  tbody tr:nth-child(odd) { background: rgba(248,240,220,0.45); }

  /* ---------- Callouts ---------- */
  .callout {
    --accent: var(--marigold);
    position: relative; background: var(--paper);
    border: 2px solid var(--ink); border-left: 8px solid var(--accent);
    border-radius: 6px; padding: 22px 22px 14px; margin: 1.6em 0 1.4em;
    box-shadow: 3px 4px 0 var(--ink);
    font-size: 0.97em;
  }
  .callout p:first-of-type { margin-top: 0.2em; }
  .callout .tape {
    position: absolute; top: -13px; left: 14px;
    background: var(--accent); color: var(--ink);
    font-family: 'Geist Mono', monospace; font-weight: 700; font-size: 0.72rem;
    letter-spacing: 0.16em; text-transform: uppercase;
    padding: 3px 12px; transform: rotate(-1.5deg);
    box-shadow: 1px 2px 0 rgba(40,20,10,0.35);
    opacity: 0.95;
  }
  .callout.golden   { --accent: var(--coral); font-size: 1.12em; text-align: center; }
  .callout.remember { --accent: var(--marigold); }
  .callout.example  { --accent: var(--cobalt); background: #f4f7ff; }
  .callout.example .tape { color: white; }
  .callout.offwall  { --accent: var(--teal); background: #f0fbf9; font-style: italic; }
  .callout.offwall strong { font-style: normal; }
  .callout.coach    { --accent: var(--lime); }
  .callout.forgot   { --accent: var(--raspberry); }
  .callout.forgot .tape { color: white; }
  .callout.variant  { --accent: var(--violet); }
  .callout.variant .tape { color: white; }
  .callout.lore {
    background: var(--ink); color: var(--chalk); border-color: var(--ink); border-left-color: var(--coral);
    font-size: 1.06em; line-height: 1.7; padding: 28px 30px 18px;
    box-shadow: 4px 5px 0 var(--wall-deep);
  }
  .callout.lore p { color: var(--chalk); }
  .callout.lore strong { color: var(--marigold); }
  .callout.plain { --accent: var(--wall-shade); }

  /* ---------- Figures ---------- */
  .fig { margin: 1.6em 0; }
  .fig svg { display: block; width: 100%; height: auto; }
  .fig-scroll { overflow-x: auto; }
  .fig-gym-map .fig-scroll svg { min-width: 540px; }
  .fig-dice .fig-scroll svg { min-width: 520px; max-width: 680px; }
  .fig-round-flow .fig-scroll svg { min-width: 560px; }
  figcaption { font-size: 0.86em; color: var(--ink-soft); margin-top: 8px; text-align: center; }
  .fig-split { display: grid; grid-template-columns: minmax(200px, 290px) 1fr; gap: 24px; align-items: center; }
  .anatomy { margin: 0; padding-left: 0; list-style: none; counter-reset: a; }
  .anatomy li { counter-increment: a; position: relative; padding-left: 38px; margin: 0.55em 0; }
  .anatomy li::before {
    content: counter(a); position: absolute; left: 0; top: 0;
    width: 24px; height: 24px; border-radius: 50%; background: var(--coral); border: 1.5px solid var(--ink);
    font-family: 'Bricolage Grotesque', sans-serif; font-weight: 800; font-size: 0.8em;
    display: flex; align-items: center; justify-content: center;
  }

  /* ---------- Climber spreads ---------- */
  .climber {
    --c: var(--coral);
    margin: 2.2em 0; border: 2px solid var(--ink); border-radius: 12px; overflow: hidden;
    background: var(--paper); box-shadow: 4px 5px 0 var(--ink);
  }
  .climber-card { background: color-mix(in srgb, var(--c) 16%, var(--paper)); border-bottom: 2px solid var(--ink); padding: 20px 22px 18px; }
  .cc-head { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
  .cc-hold { width: 54px; height: 54px; flex: none; }
  .cc-title { flex: 1; min-width: 160px; }
  .cc-arch { font-family: 'Geist Mono', monospace; font-size: 0.72rem; letter-spacing: 0.18em; text-transform: uppercase; color: var(--ink-soft); }
  .cc-name { margin: 0; font-size: 1.7em; font-weight: 800; letter-spacing: -0.03em; }
  .cc-cx { display: flex; align-items: center; gap: 8px; font-size: 0.85em; }
  .cc-cx-label { font-family: 'Geist Mono', monospace; font-size: 0.72rem; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink-soft); }
  .cc-cx-word { font-weight: 700; }
  .pips { display: inline-flex; gap: 3px; }
  .pip { width: 12px; height: 12px; border-radius: 50%; border: 1.5px solid var(--ink); background: transparent; }
  .pip.on { background: var(--c); }
  .cc-stats { margin-top: 16px; display: grid; gap: 7px; }
  .cc-row { display: grid; grid-template-columns: 40px 1fr 36px 64px; align-items: center; gap: 10px; }
  .cc-abbr { font-family: 'Geist Mono', monospace; font-weight: 700; font-size: 0.78rem; }
  .cc-bar { height: 12px; background: rgba(40,20,10,0.1); border: 1.5px solid var(--ink); border-radius: 3px; overflow: hidden; }
  .cc-bar span { display: block; height: 100%; background: linear-gradient(180deg, color-mix(in srgb, var(--c) 70%, white) 0%, var(--c) 55%, color-mix(in srgb, var(--c) 80%, black) 100%); }
  .cc-row.end { margin-top: 4px; padding-top: 8px; border-top: 1px dashed rgba(40,20,10,0.25); }
  .cc-row.end .cc-bar span { background: repeating-linear-gradient(90deg, var(--c) 0 8px, color-mix(in srgb, var(--c) 70%, white) 8px 10px); }
  .cc-val { font-family: 'Bricolage Grotesque', sans-serif; font-weight: 800; text-align: right; }
  .cc-grow { font-family: 'Geist Mono', monospace; font-size: 0.78rem; color: var(--ink-soft); }
  .cc-grow small { font-size: 0.85em; opacity: 0.8; }
  .climber-body { padding: 4px 24px 14px; }
  .climber-body .callout.plain {
    border: none; box-shadow: none; background: transparent; padding: 6px 0 0; margin: 0.8em 0 0.4em;
    font-family: 'Bricolage Grotesque', sans-serif; font-size: 1.3em; font-weight: 700; color: var(--c);
    filter: brightness(0.8);
  }
  .climber-body ul { list-style: none; margin-left: 0; }
  li.edge, li.price { display: flex; gap: 10px; align-items: baseline; }
  .pm {
    flex: none; width: 22px; height: 22px; border-radius: 50%; border: 1.5px solid var(--ink);
    display: inline-flex; align-items: center; justify-content: center; font-weight: 800; font-size: 0.95em;
    transform: translateY(3px);
  }
  li.edge .pm { background: var(--lime); }
  li.price .pm { background: var(--coral); }

  h1[id], h2[id], h3[id] { scroll-margin-top: 16px; }

  @media print {
    body { background: white; padding: 0; }
    body::before { display: none; }
    .page { box-shadow: none; }
    header .nav-links { display: none; }
    .climber, .callout, .fig { break-inside: avoid; }
  }
  @media (max-width: 720px) {
    body { padding: 0; }
    .page { border-radius: 0; }
    main { padding: 28px 16px 40px; }
    header { padding: 44px 16px 32px; }
    .fig-split { grid-template-columns: 1fr; }
    .fig-split svg { max-width: 280px; margin: 0 auto; }
    .climber-body { padding: 4px 16px 12px; }
    .cc-row { grid-template-columns: 36px 1fr 30px 56px; gap: 8px; }
    h2 { font-size: 1.4em; }
    table { font-size: 0.82em; }
    th, td { padding: 7px 9px; }
  }
</style>
</head>
<body>
<div class="page">
  <header>
    <span class="hold deco" style="--c:var(--coral);width:70px;height:58px;left:6%;top:18%;transform:rotate(-14deg)"></span>
    <span class="hold deco" style="--c:var(--teal);width:44px;height:52px;left:9%;bottom:12%;transform:rotate(22deg)"></span>
    <span class="hold deco" style="--c:var(--violet);width:62px;height:48px;right:7%;top:24%;transform:rotate(10deg)"></span>
    <span class="hold deco" style="--c:var(--marigold);width:38px;height:34px;right:9%;bottom:12%"></span>
    <span class="hold deco" style="--c:var(--cobalt);width:30px;height:36px;right:28%;top:10%;transform:rotate(-30deg)"></span>
    <h1>All-In <em>Ascent.</em></h1>
    <p class="tagline">${inlineFormat(tagline)}</p>
    <p class="strap">${inlineFormat(strapline)}</p>
    <p class="eyebrow">Alpine Indoors · Official Rulebook</p>
    <div class="nav-links">
      <a class="nav-link" href="index.html">Back to Game</a>
      <a class="nav-link" href="#table-of-contents">Contents</a>
      <a class="nav-link" href="#quick-reference">Quick Reference</a>
    </div>
  </header>
  <main>
${bodyHtml}
  </main>
</div>
</body>
</html>`;

fs.writeFileSync('RULEBOOK.html', html);
console.log(`wrote RULEBOOK.html (${(html.length / 1024).toFixed(1)} KB)`);
