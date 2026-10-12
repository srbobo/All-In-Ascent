// All In Ascent — feature flags (classic script, works from file://).
//
// Experimental features ship behind a flag that is off by default. A flag is
// kept per browser in localStorage, and can be switched from the URL:
//
//   ?projectMode=on    turn Project Mode on (remembered)
//   ?projectMode=off   turn it off (remembered)
//
// or from the console: AscentFlags.set('projectMode', true).
//
// Flags:
//   projectMode  Project Mode — build your own climbers, route cards and gear
//                (project.html) and play them in local games.

(function () {
  const STORAGE_KEY = 'all-in-ascent.flags';
  const KNOWN = ['projectMode'];

  function read() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  function write(flags) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(flags)); } catch { /* storage blocked: session only */ }
  }

  let flags = read();

  // The URL may switch a flag; the choice is remembered.
  try {
    const params = new URLSearchParams(window.location.search);
    for (const name of KNOWN) {
      const v = params.get(name);
      if (v === null) continue;
      flags[name] = ['on', '1', 'true'].includes(v.toLowerCase());
    }
    write(flags);
  } catch { /* no URL (e.g. tests) */ }

  function isOn(name) {
    return flags[name] === true;
  }

  function set(name, on) {
    flags = { ...flags, [name]: !!on };
    write(flags);
    document.dispatchEvent(new CustomEvent('ascent-flags', { detail: { name, on: !!on } }));
  }

  function all() {
    const out = {};
    for (const name of KNOWN) out[name] = isOn(name);
    return out;
  }

  // Elements marked data-flag="<name>" are shown only while that flag is on.
  function applyToDom() {
    for (const el of document.querySelectorAll('[data-flag]')) {
      el.hidden = !isOn(el.getAttribute('data-flag'));
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', applyToDom);
  else applyToDom();
  document.addEventListener('ascent-flags', applyToDom);

  window.AscentFlags = { isOn, set, all, KNOWN };
})();
