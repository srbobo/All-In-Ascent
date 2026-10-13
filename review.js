// All In Ascent — the designer's review queue (review.html; classic script).
//
// Lists every Project Mode submission stored by the submissions party
// (party/submissions.js), previews each card with the board's own renderer
// and lets the designer approve, reject or delete it, or add it to this
// browser's workshop to play it. Reading may need SUBMISSIONS_READ_TOKEN and
// changing anything needs SUBMISSIONS_ADMIN_TOKEN; both are asked for once
// and kept in this browser.
//
// Where it reads from (as telemetry-client.js decides): ?telemetry=<host>,
// the same origin on localhost, else the production PartyKit host.

(function () {
  'use strict';
  const E = window.AscentEngine;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (id) => document.getElementById(id);
  const READ_TOKEN_KEY = 'all-in-ascent.submissions-read-token';
  const ADMIN_TOKEN_KEY = 'all-in-ascent.submissions-admin-token';
  const KIND_LABELS = { character: 'Climber', route: 'Route', gear: 'Gear' };

  let submissions = [];

  const tokenStore = {
    get(k) { try { return localStorage.getItem(k) || ''; } catch { return ''; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } },
  };

  function base() {
    return AscentTelemetry.endpointFor(AscentTelemetry.SUBMISSIONS_PATH);
  }

  function withToken(url, token) {
    if (!token) return url;
    return `${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`;
  }

  async function load() {
    const root = base();
    const label = $('sourceLabel');
    if (!root) { label.textContent = 'Submissions are off on this page.'; return; }
    label.textContent = 'Loading…';
    let token = tokenStore.get(READ_TOKEN_KEY) || tokenStore.get(ADMIN_TOKEN_KEY);
    const all = [];
    let after = null;
    for (let guard = 0; guard < 100; guard++) {
      const url = withToken(`${root}?list=1&limit=500${after ? `&after=${encodeURIComponent(after)}` : ''}`, token);
      let res;
      try { res = await fetch(url); } catch (e) { label.textContent = `Could not reach ${new URL(root).host}: ${e.message}`; return; }
      if (res.status === 401) {
        token = prompt('This review queue needs a read token:') || '';
        if (!token) { label.textContent = 'A read token is needed.'; return; }
        tokenStore.set(READ_TOKEN_KEY, token);
        guard--;
        continue;
      }
      if (!res.ok) { label.textContent = `Server error ${res.status}.`; return; }
      const body = await res.json();
      all.push(...(body.submissions || []));
      if (!body.next) break;
      after = body.next;
    }
    submissions = all.sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0));
    label.textContent = `${submissions.length} submission${submissions.length === 1 ? '' : 's'} from ${new URL(root).host}`;
    render();
  }

  function compiled(sub) {
    if (sub.kind === 'character') return E.compileCharacter(sub.definition);
    if (sub.kind === 'route') return E.compileRoute(sub.definition);
    return E.compileGear(sub.definition);
  }

  function cardFor(sub) {
    const c = compiled(sub);
    if (!c.ok) {
      const p = document.createElement('p');
      p.className = 'pm-note';
      p.textContent = `This card no longer works with rules engine ${E.ENGINE_VERSION_STRING}: ${c.errors[0].message}`;
      return p;
    }
    if (sub.kind === 'character') return AIACards.climber(c.value.key, c.value);
    if (sub.kind === 'route') return AIACards.route(c.value, { area: c.value.area, grit: E.routeGritValue(E.GRIT_RULES, c.value) });
    return AIACards.gear(c.value, { currency: 'grit', price: c.value.gritCost });
  }

  function rulesText(sub) {
    const d = sub.definition || {};
    if (sub.kind === 'route') {
      return `${d.area} · ${d.grade} · ${d.routeType} · STR ${d.strength} TEC ${d.technique} FOC ${d.focus} FLX ${d.flexibility} · ${d.time} Time, ${d.endurance} END · ${(d.rollEffect || []).length} dice${d.tag ? ` · ${d.tag}` : ''}`;
    }
    return E.describeRules(d.rules || []) || 'No rules.';
  }

  function visible() {
    const kind = $('fKind').value;
    const status = $('fStatus').value;
    return submissions.filter(s => (kind === 'all' || s.kind === kind) && (status === 'all' || (s.status || 'new') === status));
  }

  function render() {
    const rows = visible();
    const host = $('queue');
    host.innerHTML = '';
    $('count').textContent = `${rows.length} of ${submissions.length}`;
    $('empty').hidden = rows.length > 0;
    for (const sub of rows) {
      const item = document.createElement('article');
      item.className = 'rv-item paper';
      item.dataset.id = sub.id;
      item.dataset.kind = sub.kind;
      item.dataset.testid = 'submission';
      const preview = document.createElement('div');
      preview.appendChild(cardFor(sub));
      const body = document.createElement('div');
      const status = sub.status || 'new';
      body.innerHTML = `
        <h3>${esc(sub.definition && sub.definition.name)} <span class="aia-chip aia-chip--ink">${esc(KIND_LABELS[sub.kind] || sub.kind)}</span></h3>
        <dl>
          <dt>Status</dt><dd><span class="rv-status rv-status--${esc(status)}" data-testid="status">${esc(status)}</span></dd>
          <dt>From</dt><dd>${esc(sub.author || 'anonymous')}</dd>
          <dt>Sent</dt><dd>${sub.submittedAt ? esc(new Date(sub.submittedAt).toLocaleString()) : '—'} · engine ${esc(sub.engineVersion)}</dd>
          <dt>Note</dt><dd>${esc(sub.note || '—')}</dd>
          <dt>Id</dt><dd><code>${esc(sub.id)}</code></dd>
        </dl>
        <p class="rv-rules">${esc(rulesText(sub))}</p>
        <div class="rv-actions">
          <button class="btn btn--lime" type="button" data-status="approved">Approve</button>
          <button class="btn btn--raspberry" type="button" data-status="rejected">Reject</button>
          <button class="btn btn--ghost" type="button" data-status="new">Back to new</button>
          <button class="btn btn--ghost" type="button" data-workshop>Add to my workshop</button>
          <button class="btn btn--ghost" type="button" data-copy title="Copy the card's definition to paste elsewhere">Copy card</button>
          <button class="btn btn--ghost" type="button" data-delete>Delete</button>
        </div>`;
      item.append(preview, body);
      host.appendChild(item);
    }
  }

  function adminToken() {
    let token = tokenStore.get(ADMIN_TOKEN_KEY);
    if (!token) {
      token = prompt('Admin token (SUBMISSIONS_ADMIN_TOKEN):') || '';
      if (token) tokenStore.set(ADMIN_TOKEN_KEY, token);
    }
    return token;
  }

  async function adminCall(method, query) {
    const token = adminToken();
    if (!token) return { ok: false, error: 'no admin token' };
    const res = await fetch(withToken(`${base()}${query}`, token), { method });
    if (res.status === 401) { tokenStore.set(ADMIN_TOKEN_KEY, ''); return { ok: false, error: 'admin token refused' }; }
    const body = await res.json().catch(() => ({}));
    return res.ok ? { ok: true, ...body } : { ok: false, error: body.error || `HTTP ${res.status}` };
  }

  function banner(text, bad = false) {
    const b = $('banner');
    b.innerHTML = text ? `<p class="pm-status ${bad ? 'is-bad' : 'is-ok'}" role="status">${esc(text)}</p>` : '';
  }

  async function onQueueClick(e) {
    const btn = e.target.closest('button');
    if (!btn) return;
    const item = btn.closest('.rv-item');
    const sub = submissions.find(s => s.id === item.dataset.id);
    if (!sub) return;
    if (btn.dataset.status) {
      const r = await adminCall('PATCH', `?id=${encodeURIComponent(sub.id)}&status=${btn.dataset.status}`);
      if (r.ok) { sub.status = btn.dataset.status; banner(`${sub.definition.name}: ${btn.dataset.status}.`); render(); } else banner(r.error, true);
    } else if (btn.dataset.delete !== undefined) {
      if (!confirm(`Delete the submission "${sub.definition.name}"?`)) return;
      const r = await adminCall('DELETE', `?id=${encodeURIComponent(sub.id)}`);
      if (r.ok) { submissions = submissions.filter(s => s.id !== sub.id); banner('Deleted.'); render(); } else banner(r.error, true);
    } else if (btn.dataset.workshop !== undefined) {
      const saved = AscentWorkshop.save(sub.kind, { ...sub.definition, reviewOf: sub.id });
      banner(`"${saved.name}" added to your workshop (project.html).`);
    } else if (btn.dataset.copy !== undefined) {
      const text = JSON.stringify(sub.definition, null, 2);
      try { await navigator.clipboard.writeText(text); banner('Card copied.'); } catch { prompt('Copy the card:', text); }
    }
  }

  function exportAll() {
    const blob = new Blob([submissions.map(s => JSON.stringify(s)).join('\n')], { type: 'application/x-ndjson' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'all-in-ascent-submissions.jsonl';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function boot() {
    if (window.AIAArt && AIAArt.mount) AIAArt.mount();
    $('reloadBtn').addEventListener('click', load);
    $('fKind').addEventListener('change', render);
    $('fStatus').addEventListener('change', render);
    $('exportBtn').addEventListener('click', exportAll);
    $('queue').addEventListener('click', onQueueClick);
    load();
  }

  window.AscentReview = { get submissions() { return submissions; }, load };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
