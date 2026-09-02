/**
 * UNIT TEST: Setup Screen Separation & Stale Table Filter
 * Антикафе «Атмосфера»
 */

const assert = require("assert");

console.log("🎮 Тестирование чистого переключения Setup/Control экранов и фильтра мертвых столов...\n");

// 1. Тест фильтрации заброшенных (мертвых) столов на ТВ
console.log("1. Тест фильтрации заброшенных (stale) столов на ТВ-дашборде:");

const now = Date.now();
const mockTvTables = {
  // Активный стол
  dealer_vlad: {
    id: "dealer_vlad",
    dealerName: "Влад",
    status: "running",
    startedAt: now - 10000,
    durationSec: 420
  },
  // Заброшенный стол (запущен вчера и не завершен)
  dealer_ghost: {
    id: "dealer_ghost",
    dealerName: "Призрак",
    status: "running",
    startedAt: now - 5 * 3600 * 1000, // 5 часов назад
    durationSec: 420
  },
  // Стол на перерыве после завершения
  dealer_dima: {
    id: "dealer_dima",
    dealerName: "Дима",
    status: "finished",
    isPostGameBreak: true,
    nextGameAt: now + 600000
  },
  // Завершенный стол без перерыва
  dealer_masha: {
    id: "dealer_masha",
    dealerName: "Маша",
    status: "finished",
    isPostGameBreak: false
  }
};

function filterTvTables(tables) {
  return Object.keys(tables).filter(k => {
    const t = tables[k];
    if (!t) return false;
    const isStaleGame = t.startedAt && (Date.now() - t.startedAt > 3.5 * 3600 * 1000);
    if (isStaleGame) return false;

    if (t.status === "running" || t.status === "paused") return true;
    if (t.isBreakActive && t.breakEndsAt && (t.breakEndsAt > Date.now())) return true;
    if (t.isPostGameBreak && t.nextGameAt && (t.nextGameAt > Date.now())) return true;
    return false;
  });
}

const activeKeys = filterTvTables(mockTvTables);
assert(activeKeys.includes("dealer_vlad"), "Живой стол Влада должен отображаться");
assert(activeKeys.includes("dealer_dima"), "Стол Димы на перерыве должен отображаться");
assert(!activeKeys.includes("dealer_ghost"), "Заброшенный стол (5 часов назад) должен быть отфильтрован");
assert(!activeKeys.includes("dealer_masha"), "Завершенный стол без перерыва не должен захламлять ТВ");
console.log(`   ✅ Отфильтровано активных столов: ${activeKeys.join(", ")} (мертвые столы скрыты).`);

// 2. Тест переключения режимов пульта (Setup Panel vs Control Card)
console.log("\n2. Тест разделения экранов в пульте ведущего:");

// Моки окружения
global.window = {
  Telegram: { WebApp: { initDataUnsafe: { user: { username: "h0raiz0n" } }, HapticFeedback: { impactOccurred: () => {}, notificationOccurred: () => {} } } }
};
global.localStorage = {
  _store: {},
  getItem(k) { return this._store[k] || null; },
  setItem(k, v) { this._store[k] = String(v); },
  removeItem(k) { delete this._store[k]; }
};
global.sessionStorage = {
  _store: { atmosphere_pin_auth: "true" },
  getItem(k) { return this._store[k] || null; },
  setItem(k, v) { this._store[k] = String(v); }
};

const domElements = {
  "setup-panel": { style: { display: "" } },
  "control-card": { style: { display: "" } },
  "game-btn-stack": { style: { display: "" } },
  "post-game-panel": { style: { display: "" } },
  "running-btn-row": { style: { display: "" } },
  "btn-pause": { textContent: "" },
  "btn-colorup": { style: { display: "" } },
  "btn-reset": { style: { display: "" } },
  "btn-finish": { style: { display: "" } },
  "identity-round": { textContent: "" },
  "blinds-current": { textContent: "" },
  "blinds-next": { textContent: "" },
  "timer-digits": { textContent: "", style: {} },
  "timer-status": { textContent: "" },
  "post-break-buttons": { style: { display: "" } },
  "post-break-active": { style: { display: "" } },
  "post-break-digits": { textContent: "" }
};

global.document = {
  getElementById: (id) => domElements[id] || null,
  addEventListener: () => {}
};

const dealerEngine = require("../dealer/dealer.js");
dealerEngine.initDealerIdentity();

// Состояние IDLE: должен быть показан setup-panel, control-card скрыта
const table = dealerEngine.getMyTable();
table.status = "idle";
dealerEngine.startNewGameFromPostGame();

assert.strictEqual(domElements["setup-panel"].style.display, "flex", "setup-panel должен быть виден в idle");
assert.strictEqual(domElements["control-card"].style.display, "none", "control-card должна быть скрыта в idle");
console.log("   ✅ Состояние IDLE: отображается чистая панель выбора параметров турнира.");

// Запуск игры
dealerEngine.startTable();
assert.strictEqual(table.status, "running");
assert.strictEqual(domElements["setup-panel"].style.display, "none", "setup-panel скрыт во время игры");
assert.strictEqual(domElements["control-card"].style.display, "block", "control-card отображается во время игры");
assert.strictEqual(domElements["game-btn-stack"].style.display, "flex");
assert.strictEqual(domElements["post-game-panel"].style.display, "none");
console.log("   ✅ Состояние RUNNING: карточка игры активна, панель выбора скрыта.");

// Завершение игры
dealerEngine.finishGame();
assert.strictEqual(table.status, "finished");
assert.strictEqual(domElements["control-card"].style.display, "block");
assert.strictEqual(domElements["game-btn-stack"].style.display, "none");
assert.strictEqual(domElements["post-game-panel"].style.display, "flex");
console.log("   ✅ Состояние FINISHED: отображается панель послеигровых действий и перерыва.");

// Переход к выбору параметров для новой игры
dealerEngine.startNewGameFromPostGame();
assert.strictEqual(table.status, "idle");
assert.strictEqual(domElements["setup-panel"].style.display, "flex");
assert.strictEqual(domElements["control-card"].style.display, "none");
console.log("   ✅ Нажатие 'Новая игра': мгновенный возврат к экрану параметров.");

console.log("\n🎉 ВСЕ ТЕСТЫ ЭКРАНОВ И ФИЛЬТРА МЕРТВЫХ СТОЛОВ УСПЕШНО ПРОЙДЕНЫ!");
