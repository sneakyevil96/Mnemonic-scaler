# Mnemonic Scaler

A memory-training game with a liquid glass look. Study a card of 9 icons for 10 seconds, then recall the icons at 2 random positions. Each round brings a new card, and the game runs until you close it.

Windows only for now. macOS, iPhone and Android are planned from the same code.

## Run it

You need Node.js, Rust and the Visual Studio C++ build tools.

```bash
npm install
npm run tauri build -- --no-bundle
```

Then start `src-tauri/target/release/mnemonic-scaler.exe`.

## Test it

```bash
npm test
```

## Project layout

- `ui/game.js`: game rules, with no DOM access
- `ui/app.js`: screens, timer, input and window controls
- `ui/style.css`: layout and liquid glass styling
- `src-tauri/`: Tauri app shell and Windows configuration
- `test/`: unit tests for the game rules
