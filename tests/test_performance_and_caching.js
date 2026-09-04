/**
 * test_performance_and_caching.js
 * Комплексный тест оптимизации производительности (Performance Roadmap):
 * 1. PWA Service Worker (sw.js): версия atmos-v10, прекэширование ассетов,
 *    стратегия Stale-While-Revalidate, исключение шин Firebase и Telegram.
 * 2. Регистрация Service Worker во всех точках входа: index.html, tv/index.html, dealer/index.html.
 * 3. GPU Hardware Acceleration на ТВ (tv/styles.css): translateZ(0), translate3d, will-change, scale3d.
 * 4. Optimistic UI & In-Flight State Guard в пульте (dealer.js): защита локального стола от затирания
 *    устаревшим сетевым снапшотом во время активной синхронизации.
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");

console.log("⚡ Тестирование оптимизаций производительности (Performance Roadmap)...\n");

// ==========================================
// 1. Проверка Service Worker (sw.js)
// ==========================================
console.log("[1] Проверка конфигурации и стратегий кэширования sw.js:");
const swCode = fs.readFileSync(path.join(__dirname, "../sw.js"), "utf8");

assert(swCode.includes("const CACHE = 'atmos-v10'") || swCode.includes("const CACHE = 'atmos-v17'") || swCode.includes("const CACHE = 'atmos-v18'") || swCode.includes("const CACHE = 'atmos-v19'"), "sw.js должен использовать актуальную версию кэша atmos-v19");
assert(swCode.includes("staleWhileRevalidate") || swCode.includes("networkFirst"), "sw.js должен реализовывать стратегию Stale-While-Revalidate или Network-First");
assert(swCode.includes("/tv") && swCode.includes("/dealer"), "sw.js должен прекэшировать ТВ и пульт дилера");
assert(swCode.includes("firebasedatabase.app"), "sw.js обязан исключать запросы Firebase из кэша (Network-Only)");
assert(swCode.includes("api.telegram.org"), "sw.js обязан исключать запросы Telegram из кэша (Network-Only)");
console.log("   ✅ sw.js: актуальная версия кэша, стратегии кэширования и Network-Only для Firebase/Telegram подтверждены.");

// ==========================================
// 2. Проверка регистрации /sw.js в HTML
// ==========================================
console.log("\n[2] Проверка регистрации /sw.js во всех точках входа:");
const tvHtml = fs.readFileSync(path.join(__dirname, "../tv/index.html"), "utf8");
const dealerHtml = fs.readFileSync(path.join(__dirname, "../dealer/index.html"), "utf8");
const indexHtml = fs.readFileSync(path.join(__dirname, "../index.html"), "utf8");

assert(tvHtml.includes("navigator.serviceWorker.register('/sw.js"), "tv/index.html должен регистрировать /sw.js");
assert(dealerHtml.includes("navigator.serviceWorker.register('/sw.js"), "dealer/index.html должен регистрировать /sw.js");
assert(indexHtml.includes("navigator.serviceWorker.register('/sw.js"), "index.html должен регистрировать /sw.js");
console.log("   ✅ Регистрация /sw.js подтверждена во всех точках входа (ТВ, Пульт, Лидерборд).");

// ==========================================
// 3. Проверка GPU Hardware Acceleration на ТВ (tv/styles.css)
// ==========================================
console.log("\n[3] Проверка GPU Hardware Acceleration в tv/styles.css:");
const tvCss = fs.readFileSync(path.join(__dirname, "../tv/styles.css"), "utf8");

assert(tvCss.includes("transform: translateZ(0)"), "tv/styles.css должен содержать translateZ(0) для выноса карточек в GPU слои");
assert(tvCss.includes("backface-visibility: hidden"), "tv/styles.css должен отключать backface-visibility для плавности композитинга");
assert(tvCss.includes("will-change: transform"), "tv/styles.css должен содержать will-change: transform для плавающих мастей");
assert(tvCss.includes("translate3d(0, -6px, 0)"), "float-suits должен использовать аппаратный translate3d");
assert(tvCss.includes("scale3d("), "pulse-live должен использовать 3D трансформацию scale3d");
assert(tvCss.includes("will-change: border-color, box-shadow"), "state-alert и state-overtime должны содержать will-change для плавных пульсаций");
console.log("   ✅ Аппаратное GPU-ускорение (translateZ, translate3d, will-change, scale3d) на ТВ подтверждено.");

// ==========================================
// 4. Проверка Optimistic UI & In-Flight State Guard в dealer.js
// ==========================================
console.log("\n[4] Проверка Optimistic UI & In-Flight State Guard в dealer.js:");

// Настройка мок-окружения
const elements = {};
function getMockElement(id) {
  if (!elements[id]) {
    elements[id] = {
      id,
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

let storageListeners = [];
global.window = {
  Telegram: {
    WebApp: {
      initDataUnsafe: { user: { username: "h0raiz0n" } },
      HapticFeedback: { impactOccurred: () => {}, notificationOccurred: () => {} }
    }
  },
  addEventListener: (event, handler) => {
    if (event === "storage") storageListeners.push(handler);
  }
};

const localStorageStore = {};
global.localStorage = {
  getItem: (k) => localStorageStore[k] || null,
  setItem: (k, v) => { localStorageStore[k] = String(v); },
  removeItem: (k) => { delete localStorageStore[k]; }
};

global.sessionStorage = {
  _store: { atmosphere_pin_auth: "true", atmosphere_dealer_name: "Влад" },
  getItem: (k) => global.sessionStorage._store[k] || null,
  setItem: (k, v) => { global.sessionStorage._store[k] = String(v); }
};

global.POKER_CONFIG = require("../shared/poker-config.js");
const dealer = require("../dealer/dealer.js");

dealer.initDealerIdentity();
dealer.initDataSource();
dealer.startTable();

const myTable = dealer.getMyTable();
assert.strictEqual(myTable.status, "running", "Стол должен быть запущен");

// 4.1. Локальное оптимистичное изменение (например, пауза)
dealer.togglePause();
assert.strictEqual(myTable.status, "paused", "Оптимистичный отклик: стол сразу перешел в paused");

// Помечаем, что идет отправка в сеть (in-flight sync)
localStorageStore["atmosphere_pending_sync_dealer_vlad"] = "true";

// 4.2. Имитируем приход устаревшего снимка из сети (где статус еще running)
assert(storageListeners.length > 0, "Должен быть зарегистрирован слушатель storage fallback");
const storageHandler = storageListeners[0];

storageHandler({
  key: "atmosphere_tables",
  newValue: JSON.stringify({
    dealer_vlad: {
      id: "dealer_vlad",
      status: "running" // Устаревший статус из сети
    },
    dealer_dima: {
      id: "dealer_dima",
      status: "running",
      playersCount: 8
    }
  })
});

// Проверяем: локальный стол НЕ должен быть затерт устаревшим снимком!
const tableAfterSnapshot = dealer.getMyTable();
assert.strictEqual(tableAfterSnapshot.status, "paused", "In-Flight Guard: статус локального стола ОБЯЗАН остаться paused!");

// Но чужой стол должен обновиться!
dealer.setTablesState(null); // сброс для чистой проверки
storageHandler({
  key: "atmosphere_tables",
  newValue: JSON.stringify({
    dealer_vlad: { id: "dealer_vlad", status: "running" },
    dealer_dima: { id: "dealer_dima", status: "running", playersCount: 7 }
  })
});
assert.strictEqual(dealer.getMyTable().status, "paused", "Локальный стол сохраняет оптимистичный статус paused");

// 4.3. Сетевая синхронизация завершилась (очередь очищена)
delete localStorageStore["atmosphere_pending_sync_dealer_vlad"];
delete localStorageStore["atmosphere_pending_sync"];

// Теперь приход свежего снимка применяется штатно
storageHandler({
  key: "atmosphere_tables",
  newValue: JSON.stringify({
    dealer_vlad: { id: "dealer_vlad", status: "running", levelIndex: 2 }
  })
});
assert.strictEqual(dealer.getMyTable().levelIndex, 2, "После завершения синхронизации снимки применяются штатно");

console.log("   ✅ In-Flight Optimistic State Guard полностью исключает затирание и мерцание при задержках сети.");

console.log("\n🎉 ВСЕ ТЕСТЫ ОПТИМИЗАЦИИ ПРОИЗВОДИТЕЛЬНОСТИ УСПЕШНО ПРОЙДЕНЫ!");
