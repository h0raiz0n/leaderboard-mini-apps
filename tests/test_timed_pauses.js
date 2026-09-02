/**
 * UNIT TEST: Timed Pauses (Color-Up & Quick Breaks) for Dealer and TV Dashboard
 * Антикафе «Атмосфера»
 */

const assert = require("assert");

console.log("⏱ Тестирование быстрых таймированных пауз (Color-Up / Перерывы)...\n");

// 1. Симуляция состояния стола при запуске таймированной паузы
console.log("1. Тест запуска 2-минутной паузы (Color-Up):");
const mockTable = {
  id: "dealer_vlad",
  dealerName: "Влад",
  status: "running",
  startedAt: Date.now() - 100000,
  elapsedBeforePause: 0,
  durationSec: 420,
  levelIndex: 5
};

function triggerTimedPause(table, seconds) {
  if (table.status === "running") {
    const elapsed = Math.floor((Date.now() - table.startedAt) / 1000);
    table.elapsedBeforePause += elapsed;
    table.startedAt = null;
  }
  table.status = "paused";
  table.pauseEndsAt = Date.now() + seconds * 1000;
  table.pauseTotalSec = seconds;
}

triggerTimedPause(mockTable, 120);

assert.strictEqual(mockTable.status, "paused", "Статус стола должен измениться на paused");
assert.strictEqual(mockTable.pauseTotalSec, 120, "Общее время паузы должно быть 120 сек");
assert(mockTable.pauseEndsAt > Date.now(), "Время окончания паузы должно быть в будущем");
console.log("   ✅ Таймированная пауза 120 сек успешно активирована.");

// 2. Тест расчета времени обратного отсчета для ТВ и пульта
console.log("\n2. Тест обратного отсчета для ТВ-дашборда:");
function formatTimedPause(table) {
  if (table.status === "paused" && table.pauseEndsAt && table.pauseEndsAt > Date.now()) {
    const rem = Math.max(0, Math.floor((table.pauseEndsAt - Date.now()) / 1000));
    const m = Math.floor(rem / 60);
    const s = rem % 60;
    return {
      formatted: `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`,
      subtext: table.pauseTotalSec === 120 ? "☕ Перерыв • Размен фишек (Color-Up)" : `☕ Перерыв (${Math.round(table.pauseTotalSec/60)} мин)`,
      isTimedPause: true
    };
  }
  return { formatted: "00:00", subtext: "Пауза", isTimedPause: false };
}

const pauseInfo = formatTimedPause(mockTable);
assert.strictEqual(pauseInfo.isTimedPause, true);
assert(pauseInfo.formatted.startsWith("01:") || pauseInfo.formatted.startsWith("02:"), "Формат должен быть 01:59..02:00");
assert.strictEqual(pauseInfo.subtext, "☕ Перерыв • Размен фишек (Color-Up)");
console.log(`   ✅ ТВ-дашборд отображает: ${pauseInfo.formatted} • ${pauseInfo.subtext}`);

// 3. Тест возобновления игры (снятие с паузы)
console.log("\n3. Тест возобновления игры (снятие паузы):");
function resumeTable(table) {
  table.status = "running";
  table.pauseEndsAt = null;
  table.pauseTotalSec = null;
  table.startedAt = Date.now();
}

resumeTable(mockTable);
assert.strictEqual(mockTable.status, "running");
assert.strictEqual(mockTable.pauseEndsAt, null);
assert.strictEqual(mockTable.pauseTotalSec, null);
console.log("   ✅ Возобновление игры корректно сбросило таймер паузы.");

console.log("\n🎉 ВСЕ ТЕСТЫ ТАЙМИРОВАННЫХ ПАУЗ УСПЕШНО ПРОЙДЕНЫ!");
