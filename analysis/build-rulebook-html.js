// Convert RULEBOOK.md → RULEBOOK.html with styling that matches the game's
// visual identity (dark gradient header, clean typography, readable line length).
//
// Why a custom converter and not e.g. `marked`?
//   No npm dependency required. The rulebook uses a constrained subset of
//   markdown (headings, tables, lists, blockquotes, bold/italic, inline code,
//   links, horizontal rules) — all handleable in ~100 lines. Re-run any time
//   the markdown changes.
//
// USAGE:
//   node analysis/build-rulebook-html.js
//
// Output: writes RULEBOOK.html to the project root.

import fs from 'node:fs';

const md = fs.readFileSync('RULEBOOK.md', 'utf8');

// --- Inline formatters (order matters: code first, then links, then bold, then italic). ---
function inlineFormat(text) {
  return text
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>');
}

// --- Heading ID slugger (lowercase, strip emoji + punctuation, spaces → hyphens) ---
// "## GAME OVERVIEW" → id="game-overview"
// "🧗 ALL-IN ASCENT" → "all-in-ascent"
function slugify(text) {
  return text
    .replace(/\*\*/g, '')
    .replace(/`/g, '')
    .replace(/[^\w\s-]/g, '')   // strips emoji + punctuation
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

// --- Table parser ---
// Input: an array of lines, each starting with '|'.
// Format: line 0 is header, line 1 is the separator (|---|---|), the rest are rows.
function parseTable(lines) {
  if (lines.length < 2) return '';
  const cells = (line) =>
    line.split('|')
      .slice(1, -1)            // drop the leading and trailing empty splits
      .map(c => c.trim());
  const headers = cells(lines[0]);
  const rows = lines.slice(2).map(cells);
  return `<table>
<thead><tr>${headers.map(h => `<th>${inlineFormat(h)}</th>`).join('')}</tr></thead>
<tbody>${rows.map(r => `<tr>${r.map(c => `<td>${inlineFormat(c)}</td>`).join('')}</tr>`).join('\n')}</tbody>
</table>`;
}

// --- Block-level converter (line-by-line state machine) ---
function mdBlocksToHtml(md) {
  const lines = md.split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Skip blank lines.
    if (!line.trim()) { i++; continue; }

    // Heading (1-6 hashes, then space, then text).
    const head = line.match(/^(#{1,6})\s+(.+)$/);
    if (head) {
      const lvl = head[1].length;
      const text = head[2].replace(/\s+$/, '');
      out.push(`<h${lvl} id="${slugify(text)}">${inlineFormat(text)}</h${lvl}>`);
      i++; continue;
    }

    // Horizontal rule (3+ dashes alone on a line).
    if (/^---+\s*$/.test(line)) {
      out.push('<hr>');
      i++; continue;
    }

    // Blockquote (one or more `>`-prefixed lines).
    if (/^>\s?/.test(line)) {
      const block = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        block.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      out.push(`<blockquote>${block.map(l => inlineFormat(l)).join('<br>')}</blockquote>`);
      continue;
    }

    // Table (consecutive lines starting with '|').
    if (line.startsWith('|')) {
      const tbl = [];
      while (i < lines.length && lines[i].startsWith('|')) {
        tbl.push(lines[i]);
        i++;
      }
      out.push(parseTable(tbl));
      continue;
    }

    // Unordered list (lines beginning with '- '). Allow blank lines inside? No: stop at blank.
    if (/^-\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^-\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^-\s+/, ''));
        i++;
      }
      out.push(`<ul>${items.map(it => `<li>${inlineFormat(it)}</li>`).join('')}</ul>`);
      continue;
    }

    // Ordered list (lines beginning with '<digit>. ').
    if (/^\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s+/, ''));
        i++;
      }
      out.push(`<ol>${items.map(it => `<li>${inlineFormat(it)}</li>`).join('')}</ol>`);
      continue;
    }

    // Default: paragraph — collect consecutive non-block lines.
    const para = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
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

// --- Page template (matches the game's visual identity from index.html) ---
const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>All-In Ascent — Rulebook</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    line-height: 1.6;
    color: #2c3e50;
    background: #f0f2f5;
  }
  .page {
    max-width: 880px;
    margin: 0 auto;
    background: white;
    box-shadow: 0 0 24px rgba(0,0,0,0.08);
    min-height: 100vh;
  }
  header {
    background: linear-gradient(135deg, #2c3e50 0%, #34495e 100%);
    color: white;
    padding: 36px 40px;
    text-align: center;
  }
  header h1 { font-size: 2.4em; margin-bottom: 6px; }
  header p { opacity: 0.9; font-size: 1.05em; }
  header .nav-links {
    margin-top: 16px;
    display: flex;
    gap: 10px;
    justify-content: center;
  }
  header .nav-link {
    display: inline-block;
    padding: 6px 14px;
    background: rgba(255,255,255,0.15);
    border: 1px solid rgba(255,255,255,0.3);
    border-radius: 20px;
    color: white;
    text-decoration: none;
    font-size: 0.95em;
    transition: background 0.15s, border-color 0.15s;
  }
  header .nav-link:hover {
    background: rgba(255,255,255,0.28);
    border-color: rgba(255,255,255,0.6);
  }
  main { padding: 40px 56px 56px 56px; }
  h1, h2, h3, h4, h5, h6 {
    color: #2c3e50;
    margin-top: 1.6em;
    margin-bottom: 0.5em;
    line-height: 1.25;
  }
  /* The first heading inside <main> shouldn't have a top margin — it would
     duplicate the header's spacing. */
  main > h1:first-child, main > h2:first-child { margin-top: 0; }
  h1 { font-size: 2em; border-bottom: 2px solid #e0e4e8; padding-bottom: 8px; }
  h2 { font-size: 1.55em; border-bottom: 1px solid #e0e4e8; padding-bottom: 6px; }
  h3 { font-size: 1.2em; }
  h4 { font-size: 1.05em; color: #455a64; }
  p { margin: 0.7em 0; }
  ul, ol { margin: 0.7em 0 0.7em 1.6em; }
  li { margin: 0.3em 0; }
  a { color: #3498db; text-decoration: none; }
  a:hover { text-decoration: underline; }
  hr {
    border: none;
    border-top: 1px solid #e0e4e8;
    margin: 2em 0;
  }
  blockquote {
    border-left: 4px solid #3498db;
    background: #f5f8fa;
    padding: 12px 18px;
    margin: 1em 0;
    border-radius: 4px;
    color: #455a64;
  }
  code {
    background: #f3f5f7;
    padding: 1px 6px;
    border-radius: 3px;
    font-family: 'SF Mono', Menlo, Consolas, monospace;
    font-size: 0.92em;
    color: #c0392b;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 1em 0;
    font-size: 0.94em;
  }
  th, td {
    padding: 8px 12px;
    border: 1px solid #e0e4e8;
    text-align: left;
    vertical-align: top;
  }
  th {
    background: #f5f8fa;
    font-weight: 600;
  }
  tbody tr:nth-child(even) { background: #fafbfc; }
  /* Make the table-of-contents list section flow nicely */
  ol li { margin: 0.25em 0; }
  /* Anchor offset so headings aren't hidden under any sticky elements */
  h1[id], h2[id], h3[id] { scroll-margin-top: 16px; }
  /* Print friendliness */
  @media print {
    body { background: white; }
    .page { box-shadow: none; }
    header .nav-links { display: none; }
  }
  /* Mobile */
  @media (max-width: 720px) {
    main { padding: 24px 20px 40px; }
    header { padding: 28px 20px; }
    header h1 { font-size: 1.8em; }
  }
</style>
</head>
<body>
<div class="page">
  <header>
    <h1>🧗 All-In Ascent</h1>
    <p>Alpine Indoors Rock Climbing Board Game — Official Rulebook</p>
    <div class="nav-links">
      <a class="nav-link" href="index.html">← Back to Game</a>
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
const sizeKB = (html.length / 1024).toFixed(1);
console.log(`wrote RULEBOOK.html (${sizeKB} KB, ${html.split('\n').length} lines)`);
