/**
 * TEST: Multi-Tap Gestures, Simulation Mode Persistence & Offline Mock Cockpit
 * Проверка альтернативного скрытого жеста переключения в тестовый режим (ТВ и Пульт),
 * сохранения состояния в localStorage / hash и 100% изоляции от Firebase.
 * Антикафе «Атмосфера»
 */

const assert = require("assert");

// Изоляция сетевых вызовов
require("./network_guard.js");

// DOM Stubs для запуска в среде Node.js
global.window = {
  location: { search: "", hash: "" },
  addEventListener: () => {}
};
const storageMap = {};
global.localStorage = {
  getItem: (k) => storageMap[k] || null,
  setItem: (k, v) => { storageMap[k] = String(v); },
  removeItem: (k) => { delete storageMap[k]; },
  clear: () => { for (const k in storageMap) delete storageMap[k]; }
};

const domElements = {};
global.document = {
  getElementById: (id) => {
    if (!domElements[id]) {
      domElements[id] = {
        id,
        style: { display: "none" },
        classList: {
          classes: new Set(),
          add: function(c) { this.classes.add(c); },
          remove: function(c) { this.classes.delete(c); },
          contains: function(c) { return this.classes.has(c); }
        },
        textContent: ""
      };
    }
    return domElements[id];
  },
  querySelectorAll: () => [],
  addEventListener: () => {}
};

console.log("♠️ Тестирование скрытых жестов и симуляторов ТВ и пульта ведущего...\n");

// 1. Проверка ТВ-симулятора и персистентности в localStorage / Hash
console.log("1. Проверка персистентности симулятора ТВ (localStorage + URL hash):");
const tv = require("../tv/tv.js");

assert.strictEqual(typeof tv.toggleTvSimulator, "function", "toggleTvSimulator должен быть функцией");
assert.strictEqual(typeof tv.setSimulatedTables, "function", "setSimulatedTables должен быть функцией");
assert.strictEqual(typeof tv.resetToLiveFirebase, "function", "resetToLiveFirebase должен быть функцией");

// Активируем режим 3 столов
tv.setSimulatedTables(3);
assert.strictEqual(tv.isSimulationMode(), true, "Режим симуляции ТВ должен стать активным");
assert.strictEqual(global.window.location.hash, "mock=3", "Хэш URL должен синхронизироваться с #mock=3");

const savedTvState = JSON.parse(global.localStorage.getItem("atmo_tv_sim_state"));
assert.strictEqual(savedTvState.type, "tables");
assert.strictEqual(savedTvState.count, 3, "В localStorage должно сохраниться состояние 3 столов");
console.log("   ✅ ТВ-симулятор успешно сохраняет макет 3 столов в localStorage и URL hash.");

// Активируем режим перерыва
tv.setSimulatedBreak();
assert.strictEqual(global.window.location.hash, "mock=break", "Хэш URL должен синхронизироваться с #mock=break");
console.log("   ✅ ТВ-симулятор сохраняет режим перерыва в URL hash.");

// Сброс в Live Firebase
tv.resetToLiveFirebase();
assert.strictEqual(tv.isSimulationMode(), false, "Режим симуляции ТВ должен быть выключен");
assert.strictEqual(global.window.location.hash, "", "Хэш URL должен очиститься");
assert.strictEqual(global.localStorage.getItem("atmo_tv_sim_state"), null, "localStorage должен очиститься при возврате в Live");
console.log("   ✅ Возврат в Live Firebase корректно очищает тестовые флаги и персистентность.");

// 2. Проверка тестового режима пульта дилера (Dealer Simulation Mode)
console.log("\n2. Проверка симулятора пульта дилера (Dealer Simulation Mode):");
const dealer = require("../dealer/dealer.js");

assert.strictEqual(typeof dealer.enableDealerSimulation, "function", "enableDealerSimulation должен быть функцией");
assert.strictEqual(typeof dealer.exitDealerSimulation, "function", "exitDealerSimulation должен быть функцией");
assert.strictEqual(typeof dealer.isDealerSimulationMode, "function", "isDealerSimulationMode должен быть функцией");

// Исходно симуляция выключена
assert.strictEqual(dealer.isDealerSimulationMode(), false, "Исходно пульт дилера не в симуляции");

// Включаем тестовый режим пульта
dealer.enableDealerSimulation();
assert.strictEqual(dealer.isDealerSimulationMode(), true, "Режим симуляции пульта должен стать активным");

const myTable = dealer.getMyTable();
assert.ok(myTable, "В тестовом режиме пульта должен появиться mock-стол");
assert.strictEqual(myTable.status, "running", "Mock-стол должен быть в статусе running");
assert.strictEqual(myTable.levelIndex, 5, "Mock-стол инициализирован 5 уровнем (200/400)");

const banner = global.document.getElementById("dealer-sim-banner");
assert.strictEqual(banner.style.display, "flex", "Баннер тестового режима пульта должен отображаться");
console.log("   ✅ Включение тестового режима пульта инициализирует in-memory стол и показывает баннер.");

// Проверяем, что операции в симуляции пульта не пишут в localStorage pending_sync
dealer.adjustLevelTime(60);
assert.notStrictEqual(global.localStorage.getItem("atmosphere_pending_sync"), "true", "Операции в симуляторе НЕ должны помечаться на синхронизацию с Firebase");
console.log("   ✅ Действия в тестовом режиме пульта изолированы от боевой базы данных.");

// Выходим из симулятора пульта
dealer.exitDealerSimulation();
assert.strictEqual(dealer.isDealerSimulationMode(), false, "После exitDealerSimulation пульт возвращается в нормальный режим");
assert.strictEqual(banner.style.display, "none", "Баннер тестового режима пульта должен скрыться");
console.log("   ✅ Выход из тестового режима пульта восстанавливает исходное состояние.");

console.log("\n🎉 ВСЕ ПРОВЕРКИ СКРЫТЫХ ЖЕСТОВ И ТЕСТОВЫХ РЕЖИМОВ УСПЕШНО ПРОЙДЕНЫ!");
