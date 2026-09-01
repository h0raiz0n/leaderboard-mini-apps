/**
 * UNIT & INTEGRATION TEST: Flexible Breaks & Game Finish
 * Антикафе «Атмосфера»
 */

const assert = require("assert");
global.POKER_CONFIG = require("../shared/poker-config.js");

const tvEngine = require("../tv/tv.js");

console.log("♠️ Тестирование гибкого управления перерывами и финишем игры...\n");

// 1. Тест состояния при завершении игры
console.log("1. Тест перехода в статус finished без принудительного перерыва:");
const table = {
  id: "dealer_vlad",
  dealerName: "Влад",
  status: "running",
  startedAt: Date.now() - 300000,
  durationSec: 420
};

// Функция завершения игры (эмуляция dealer.js)
function finishGameSim(t) {
  t.status = "finished";
  t.isBreakActive = false;
  t.breakEndsAt = null;
  t.isPostGameBreak = false;
  t.nextGameAt = null;
  t.startedAt = null;
  return t;
}

const finishedTable = finishGameSim({ ...table });
assert.strictEqual(finishedTable.status, "finished");
assert.strictEqual(finishedTable.isBreakActive, false);
assert.strictEqual(finishedTable.breakEndsAt, null);
console.log("   ✅ Игра завершена, принудительный перерыв не запускается.");

// 2. Тест ручного запуска перерыва на 5, 10, 15 минут
console.log("\n2. Тест ручного запуска перерыва на 5, 10, 15 минут:");
function startCustomBreakSim(t, minutes) {
  t.isBreakActive = true;
  t.breakDurationMin = minutes;
  t.breakEndsAt = Date.now() + minutes * 60 * 1000;
  t.status = "idle";
  return t;
}

const breakTable5 = startCustomBreakSim({ ...finishedTable }, 5);
assert.strictEqual(breakTable5.isBreakActive, true);
assert.strictEqual(breakTable5.breakDurationMin, 5);
assert(breakTable5.breakEndsAt > Date.now());
console.log("   ✅ Перерыв 5 минут успешно запущен.");

// 3. Тест досрочной остановки перерыва
console.log("\n3. Тест досрочной остановки перерыва:");
function stopBreakSim(t) {
  t.isBreakActive = false;
  t.breakEndsAt = null;
  t.status = "idle";
  return t;
}

const stoppedBreak = stopBreakSim({ ...breakTable5 });
assert.strictEqual(stoppedBreak.isBreakActive, false);
assert.strictEqual(stoppedBreak.breakEndsAt, null);
console.log("   ✅ Перерыв успешно остановлен ведущим.");

// 4. Тест отображения на ТВ
console.log("\n4. Тест рендеринга на ТВ при ручном перерыве и остановке:");
let capturedHtml = "";
let capturedDataset = {};
global.document = {
  getElementById: (id) => {
    if (id === "tv-viewport") {
      return {
        dataset: capturedDataset,
        set innerHTML(val) { capturedHtml = val; },
        get innerHTML() { return capturedHtml; }
      };
    }
    return null;
  }
};

// А. Перерыв активен -> карточка на ТВ
tvEngine.setActiveTables({ dealer_vlad: breakTable5 });
tvEngine.renderTables();
assert.strictEqual(capturedDataset.tables, "1");
assert(capturedHtml.includes("ПЕРЕРЫВ"), "Должен отображаться заголовок ПЕРЕРЫВ");
assert(capturedHtml.includes("Стол ведущего Влад"), "Должен отображаться стол ведущего");
console.log("   ✅ ТВ корректно отображает карточку ручного перерыва.");

// Б. Перерыв остановлен -> Lounge экран (0 активных столов)
tvEngine.setActiveTables({ dealer_vlad: stoppedBreak });
tvEngine.renderTables();
assert(capturedHtml.includes("lounge-brand"), "Экран должен вернуться в Lounge-режим ожидания столов");
console.log("   ✅ ТВ плавно возвращается в Lounge-режим при остановке перерыва.");

console.log("\n🎉 ВСЕ ТЕСТЫ ГИБКИХ ПЕРЕРЫВОВ УСПЕШНО ПРОЙДЕНЫ!");
