/**
 * UNIT TEST: Post-Game Flow, Break Resilience & Phrasing Consistency
 * Антикафе «Атмосфера»
 */

const assert = require("assert");
const fs = require("fs");

console.log("♠️ Тестирование послеигрового флоу, перерывов и терминологии...\n");

// 1. Проверка запрета формулировки "покерный клуб"
console.log("1. Проверка отсутствия формулировки 'покерный клуб':");
const filesToCheck = [
  "tv/tv.js",
  "dealer/dealer.js",
  "DealerBot.js",
  "shared/poker-config.js",
  "dealer/index.html",
  "tv/index.html"
];

filesToCheck.forEach(file => {
  if (fs.existsSync(file)) {
    const content = fs.readFileSync(file, "utf8");
    assert(!content.includes("покерный клуб"), `Файл ${file} содержит запрещенную фразу 'покерный клуб'`);
    assert(!content.includes("покерного клуба"), `Файл ${file} содержит запрещенную фразу 'покерного клуба'`);
    console.log(`   ✅ ${file}: формулировка чиста.`);
  }
});

// 2. Проверка терминологии "Уровень" вместо "Раунд" на ТВ
console.log("\n2. Проверка замены 'Раунд' на 'Уровень' на ТВ и в пульте:");
const tvJs = fs.readFileSync("tv/tv.js", "utf8");
assert(tvJs.includes("УРОВЕНЬ ${currentLevel.level}"), "ТВ должно отображать 'УРОВЕНЬ'");
assert(!tvJs.includes("РАУНД ${currentLevel.level}"), "ТВ не должно содержать 'РАУНД'");

const dealerHtml = fs.readFileSync("dealer/index.html", "utf8");
assert(dealerHtml.includes("Уровень 1"), "Пульт дилера должен содержать 'Уровень 1'");
assert(dealerHtml.includes("Анте с 6 уровня"), "Пульт дилера должен содержать 'Анте с 6 уровня'");
assert(!dealerHtml.includes("Анте со 6 уровня"), "Старая опечатка 'со 6 уровня' должна быть удалена");
console.log("   ✅ Терминология 'Уровень' и 'Анте с 6 уровня' проверена.");

// 3. Тестирование логики Post-Game и перерыва перед новой игрой
console.log("\n3. Тестирование флоу послеигрового перерыва:");

// Моки окружения для Node.js
global.window = {
  Telegram: { WebApp: { initDataUnsafe: { user: { username: "h0raiz0n" } }, HapticFeedback: { impactOccurred: () => {}, notificationOccurred: () => {} } } }
};
global.localStorage = {
  _store: {},
  getItem(k) { return this._store[k] || null; },
  setItem(k, v) { this._store[k] = String(v); },
  removeItem(k) { delete this._store[k]; }
};
global.sessionStorage = {
  _store: { atmosphere_pin_auth: "true" },
  getItem(k) { return this._store[k] || null; },
  setItem(k, v) { this._store[k] = String(v); }
};
global.document = {
  getElementById: () => null,
  addEventListener: () => {}
};

const dealerEngine = require("../dealer/dealer.js");

// Инициализируем стол
dealerEngine.initDealerIdentity();
const table = dealerEngine.getMyTable();
table.status = "running";
table.startedAt = Date.now() - 100000;

// Завершаем игру
dealerEngine.finishGame();
assert.strictEqual(table.status, "finished", "После finishGame() статус стола должен быть finished");
assert.strictEqual(table.startedAt, null, "startedAt должен быть сброшен");

// Запускаем послеигровой перерыв на 10 минут
dealerEngine.startPostGameBreak(10);
assert.strictEqual(table.isPostGameBreak, true, "isPostGameBreak должен стать true");
assert.strictEqual(table.postGameBreakMinutes, 10, "Длительность перерыва должна быть 10 мин");
assert(table.nextGameAt > Date.now(), "nextGameAt должен быть в будущем");
console.log("   ✅ Послеигровой перерыв 10 мин успешно установлен.");

// Сбрасываем перерыв
dealerEngine.stopPostGameBreak();
assert.strictEqual(table.isPostGameBreak, false, "isPostGameBreak должен стать false");
assert.strictEqual(table.nextGameAt, null, "nextGameAt должен быть null");
console.log("   ✅ Сброс послеигрового перерыва работает корректно.");

// Запуск новой игры из режима Post-Game
dealerEngine.startNewGameFromPostGame();
assert.strictEqual(table.status, "running", "Новая игра должна стартовать в статусе running");
assert.strictEqual(table.levelIndex, 0, "Новая игра должна начинаться с уровня 0");
assert(table.startedAt > 0, "startedAt должен быть валидным таймстемпом");
console.log("   ✅ Старт новой игры из post-game режима работает безупречно.");

console.log("\n🎉 ВСЕ ТЕСТЫ ПОСЛЕИГРОВОГО ФЛОУ И ТЕРМИНОЛОГИИ УСПЕШНО ПРОЙДЕНЫ!");
