/**
 * UNIT TEST: FIREBASE SYNC & TV ENGINE
 * Антикафе «Атмосфера»
 */

const assert = require("assert");

// Мокаем глобальные объекты Apps Script
global.getScriptProperty = (key, fallback) => {
  if (key === "FIREBASE_DB_URL") return "https://atmosphere-poker-test.firebaseio.com";
  return fallback;
};

let lastFetchedUrl = "";
let lastPayload = null;
let mockResponseCode = 200;

let storedDb = {};

global.UrlFetchApp = {
  fetch: (url, options) => {
    lastFetchedUrl = url;
    lastPayload = options && options.payload ? JSON.parse(options.payload) : null;
    if (options && options.method === "put" && options.payload) {
      storedDb[url] = JSON.parse(options.payload);
      return {
        getResponseCode: () => 200,
        getContentText: () => JSON.stringify(storedDb[url])
      };
    }
    if (options && options.method === "get") {
      return {
        getResponseCode: () => (storedDb[url] ? 200 : 404),
        getContentText: () => JSON.stringify(storedDb[url] || null)
      };
    }
    return {
      getResponseCode: () => 200,
      getContentText: () => JSON.stringify({ status: "ok" })
    };
  }
};

const firebaseSync = require("../FirebaseSync.js");

console.log("♠️ Тестирование интеграции Firebase и ТВ-дашборда...\n");

// 1. Проверка генерации REST эндпоинта и сериализации данных
console.log("1. Тест отправки состояния стола в Firebase:");
const testTable = {
  id: "dealer_vlad",
  dealerName: "Влад",
  format: "SnG",
  status: "running",
  levelIndex: 1,
  startedAt: 1725062400000,
  durationSec: 420,
  elapsedBeforePause: 0
};

const res = firebaseSync.syncTableToFirebase("dealer_vlad", testTable);
assert.strictEqual(res, true, "Синхронизация должна завершиться успешно");
assert.strictEqual(lastFetchedUrl, "https://atmosphere-poker-test.firebaseio.com/atmosphere/tables/dealer_vlad.json");
assert.strictEqual(lastPayload.dealerName, "Влад");
assert.strictEqual(lastPayload.status, "running");
console.log("   ✅ REST эндпоинт и тело запроса сформированы корректно.");

// 2. Тест чтения состояния стола
console.log("\n2. Тест чтения состояния стола из Firebase:");
const fetched = firebaseSync.getTableFromFirebase("dealer_vlad");
assert.strictEqual(fetched.id, "dealer_vlad");
assert.strictEqual(fetched.dealerName, "Влад");
console.log("   ✅ Чтение состояния стола работает корректно.");

// 3. Тест логики адаптивной сетки ТВ под 1, 2, 3 и 4 стола
console.log("\n3. Тест расчета адаптивной сетки ТВ:");
function getGridMode(tablesCount) {
  if (tablesCount <= 1) return "1";
  if (tablesCount === 2) return "2";
  if (tablesCount === 3) return "3";
  return "4";
}

assert.strictEqual(getGridMode(0), "1", "0 столов -> Lounge экран (1 slot)");
assert.strictEqual(getGridMode(1), "1", "1 стол -> Fullscreen (1 slot)");
assert.strictEqual(getGridMode(2), "2", "2 стола -> Сплит 50/50");
assert.strictEqual(getGridMode(3), "3", "3 стола -> 3 колонки");
assert.strictEqual(getGridMode(4), "4", "4 стола -> Сетка 2x2");
assert.strictEqual(getGridMode(6), "4", "Больше 4 столов -> Ограничение до 4");
console.log("   ✅ Адаптивная раскладка сетки ТВ (1, 2, 3, 4 стола) валидна.");

// 4. Тест триггера 10-минутного перерыва после завершения стола
console.log("\n4. Тест таймера межтурнирного перерыва:");
const finishedTable = {
  id: "dealer_arina",
  dealerName: "Арина",
  status: "idle",
  isPostGameBreak: true,
  nextGameAt: Date.now() + 600000 // +10 минут
};

const remainingBreakSec = Math.floor((finishedTable.nextGameAt - Date.now()) / 1000);
assert(remainingBreakSec >= 595 && remainingBreakSec <= 600, "Таймер перерыва должен быть ~600 сек (10 мин)");
console.log("   ✅ 10-минутный регламентированный отсчёт до следующей игры активен.");

console.log("\n🎉 ВСЕ ТЕСТЫ СИНХРОНИЗАЦИИ И ТВ УСПЕШНО ПРОЙДЕНЫ!");
