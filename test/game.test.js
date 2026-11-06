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
