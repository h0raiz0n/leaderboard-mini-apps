/**
 * SPRINT 18 UNIT & INTEGRATION TESTS
 * MTT Redesign, Structure Filtering, Satellite Kick, and Cinema Deck
 * Покерный клуб «Атмосфера»
 */

const assert = require("assert");

global.POKER_CONFIG = require("../shared/poker-config.js");
const dealer = require("../dealer/dealer.js");
const tv = require("../tv/tv.js");

console.log("🏆 Тестирование Sprint 18: MTT Redesign, Фильтрация структур, Кик сателлитов и Cinema Deck...\n");

// 1. Тест сопоставления форматов и структур (poker-config.js)
console.log("1. Проверка правил фильтрации структур по форматам турниров:");
const sngStructs = POKER_CONFIG.getAllowedStructuresForFormat("SnG");
assert.deepStrictEqual(sngStructs, ["SNG_DEEP_1500", "SNG_STANDARD"], "Для SnG доступны строго Про и Легаси");

const mysteryStructs = POKER_CONFIG.getAllowedStructuresForFormat("Mystery");
assert.deepStrictEqual(mysteryStructs, ["SNG_DEEP_1500", "SNG_STANDARD"], "Для Mystery доступны строго Про и Легаси");

const mttStructs = POKER_CONFIG.getAllowedStructuresForFormat("MTT");
assert.deepStrictEqual(mttStructs, ["MTT_PRO_5000"], "Для MTT доступна строго единственная структура MTT_PRO_5000");
console.log("   ✅ poker-config.js строго ограничивает структуры для SnG, Mystery и MTT.");

// 2. Тест переключения видимости карточек структур в интерфейсе пульта ведущего
console.log("\n2. Проверка динамического переключения карточек структур в DOM пульта:");
const mockDomStore = {
  "struct-card-classic": { style: { display: "" } },
  "struct-card-pro": { style: { display: "" } },
  "struct-card-mtt": { style: { display: "" } },
  "struct-grid": { dataset: {} }
};

global.document = {
  getElementById: (id) => mockDomStore[id] || null,
  querySelector: () => null,
  querySelectorAll: () => []
};

// А. Переключение на SnG
dealer.updateStructureVisibilityForFormat("SnG");
assert.strictEqual(mockDomStore["struct-card-classic"].style.display, "flex", "Легаси должна быть видна для SnG");
assert.strictEqual(mockDomStore["struct-card-pro"].style.display, "flex", "Про должна быть видна для SnG");
assert.strictEqual(mockDomStore["struct-card-mtt"].style.display, "none", "MTT структура должна быть скрыта для SnG");
console.log("   ✅ Режим SnG: отображаются Про и Легаси, MTT скрыта.");

// Б. Переключение на Mystery
dealer.updateStructureVisibilityForFormat("Mystery");
assert.strictEqual(mockDomStore["struct-card-classic"].style.display, "flex", "Легаси должна быть видна для Mystery");
assert.strictEqual(mockDomStore["struct-card-pro"].style.display, "flex", "Про должна быть видна для Mystery");
assert.strictEqual(mockDomStore["struct-card-mtt"].style.display, "none", "MTT структура должна быть скрыта для Mystery");
console.log("   ✅ Режим Mystery: отображаются Про и Легаси, MTT скрыта.");

// В. Переключение на MTT
dealer.updateStructureVisibilityForFormat("MTT");
assert.strictEqual(mockDomStore["struct-card-classic"].style.display, "none", "Легаси должна быть скрыта для MTT");
assert.strictEqual(mockDomStore["struct-card-pro"].style.display, "none", "Про должна быть скрыта для MTT");
assert.strictEqual(mockDomStore["struct-card-mtt"].style.display, "flex", "MTT структура должна быть видна для MTT");
console.log("   ✅ Режим MTT: SnG структуры скрыты, отображается только заблокированная структура MTT Pro.");

// 3. Тест принудительного отключения сателлитного стола ведущим (Kick Satellite)
console.log("\n3. Проверка отсоединения (кика) сателлитного стола головным ведущим:");
const initialTables = {
  dealer_vlad: {
    id: "dealer_vlad",
    dealerName: "Влад",
    format: "MTT",
    isMttMaster: true,
    status: "running"
  },
  dealer_crashed: {
    id: "dealer_crashed",
    dealerName: "Зависший стол",
    format: "MTT",
    isMttMaster: false,
    status: "ready",
    playersCount: 9
  }
};

dealer.setTablesState(initialTables);
dealer.kickSatelliteTable("dealer_crashed");

const kickedTable = initialTables.dealer_crashed;
assert.strictEqual(kickedTable.format, "SnG", "Отключенный стол должен быть переведен в формат SnG");
assert.strictEqual(kickedTable.status, "idle", "Отключенный стол должен быть сброшен в idle");
assert.strictEqual(kickedTable.dissolved, true, "Отключенный стол должен быть помечен как dissolved");
console.log("   ✅ Зависший стол успешно отключен и переведен в автономный SnG.");

// 4. Тест фильтрации устаревших столов (isTableStale)
console.log("\n4. Проверка фильтрации устаревших столов:");
const now = Date.now();
// А. Стол на активном перерыве не должен считаться устаревшим
const breakTable = { status: "idle", isBreakActive: true, breakEndsAt: now + 300000 };
assert.strictEqual(dealer.isTableStale(breakTable), false, "Стол на активном перерыве НЕ должен отфильтровываться");

// Б. Стол в игре без startedAt (мок в памяти) не должен считаться устаревшим
const mockRunningTable = { status: "running" };
assert.strictEqual(dealer.isTableStale(mockRunningTable), false, "Запущенный стол без таймштампа не отфильтровывается");

// В. Зависший стол старше 3.5 часов должен считаться устаревшим
const oldTable = { status: "running", startedAt: now - 4 * 3600 * 1000 };
assert.strictEqual(dealer.isTableStale(oldTable), true, "Стол старше 3.5 часов должен считаться stale");
console.log("   ✅ Алгоритм isTableStale корректно защищает активные перерывы и отфильтровывает призраков.");

// 5. Тест активации TV Cinema Deck
console.log("\n5. Проверка переключения режима отображения на ТВ (Cinema Deck vs Multi-Grid):");
let capturedHtml = "";
let capturedDataset = {};

global.document = {
  getElementById: (id) => {
    if (id === "tv-viewport") {
      return {
        dataset: capturedDataset,
        classList: {
          toggle: () => {},
          remove: () => {}
        },
        set innerHTML(val) { capturedHtml = val; },
        get innerHTML() { return capturedHtml; }
      };
    }
    return null;
  }
};

// А. Режим чистого MTT -> Cinema Deck
const pureMtt = {
  dealer_vlad: {
    id: "dealer_vlad",
    dealerName: "Влад",
    format: "MTT",
    isMttMaster: true,
    status: "running",
    levelIndex: 0,
    playersCount: 9,
    initialPlayers: 9,
    durationSec: 600,
    levelEndsAt: now + 500000
  },
  dealer_arina: {
    id: "dealer_arina",
    dealerName: "Арина",
    format: "MTT",
    isMttMaster: false,
    status: "running",
    levelIndex: 0,
    playersCount: 8,
    initialPlayers: 9,
    durationSec: 600,
    levelEndsAt: now + 500000
  }
};

tv.setActiveTables(pureMtt);
tv.renderTables();

assert(capturedHtml.includes("mtt-cinema-deck"), "Для чистого турнира MTT должен рендериться Cinema Deck");
assert(capturedHtml.includes("mtt-hero-center"), "В Cinema Deck должен присутствовать центральный таймер");
assert(capturedHtml.includes("mtt-blinds-deck"), "В Cinema Deck должен присутствовать крупный блок блайндов");
assert(capturedHtml.includes("mtt-tables-dock"), "В Cinema Deck должен присутствовать док статусов столов");
console.log("   ✅ При турнире MTT ТВ-экран формирует грандиозный Cinema Deck с центральным таймером.");

// Б. Смешанный режим (SnG + Mystery) -> 2-карточная сетка
const mixedTables = {
  dealer_vlad: {
    id: "dealer_vlad",
    dealerName: "Влад",
    format: "SnG",
    status: "running",
    durationSec: 420,
    levelEndsAt: now + 300000
  },
  dealer_arina: {
    id: "dealer_arina",
    dealerName: "Арина",
    format: "Mystery",
    status: "running",
    durationSec: 420,
    levelEndsAt: now + 300000
  }
};

tv.setActiveTables(mixedTables);
tv.renderTables();

assert(!capturedHtml.includes("mtt-cinema-deck"), "Для SnG/Mystery Cinema Deck НЕ должен рендериться");
assert(capturedHtml.includes("card-dealer_vlad"), "Должна отображаться карточка стола Влада");
assert(capturedHtml.includes("card-dealer_arina"), "Должна отображаться карточка стола Арины");
console.log("   ✅ Для SnG/Mystery ТВ-экран сохраняет многокарточную сетку столов.");

console.log("\n🎉 ВСЕ ТЕСТЫ SPRINT 18 УСПЕШНО ПРОЙДЕНЫ С ОТЛИЧИЕМ!");
