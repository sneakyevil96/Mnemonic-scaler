const test = require('node:test');
const assert = require('node:assert/strict');
const conf = require('../src-tauri/tauri.conf.json');

const windowConf = conf.app.windows[0];

// A 1080p laptop at 150% scale has about 672 logical pixels above the taskbar.
test('window opens centered and fits a 1080p laptop at 150% scale', () => {
  assert.equal(windowConf.center, true);
  assert.ok(windowConf.height <= 660);
  assert.ok(windowConf.height >= windowConf.minHeight);
});
