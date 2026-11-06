# Mnemonic Scaler Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the 9-icon memory game as a liquid glass Windows desktop app.

**Architecture:** A plain HTML, CSS and JavaScript game in `ui/`, with all rules in a pure `game.js` and all DOM work in `app.js`. Tauri 2 wraps `ui/` in a transparent Windows window. No game logic lives in Rust.

**Tech Stack:** Vanilla JS (classic scripts, no bundler), CSS `backdrop-filter`, `node:test`, Tauri 2, Rust 1.98, NSIS.

**Spec:** `docs/superpowers/specs/2026-11-06-mnemonic-game-design.md`

## Global Constraints

- Repository: `sneakyevil96/Mnemonic-scaler`, branch `main`, local path `C:\Claude\Mnemonic-scaler`.
- Commits carry the owner's git identity only. Never add `Co-Authored-By` or generated-by lines.
- Rules: 9 icons in a 3×3 grid, pool of 40, 10 seconds viewing, 2 distinct positions asked, 12 options per question, no recall time limit, endless session.
- No network requests and no remote content. All files are local.
- Glass text contrast is at least 4.5:1 on light and dark desktops.
- A hidden tile contains no icon in the DOM.
- Stats are session-only. No saved data.
- Build output stays out of git. Do not publish a GitHub Release.
- Out of scope: macOS, iPhone and Android builds, difficulty scaling, sound, settings, code signing, auto-update.

## Review Focus

- **Double-clicking an answer:** the second click lands on the next question's options, which render in the same place. It must not answer question 2. Checked in Task 2.
- **Holding Enter or using only the keyboard:** a held key must not skip a question or answer one by accident. Checked in Task 2.
- **Minimizing during Memorize:** viewing time must not extend. On restore after 10 seconds, the game must already be on Recall. Checked in Task 4.
- **Pure white or pure black behind the window:** text stays at 4.5:1 or better, and the glass stays visible. Checked in Task 3.
- **Smallest and very large windows:** at 720×640 nothing scrolls, and at 2560×1440 the card does not stretch out of proportion. Checked in Task 3.

---

### Task 1: Project setup and game logic

**Files:**
- Create: `package.json`, `.gitignore`, `ui/game.js`
- Test: `test/game.test.js`
- Modify: `docs/superpowers/specs/2026-11-06-mnemonic-game-design.md` (set `Status: Approved`)

**Interfaces:**
- Consumes: nothing.
- Produces, as `module.exports` in Node and `globalThis.MnemonicGame` in the browser:
  - `ICONS: {emoji: string, name: string}[]` (40 entries)
  - `VIEW_MS = 10000`, `CARD_SIZE = 9`, `QUESTIONS_PER_ROUND = 2`, `OPTION_COUNT = 12`
  - `createRng(seed: number): () => number`, returning values in `[0, 1)`
  - `createRound(random = Math.random): {card: Icon[], asked: number[], options: Icon[][]}`, with `options[i]` belonging to `asked[i]`
  - `createSession(): {correct, total, rounds, streak, bestStreak}`, all `0`
  - `recordAnswer(session, round, questionIndex, pickedIcon): {session, correct: boolean}`, which returns a new session and never mutates its input
  - `accuracyText(session): string`, either `"—"` or a rounded percent such as `"67%"`

- [ ] **Step 1: Create `package.json` and `.gitignore`**

`package.json`: `name` `mnemonic-scaler`, `version` `0.1.0`, `private` true, no `type` field (CommonJS), scripts `"test": "node --test"` and `"tauri": "tauri"`.

`.gitignore`: `node_modules/`, `src-tauri/target/`, `src-tauri/gen/schemas/`, `.claude/`.

- [ ] **Step 2: Write the failing tests in `test/game.test.js`**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../ui/game.js');

const names = (icons) => icons.map((i) => i.name);
const distinct = (list) => new Set(list).size === list.length;
const rounds = (n, seed = 1) => {
  const random = G.createRng(seed);
  return Array.from({ length: n }, () => G.createRound(random));
};

test('pool has 40 icons with distinct names and emoji', () => {
  assert.equal(G.ICONS.length, 40);
  assert.ok(distinct(names(G.ICONS)));
  assert.ok(distinct(G.ICONS.map((i) => i.emoji)));
});

test('card has 9 distinct icons from the pool', () => {
  for (const r of rounds(200)) {
    assert.equal(r.card.length, 9);
    assert.ok(distinct(names(r.card)));
    assert.ok(r.card.every((icon) => G.ICONS.includes(icon)));
  }
});

test('asks 2 distinct positions in the grid and can reach all 9', () => {
  const seen = new Set();
  for (const r of rounds(500)) {
    assert.equal(r.asked.length, 2);
    assert.notEqual(r.asked[0], r.asked[1]);
    r.asked.forEach((p) => {
      assert.ok(Number.isInteger(p) && p >= 0 && p <= 8);
      seen.add(p);
    });
  }
  assert.equal(seen.size, 9);
});

test('each question has 12 distinct options: 9 card icons and 3 decoys', () => {
  for (const r of rounds(200)) {
    assert.equal(r.options.length, 2);
    for (const options of r.options) {
      const optionNames = names(options);
      const cardNames = names(r.card);
      assert.equal(options.length, 12);
      assert.ok(distinct(optionNames));
      assert.ok(cardNames.every((n) => optionNames.includes(n)));
      assert.equal(optionNames.filter((n) => !cardNames.includes(n)).length, 3);
    }
  }
});

test('option order is shuffled, not card order first', () => {
  const r = rounds(1)[0];
  assert.notDeepEqual(names(r.options[0]).slice(0, 9), names(r.card));
});

test('same seed gives the same round', () => {
  assert.deepEqual(rounds(3, 42), rounds(3, 42));
});

test('extreme random sources still give valid rounds', () => {
  for (const random of [() => 0, () => 0.999999]) {
    const r = G.createRound(random);
    assert.ok(distinct(names(r.card)));
    assert.notEqual(r.asked[0], r.asked[1]);
    assert.equal(new Set(names(r.options[0])).size, 12);
  }
});

const rightIcon = (r, q) => r.card[r.asked[q]];
const wrongIcon = (r, q) => r.card.find((i) => i !== rightIcon(r, q));

test('scoring: right builds the streak, wrong resets it, best is kept', () => {
  const r = rounds(1)[0];
  let s = G.createSession();
  ({ session: s } = G.recordAnswer(s, r, 0, rightIcon(r, 0)));
  ({ session: s } = G.recordAnswer(s, r, 1, rightIcon(r, 1)));
  assert.deepEqual(s, { correct: 2, total: 2, rounds: 1, streak: 2, bestStreak: 2 });
  const result = G.recordAnswer(s, r, 0, wrongIcon(r, 0));
  assert.equal(result.correct, false);
  assert.deepEqual(result.session, { correct: 2, total: 3, rounds: 1, streak: 0, bestStreak: 2 });
});

test('a round counts only after the second answer', () => {
  const r = rounds(1)[0];
  const first = G.recordAnswer(G.createSession(), r, 0, rightIcon(r, 0));
  assert.equal(first.session.rounds, 0);
  assert.equal(G.recordAnswer(first.session, r, 1, rightIcon(r, 1)).session.rounds, 1);
});

test('recordAnswer does not mutate the session', () => {
  const r = rounds(1)[0];
  const s = G.createSession();
  G.recordAnswer(s, r, 0, rightIcon(r, 0));
  assert.deepEqual(s, G.createSession());
});

test('accuracy shows a dash before any answer, then a rounded percent', () => {
  assert.equal(G.accuracyText(G.createSession()), '—');
  assert.equal(G.accuracyText({ correct: 2, total: 3, rounds: 1, streak: 0, bestStreak: 2 }), '67%');
});
```

- [ ] **Step 3: Run the tests and confirm they fail**

Run: `npm test`
Expected: FAIL with `Cannot find module '../ui/game.js'`.

- [ ] **Step 4: Implement `ui/game.js`**

Use a Fisher-Yates shuffle over `random` and mulberry32 for `createRng`. Avoid rejection sampling, so a constant `random` cannot loop forever. End the file with `if (typeof module !== 'undefined') module.exports = api; else globalThis.MnemonicGame = api;`.

Use this pool, in this form, with `\uFE0F` where shown:

anchor ⚓, apple 🍎, balloon 🎈, banana 🍌, bell 🔔, bicycle 🚲, book 📖, butterfly 🦋, cactus 🌵, camera 📷, candle 🕯️, car 🚗, cat 🐱, cherries 🍒, clock ⏰, cloud ☁️, crown 👑, dice 🎲, dog 🐶, duck 🦆, elephant 🐘, fire 🔥, fish 🐟, flower 🌸, gift 🎁, guitar 🎸, hammer 🔨, hat 🎩, key 🔑, lightning ⚡, magnet 🧲, moon 🌙, mushroom 🍄, octopus 🐙, pizza 🍕, rainbow 🌈, rocket 🚀, snowflake ❄️, star ⭐, umbrella ☂️

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `npm test`
Expected: all 11 tests pass.

- [ ] **Step 6: Commit**

```bash
git add package.json .gitignore ui/game.js test/game.test.js docs/superpowers/specs/2026-11-06-mnemonic-game-design.md docs/superpowers/plans/2026-11-06-mnemonic-game.md
git commit -m "Add game logic with tests"
```

### Task 2: Playable game screens

**Files:**
- Create: `ui/index.html`, `ui/app.js`, `ui/style.css` (layout only, glass comes in Task 3), `.claude/launch.json`

**Interfaces:**
- Consumes: everything Task 1 produces, through `globalThis.MnemonicGame`.
- Produces, for Tasks 3 and 4:
  - DOM ids: `#titlebar`, `#window-controls`, `#minimize-button`, `#close-button`, `#stats`, `#stat-score`, `#stat-rounds`, `#stat-streak`, `#stat-best`, `#stat-accuracy`, `#screen`, `#card`, `#options`, `#prompt`, `#countdown-bar`, `#countdown-seconds`, `#start-button`, `#next-button`
  - Classes: `.tile`, `.tile.asked`, `.tile.right`, `.tile.wrong`, `.option`
  - `document.body.dataset.phase`: `start`, `memorize`, `recall` or `result`

- [ ] **Step 1: Write `ui/index.html`**

Load `style.css`, then `game.js`, then `app.js`, with classic `<script defer>` tags. Include `#titlebar` with `data-tauri-drag-region`, `#stats` with a label on each value, and an empty `#screen` for `app.js` to render into.

- [ ] **Step 2: Implement `ui/app.js`**

- `setPhase(phase)` sets `body.dataset.phase` and re-renders `#screen`.
- Hold state in a single object: `{session, round, questionIndex, picks}`.
- **Memorize:** store `endsAt = Date.now() + VIEW_MS`. A 100 ms `setInterval` compares against `endsAt`, updates `#countdown-bar` (`transform: scaleX`) and `#countdown-seconds`, and moves to Recall at zero. Also run the same check on `visibilitychange`. Clear the interval on exit.
- **Recall:** render tiles with no emoji text. Each tile's `aria-label` gives only its position, such as `Row 1, column 2`. Mark the current asked tile `.asked`. Render `round.options[questionIndex]` as `<button class="option" aria-label="{name}">`. Show no right or wrong feedback.
- **Input lock:** after each question renders, ignore option clicks for 300 ms, using a constant `INPUT_LOCK_MS = 300`. Move focus to `#prompt` (`tabindex="-1"`) on each new question, so a held Enter key cannot pick an option.
- **Result:** render the full card, and mark asked tiles `.right` with ✓ or `.wrong` with ✗. A wrong tile also shows the picked icon. Focus `#next-button`.
- **Stats:** `#stat-score` shows `correct / total`, and `#stat-accuracy` uses `accuracyText`.
- **Window controls:** if `window.__TAURI__` is undefined, set `#window-controls` hidden.

- [ ] **Step 3: Write layout-only `ui/style.css`**

The card is a 3×3 grid and the options are a 4×3 grid. In Recall, place them side by side when the window is at least 700px wide, and stack them below that. Size tiles from the smaller of the available width and height, capped at 140px. Use the emoji font stack `"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`.

- [ ] **Step 4: Add `.claude/launch.json` and open the game**

Add a `mnemonic-ui` configuration that runs `python -m http.server 5173 --directory ui` on port `5173`. Open it with the built-in browser's `preview_start`.

- [ ] **Step 5: Check a full round in the browser**

Using `javascript_tool` and clicks, confirm each of these:

- Start leads to `phase=memorize`, with 9 tiles showing emoji.
- `phase` becomes `recall` between 9.9 and 10.5 seconds later, with no input.
- During Recall, `#card` text contains no emoji, and no attribute on any tile contains a card icon's name.
- Each of the 2 questions shows 12 `.option` buttons.
- After both answers `phase=result`, the 2 asked tiles are marked, and the stats add up.
- Next leads to `memorize` with a new card.

- [ ] **Step 6: Check the double-click case**

On Recall, run `const o = document.querySelector('.option'); o.click(); document.querySelector('.option').click();`.
Expected: `#stat-score` shows a total raised by only 1, and the phase is still `recall`.

- [ ] **Step 7: Check keyboard-only play**

Press Tab and Enter to complete one round without the mouse. Then press Enter repeatedly on a new question.
Expected: repeated Enter on `#prompt` answers nothing. Every control shows a visible focus ring.

- [ ] **Step 8: Commit**

```bash
git add ui/index.html ui/app.js ui/style.css
git commit -m "Add playable game screens"
```

### Task 3: Liquid glass styling

Use the `frontend-design` skill for this task.

**Files:**
- Modify: `ui/style.css`, `ui/index.html` (backdrop elements and the SVG filter)

**Interfaces:**
- Consumes: DOM ids and classes from Task 2.
- Produces: a `.glass` class, and `html.tauri` styling hook for Task 4. `html.tauri` keeps `body` transparent. Without it, `body` gets an opaque gradient, so the browser view works.

- [ ] **Step 1: Add the backdrop**

Add 3 or 4 blurred, saturated color shapes that drift slowly using CSS animation, behind a fixed layer with a light `rgba(10, 14, 30, 0.30)` tint. Windows cannot report whether acrylic is active, so this layer also serves as the spec's fallback. The app stays readable over a raw desktop.

- [ ] **Step 2: Add the `.glass` surface**

Apply it to `#card`, `.tile`, `.option`, `#stats`, `#titlebar` and the buttons.

- Base: `backdrop-filter: blur(22px) saturate(170%) brightness(0.55)`, with a `rgba(10, 14, 30, 0.25)` fill plus a faint white top sheen.
- Edge: a bright 1px highlight using inset `box-shadow`, and a soft outer shadow.
- Refraction: a `::before` ring, masked to the panel edge, with `backdrop-filter: url(#glass-refract) blur(4px)` inside `@supports (backdrop-filter: url(#x))`. Define `#glass-refract` in `index.html` using `feTurbulence` and `feDisplacementMap`.
- Interaction: a small scale and brighter highlight on hover and press.
- Text is white. Emoji are drawn at full opacity, with no filter on them.

- [ ] **Step 3: Add reduced motion**

Under `@media (prefers-reduced-motion: reduce)`, stop the backdrop animation and the hover and press transforms. The countdown bar keeps working.

- [ ] **Step 4: Check contrast on white and on black**

In the browser, set `document.body.style.background` to `#fff`, take a screenshot and sample the pixels behind the panel text on all 4 phases. Repeat with `#000`.
Expected: white text reaches at least 4.5:1 on `#fff`, and panel edges are still visible on `#000`. If contrast falls short, lower `brightness` before adding more tint, to keep the transparency.

- [ ] **Step 5: Check window sizes**

Use `resize_window` at 720×640 and at 2560×1440, on the Recall and Result phases.
Expected: at 720×640, `document.documentElement.scrollHeight <= innerHeight` and all 12 options are visible. At 2560×1440, tiles stay at the 140px cap and the content stays centered.

- [ ] **Step 6: Commit**

```bash
git add ui/style.css ui/index.html
git commit -m "Add liquid glass styling"
```

### Task 4: Windows app and installer

**Files:**
- Create: `src-tauri/Cargo.toml`, `src-tauri/build.rs`, `src-tauri/src/main.rs`, `src-tauri/tauri.conf.json`, `src-tauri/capabilities/default.json`, `src-tauri/app-icon.svg`, `src-tauri/icons/*` (generated)
- Modify: `package.json`, `ui/app.js`

**Interfaces:**
- Consumes: `#window-controls`, `#minimize-button`, `#close-button` from Task 2, and `html.tauri` from Task 3.
- Produces: installer at `src-tauri/target/release/bundle/nsis/Mnemonic Scaler_0.1.0_x64-setup.exe`.

- [ ] **Step 1: Add the Tauri CLI**

Run: `npm install --save-dev @tauri-apps/cli@^2`
Expected: installs with no errors, and `npx tauri --version` prints `tauri-cli 2.x`.

- [ ] **Step 2: Create the Rust shell**

`Cargo.toml`: package `mnemonic-scaler` version `0.1.0`, with `tauri = "2"` and build dependency `tauri-build = "2"`. `build.rs` calls `tauri_build::build()`. `main.rs` sets `windows_subsystem = "windows"` for release builds and runs `tauri::Builder::default()` with `generate_context!()`, and nothing else.

- [ ] **Step 3: Write `tauri.conf.json`**

```json
{
  "productName": "Mnemonic Scaler",
  "version": "0.1.0",
  "identifier": "com.sneakyevil96.mnemonicscaler",
  "build": { "frontendDist": "../ui" },
  "app": {
    "withGlobalTauri": true,
    "windows": [{
      "label": "main",
      "title": "Mnemonic Scaler",
      "width": 960, "height": 720,
      "minWidth": 720, "minHeight": 640,
      "maximizable": false,
      "decorations": false,
      "transparent": true,
      "windowEffects": { "effects": ["acrylic"] }
    }],
    "security": {
      "csp": "default-src 'self'; connect-src ipc: http://ipc.localhost"
    }
  },
  "bundle": { "active": true, "targets": ["nsis"], "icon": ["icons/icon.ico", "icons/icon.png"] }
}
```

- [ ] **Step 4: Grant only the needed permissions**

`capabilities/default.json`: window `main`, with permissions `core:window:allow-minimize`, `core:window:allow-close` and `core:window:allow-start-dragging`.

- [ ] **Step 5: Wire the window controls in `ui/app.js`**

If `window.__TAURI__` exists, add class `tauri` to `<html>` and connect `#minimize-button` and `#close-button` to `window.__TAURI__.window.getCurrentWindow()`.

- [ ] **Step 6: Generate the icons**

Write an original `app-icon.svg` showing a 3×3 glass grid. Run: `npx tauri icon src-tauri/app-icon.svg`. If the CLI rejects SVG, rasterize it to a 1024×1024 PNG first and pass that.
Expected: `src-tauri/icons/icon.ico` exists.

- [ ] **Step 7: Build the installer**

Run: `npm run tauri build`
Expected: exit code 0, and the setup file exists at the path above.

- [ ] **Step 8: Install and launch the app**

Run the setup file with `/S`, then launch the installed app with `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222` set.
Expected: the process is running with a `Mnemonic Scaler` window, and `http://127.0.0.1:9222/json` lists the page.

- [ ] **Step 9: Check the real app over the debug port**

From a script in the scratchpad, using Node's built-in `WebSocket`:

- `html.tauri` is present and `#window-controls` is visible.
- `getComputedStyle(document.body).backgroundColor` is transparent.
- A scripted full round reaches `phase=result` with correct stats.
- `performance.getEntriesByType('resource')` has only local URLs.
- No CSP errors appear in the console.

- [ ] **Step 10: Check minimizing during Memorize**

Start a round, call `getCurrentWindow().minimize()`, wait 11 seconds, then read `body.dataset.phase` over the debug port.
Expected: `recall`. Restore the window and confirm the Recall screen renders normally.

- [ ] **Step 11: Check the glass and window controls**

Capture the window's screen area to the scratchpad and inspect it.
Expected: the desktop shows through with blur. Then confirm that the title bar drags the window (compare window position before and after), that minimize works, and that close ends the process.

- [ ] **Step 12: Commit**

```bash
git add package.json package-lock.json ui/app.js src-tauri
git commit -m "Package game as Windows app"
```

### Task 5: Delivery

**Files:**
- Create: `README.md`

**Interfaces:**
- Consumes: the installer from Task 4.
- Produces: pushed `main`.

- [ ] **Step 1: Write `README.md`**

Cover what the game is, how to install it from a local build (`npm install`, `npm run tauri build`), the SmartScreen warning on the unsigned installer ("More info", then "Run anyway"), and how to run tests (`npm test`).

- [ ] **Step 2: Run the final checks**

Run: `npm test`
Expected: all tests pass.

Run: `git log --format=%B | grep -ci "claude"`
Expected: `0`.

Run: `git status --short`
Expected: no `node_modules` or `target` files listed.

- [ ] **Step 3: Commit and push**

```bash
git add README.md
git commit -m "Add README"
git push -u origin main
```

Expected: push succeeds, and `main` on GitHub shows all commits.
