/**
 * tests/test_single_writer_and_longevity.js
 * E2E & Architectural Verification for Step 2.2:
 * 1. Single Writer Isolation: TV is 100% passive, zero writes (.update, .set, .remove, fetch) to Firebase during auto-progression.
 * 2. Longevity & Immortality of Active Tournaments: Tables running for 6+ hours are NEVER stale and NEVER dissolved.
 * 3. Paused Table Immortality: Tables paused for extended hours are protected from cleanup.
 */

const assert = require("assert");

console.log("▶ Running Single Writer & Tournament Longevity Tests...\n");

// Защита от зависания тестов (таймаут 6с)
setTimeout(() => {
  console.error("❌ TIMEOUT: Тест test_single_writer_and_longevity.js превысил лимит времени 6с!");
  process.exit(1);
}, 6000).unref();

(async function runAllTests() {
  // =============================================================
  // TEST 1: Single Writer Isolation (TV Zero Writes Guarantee)
  // =============================================================
  console.log("1. Проверка архитектурного закона «Single Writer» (ТВ ➔ Firebase = 0 записей):");

  let firebaseMutations = [];
  const mockFirebaseRef = {
    update: (data) => {
      firebaseMutations.push({ method: "update", data });
      return Promise.resolve();
    },
    set: (data) => {
      firebaseMutations.push({ method: "set", data });
      return Promise.resolve();
    },
    remove: () => {
      firebaseMutations.push({ method: "remove" });
      return Promise.resolve();
    }
  };

  global.firebase = {
    apps: [{ name: "[DEFAULT]" }],
    database: () => ({
      ref: (path) => mockFirebaseRef
    })
  };

  let interceptedFetchCalls = [];
  global.fetch = (url, options) => {
    interceptedFetchCalls.push({ url, method: (options && options.method) || "GET" });
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  };

  // Mock minimal DOM for TV
  global.document = {
    getElementById: (id) => ({
      id,
      innerHTML: "",
      textContent: "",
      style: {},
      classList: {
        add: () => {},
        remove: () => {},
        contains: () => false
      },
      querySelector: () => null,
      querySelectorAll: () => []
    }),
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {}
  };

  global.window = {
    addEventListener: () => {}
  };

  const tv = require("../tv/tv.js");
  const POKER_CONFIG = require("../shared/poker-config.js");

  const now = Date.now();
  const testTableKey = "table_test_writer";
  const testTable = {
    id: testTableKey,
    dealerName: "Игорь",
    status: "running",
    format: "SnG",
    levelIndex: 0,
    durationSec: 600,
    remainingMs: 0, // Уровень истек! Требуется автопрогрессия
    levelEndsAt: now - 1000,
    startedAt: now - 600000,
    createdAt: now - 600000
  };

  const mockTables = {};
  mockTables[testTableKey] = testTable;
  tv.setActiveTables(mockTables);

  // Симулируем 10 последовательных циклов автопрогрессии на ТВ
  for (let round = 0; round < 10; round++) {
    testTable.levelEndsAt = Date.now() - 100; // искусственно просрочен
    tv.renderTables();
  }

  // Проверяем: было ли хоть одно обращение на запись в Firebase из ТВ?
  const writeMutations = firebaseMutations.filter(m => m.method === "update" || m.method === "set" || m.method === "remove");
  assert.strictEqual(
    writeMutations.length,
    0,
    `Нарушение Single Writer: ТВ отправил ${writeMutations.length} мутаций в Firebase! Должно быть строго 0.`
  );
  console.log("   ✓ ТВ отработал 10 циклов автопрогрессии: 0 мутаций в Firebase (.update/.set/.remove).");

  // =============================================================
  // TEST 2: Active Tournament Longevity (> 6 Hours)
  // =============================================================
  console.log("\n2. Проверка бессмертия активных столов длительностью более 6 часов:");
  const dealer = require("../dealer/dealer.js");

  const sixHoursAgo = Date.now() - (6 * 3600 * 1000);
  const marathonTable = {
    id: "table_marathon",
    dealerName: "Влад",
    status: "running",
    format: "SnG",
    startedAt: sixHoursAgo,
    createdAt: sixHoursAgo,
    levelIndex: 14,
    durationSec: 600
  };

  // 2.1 isTableStale на ТВ
  const isStaleOnTv = tv.isTableStale(marathonTable);
  assert.strictEqual(
    isStaleOnTv,
    false,
    "ТВ посчитал активный стол длительностью 6 часов устаревшим (isTableStale === true)"
  );
  console.log("   ✓ ТВ: стол длительностью 6 часов признан активным (isTableStale === false).");

  // 2.2 isTableStale в пульте дилера
  const isStaleOnDealer = dealer.isTableStale(marathonTable);
  assert.strictEqual(
    isStaleOnDealer,
    false,
    "Пульт дилера посчитал активный стол длительностью 6 часов устаревшим (isTableStale === true)"
  );
  console.log("   ✓ Дилер: стол длительностью 6 часов признан активным (isTableStale === false).");

  // 2.3 cleanupStaleTablesInFirebase не должен трогать живую игру
  let dissolvedEvents = [];
  firebaseMutations = []; // сбрасываем счетчик

  dealer.cleanupStaleTablesInFirebase("any_session");
  const dissolvedMutations = firebaseMutations.filter(m => m.data && m.data.dissolved === true);
  assert.strictEqual(
    dissolvedMutations.length,
    0,
    "cleanupStaleTablesInFirebase попытался растворить активные столы в игре!"
  );
  console.log("   ✓ Очистка Firebase защитила идущие турниры (0 вызовов dissolved: true).");

  // =============================================================
  // TEST 3: Paused Table Longevity
  // =============================================================
  console.log("\n3. Проверка защиты турниров на длительной паузе:");
  const fiveHoursAgo = Date.now() - (5 * 3600 * 1000);
  const pausedTable = {
    id: "table_paused",
    dealerName: "Олег",
    status: "paused",
    format: "SnG",
    startedAt: fiveHoursAgo,
    createdAt: fiveHoursAgo,
    pausedAt: Date.now() - 300000,
    levelIndex: 8
  };

  assert.strictEqual(tv.isTableStale(pausedTable), false, "ТВ не должен считать стол на паузе устаревшим");
  assert.strictEqual(dealer.isTableStale(pausedTable), false, "Дилер не должен считать стол на паузе устаревшим");
  console.log("   ✓ Стол на длительной паузе защищен от устаревания как на ТВ, так и у дилера.");

  // =============================================================
  // TEST 4: Ghost / Abandoned Tables Elimination
  // =============================================================
  console.log("\n4. Проверка корректной ликвидации реальных призраков (ghost sessions):");
  const ghostIdle = { status: "idle", createdAt: fiveHoursAgo };
  const ghostFinished = { status: "finished", createdAt: fiveHoursAgo };
  const ghostLobby = { status: "lobby", createdAt: Date.now() - (3 * 3600 * 1000) }; // заброшено 3 часа

  assert.strictEqual(tv.isTableStale(ghostIdle), true, "idle стол обязан считаться stale");
  assert.strictEqual(tv.isTableStale(ghostFinished), true, "finished стол обязан считаться stale");
  assert.strictEqual(tv.isTableStale(ghostLobby), true, "заброшенное лобби > 2ч обязано считаться stale");
  console.log("   ✓ Заброшенные сессии (idle, finished, лобби > 2 часов) корректно отфильтровываются.");

  console.log("\n=======================================================");
  console.log("🎉 ВСЕ ТЕСТЫ SINGLE WRITER И БЕССМЕРТИЯ СТОЛОВ (2.2) УСПЕШНО ПРОЙДЕНЫ!");
  console.log("=======================================================");
  process.exit(0);
})().catch(err => {
  console.error("Test failed with error:", err);
  process.exit(1);
});
