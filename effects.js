// All In Ascent — Chalk & Friction micro-experiences module.
//
// Self-contained animation/UX layer. Loaded via <script src="effects.js">
// BEFORE game.js so game.js can call window.Effects.* hooks.
//
// Design rules:
//   - Tactile, physical. Spring-damped settles, not linear slides.
//   - Restrained palette (chalk-cream + ink + the Grit & Holds polychrome holds).
//   - Every effect runs in a floating overlay layer (#effects-layer) so it
//     never conflicts with the main render cycle's destroy/recreate of DOM.
//   - All effects degrade gracefully if elements are missing.
//
// Public API (window.Effects):
//   floatNumber(targetEl, text, kind)       -> '+15 XP' floats up; kind in {xp, endurance-gain, endurance-loss, time, stat}
//   chalkPuff(targetEl, color)              -> a small chalk-dust burst at the element
//   barSettle(barEl, toPercent, kind)       -> bar overshoots target then settles
//   diceAnticipation(ms)                    -> returns a promise that resolves after a tense pause
//   cardFlip(cardEl)                        -> flips a card in place (X-axis 180°)
//   flyToInventory(srcEl, destEl, label)    -> a ghost card flies from src to dest
//   roundTransition(roundNum)               -> "ROUND 12" wipe overlay (~1.2s)
//   turnSummaryCard(summary)                -> card slides in with last-turn recap
//   recordTurnAction(action)                -> append to current turn's log
//   beginTurn(playerNum)                    -> reset turn log for a new player
//
// Internal state is namespaced under window.Effects.

(function () {
  'use strict';

  // -------------------------------------------------------------------------
  // 0. Inject the stylesheet exactly once.
  // -------------------------------------------------------------------------
  const STYLE = `
    #effects-layer {
      position: fixed; inset: 0; pointer-events: none; z-index: 2000;
      overflow: hidden;
    }
    .fx-float {
      position: absolute;
      font-family: 'Bricolage Grotesque', sans-serif;
      font-weight: 800;
      font-size: 22px;
      letter-spacing: 0.02em;
      padding: 4px 10px;
      border-radius: 4px;
      pointer-events: none;
      transform: translate(-50%, -50%);
      animation: fx-float-rise 1100ms cubic-bezier(0.18, 0.85, 0.32, 1) forwards;
      text-shadow: 0 2px 0 rgba(0,0,0,0.35);
    }
    .fx-float.xp              { color: #f8f0dc; background: #2c66cf; }
    .fx-float.endurance-loss  { color: #f8f0dc; background: #d8347d; }
    .fx-float.endurance-gain  { color: #2a1d12; background: #b6d62d; }
    .fx-float.time            { color: #2a1d12; background: #ffae28; }
    .fx-float.stat            { color: #f8f0dc; background: #8857d4; }
    .fx-float.fail            { color: #f8f0dc; background: #5a4530; }
    @keyframes fx-float-rise {
      0%   { transform: translate(-50%, -50%) scale(0.7);  opacity: 0; }
      18%  { transform: translate(-50%, -50%) scale(1.18); opacity: 1; }
      30%  { transform: translate(-50%, -90%) scale(1);    opacity: 1; }
      100% { transform: translate(-50%, -200%) scale(0.9); opacity: 0; }
    }

    .fx-chalk {
      position: absolute;
      width: 80px; height: 80px;
      pointer-events: none;
      transform: translate(-50%, -50%);
      background:
        radial-gradient(circle at 30% 35%, rgba(244,237,224,0.95), rgba(244,237,224,0) 55%),
        radial-gradient(circle at 65% 50%, rgba(244,237,224,0.85), rgba(244,237,224,0) 60%),
        radial-gradient(circle at 50% 70%, rgba(244,237,224,0.75), rgba(244,237,224,0) 65%);
      animation: fx-chalk-puff 720ms ease-out forwards;
      filter: blur(0.5px);
    }
    .fx-chalk.coral   { background: radial-gradient(circle at 50% 50%, rgba(255,104,69,0.55), rgba(255,104,69,0) 60%); }
    .fx-chalk.lime    { background: radial-gradient(circle at 50% 50%, rgba(182,214,45,0.65), rgba(182,214,45,0) 60%); }
    .fx-chalk.cobalt  { background: radial-gradient(circle at 50% 50%, rgba(44,102,207,0.55), rgba(44,102,207,0) 60%); }
    @keyframes fx-chalk-puff {
      0%   { transform: translate(-50%, -50%) scale(0.2); opacity: 1; }
      40%  { transform: translate(-50%, -65%) scale(1.0); opacity: 0.9; }
      100% { transform: translate(-50%, -110%) scale(1.6); opacity: 0; }
    }

    /* Bar settle: a CSS-only spring overshoot via cubic-bezier > 1. The bar
       element's width transition uses this curve when fx-settle is applied. */
    .fx-settle {
      transition: width 520ms cubic-bezier(0.34, 1.56, 0.64, 1) !important;
    }

    /* Card flip — applied transiently to a gear-card element. */
    @keyframes fx-card-flip {
      0%   { transform: perspective(800px) rotateY(0deg);   }
      50%  { transform: perspective(800px) rotateY(90deg);  }
      100% { transform: perspective(800px) rotateY(0deg);   }
    }
    .fx-flip { animation: fx-card-flip 480ms ease-in-out; backface-visibility: hidden; }

    /* Inventory acquisition — ghost card flies from src to dest. Built via JS. */
    .fx-ghost-card {
      position: absolute;
      background: #f8f0dc;
      border: 2px solid #2a1d12;
      border-radius: 6px;
      padding: 8px 12px;
      font-family: 'Bricolage Grotesque', sans-serif;
      font-weight: 700;
      font-size: 13px;
      color: #2a1d12;
      box-shadow: 4px 4px 0 rgba(0,0,0,0.25);
      transform-origin: center;
      pointer-events: none;
      transition: transform 700ms cubic-bezier(0.34, 1.2, 0.64, 1), opacity 700ms ease-out;
    }

    /* Round transition wipe. */
    .fx-round-overlay {
      position: fixed; inset: 0;
      background: linear-gradient(135deg, rgba(42,29,18,0.92), rgba(90,69,48,0.92));
      z-index: 2500;
      display: flex; align-items: center; justify-content: center;
      pointer-events: none;
      clip-path: inset(50% 0 50% 0);
      animation: fx-round-wipe 1200ms cubic-bezier(0.7, 0, 0.3, 1) forwards;
    }
    .fx-round-overlay .label {
      font-family: 'Bricolage Grotesque', sans-serif;
      font-weight: 800;
      font-size: 78px;
      color: #f4ede0;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      text-shadow: 0 6px 0 rgba(0,0,0,0.35);
      transform: scale(0.7);
      animation: fx-round-label 1200ms cubic-bezier(0.34, 1.4, 0.5, 1) forwards;
    }
    @keyframes fx-round-wipe {
      0%   { clip-path: inset(50% 0 50% 0); }
      18%  { clip-path: inset(0 0 0 0); }
      75%  { clip-path: inset(0 0 0 0); }
      100% { clip-path: inset(0 0 100% 0); }
    }
    @keyframes fx-round-label {
      0%   { transform: scale(0.7);  opacity: 0; }
      25%  { transform: scale(1.05); opacity: 1; }
      55%  { transform: scale(1);    opacity: 1; }
      85%  { transform: scale(1);    opacity: 1; }
      100% { transform: scale(0.9);  opacity: 0; }
    }

    /* Turn-end summary card — slides up from bottom-right. */
    .fx-summary-card {
      position: fixed;
      bottom: 24px;
      right: 24px;
      width: 320px;
      max-height: 60vh;
      overflow-y: auto;
      background: #f8f0dc;
      border: 2px solid #2a1d12;
      border-radius: 8px;
      padding: 14px 16px;
      box-shadow: 6px 6px 0 rgba(0,0,0,0.3);
      font-family: 'Hanken Grotesk', sans-serif;
      color: #2a1d12;
      z-index: 2200;
      transform: translateY(120%);
      animation: fx-summary-in 600ms cubic-bezier(0.34, 1.4, 0.5, 1) forwards;
      pointer-events: auto;
    }
    .fx-summary-card.closing { animation: fx-summary-out 350ms ease-in forwards; }
    @keyframes fx-summary-in  { to { transform: translateY(0); } }
    @keyframes fx-summary-out { to { transform: translateY(120%); opacity: 0; } }
    .fx-summary-card h4 {
      font-family: 'Bricolage Grotesque', sans-serif;
      font-weight: 800;
      font-size: 15px;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: #5a4530;
      margin: 0 0 8px;
      display: flex; justify-content: space-between; align-items: center;
    }
    .fx-summary-card .close-x {
      cursor: pointer; font-size: 18px; padding: 0 6px;
      background: transparent; border: none; color: #5a4530;
    }
    .fx-summary-card .row {
      font-size: 13px; padding: 4px 0;
      border-bottom: 1px dotted rgba(42,29,18,0.2);
      display: flex; justify-content: space-between; gap: 8px;
    }
    .fx-summary-card .row:last-child { border-bottom: none; }
    .fx-summary-card .row .kind {
      font-family: 'Geist Mono', monospace; font-size: 10px;
      text-transform: uppercase; color: #8a6440;
      align-self: center; min-width: 60px;
    }
    .fx-summary-card .row .desc { flex: 1; }
    .fx-summary-card .row .delta {
      font-family: 'Geist Mono', monospace; font-size: 12px;
      font-weight: 700;
    }
    .fx-summary-card .delta.pos { color: #5a8a1a; }
    .fx-summary-card .delta.neg { color: #c1276a; }

    /* Dice anticipation rattle on the dice container if present. */
    @keyframes fx-rattle {
      0%, 100% { transform: translate(0, 0) rotate(0); }
      10% { transform: translate(-1px, 1px)  rotate(-1deg); }
      30% { transform: translate( 2px, -1px) rotate( 1deg); }
      50% { transform: translate(-1px, 2px)  rotate(-1deg); }
      70% { transform: translate( 1px, -1px) rotate( 0.5deg); }
      90% { transform: translate(-2px, 1px)  rotate(-0.5deg); }
    }
    .fx-anticipate { animation: fx-rattle 350ms ease-in-out 3; }
  `;

  function injectStyle() {
    if (document.getElementById('fx-style')) return;
    const s = document.createElement('style');
    s.id = 'fx-style';
    s.textContent = STYLE;
    document.head.appendChild(s);
  }

  function ensureLayer() {
    let l = document.getElementById('effects-layer');
    if (!l) {
      l = document.createElement('div');
      l.id = 'effects-layer';
      document.body.appendChild(l);
    }
    return l;
  }

  // -------------------------------------------------------------------------
  // 1. Element-anchored effects: floatNumber, chalkPuff
  // -------------------------------------------------------------------------
  function centerOf(el) {
    if (!el || !el.getBoundingClientRect) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  function floatNumber(targetEl, text, kind = 'xp') {
    const pos = centerOf(targetEl);
    if (!pos) return;
    const layer = ensureLayer();
    const node = document.createElement('div');
    node.className = `fx-float ${kind}`;
    node.textContent = text;
    node.style.left = pos.x + 'px';
    node.style.top  = pos.y + 'px';
    layer.appendChild(node);
    setTimeout(() => node.remove(), 1200);
  }

  function chalkPuff(targetEl, color = '') {
    const pos = centerOf(targetEl);
    if (!pos) return;
    const layer = ensureLayer();
    const node = document.createElement('div');
    node.className = 'fx-chalk' + (color ? ' ' + color : '');
    node.style.left = pos.x + 'px';
    node.style.top  = pos.y + 'px';
    layer.appendChild(node);
    setTimeout(() => node.remove(), 800);
  }

  // -------------------------------------------------------------------------
  // 2. Bar settle: applies a spring transition to a bar element when its
  //    width changes. The caller updates the bar element AFTER calling
  //    barSettle so the transition curve takes effect.
  // -------------------------------------------------------------------------
  function barSettle(barEl, toPercent) {
    if (!barEl) return;
    barEl.classList.add('fx-settle');
    requestAnimationFrame(() => {
      barEl.style.width = toPercent + '%';
    });
    setTimeout(() => barEl.classList.remove('fx-settle'), 600);
  }

  // -------------------------------------------------------------------------
  // 3. Dice anticipation — returns a Promise so the caller can `await` it.
  // -------------------------------------------------------------------------
  function diceAnticipation(ms = 420) {
    // Find any visible dice display and rattle it during the pause.
    const dice = document.querySelectorAll('.dice, .dice-roll, #dice-display, [data-dice]');
    dice.forEach(d => d.classList.add('fx-anticipate'));
    return new Promise(resolve => {
      setTimeout(() => {
        dice.forEach(d => d.classList.remove('fx-anticipate'));
        resolve();
      }, ms);
    });
  }

  // -------------------------------------------------------------------------
  // 4. Card flip — used when the shop refreshes a slot.
  // -------------------------------------------------------------------------
  function cardFlip(cardEl) {
    if (!cardEl) return;
    cardEl.classList.add('fx-flip');
    setTimeout(() => cardEl.classList.remove('fx-flip'), 500);
  }

  // -------------------------------------------------------------------------
  // 5. Inventory acquisition — fly a ghost card from source to destination.
  // -------------------------------------------------------------------------
  function flyToInventory(srcEl, destEl, label) {
    const srcPos = centerOf(srcEl);
    const destPos = centerOf(destEl);
    if (!srcPos || !destPos) return;
    const layer = ensureLayer();
    const ghost = document.createElement('div');
    ghost.className = 'fx-ghost-card';
    ghost.textContent = label || 'Gear';
    ghost.style.left = (srcPos.x - 60) + 'px';
    ghost.style.top  = (srcPos.y - 16) + 'px';
    ghost.style.opacity = '0';
    layer.appendChild(ghost);

    requestAnimationFrame(() => {
      ghost.style.opacity = '1';
      requestAnimationFrame(() => {
        const dx = destPos.x - srcPos.x;
        const dy = destPos.y - srcPos.y;
        ghost.style.transform = `translate(${dx}px, ${dy}px) scale(0.45) rotate(8deg)`;
      });
      setTimeout(() => {
        ghost.style.opacity = '0';
        setTimeout(() => ghost.remove(), 400);
      }, 700);
    });

    // A small chalk puff at the destination once the card arrives.
    setTimeout(() => chalkPuff(destEl, 'lime'), 700);
  }

  // -------------------------------------------------------------------------
  // 6. Round transition.
  // -------------------------------------------------------------------------
  function roundTransition(roundNum) {
    return new Promise(resolve => {
      const o = document.createElement('div');
      o.className = 'fx-round-overlay';
      o.innerHTML = `<div class="label">Round ${roundNum}</div>`;
      document.body.appendChild(o);
      setTimeout(() => {
        o.remove();
        resolve();
      }, 1200);
    });
  }

  // -------------------------------------------------------------------------
  // 7. Turn-end summary card.
  // -------------------------------------------------------------------------
  // currentTurn = { playerNum, characterName, actions: [{kind, desc, delta?}] }
  let currentTurn = null;
  let activeSummaryEl = null;

  function beginTurn(playerNum, characterName) {
    currentTurn = { playerNum, characterName: characterName || `Player ${playerNum}`, actions: [] };
  }

  function recordTurnAction(action) {
    if (!currentTurn) return;
    currentTurn.actions.push(action);
  }

  function turnSummaryCard(summary) {
    if (activeSummaryEl) {
      activeSummaryEl.classList.add('closing');
      setTimeout((el => () => el.remove())(activeSummaryEl), 350);
    }
    const data = summary || currentTurn;
    if (!data || !data.actions || !data.actions.length) return;

    const card = document.createElement('div');
    card.className = 'fx-summary-card';
    const rows = data.actions.map(a => {
      const deltaClass = a.delta ? (a.delta.startsWith('+') ? 'pos' : 'neg') : '';
      return `<div class="row">
        <span class="kind">${escapeHtml(a.kind)}</span>
        <span class="desc">${escapeHtml(a.desc)}</span>
        ${a.delta ? `<span class="delta ${deltaClass}">${escapeHtml(a.delta)}</span>` : ''}
      </div>`;
    }).join('');
    card.innerHTML = `
      <h4>
        <span>${escapeHtml(data.characterName)} — turn recap</span>
        <button class="close-x" aria-label="dismiss">&times;</button>
      </h4>
      ${rows}
    `;
    document.body.appendChild(card);
    activeSummaryEl = card;
    card.querySelector('.close-x').addEventListener('click', () => {
      card.classList.add('closing');
      setTimeout(() => { card.remove(); if (activeSummaryEl === card) activeSummaryEl = null; }, 350);
    });
    // Auto-dismiss after a generous read window so it doesn't linger.
    setTimeout(() => {
      if (!card.parentNode) return;
      card.classList.add('closing');
      setTimeout(() => { card.remove(); if (activeSummaryEl === card) activeSummaryEl = null; }, 350);
    }, 9000);
  }

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    })[c]);
  }

  // -------------------------------------------------------------------------
  // 8. Convenience: locate the current player's panel for anchoring effects.
  //    Looks for [data-player="N"] OR id="player-N-panel" OR class fallback.
  // -------------------------------------------------------------------------
  function locatePlayerPanel(playerNum) {
    return document.querySelector(`[data-player="${playerNum}"]`)
        || document.getElementById(`player-${playerNum}-panel`)
        || document.querySelector(`#player-${playerNum}`)
        || null;
  }

  function locateEnduranceBar(playerNum) {
    return document.querySelector(`[data-endurance-bar="${playerNum}"]`)
        || document.getElementById(`endurance-bar-${playerNum}`)
        || null;
  }

  function locateXpBar(playerNum) {
    return document.querySelector(`[data-xp-bar="${playerNum}"]`)
        || document.getElementById(`xp-bar-${playerNum}`)
        || null;
  }

  // -------------------------------------------------------------------------
  // Exports
  // -------------------------------------------------------------------------
  injectStyle();

  window.Effects = {
    floatNumber,
    chalkPuff,
    barSettle,
    diceAnticipation,
    cardFlip,
    flyToInventory,
    roundTransition,
    turnSummaryCard,
    beginTurn,
    recordTurnAction,
    locatePlayerPanel,
    locateEnduranceBar,
    locateXpBar,
    _state: () => ({ currentTurn }),
  };
})();
