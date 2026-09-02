/**
 * UNIT TEST: 30s Alert & Final Round Overtime Engine
 * Антикафе «Атмосфера»
 */

const assert = require("assert");
global.POKER_CONFIG = require("../shared/poker-config.js");

const tvEngine = require("../tv/tv.js");

console.log("♠️ Тестирование алерта 30 секунд и овертайма финала на ТВ...\n");

// 1. Тест порога алерта 30 секунд (вместо 45 сек)
console.log("1. Тест переключения алерта за 30 секунд:");
const table45s = {
  status: "running",
  startedAt: Date.now() - 375000,
  durationSec: 420, // 45 сек осталось
  elapsedBeforePause: 0
};
const res45s = tvEngine.calculateTableTime(table45s, false);
assert.strictEqual(res45s.remaining, 45);
assert.strictEqual(res45s.isAlert, false, "При остатке 45 сек алерт НЕ должен срабатывать");

const table30s = {
  status: "running",
  startedAt: Date.now() - 390000,
  durationSec: 420, // 30 сек осталось
  elapsedBeforePause: 0
};
const res30s = tvEngine.calculateTableTime(table30s, false);
assert.strictEqual(res30s.remaining, 30);
assert.strictEqual(res30s.isAlert, true, "При остатке <= 30 сек ДОЛЖЕН срабатывать алерт");
console.log("   ✅ Порог алерта строго 30 секунд (45 сек = спокойный режим, 30 сек = янтарный алерт).");

// 2. Тест финального уровня и овертайма (+01:15)
console.log("\n2. Тест овертайма на финальном уровне турнира:");
const finalLevelRunning = {
  status: "running",
  startedAt: Date.now() - 435000, // прошло 435 сек (на 75 сек больше 360 сек длительности)
  durationSec: 360,
  elapsedBeforePause: 0
};

const resFinal = tvEngine.calculateTableTime(finalLevelRunning, true);
assert.strictEqual(resFinal.isOvertime, true, "Должен включиться флаг овертайма");
assert.strictEqual(resFinal.formatted, "+01:15", "Таймер должен отсчитывать овертайм +01:15");
console.log("   ✅ Финальный раунд отображает овертайм (+01:15) вместо зависания на 00:00.");

// 3. Тест рендеринга карточки со статусом финала и плашкой АНТЕ
console.log("\n3. Тест рендеринга карточки со статусом финала и плашкой АНТЕ:");
let capturedHtml = "";
global.document = {
  getElementById: (id) => {
    if (id === "tv-viewport") {
      return {
        dataset: {},
        set innerHTML(val) { capturedHtml = val; },
        get innerHTML() { return capturedHtml; }
      };
    }
    return null;
  }
};

const anteTable = {
  id: "dealer_vlad",
  dealerName: "Влад",
  format: "SnG",
  status: "running",
  levelIndex: 5, // Уровень 6 (200 / 400 + BBA 400)
  startedAt: Date.now(),
  durationSec: 420
};

tvEngine.setActiveTables({ dealer_vlad: anteTable });
tvEngine.renderTables();

assert(capturedHtml.includes("ante-badge"), "Должен присутствовать класс ante-badge");
assert(capturedHtml.includes("АНТЕ 400"), "Должен отображаться бейдж АНТЕ 400");
assert(capturedHtml.includes("blinds-number current"), "Текущие блайнды должны быть выделены");
assert(capturedHtml.includes("blinds-number upcoming"), "Следующие блайнды должны быть второстепенными");
console.log("   ✅ Бейдж АНТЕ и типографическая иерархия блайндов успешно отрендерены.");

console.log("\n🎉 ВСЕ ТЕСТЫ АЛЕРТОВ И ТАЙМЕРА УСПЕШНО ПРОЙДЕНЫ!");
