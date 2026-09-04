/**
 * test_sprint15_audit_and_fixes.js
 * Комплексный тест Спринта 15:
 * 1. Lounge Mode на ТВ: текст "Ожидание начала игр" (без "Свободная посадка")
 * 2. Финальный уровень на ТВ и в пульте: "Блайнды зафиксированы" (без "Игра до победителя")
 * 3. Предотвращение утечки состояния турниров (State Leak Fix): гарантированный сброс colorUpDone,
 *    isColorUpActive, pauseEndsAt, breakEndsAt при рестарте стола (startTable, resetTable, startNewGameFromPostGame)
 * 4. Защита кнопки шага уровня (btn-step) через Confirm Toast с автозакрытием и подтверждением
 */

const assert = require("assert");
global.POKER_CONFIG = require("../shared/poker-config.js");

// Setup minimal DOM mocks
const elements = {};
function getMockElement(id) {
  if (!elements[id]) {
    elements[id] = {
      id,
      dataset: {},
      style: { display: "" },
      classList: {
        classes: new Set(),
        add(c) { this.classes.add(c); },
        remove(c) { this.classes.delete(c); },
        contains(c) { return this.classes.has(c); }
      },
      textContent: "",
      disabled: false,
      title: "",
      addEventListener: () => {},
      querySelector: () => null,
      querySelectorAll: () => []
    };
  }
  return elements[id];
}

global.document = {
  getElementById: (id) => getMockElement(id),
  querySelectorAll: () => [],
  addEventListener: () => {}
};

global.window = {
  Telegram: {
    WebApp: {
      initDataUnsafe: { user: { username: "h0raiz0n" } },
      HapticFeedback: { impactOccurred: () => {}, notificationOccurred: () => {} }
    }
  },
  addEventListener: () => {}
};

global.sessionStorage = {
  _store: { atmosphere_pin_auth: "true", atmosphere_dealer_name: "Влад" },
  getItem(k) { return this._store[k] || null; },
  setItem(k, v) { this._store[k] = String(v); }
};

global.localStorage = {
  _store: {},
  getItem(k) { return this._store[k] || null; },
  setItem(k, v) { this._store[k] = String(v); },
  removeItem(k) { delete this._store[k]; }
};

global.navigator = {
  vibrate: () => {}
};

// Загрузка модулей
const tv = require("../tv/tv.js");
const dealer = require("../dealer/dealer.js");

console.log("▶️ Запуск тестов Спринта 15: Тексты, ликвидация багов состояния и Confirm Toast...");

// ==========================================
// 1. Lounge Mode на ТВ
// ==========================================
console.log("\n[1] Проверка текстов режима Lounge на ТВ:");
let capturedTvHtml = "";
global.document.getElementById = (id) => {
  if (id === "tv-viewport") {
    return {
      dataset: {},
      get innerHTML() { return capturedTvHtml; },
      set innerHTML(v) { capturedTvHtml = v; },
      querySelector: () => null
    };
  }
  return getMockElement(id);
};

tv.setActiveTables({});
tv.renderTables();

assert(capturedTvHtml.includes("Ожидание начала игр"), "Lounge Mode должен содержать статус 'Ожидание начала игр'");
assert(!capturedTvHtml.includes("Свободная посадка"), "Lounge Mode НЕ должен содержать 'Свободная посадка'");
assert(!capturedTvHtml.includes("Ожидание открытия столов"), "Lounge Mode НЕ должен содержать 'Ожидание открытия столов'");
console.log("   ✅ Статус Lounge Mode: 'Ожидание начала игр' подтвержден.");

// ==========================================
// 2. Финальный уровень на ТВ и в пульте дилера
// ==========================================
console.log("\n[2] Проверка текстов финального уровня (ТВ и Пульт):");
const deepStruct = dealer.getActiveStructure("SNG_DEEP_1500");
const maxLevelIdx = deepStruct.levels.length - 1;

const finalTable = {
  id: "dealer_vlad",
  dealerName: "Влад",
  format: "SnG",
  structKey: "SNG_DEEP_1500",
  status: "running",
  levelIndex: maxLevelIdx,
  durationSec: 600,
  startedAt: Date.now() - 10000,
  levelEndsAt: Date.now() + 590000
};

tv.setActiveTables({ dealer_vlad: finalTable });
tv.renderTables();

assert(capturedTvHtml.includes("ФИНАЛЬНЫЙ УРОВЕНЬ"), "ТВ должно отображать 'ФИНАЛЬНЫЙ УРОВЕНЬ'");
assert(capturedTvHtml.includes("Блайнды зафиксированы"), "ТВ должно информировать игроков о фиксации блайндов");
assert(!capturedTvHtml.includes("Игра до победителя"), "ТВ не должно содержать 'Игра до победителя'");
console.log("   ✅ ТВ-дашборд на финале: 'Блайнды зафиксированы' (без 'Игра до победителя').");

// Проверка в пульте дилера
dealer.initDealerIdentity();
dealer.setTablesState({
  dealer_vlad: { ...finalTable }
});
dealer.renderDealerView();

const dealerStatus = getMockElement("timer-status").textContent;
assert(dealerStatus.includes("Блайнды зафиксированы"), `Статус дилера должен содержать 'Блайнды зафиксированы', получено: ${dealerStatus}`);
assert(!dealerStatus.includes("Игра до победителя"), `Статус дилера НЕ должен содержать 'Игра до победителя', получено: ${dealerStatus}`);
console.log("   ✅ Пульт дилера на финале: '🟢 Блайнды зафиксированы' подтвержден.");

// ==========================================
// 3. Ликвидация утечки состояния турниров (State Leak Bug Fix)
// ==========================================
console.log("\n[3] Проверка сброса состояния (State Leak Fix: colorUpDone и др.):");

// Имитируем завершение игры, где были взведены флаги Color-Up и пауз
const dirtyTable = dealer.getMyTable();
dirtyTable.status = "finished";
dirtyTable.levelIndex = 5;
dirtyTable.colorUpDone = true;
dirtyTable.isColorUpActive = true;
dirtyTable.pauseEndsAt = Date.now() + 120000;
dirtyTable.pauseTotalSec = 120;
dirtyTable.breakEndsAt = Date.now() + 300000;
dirtyTable.isBreakActive = true;
dirtyTable.isPostGameBreak = true;
dirtyTable.nextGameAt = Date.now() + 600000;

// Действие дилера: "Новая игра" из режима завершения
dealer.startNewGameFromPostGame();
const resetPostGameTable = dealer.getMyTable();
assert.strictEqual(resetPostGameTable.status, "idle", "Статус после перехода из post-game должен быть idle");
assert.strictEqual(resetPostGameTable.colorUpDone, false, "colorUpDone должен быть сброшен в false");
assert.strictEqual(resetPostGameTable.isColorUpActive, false, "isColorUpActive должен быть сброшен в false");
assert.strictEqual(resetPostGameTable.pauseEndsAt, null, "pauseEndsAt должен быть очищен");
assert.strictEqual(resetPostGameTable.pauseTotalSec, null, "pauseTotalSec должен быть очищен");
assert.strictEqual(resetPostGameTable.breakEndsAt, null, "breakEndsAt должен быть очищен");
assert.strictEqual(resetPostGameTable.isBreakActive, false, "isBreakActive должен быть false");
assert.strictEqual(resetPostGameTable.isPostGameBreak, false, "isPostGameBreak должен быть false");
assert.strictEqual(resetPostGameTable.nextGameAt, null, "nextGameAt должен быть очищен");

// Запуск следующей игры
dealer.startTable();
const newTable = dealer.getMyTable();
assert.strictEqual(newTable.status, "running", "Новый турнир должен быть running");
assert.strictEqual(newTable.levelIndex, 0, "Уровень нового турнира должен начинаться с 0");
assert.strictEqual(newTable.colorUpDone, false, "colorUpDone в новом турнире ОБЯЗАН быть false, чтобы сработал Color-Up");
assert.strictEqual(newTable.isColorUpActive, false, "isColorUpActive должен быть false");
assert.strictEqual(newTable.pauseEndsAt, null, "pauseEndsAt должен быть null");

// Проверка сброса через resetTable()
newTable.colorUpDone = true;
newTable.isColorUpActive = true;
dealer.resetTable();
const afterErrorReset = dealer.getMyTable();
assert.strictEqual(afterErrorReset.status, "idle", "После сброса ошибки статус idle");
assert.strictEqual(afterErrorReset.colorUpDone, false, "colorUpDone после сброса ошибки должен быть false");
assert.strictEqual(afterErrorReset.isColorUpActive, false, "isColorUpActive после сброса ошибки должен быть false");
console.log("   ✅ Сброс состояния между турнирами проверен: colorUpDone, паузы и флаги перерыва полностью изолированы.");

// ==========================================
// 4. Защита кнопки шага уровня (Confirm Step Toast)
// ==========================================
console.log("\n[4] Проверка защитного всплывающего тоста шага уровня (btn-step):");
dealer.startTable();
const runningTable = dealer.getMyTable();
runningTable.levelIndex = 0;

const toastEl = getMockElement("confirm-step-toast");
toastEl.style.display = "none";

// 1-й клик по кнопке "⏩"
dealer.handleStepClick();
assert.strictEqual(toastEl.style.display, "block", "Тост подтверждения должен отобразиться (display: block)");
assert.strictEqual(runningTable.levelIndex, 0, "Уровень НЕ должен переключиться до подтверждения");

// Повторный клик по кнопке "⏩" подтверждает переход
dealer.handleStepClick();
assert.strictEqual(runningTable.levelIndex, 1, "Повторный клик по btn-step должен подтвердить переход на уровень 1");
assert.strictEqual(toastEl.style.display, "none", "После подтверждения тост должен скрыться");

// Проверка отмены через dismissStepToast
dealer.handleStepClick();
assert.strictEqual(toastEl.style.display, "block", "Тост снова открылся");
dealer.dismissStepToast();
assert.strictEqual(toastEl.style.display, "none", "Тост скрылся после отмены");
assert.strictEqual(runningTable.levelIndex, 1, "Уровень остался неизменным (1)");

// Проверка явного клика по кнопке подтверждения "⏩ Да" в тосте
dealer.handleStepClick();
assert.strictEqual(toastEl.style.display, "block");
dealer.confirmNextLevel();
assert.strictEqual(runningTable.levelIndex, 2, "Клик по кнопке тоста переключил уровень на 2");
assert.strictEqual(toastEl.style.display, "none", "Тост скрылся");

// Проверка на финальном уровне: тост не должен открываться
runningTable.levelIndex = 12; // Финал
dealer.handleStepClick();
assert.strictEqual(toastEl.style.display, "none", "На финальном уровне тост не должен открываться");

console.log("   ✅ Механика Confirm Toast для шага уровня работает идеально.");

console.log("\n🎉 ВСЕ ТЕСТЫ СПРИНТА 15 УСПЕШНО ПРОЙДЕНЫ!");
