// Convert RULEBOOK.md → RULEBOOK.html with the Grit & Holds visual language
// (sandstone + tape-cream, polychrome holds, Bricolage Grotesque + Hanken
// Grotesk + Geist Mono). Strips all emoji glyphs from the source so the
// rendered page reads as a typeset document, not an emoji-laden web page.
//
// USAGE:  node analysis/build-rulebook-html.js
//
// Output: writes RULEBOOK.html to the project root.

import fs from 'node:fs';

// Strip emoji glyphs (and zero-width joiners + variation selectors) from text.
// Keeps ASCII punctuation and standard Unicode letters intact.
function stripEmoji(text) {
  return text
    // Major emoji blocks
    .replace(/[\u{1F300}-\u{1F9FF}]/gu, '')
    .replace(/[\u{1FA00}-\u{1FAFF}]/gu, '')
    .replace(/[\u{2600}-\u{27BF}]/gu, '')   // misc symbols + dingbats (✨ ⭐ ✓ etc.)
    .replace(/[\u{2300}-\u{23FF}]/gu, '')   // misc technical (⏰ ⏱)
    .replace(/[\u{2B00}-\u{2BFF}]/gu, '')   // misc symbols and arrows
    .replace(/[\u{1F000}-\u{1F02F}]/gu, '')
    .replace(/[\u{1F0A0}-\u{1F0FF}]/gu, '')
    .replace(/️/g, '')                 // variation selector
    .replace(/‍/g, '')                 // zero-width joiner
    // Collapse runs of whitespace introduced by stripped emojis
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/^\s+|\s+$/gm, (m) => m.includes('\n') ? m : '');
}

const md = stripEmoji(fs.readFileSync('RULEBOOK.md', 'utf8'));

// --- Inline formatters (order matters) ---
function inlineFormat(text) {
  return text
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>');
}

// Heading id: lowercase, strip punctuation, spaces -> hyphens
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
  const cells = (line) =>
    line.split('|').slice(1, -1).map(c => c.trim());
  const headers = cells(lines[0]);
  const rows = lines.slice(2).map(cells);
  return `<table>
<thead><tr>${headers.map(h => `<th>${inlineFormat(h)}</th>`).join('')}</tr></thead>
<tbody>${rows.map(r => `<tr>${r.map(c => `<td>${inlineFormat(c)}</td>`).join('')}</tr>`).join('\n')}</tbody>
</table>`;
}

function mdBlocksToHtml(md) {
  const lines = md.split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    const head = line.match(/^(#{1,6})\s+(.+)$/);
    if (head) {
      const lvl = head[1].length;
      const text = head[2].replace(/\s+$/, '');
      out.push(`<h${lvl} id="${slugify(text)}">${inlineFormat(text)}</h${lvl}>`);
      i++; continue;
    }
    if (/^---+\s*$/.test(line)) { out.push('<hr>'); i++; continue; }
    if (/^>\s?/.test(line)) {
      const block = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        block.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      out.push(`<blockquote>${block.map(l => inlineFormat(l)).join('<br>')}</blockquote>`);
      continue;
    }
    if (line.startsWith('|')) {
      const tbl = [];
      while (i < lines.length && lines[i].startsWith('|')) { tbl.push(lines[i]); i++; }
      out.push(parseTable(tbl));
      continue;
    }
    if (/^-\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^-\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^-\s+/, ''));
        i++;
      }
      out.push(`<ul>${items.map(it => `<li>${inlineFormat(it)}</li>`).join('')}</ul>`);
      continue;
    }
    if (/^\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s+/, ''));
        i++;
      }
      out.push(`<ol>${items.map(it => `<li>${inlineFormat(it)}</li>`).join('')}</ol>`);
      continue;
    }
    const para = [];
    while (
      i < lines.length && lines[i].trim() &&
      !/^#{1,6}\s+/.test(lines[i]) &&
      !/^---+\s*$/.test(lines[i]) &&
      !/^>\s?/.test(lines[i]) &&
      !lines[i].startsWith('|') &&
      !/^-\s+/.test(lines[i]) &&
      !/^\d+\.\s+/.test(lines[i])
    ) {
      para.push(lines[i]);
      i++;
    }
    if (para.length) out.push(`<p>${inlineFormat(para.join(' '))}</p>`);
  }
  return out.join('\n');
}

const bodyHtml = mdBlocksToHtml(md);

// --- Grit & Holds page template ---
const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>All-In Ascent — Rulebook</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,500;12..96,700;12..96,800&family=Hanken+Grotesk:wght@400;500;700&family=Geist+Mono:wght@400;500;700&display=swap" rel="stylesheet">
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
  }

  /* Sandstone wall body */
  body {
    font-family: 'Hanken Grotesk', sans-serif;
    color: var(--ink);
    background-color: var(--wall-base);
    background-image:
      radial-gradient(circle at 50% 50%,
        rgba(36,20,8,0.45) 1px, rgba(36,20,8,0.18) 2px, transparent 3px),
      radial-gradient(ellipse 80% 60% at 20% 10%,
        rgba(255,220,170,0.22), transparent 60%),
      radial-gradient(ellipse 70% 70% at 90% 95%,
        rgba(60,35,15,0.28), transparent 70%),
      radial-gradient(ellipse 40% 30% at 35% 60%,
        rgba(180,140,90,0.25), transparent 70%);
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

  /* Tape-cream container — pinned to the wall */
  .page {
    position: relative;
    z-index: 1;
    max-width: 880px;
    margin: 0 auto;
    background: var(--tape-cream);
    border-radius: 12px;
    box-shadow:
      0 12px 32px rgba(40,20,10,0.32),
      0 24px 48px rgba(40,20,10,0.16),
      inset 0 1px 0 rgba(255,255,255,0.5);
    overflow: hidden;
  }
  .page::before {
    content: ""; position: absolute; inset: 0;
    background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'><filter id='p'><feTurbulence type='fractalNoise' baseFrequency='1.2' numOctaves='2'/><feColorMatrix values='0 0 0 0 0.5 0 0 0 0 0.4 0 0 0 0 0.25 0 0 0 0.18 0'/></filter><rect width='100%25' height='100%25' filter='url(%23p)'/></svg>");
    mix-blend-mode: multiply; opacity: 0.35;
    pointer-events: none;
  }
  .page > * { position: relative; }

  /* Ink slab header */
  header {
    background: var(--ink);
    color: var(--chalk);
    padding: 48px 56px 40px;
    text-align: center;
    position: relative;
    overflow: hidden;
  }
  header::after {
    content: ""; position: absolute; inset: 0;
    background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 240 240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='1.6' numOctaves='3' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1 0 0 0 0 0.95 0 0 0 0 0.85 0 0 0 0.06 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>");
    pointer-events: none; opacity: 0.85;
  }
  header > * { position: relative; z-index: 1; }
  header h1 {
    font-family: 'Bricolage Grotesque', sans-serif;
    font-weight: 800;
    font-variation-settings: "wdth" 110, "opsz" 96;
    font-size: clamp(2.4rem, 5.5vw, 4rem);
    line-height: 0.9;
    letter-spacing: -0.04em;
    color: var(--chalk);
    margin-bottom: 8px;
  }
  header h1 em { font-style: italic; font-weight: 500; color: var(--coral); }
  header .eyebrow {
    font-family: 'Geist Mono', monospace;
    font-size: 0.75rem;
    letter-spacing: 0.32em;
    text-transform: uppercase;
    color: rgba(244,237,224,0.72);
    margin-top: 8px;
  }
  header .eyebrow::before { content: "▸ "; color: var(--coral); margin-right: 0.4rem; }
  header .nav-links {
    margin-top: 22px;
    display: flex;
    gap: 10px;
    justify-content: center;
    flex-wrap: wrap;
  }
  header .nav-link {
    display: inline-block;
    padding: 8px 18px;
    background: var(--chalk);
    color: var(--ink);
    border: 2px solid var(--chalk);
    border-radius: 100px;
    text-decoration: none;
    font-family: 'Bricolage Grotesque', sans-serif;
    font-weight: 700;
    font-size: 0.92em;
    letter-spacing: 0.02em;
    box-shadow: 2px 3px 0 rgba(0,0,0,0.4);
    transition: transform 0.15s, box-shadow 0.15s;
  }
  header .nav-link:hover {
    transform: translate(-1px, -1px);
    box-shadow: 3px 4px 0 rgba(0,0,0,0.45);
  }

  /* Content body */
  main { padding: 48px 56px 56px; }
  h1, h2, h3, h4, h5, h6 {
    font-family: 'Bricolage Grotesque', sans-serif;
    color: var(--ink);
    margin-top: 1.8em;
    margin-bottom: 0.5em;
    line-height: 1.15;
    letter-spacing: -0.02em;
    font-weight: 800;
  }
  main > h1:first-child, main > h2:first-child { margin-top: 0; }
  h1 {
    font-size: 2em;
    border-bottom: 2px solid rgba(40,20,10,0.2);
    padding-bottom: 8px;
  }
  h2 {
    font-size: 1.55em;
    padding-bottom: 6px;
    border-bottom: 2px dashed rgba(40,20,10,0.2);
  }
  h3 {
    font-size: 1.18em;
    color: var(--ink);
    font-weight: 700;
  }
  h3 em { font-style: italic; font-weight: 500; color: var(--raspberry); }
  h4 {
    font-size: 1rem;
    color: var(--ink-soft);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-weight: 700;
    font-family: 'Geist Mono', monospace;
  }

  p { margin: 0.7em 0; color: var(--ink); }
  ul, ol { margin: 0.7em 0 0.7em 1.6em; }
  li { margin: 0.3em 0; }
  a { color: var(--cobalt); text-decoration: none; border-bottom: 1px solid rgba(44,102,207,0.4); }
  a:hover { border-bottom-color: var(--cobalt); }

  hr {
    border: none;
    border-top: 1px dashed rgba(40,20,10,0.25);
    margin: 2.2em 0;
  }
  blockquote {
    background: white;
    border-left: 4px solid var(--marigold);
    padding: 14px 20px;
    margin: 1.2em 0;
    border-radius: 4px;
    box-shadow: 2px 3px 0 var(--ink), 2px 3px 12px rgba(40,20,10,0.12);
    color: var(--ink);
    font-size: 0.95em;
  }
  code {
    background: rgba(40,20,10,0.08);
    padding: 1px 7px;
    border-radius: 4px;
    font-family: 'Geist Mono', monospace;
    font-size: 0.85em;
    color: var(--raspberry);
  }
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 1.2em 0;
    font-size: 0.92em;
    background: white;
    border: 2px solid var(--ink);
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 3px 4px 0 var(--ink);
  }
  th, td {
    padding: 10px 14px;
    border: 1px solid rgba(40,20,10,0.12);
    text-align: left;
    vertical-align: top;
  }
  th {
    background: var(--ink);
    color: var(--chalk);
    font-family: 'Bricolage Grotesque', sans-serif;
    font-weight: 700;
    letter-spacing: 0.02em;
    font-size: 0.88em;
  }
  tbody tr:nth-child(odd) { background: rgba(248,240,220,0.4); }

  ol.toc-list, ul.toc-list { padding-left: 1.4em; }
  /* Anchor offset */
  h1[id], h2[id], h3[id] { scroll-margin-top: 16px; }

  /* Print friendliness */
  @media print {
    body { background: white; }
    body::before { display: none; }
    .page { box-shadow: none; }
    header .nav-links { display: none; }
  }
  /* Mobile */
  @media (max-width: 720px) {
    main { padding: 28px 24px 40px; }
    header { padding: 32px 24px 28px; }
    header h1 { font-size: 1.9em; }
  }
</style>
</head>
<body>
<div class="page">
  <header>
    <h1>All-In <em>Ascent.</em></h1>
    <p class="eyebrow">Alpine Indoors · Official Rulebook</p>
    <div class="nav-links">
      <a class="nav-link" href="index.html">Back to Game</a>
      <a class="nav-link" href="#table-of-contents">Table of Contents</a>
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
