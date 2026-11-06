// Screens, timer and input. All game rules live in game.js.
(function () {
  const G = globalThis.MnemonicGame;
  const TICK_MS = 100;
  // Options and Next appear under the cursor, so a double-click must not hit them too.
  // 500 ms is the default Windows double-click time.
  const INPUT_LOCK_MS = 500;
  // WebView2 keeps browser shortcuts on. Reload would wipe the session.
  const BROWSER_KEYS = new Set(['F3', 'F5', 'F7', 'BrowserBack', 'BrowserForward', 'BrowserRefresh']);
  const BROWSER_CTRL_KEYS = new Set(['f', 'g', 'j', 'p', 'r', 'u']);

  const screen = document.getElementById('screen');
  const state = {
    session: G.createSession(),
    round: null,
    questionIndex: 0,
    picks: [],
    results: [],
    endsAt: 0,
    timer: null,
    lockedUntil: 0,
  };

  function el(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    Object.entries(props).forEach(([key, value]) => {
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key === 'onclick') node.addEventListener('click', value);
      else node.setAttribute(key, value);
    });
    children.forEach((child) => node.append(child));
    return node;
  }

  function positionLabel(position) {
    return `Row ${Math.floor(position / 3) + 1}, column ${(position % 3) + 1}`;
  }

  function isLocked() {
    return Date.now() < state.lockedUntil;
  }

  function lockInput() {
    state.lockedUntil = Date.now() + INPUT_LOCK_MS;
  }

  // Called only on Result: stats during Recall would reveal whether an answer was right.
  function renderStats() {
    const { session } = state;
    document.getElementById('stat-score').textContent = `${session.correct} / ${session.total}`;
    document.getElementById('stat-rounds').textContent = session.rounds;
    document.getElementById('stat-streak').textContent = session.streak;
    document.getElementById('stat-best').textContent = session.bestStreak;
    document.getElementById('stat-accuracy').textContent = G.accuracyText(session);
  }

  function emojiNode(icon) {
    return el('span', { class: 'emoji', text: icon.emoji, 'aria-hidden': 'true' });
  }

  function visibleTile(icon, position) {
    return el(
      'div',
      { class: 'tile', role: 'img', 'aria-label': `${positionLabel(position)}: ${icon.name}` },
      [emojiNode(icon)],
    );
  }

  // Hidden tiles hold no icon at all, so transparency can never leak an answer.
  function hiddenTile(position) {
    const asked = position === state.round.asked[state.questionIndex];
    return el('div', {
      class: asked ? 'tile asked' : 'tile',
      role: 'img',
      'aria-label': asked ? `${positionLabel(position)}, asked` : positionLabel(position),
    });
  }

  function resultTile(icon, position) {
    const questionIndex = state.round.asked.indexOf(position);
    if (questionIndex === -1) return visibleTile(icon, position);
    const right = state.results[questionIndex];
    const picked = state.picks[questionIndex];
    const verdict = right ? 'right' : `wrong, you picked ${picked.name}`;
    const tile = el(
      'div',
      {
        class: right ? 'tile right' : 'tile wrong',
        role: 'img',
        'aria-label': `${positionLabel(position)}: ${icon.name}, ${verdict}`,
      },
      [emojiNode(icon), el('span', { class: 'mark', text: right ? '✓' : '✗', 'aria-hidden': 'true' })],
    );
    if (!right) {
      tile.append(el('span', { class: 'picked', text: picked.emoji, 'aria-hidden': 'true' }));
    }
    return tile;
  }

  function renderStart() {
    const start = el('button', { id: 'start-button', class: 'primary', type: 'button', text: 'Start', onclick: startRound });
    screen.replaceChildren(
      el('div', { class: 'intro glass' }, [
        el('h1', { text: 'Remember the card' }),
        el('p', { text: 'Study 9 icons for 10 seconds. They hide, then you name the icons at 2 random positions.' }),
        el('p', { text: 'Each round brings a new card. Stop whenever you like.' }),
        start,
      ]),
    );
    start.focus();
  }

  function startRound() {
    state.round = G.createRound();
    state.questionIndex = 0;
    state.picks = [];
    state.results = [];
    state.endsAt = Date.now() + G.VIEW_MS;
    setPhase('memorize');
    state.timer = setInterval(tick, TICK_MS);
  }

  function renderMemorize() {
    screen.replaceChildren(
      el('div', { class: 'memorize' }, [
        el('div', { id: 'card' }, state.round.card.map(visibleTile)),
        el('div', { class: 'countdown' }, [
          el('div', { class: 'countdown-track' }, [el('div', { id: 'countdown-bar' })]),
          el('span', { id: 'countdown-seconds', text: String(G.VIEW_MS / 1000) }),
        ]),
      ]),
    );
  }

  // Compares timestamps, so a throttled or hidden window cannot extend viewing time.
  function tick() {
    if (document.body.dataset.phase !== 'memorize') return;
    const remaining = state.endsAt - Date.now();
    if (remaining <= 0) {
      clearInterval(state.timer);
      setPhase('recall');
      return;
    }
    document.getElementById('countdown-bar').style.transform = `scaleX(${remaining / G.VIEW_MS})`;
    document.getElementById('countdown-seconds').textContent = String(Math.ceil(remaining / 1000));
  }

  function renderRecall() {
    const options = state.round.options[state.questionIndex].map((icon) =>
      el('button', { class: 'option', type: 'button', 'aria-label': icon.name, onclick: () => pick(icon) }, [emojiNode(icon)]),
    );
    const prompt = el('h2', {
      id: 'prompt',
      tabindex: '-1',
      'aria-live': 'polite',
      text: `Question ${state.questionIndex + 1} of ${G.QUESTIONS_PER_ROUND}: what was on the highlighted tile?`,
    });
    screen.replaceChildren(
      el('div', { class: 'recall' }, [
        prompt,
        el('div', { class: 'recall-body' }, [
          el('div', { id: 'card' }, state.round.card.map((_, position) => hiddenTile(position))),
          el('div', { id: 'options' }, options),
        ]),
      ]),
    );
    lockInput();
    prompt.focus();
  }

  function pick(icon) {
    if (document.body.dataset.phase !== 'recall' || isLocked()) return;
    const outcome = G.recordAnswer(state.session, state.round, state.questionIndex, icon);
    state.session = outcome.session;
    state.picks.push(icon);
    state.results.push(outcome.correct);
    if (state.questionIndex + 1 < G.QUESTIONS_PER_ROUND) {
      state.questionIndex += 1;
      renderRecall();
    } else {
      setPhase('result');
    }
  }

  function renderResult() {
    const rightCount = state.results.filter(Boolean).length;
    const next = el('button', {
      id: 'next-button',
      class: 'primary',
      type: 'button',
      text: 'Next',
      onclick: () => {
        if (!isLocked()) startRound();
      },
    });
    screen.replaceChildren(
      el('div', { class: 'result' }, [
        el('h2', { id: 'prompt', tabindex: '-1', 'aria-live': 'polite', text: `${rightCount} of ${G.QUESTIONS_PER_ROUND} right` }),
        el('div', { id: 'card' }, state.round.card.map(resultTile)),
        next,
      ]),
    );
    renderStats();
    lockInput();
    next.focus();
  }

  const renderers = { start: renderStart, memorize: renderMemorize, recall: renderRecall, result: renderResult };

  function setPhase(phase) {
    document.body.dataset.phase = phase;
    renderers[phase]();
  }

  function isBrowserShortcut(event) {
    if (BROWSER_KEYS.has(event.key)) return true;
    if (event.altKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) return true;
    return (event.ctrlKey || event.metaKey) && BROWSER_CTRL_KEYS.has(event.key.toLowerCase());
  }

  document.addEventListener(
    'keydown',
    (event) => {
      // A held key must not press whichever button takes focus next.
      const heldActivation = event.repeat && (event.key === 'Enter' || event.key === ' ');
      if (heldActivation || isBrowserShortcut(event)) event.preventDefault();
    },
    true,
  );
  document.addEventListener('contextmenu', (event) => event.preventDefault());
  document.addEventListener('visibilitychange', tick);

  // Outside the Tauri app, as in a plain browser, there is no window to control.
  document.getElementById('window-controls').hidden = !window.__TAURI__;
  if (window.__TAURI__) {
    const appWindow = window.__TAURI__.window.getCurrentWindow();
    document.documentElement.classList.add('tauri');
    document.getElementById('minimize-button').addEventListener('click', () => appWindow.minimize());
    document.getElementById('close-button').addEventListener('click', () => appWindow.close());
  }

  setPhase('start');
})();
