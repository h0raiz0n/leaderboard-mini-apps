/**
 * 4K SMART TV HUD STRESS TEST & VISUAL INTEGRITY
 * Антикафе «Атмосфера»
 */

const assert = require("assert");

global.POKER_CONFIG = require("../shared/poker-config.js");

const tvEngine = require("../tv/tv.js");

console.log("♠️ Стресс-тестирование ТВ-дашборда 4K (1, 2, 3, 4 стола)...\n");

// 1. Тест расчета времени и алертов
console.log("1. Тест расчета времени таймера и алертов:");
const activeTable = {
  id: "dealer_vlad",
  dealerName: "Влад",
  status: "running",
  startedAt: Date.now() - 395000, // прошло 395 сек
  durationSec: 420, // осталось 25 сек -> алерт!
  elapsedBeforePause: 0
};

const timeResult = tvEngine.calculateTableTime(activeTable);
assert.strictEqual(timeResult.minutes, 0);
assert.strictEqual(timeResult.seconds, 25);
assert.strictEqual(timeResult.formatted, "00:25");
assert.strictEqual(timeResult.isAlert, true, "При времени <= 30 сек должен включаться визуальный алерт");
console.log("   ✅ Таймер и визуальный алерт (25 сек) работают корректно.");

// 2. Тест различных форматов турниров
console.log("\n2. Тест распознавания форматов столов:");
assert.strictEqual(tvEngine.getFormatLabel("Data"), "SnG");
assert.strictEqual(tvEngine.getFormatLabel("SnG"), "SnG");
assert.strictEqual(tvEngine.getFormatLabel("Mystery"), "Mystery");
assert.strictEqual(tvEngine.getFormatLabel("MTT"), "MTT");
console.log("   ✅ Метки форматов SnG, Mystery, MTT валидны.");

// 3. Тест симуляции 4 активных столов одновременно
console.log("\n3. Тест симуляции 4 столов одновременно на 4K экране:");
const fourTables = {
  dealer_vlad: {
    id: "dealer_vlad",
    dealerName: "Влад",
    format: "SnG",
    status: "running",
    levelIndex: 0,
    startedAt: Date.now(),
    durationSec: 420
  },
  dealer_arina: {
    id: "dealer_arina",
    dealerName: "Арина",
    format: "Mystery",
    status: "paused",
    levelIndex: 2,
    durationSec: 420,
    elapsedBeforePause: 120
  },
  dealer_igor: {
    id: "dealer_igor",
    dealerName: "Игорь",
    format: "MTT",
    status: "running",
    levelIndex: 5, // Break
    startedAt: Date.now(),
    durationSec: 300
  },
  dealer_sergey: {
    id: "dealer_sergey",
    dealerName: "Сергей",
    format: "SnG",
    isPostGameBreak: true,
    nextGameAt: Date.now() + 500000
  }
};

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

// Загружаем 4 стола в tv.js
tvEngine.setActiveTables(fourTables);
tvEngine.renderTables();

assert.strictEqual(capturedDataset.tables, "4", "Сетка должна автоматически переключиться в режим 4 столов (2x2)");
assert(capturedHtml.includes("Влад"), "Стол Влада должен присутствовать");
assert(capturedHtml.includes("Арина"), "Стол Арины должен присутствовать");
assert(capturedHtml.includes("Игорь"), "Стол Игоря должен присутствовать");
assert(capturedHtml.includes("Сергей"), "Стол Сергея (перерыв) должен присутствовать");
assert(capturedHtml.includes("state-paused"), "Стол на паузе должен иметь CSS класс state-paused");
assert(capturedHtml.includes("state-break"), "Стол на перерыве должен иметь CSS класс state-break");
assert(capturedHtml.includes("break-screen-card"), "Завершенный стол должен отображать карточку 10-мин перерыва");

console.log("   ✅ Сетка 4 столов успешно сгенерирована без ошибок.");

console.log("\n🎉 ВСЕ ТЕСТЫ ТВ-ДАШБОРДА 4K УСПЕШНО ПРОЙДЕНЫ!");
