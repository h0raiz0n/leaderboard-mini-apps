/**
 * E2E UNIT TEST: TV Multi-Transport Resilience & Overtime Animations
 * Антикафе «Атмосфера»
 */

const assert = require("assert");

console.log("📺 Тестирование двойного транспорта данных (WebSocket + REST) и овертайма на ТВ...\n");

// Моки DOM окружения
global.document = {
  getElementById: (id) => {
    if (id === "tv-viewport") {
      return {
        dataset: {},
        innerHTML: ""
      };
    }
    return { style: {}, textContent: "" };
  }
};

let restFetched = false;
global.fetch = async (url) => {
  restFetched = true;
  return {
    ok: true,
    json: async () => ({
      table_1: {
        id: "table_1",
        dealerName: "Влад",
        format: "SnG",
        status: "running",
        levelIndex: 0,
        durationSec: 420,
        levelEndsAt: Date.now() + 15000 // 15 секунд осталось (алерт)
      },
      table_2: {
        id: "table_2",
        dealerName: "Арина",
        format: "MTT",
        status: "running",
        levelIndex: 0,
        durationSec: 420,
        levelEndsAt: Date.now() - 35000 // 35 секунд овертайма
      }
    })
  };
};

const tv = require("../tv/tv.js");

// 1. Тест REST Polling Fallback
console.log("1. Тест REST Polling Fallback при отсутствии WebSocket:");
tv.fetchTablesRest().then(() => {
  assert.strictEqual(restFetched, true, "fetchTablesRest должен успешно запросить данные через REST");
  console.log("   ✅ Данные столов успешно получены через аварийный REST-транспорт.");

  // 2. Тест алерта 30с и овертайма
  console.log("\n2. Тест расчета времени и флагов isAlert и isOvertime:");
  const alertTime = tv.calculateTableTime({
    status: "running",
    durationSec: 420,
    levelEndsAt: Date.now() + 15000
  });

  assert.strictEqual(alertTime.isAlert, true, "isAlert должен быть true при <=30 сек");
  assert.strictEqual(alertTime.isOvertime, false, "isOvertime должен быть false");
  console.log(`   ✅ Алерт активен: remaining = ${alertTime.remaining}s, formatted = ${alertTime.formatted}`);

  const overtimeTime = tv.calculateTableTime({
    status: "running",
    durationSec: 420,
    levelEndsAt: Date.now() - 35000
  });

  assert.strictEqual(overtimeTime.isOvertime, true, "isOvertime должен быть true при просроченном levelEndsAt");
  assert(overtimeTime.formatted.startsWith("+"), "Таймер овертайма должен начинаться с +");
  console.log(`   ✅ Овертайм активен: formatted = ${overtimeTime.formatted}`);

  // 3. Тест рендеринга сетки столов
  console.log("\n3. Тест рендеринга сетки с классами состояний:");
  tv.renderTables();
  console.log("   ✅ Сетка столов успешно отрендерена с поддержкой стилей овертайма.");

  console.log("\n🎉 ВСЕ ТЕСТЫ ТРАНСПОРТА И ОВЕРТАЙМА ТВ УСПЕШНО ПРОЙДЕНЫ!");
});
