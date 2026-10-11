// All In Ascent — browser telemetry client (classic script, works from file://).
//
// Sends the anonymous match record of a finished LOCAL game
// (AscentEngine.buildMatchRecord) to the telemetry party (party/telemetry.js)
// for the designer's dashboard. Online games are recorded by the PartyKit
// GameRoom itself, so online play never calls this.
//
// Where records go (same host logic as online.html):
//   ?telemetry=off          → nothing is sent from this page
//   ?telemetry=<host>       → that PartyKit host (e.g. 127.0.0.1:1999)
//   page on localhost       → the same origin (`npm run online:dev`, the e2e server)
//   anywhere else / file:// → the production PartyKit host
//
// Players can switch sharing off for their browser (the footer checkbox in
// index.html); the choice is kept in localStorage.

(function () {
  const PRODUCTION_PARTYKIT_HOST = 'all-in-ascent.srbobo.partykit.dev';
  const STORAGE_KEY = 'all-in-ascent.telemetry';
  const PATH = '/parties/telemetry/global';

  function endpoint() {
    const override = new URLSearchParams(window.location.search).get('telemetry');
    if (override === 'off') return null;
    if (override) {
      const host = override.trim();
      const local = /^(127\.0\.0\.1|localhost|0\.0\.0\.0)(:|$)/.test(host);
      return `${local ? 'http' : 'https'}://${host}${PATH}`;
    }
    const h = window.location.hostname;
    if (h === '127.0.0.1' || h === 'localhost' || h === '0.0.0.0') return window.location.origin + PATH;
    return `https://${PRODUCTION_PARTYKIT_HOST}${PATH}`;
  }

  function enabled() {
    try { return localStorage.getItem(STORAGE_KEY) !== 'off'; } catch { return true; }
  }

  function setEnabled(on) {
    try { localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off'); } catch { /* storage blocked: stays on */ }
  }

  function newId(prefix) {
    const rand = (window.crypto && window.crypto.randomUUID)
      ? window.crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    return `${prefix}-${rand}`;
  }

  // POST the record. text/plain keeps it a "simple" request (no CORS
  // preflight). Resolves to true when the server stored it; never throws.
  async function sendMatch(record) {
    const url = endpoint();
    if (!url || !enabled()) return false;
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify(record), keepalive: true });
      return res.ok;
    } catch {
      return false;
    }
  }

  // Footer opt-out checkbox (index.html #telemetryOptIn).
  function bindToggle() {
    const box = document.getElementById('telemetryOptIn');
    if (!box) return;
    box.checked = enabled();
    box.addEventListener('change', () => setEnabled(box.checked));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindToggle);
  else bindToggle();

  window.AscentTelemetry = { endpoint, enabled, setEnabled, newId, sendMatch };
})();
