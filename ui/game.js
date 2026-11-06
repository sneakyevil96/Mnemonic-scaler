// Pure game rules. No DOM and no timers, so Node tests can load this directly.
(function () {
  const VIEW_MS = 10000;
  const CARD_SIZE = 9;
  const QUESTIONS_PER_ROUND = 2;
  const OPTION_COUNT = 12;

  const ICONS = [
    ['⚓', 'anchor'], ['🍎', 'apple'], ['🎈', 'balloon'], ['🍌', 'banana'],
    ['🔔', 'bell'], ['🚲', 'bicycle'], ['📖', 'book'], ['🦋', 'butterfly'],
    ['🌵', 'cactus'], ['📷', 'camera'], ['🕯️', 'candle'], ['🚗', 'car'],
    ['🐱', 'cat'], ['🍒', 'cherries'], ['⏰', 'clock'], ['☁️', 'cloud'],
    ['👑', 'crown'], ['🎲', 'dice'], ['🐶', 'dog'], ['🦆', 'duck'],
    ['🐘', 'elephant'], ['🔥', 'fire'], ['🐟', 'fish'], ['🌸', 'flower'],
    ['🎁', 'gift'], ['🎸', 'guitar'], ['🔨', 'hammer'], ['🎩', 'hat'],
    ['🔑', 'key'], ['⚡', 'lightning'], ['🧲', 'magnet'], ['🌙', 'moon'],
    ['🍄', 'mushroom'], ['🐙', 'octopus'], ['🍕', 'pizza'], ['🌈', 'rainbow'],
    ['🚀', 'rocket'], ['❄️', 'snowflake'], ['⭐', 'star'], ['☂️', 'umbrella'],
  ].map(([emoji, name]) => ({ emoji, name }));

  // mulberry32: small seeded generator, enough for repeatable tests.
  function createRng(seed) {
    let state = seed >>> 0;
    return function () {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Fisher-Yates on a copy. Finishes for any random source, even a constant one.
  function shuffled(list, random) {
    const result = list.slice();
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  function createRound(random = Math.random) {
    const pool = shuffled(ICONS, random);
    const card = pool.slice(0, CARD_SIZE);
    const decoyPool = pool.slice(CARD_SIZE);
    const positions = shuffled(card.map((_, position) => position), random);
    const asked = positions.slice(0, QUESTIONS_PER_ROUND);
    const options = asked.map(() => {
      const decoys = shuffled(decoyPool, random).slice(0, OPTION_COUNT - CARD_SIZE);
      return shuffled(card.concat(decoys), random);
    });
    return { card, asked, options };
  }

  function createSession() {
    return { correct: 0, total: 0, rounds: 0, streak: 0, bestStreak: 0 };
  }

  function recordAnswer(session, round, questionIndex, pickedIcon) {
    const correct = round.card[round.asked[questionIndex]].name === pickedIcon.name;
    const streak = correct ? session.streak + 1 : 0;
    const finishedRound = questionIndex === round.asked.length - 1;
    return {
      correct,
      session: {
        correct: session.correct + (correct ? 1 : 0),
        total: session.total + 1,
        rounds: session.rounds + (finishedRound ? 1 : 0),
        streak,
        bestStreak: Math.max(session.bestStreak, streak),
      },
    };
  }

  function accuracyText(session) {
    if (session.total === 0) return '—';
    return `${Math.round((session.correct / session.total) * 100)}%`;
  }

  const api = {
    ICONS,
    VIEW_MS,
    CARD_SIZE,
    QUESTIONS_PER_ROUND,
    OPTION_COUNT,
    createRng,
    createRound,
    createSession,
    recordAnswer,
    accuracyText,
  };

  if (typeof module !== 'undefined') module.exports = api;
  else globalThis.MnemonicGame = api;
})();
