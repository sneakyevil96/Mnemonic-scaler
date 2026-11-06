# Mnemonic Scaler: Game Design

Date: 2026-11-06
Status: Awaiting spec review

## Goal

A solo memory-training game. The player studies a card of 9 icons for 10 seconds, then recalls the icons at 2 random positions. The card changes and the game repeats until the player stops.

The first release is a Windows desktop app with a liquid glass look. macOS, iPhone and Android come later from the same codebase.

### Success criteria

- A Windows user can install the app and play rounds without a network connection.
- Each round follows the rules below exactly.
- The interface reads as liquid glass, and all text and icons stay easy to see.

## Game rules

These values are fixed. Nothing changes as the player progresses.

| Rule | Value |
| --- | --- |
| Icons on a card | 9, all different, in a 3×3 grid |
| Icon pool | 40 |
| Viewing time | 10 seconds |
| Positions asked per round | 2, always different |
| Answer options per question | 12 |
| Recall time limit | None |
| Session length | Endless, until the player closes the app |

Each round draws 9 new icons at random from the pool and places them at random. Consecutive cards may share icons.

## Game flow

1. **Start.** Shows the rules and a Start button.
2. **Memorize.** Shows the 3×3 card and a 10-second countdown bar. There is no skip button. The game moves on automatically when time runs out.
3. **Recall.** Hides the icons and highlights the first asked tile. The player picks from 12 options: the 9 icons on the card plus 3 decoys from the rest of the pool, in random order. The first answer locks in, without showing whether it was right. The same step then repeats for the second asked tile.
4. **Result.** Reveals the full card. Each asked tile is marked right or wrong. A wrong answer also shows what the player picked. A Next button starts a new round at step 2.

## Scoring

- A correct answer adds 1 to the correct count and 1 to the current streak.
- A wrong answer resets the current streak to 0.
- Streaks count answers, not rounds.
- The game shows correct answers out of total, rounds played, current streak, best streak and accuracy.
- Accuracy before the first answer shows as a dash.
- A round counts as played once both answers are in.
- Stats last for the current session only. Closing the app resets them.

## Liquid glass visual design

The look is translucent, layered and light-bending. It is an original design that uses no Apple assets, icons or branding.

### Window

- The native title bar is removed. A custom glass title bar provides a drag region, a minimize button and a close button.
- The window is transparent with the Windows acrylic effect, so the desktop shows through.
- If the effect is unavailable, the window falls back to the app's own background and stays fully usable.
- The minimum window size keeps the grid and all 12 answer options visible without scrolling.

### Backdrop

Slow-moving, soft color shapes sit behind all panels, so the glass always has something to refract, whatever the desktop shows.

### Glass surfaces

The card, tiles, answer buttons, stats bar and title bar all use the same surface treatment:

- A translucent fill with background blur and raised saturation.
- A refraction effect at the panel edges, using an SVG displacement filter in `backdrop-filter`. WebView2 is Chromium-based and supports this. Plain blur is the fallback.
- A bright specular edge highlight and a soft shadow, so each panel looks raised.
- A gentle press and hover response on interactive elements.

### Readability and accessibility

- Glass panels carry enough tint to keep text at a contrast ratio of at least 4.5:1 on light and dark desktops.
- Emoji icons are drawn fully opaque.
- Right and wrong are shown with symbols as well as color.
- `prefers-reduced-motion` stops the backdrop animation and press effects.
- All controls are native buttons, so keyboard use works. Each icon has a text label for screen readers.

### Fair play

A hidden tile contains no icon in the page at all. The icon is removed, not blurred, so transparency can never leak an answer.

## Architecture

Tauri 2 wraps a plain HTML, CSS and JavaScript game. There is no front-end framework or bundler. No game logic lives in Rust.

```text
ui/
  index.html      Page markup
  style.css       Layout and liquid glass styling
  game.js         Pure game logic, no DOM access
  app.js          Screens, timer, input and window controls
src-tauri/        Tauri 2 shell and Windows configuration
test/
  game.test.js    Unit tests for game.js
package.json      Tauri CLI dependency and scripts
```

### `game.js`

Pure functions with no DOM or timers. It works as a classic browser script and as a Node module, so the tests can load it directly. Every random choice uses an injectable random source.

It provides:

- The pool of 40 icons, each with an emoji and a name. Icons must be easy to tell apart.
- Drawing a card of 9 distinct icons.
- Picking 2 distinct positions.
- Building the 12 shuffled answer options.
- Starting a session, recording an answer and calculating stats.

### `app.js`

Owns the screens, DOM and timer. It calls `game.js` for all rules. The timer compares timestamps, so a hidden or minimized window cannot extend the viewing time.

The window controls use the Tauri window API, and only the permissions they need are granted. In a plain browser, where Tauri is absent, the app hides the window controls, so the browser test still works.

### Data flow

`app.js` asks `game.js` for a new round, renders it and starts the timer. Each answer goes to `game.js`, which returns the updated session. `app.js` then renders the result. Session state is held in memory only.

### Security and offline use

The app makes no network requests and loads no remote content. Fonts, styles and scripts are all local, and a strict content security policy enforces this.

## Error handling

The game has no network, files or saved data, so failures are limited. The cases that matter:

- **Window effect unavailable:** fall back to the app's own background, as described above.
- **Refraction filter unsupported:** fall back to plain blur.
- **Window API unavailable:** hide the window controls.

## Testing

Unit tests use `node:test` and cover:

- A card has 9 distinct icons from the pool.
- A round asks 2 distinct positions within the grid.
- Answer options number 12, are all distinct, and include all 9 card icons plus 3 decoys from outside the card.
- Scoring and streak rules, including the best streak and the accuracy dash.
- A seeded random source gives repeatable results.

Manual checks:

- Play a full round in the built-in browser and check the layout at the minimum window size.
- Build the Windows installer, install it and launch the app once. Confirm that the glass effect, window controls and a full round all work.

## Delivery

- Source is committed to `main` on `sneakyevil96/Mnemonic-scaler` and pushed.
- Commits carry the owner's git identity only, with no Claude attribution.
- Build output stays out of git, and no GitHub Release is published in this work.
- The installer is built locally as an NSIS setup file under `src-tauri/target/release/bundle/nsis/`.
- The installer is unsigned, so Windows SmartScreen warns on first run.

## Out of scope

- macOS, iPhone and Android builds. The layout and the web-based game keep these open for later.
- Difficulty scaling, lives, fixed-length sessions, saved stats, sound and settings.
- Code signing, auto-update and store releases.
