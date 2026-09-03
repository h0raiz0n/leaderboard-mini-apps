/**
 * UNIT TEST: Tournament Structures v2 (No In-Structure Breaks, 1500 Deep Stack)
 * Антикафе «Атмосфера»
 */

const assert = require("assert");
const POKER_CONFIG = require("../shared/poker-config.js");

console.log("🃏 Тестирование турнирных структур v2 (без встроенных пауз)...\n");

// 1. Проверка структуры SNG_STANDARD (5 000 стек / 7 мин)
console.log("1. Тест структуры SNG_STANDARD:");
const std = POKER_CONFIG.BLIND_STRUCTURES.SNG_STANDARD;
assert.ok(std, "SNG_STANDARD должна существовать");
assert.strictEqual(std.stack, 5000, "Стартовый стек должен быть 5000");
assert.strictEqual(std.levels.length, 11, "Должно быть 11 уровней блайндов (включая резерв)");

// Проверка отсутствия встроенных перерывов
const breaksInStd = std.levels.filter(l => l.isBreak === true || l.sb === 0);
assert.strictEqual(breaksInStd.length, 0, "В структуре SNG_STANDARD не должно быть раундов-перерывов");
assert.strictEqual(std.levels[0].sb, 25);
assert.strictEqual(std.levels[0].bb, 50);
assert.strictEqual(std.levels[5].sb, 200);
assert.strictEqual(std.levels[5].ante, 400, "Анте со 6 уровня (200/400 BBA 400)");
assert.strictEqual(std.levels[7].sb, 400, "Уровень 8: 400/800 BBA 800");
assert.strictEqual(std.levels[7].ante, 800, "Уровень 8: BBA 800");
assert.strictEqual(std.levels[8].sb, 600, "Уровень 9: 600/1200 BBA 1200");
assert.strictEqual(std.levels[9].bb, 2000, "Уровень 10: финал 1000/2000 BBA 2000");
console.log("   ✅ SNG_STANDARD (5 000 стек / 7 мин): 11 уровней со сглаживающим 400/800 и 600/1200 BBA.");

// 2. Проверка структуры SNG_DEEP_1500 (1 500 стек / 10 мин, без анте)
console.log("\n2. Тест структуры SNG_DEEP_1500 (Классика):");
const deep = POKER_CONFIG.BLIND_STRUCTURES.SNG_DEEP_1500;
assert.ok(deep, "SNG_DEEP_1500 должна существовать");
assert.strictEqual(deep.stack, 1500, "Стартовый стек должен быть 1500");
assert.strictEqual(deep.levels.length, 9, "Должно быть ровно 9 уровней");

// Проверка длительности 10 мин (600 сек) и отсутствия анте
deep.levels.forEach((lvl, idx) => {
  assert.strictEqual(lvl.durationSec, 600, `Уровень ${idx + 1} должен длиться 600 сек (10 мин)`);
  assert.strictEqual(lvl.ante, 0, `Уровень ${idx + 1} не должен иметь анте`);
  assert.strictEqual(lvl.isBreak, false, `Уровень ${idx + 1} не должен быть перерывом`);
});

// Проверка точных номиналов: 5/10, 10/25, 25/50, 50/100, 100/200, 200/400, 400/800, 800/1600, 1000/2000
const expectedBlinds = [
  [5, 10],
  [10, 25],
  [25, 50],
  [50, 100],
  [100, 200],
  [200, 400],
  [400, 800],
  [800, 1600],
  [1000, 2000]
];

expectedBlinds.forEach(([sb, bb], i) => {
  assert.strictEqual(deep.levels[i].sb, sb, `Уровень ${i+1}: малый блайнд должен быть ${sb}`);
  assert.strictEqual(deep.levels[i].bb, bb, `Уровень ${i+1}: большой блайнд должен быть ${bb}`);
});
console.log("   ✅ SNG_DEEP_1500 (1 500 стек / 10 мин): 9 уровней от 5/10 до 1000/2000 без анте.");

console.log("\n🎉 ВСЕ ТЕСТЫ СТРУКТУР БЛАЙНДОВ v2 УСПЕШНО ПРОЙДЕНЫ!");
