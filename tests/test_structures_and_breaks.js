/**
 * UNIT TEST: Tournament Blind Structures & Clean Breaks
 * Антикафе «Атмосфера»
 */

const assert = require("assert");
const POKER_CONFIG = require("../shared/poker-config.js");

console.log("🃏 Тестирование турнирных структур блайндов и чистых перерывов...\n");

// 1. Проверка структуры SNG_STANDARD
console.log("1. Проверка SNG_STANDARD (7 мин / BBA):");
const standard = POKER_CONFIG.BLIND_STRUCTURES.SNG_STANDARD;
assert(standard, "SNG_STANDARD должна присутствовать в конфигурации");
assert.strictEqual(standard.stack, 5000);
assert.strictEqual(standard.levels.length, 10);

// Уровень 1: 25/50
assert.strictEqual(standard.levels[0].durationSec, 420);
assert.strictEqual(standard.levels[0].sb, 25);
assert.strictEqual(standard.levels[0].bb, 50);
assert.strictEqual(standard.levels[0].ante, 0);

// Уровень 6: 200/400 BBA 400 (без встроенного перерыва)
const anteLevel = standard.levels[5];
assert.strictEqual(anteLevel.ante, 400);
assert.strictEqual(anteLevel.durationSec, 420);
console.log("   ✅ Уровень 6 включает BBA анте (400).");

// 2. Проверка структуры SNG_DEEP_1500 (без анте)
console.log("\n2. Проверка SNG_DEEP_1500 (10 мин / Классика без анте):");
const deep = POKER_CONFIG.BLIND_STRUCTURES.SNG_DEEP_1500;
assert(deep, "SNG_DEEP_1500 должна присутствовать в конфигурации");
assert.strictEqual(deep.stack, 1500);
assert.strictEqual(deep.levels.length, 9);

deep.levels.forEach(lvl => {
  assert.strictEqual(lvl.ante, 0, `На уровне ${lvl.level} анте должно быть 0`);
  assert.strictEqual(lvl.durationSec, 600, `На уровне ${lvl.level} длительность должна быть 600 сек`);
});
console.log("   ✅ Классическая структура 1500 содержит 0 анте на всех уровнях.");

// 3. Проверка отсутствия 5-минутной турбо-структуры
console.log("\n3. Проверка удаления турбо 5-минутки:");
assert.strictEqual(POKER_CONFIG.BLIND_STRUCTURES.SNG_TURBO, undefined, "SNG_TURBO должна быть удалена");
console.log("   ✅ 5-минутный турбо-пресет успешно удален.");

console.log("\n🎉 ВСЕ ТЕСТЫ СТРУКТУР И ПЕРЕРЫВОВ УСПЕШНО ПРОЙДЕНЫ!");
