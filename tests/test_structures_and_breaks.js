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
assert.strictEqual(standard.levels.length, 11);

// Уровень 1: 25/50
assert.strictEqual(standard.levels[0].durationSec, 420);
assert.strictEqual(standard.levels[0].sb, 25);
assert.strictEqual(standard.levels[0].bb, 50);
assert.strictEqual(standard.levels[0].ante, 0);

// Уровень 6: Перерыв 5 минут БЕЗ колор-апа
const breakLevel = standard.levels[5];
assert.strictEqual(breakLevel.isBreak, true);
assert.strictEqual(breakLevel.durationSec, 300);
assert(!breakLevel.label.toLowerCase().includes("color-up"), "Колор-ап должен быть удален из текста");
assert.strictEqual(breakLevel.label, "ПЕРЕРЫВ (5 МИН)");
console.log("   ✅ Уровень 6 является чистым 5-минутным перерывом без колор-апа.");

// Уровень 7: 200/400 BBA 400
const anteLevel = standard.levels[6];
assert.strictEqual(anteLevel.ante, 400);
assert.strictEqual(anteLevel.durationSec, 420);
console.log("   ✅ Уровень 7 включает BBA анте (400).");

// 2. Проверка структуры SNG_CLASSIC (без анте)
console.log("\n2. Проверка SNG_CLASSIC (7 мин / Классика без анте):");
const classic = POKER_CONFIG.BLIND_STRUCTURES.SNG_CLASSIC;
assert(classic, "SNG_CLASSIC должна присутствовать в конфигурации");
assert.strictEqual(classic.stack, 5000);
assert.strictEqual(classic.levels.length, 11);

classic.levels.forEach(lvl => {
  if (!lvl.isBreak) {
    assert.strictEqual(lvl.ante, 0, `На уровне ${lvl.level} анте должно быть 0`);
  }
});
console.log("   ✅ Классическая структура содержит 0 анте на всех уровнях.");

// 3. Проверка отсутствия 5-минутной турбо-структуры
console.log("\n3. Проверка удаления турбо 5-минутки:");
assert.strictEqual(POKER_CONFIG.BLIND_STRUCTURES.SNG_TURBO, undefined, "SNG_TURBO должна быть удалена");
console.log("   ✅ 5-минутный турбо-пресет успешно удален.");

console.log("\n🎉 ВСЕ ТЕСТЫ СТРУКТУР И ПЕРЕРЫВОВ УСПЕШНО ПРОЙДЕНЫ!");
