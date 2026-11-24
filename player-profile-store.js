// All In Ascent — the player's profile in this browser (classic script,
// works from file://).
//
// The profile (engine/player-profile.js: rating against CPUs, record, style)
// lives only here, in localStorage, in local and online play alike: the
// engine computes it, this file only loads and saves it. Online, the client
// sends just the rating to the room, so an Adaptive CPU can play at it.
//
//   AscentProfile.load()                     → the profile (a new one if none or unreadable)
//   AscentProfile.record(state, seat, seats) → fold a finished game in, save, return the change
//   AscentProfile.reset()                    → forget it

(function () {
  const KEY = 'all-in-ascent.profile';

  function engine() {
    return window.AscentEngine;
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      return engine().sanitizeProfile(raw ? JSON.parse(raw) : null);
    } catch {
      return engine().emptyProfile();
    }
  }

  function save(profile) {
    try { localStorage.setItem(KEY, JSON.stringify(profile)); } catch { /* storage blocked: kept for this page only */ }
  }

  function record(state, seat, seats) {
    const { profile, change } = engine().updateProfile(load(), state, { seat, seats });
    save(profile);
    return change;
  }

  function reset() {
    try { localStorage.removeItem(KEY); } catch { /* storage blocked */ }
  }

  window.AscentProfile = { KEY, load, save, record, reset };
})();
