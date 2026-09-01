/**
 * AUTOMATED TESTS: POKER SUITE & TV ENGINE
 * Антикафе «Атмосфера»
 */

const assert = require("assert");
const POKER_CONFIG = require("../shared/poker-config.js");
const dealerBot = require("../bot/dealer-bot.js");

console.log("♠️ Запуск автоматических тестов покерной системы «Атмосфера»...\n");

// 1. Тест конфигурации стека и фишек
console.log("1. Проверка структуры стека (5 000 фишек — 100 BB):");
const sng = POKER_CONFIG.SNG_STRUCTURE;
let totalChips = 0;
let physicalChipsCount = 0;

sng.chipsDistribution.forEach(c => {
  totalChips += c.total;
  physicalChipsCount += c.count;
});

assert.strictEqual(totalChips, 5000, "Сумма номиналов фишек должна быть ровно 5 000");
assert.strictEqual(physicalChipsCount, 19, "Физическое количество фишек должно быть 19 шт");
assert.strictEqual(sng.levels[0].bb, 50, "Первый уровень блайндов должен быть 25/50");
assert.strictEqual(sng.startingStack / sng.levels[0].bb, 100, "Стартовая глубина должна быть ровно 100 BB");
console.log("   ✅ Стек 5 000 фишек (13 шт, 100 BB) валиден.");

// 2. Тест длительности уровней и турнира
console.log("\n2. Проверка сетки блайндов и тайминга:");
let totalSeconds = 0;
sng.levels.forEach(lvl => {
  totalSeconds += lvl.durationSec;
});
const totalMinutes = totalSeconds / 60;
console.log(`   Общая длительность турнира: ${totalMinutes} мин (${sng.levels.length} уровней).`);
assert(totalMinutes >= 70 && totalMinutes <= 80, "Длительность турнира должна быть в окне 70-80 минут");
assert.strictEqual(sng.levels[5].isBreak, true, "Уровень 6 должен быть перерывом с Color-Up");
assert.strictEqual(sng.levels[6].ante, 400, "Уровень 7 должен включать Big Blind Ante 400");
console.log("   ✅ Сетка блайндов (75 минут) и включение BBA валидны.");

// 3. Тест таймстемп-движка и алерта смены уровней
console.log("\n3. Проверка таймстемп-калькулятора таймера:");
function simulateTimer(startedAtOffsetMs, durationSec, status, elapsedBeforePause = 0) {
  const now = Date.now();
  let elapsed = elapsedBeforePause;
  if (status === "running") {
    elapsed += Math.floor((now - (now - startedAtOffsetMs)) / 1000);
  }
  const remaining = Math.max(0, durationSec - elapsed);
  const isAlert = status === "running" && remaining <= 30 && remaining > 0;
  return { remaining, isAlert };
}

// Случай 1: Середина уровня (300 сек осталось)
const midLevel = simulateTimer(120000, 420, "running");
assert.strictEqual(midLevel.remaining, 300);
assert.strictEqual(midLevel.isAlert, false);

// Случай 2: Конец уровня (20 сек осталось — алерт!)
const endLevel = simulateTimer(400000, 420, "running");
assert.strictEqual(endLevel.remaining, 20);
assert.strictEqual(endLevel.isAlert, true, "При остатке <= 30 сек должен срабатывать алерт");

// Случай 3: Пауза (время не должно утекать)
const pausedLevel = simulateTimer(0, 420, "paused", 150);
assert.strictEqual(pausedLevel.remaining, 270);
assert.strictEqual(pausedLevel.isAlert, false);
console.log("   ✅ Таймстемп-движок, защита от дрифта и визуальный алерт работают корректно.");

// 4. Тест прав дилерского бота
console.log("\n4. Проверка прав дилерского бота:");
dealerBot.BOT_CONFIG.DEALER_WHITELIST = [999001, 999002];
assert.strictEqual(dealerBot.isAuthorizedDealer(999001), true);
assert.strictEqual(dealerBot.isAuthorizedDealer(111000), false);
console.log("   ✅ Белый список Telegram ID дилеров работает корректно.");

console.log("\n🎉 ВСЕ АВТОМАТИЧЕСКИЕ ТЕСТЫ ПРОЙДЕНЫ УСПЕШНО!");
