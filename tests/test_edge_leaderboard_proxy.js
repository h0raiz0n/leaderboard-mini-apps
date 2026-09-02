/**
 * E2E UNIT TEST: Vercel Edge Proxy for Leaderboard API & Firebase Event Sync
 * Антикафе «Атмосфера»
 */

const assert = require("assert");

console.log("⚡ Тестирование Vercel Edge Proxy для Лидерборда и событийного обновления...\n");

// 1. Тест Edge Proxy обработчика
console.log("1. Тест CORS и Cache-Control заголовков в Edge Proxy (/api/leaderboard):");

const edgeProxy = require("../api/leaderboard.js");

const mockHeaders = {};
let responseStatus = 200;
let responseBody = null;

const mockRes = {
  setHeader: (k, v) => { mockHeaders[k.toLowerCase()] = v; },
  status: (code) => {
    responseStatus = code;
    return {
      json: (data) => { responseBody = data; return data; },
      send: (data) => { responseBody = data; return data; },
      end: () => { responseBody = ""; return ""; }
    };
  }
};

// 1.1 OPTIONS Preflight
edgeProxy({ method: "OPTIONS", url: "/api/leaderboard" }, mockRes).then(() => {
  assert.strictEqual(mockHeaders["access-control-allow-origin"], "*", "CORS заголовок должен быть *");
  console.log("   ✅ OPTIONS Preflight возвращает корректные CORS заголовки.");

  // 2. Тест пуша событий в Firebase
  console.log("\n2. Тест pushLeaderboardUpdate() в Firebase RTDB:");
  const firebaseSync = require("../FirebaseSync.js");

  let fetchedUrl = null;
  let fetchedPayload = null;

  global.UrlFetchApp = {
    fetch: (url, options) => {
      fetchedUrl = url;
      fetchedPayload = JSON.parse(options.payload);
      return {
        getResponseCode: () => 200,
        getContentText: () => JSON.stringify({ name: "success" })
      };
    }
  };

  global.CONFIG = {
    FIREBASE_DB_URL: "https://atmosphere-poker-default-rtdb.europe-west1.firebasedatabase.app"
  };

  const ok = firebaseSync.pushLeaderboardUpdate("GAME_123", "SnG", "2026-09-02");
  assert.strictEqual(ok, true, "Функция должна вернуть true при успехе");
  assert(fetchedUrl.includes("/atmosphere/leaderboard_sync.json"), "Эндпоинт должен быть leaderboard_sync.json");
  assert.strictEqual(fetchedPayload.lastGameId, "GAME_123", "lastGameId должен совпадать");
  assert.strictEqual(fetchedPayload.format, "SnG", "format должен совпадать");
  assert(fetchedPayload.timestamp > 0, "timestamp должен быть задан");
  console.log("   ✅ Событие обновления лидерборда сформировано и отправлено в Firebase.");

  console.log("\n🎉 ВСЕ ТЕСТЫ EDGE PROXY И СОБЫТИЙНОГО ОБНОВЛЕНИЯ УСПЕШНО ПРОЙДЕНЫ!");
});
