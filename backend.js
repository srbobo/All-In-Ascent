// All In Ascent — where the online backend lives (classic script, works from file://).
//
// The Cloudflare Worker (party/server.js, deployed with `npm run online:deploy`)
// serves online play, the telemetry store and the review queue. Every page that
// talks to it reads the production host from here: online.html,
// telemetry-client.js (local games, Project Mode submissions, review.html) and
// dashboard.js. Pages on localhost talk to their own origin instead.
//
// PRODUCTION_HOST is the host `npm run online:deploy` prints (the Worker's
// workers.dev address); change it here if the Worker moves to a custom domain.

(function () {
  const PRODUCTION_HOST = 'all-in-ascent.all-in-ascent.workers.dev';

  window.AscentBackend = {
    PRODUCTION_HOST,
    // Is a page on this hostname served by a backend (the Worker, or a local
    // `wrangler dev` / e2e server), so it can use its own origin?
    servedByBackend(hostname) {
      return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0'
        || hostname === PRODUCTION_HOST || hostname.endsWith('.workers.dev');
    },
  };
})();
