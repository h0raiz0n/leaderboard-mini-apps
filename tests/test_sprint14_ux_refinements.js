/**
 * UNIT & INTEGRATION TEST: Sprint 14 UX/UI Refinements & Tournament Final Cycle
 * Антикафе «Атмосфера»
 */

const assert = require("assert");
const fs = require("fs");

console.log("🎨 Тестирование улучшений Спринта 14 (UX/UI, Final Level, Lounge Mode)...\n");

// 1. Проверка ТВ шапки: отсутствие пинг-индикатора для игроков
console.log("1. Проверка отсутствия net-status-badge в tv/index.html:");
const tvHtml = fs.readFileSync("tv/index.html", "utf8");
assert(!tvHtml.includes("net-status-badge"), "tv/index.html не должен содержать net-status-badge");
assert(!tvHtml.includes("net-ping-val"), "tv/index.html не должен содержать net-ping-val");
console.log("   ✅ Шапка ТВ чиста от пинг-индикатора.");

// 2. Проверка пульта дилера: компактные плашки структур и живой пинг
console.log("\n2. Проверка компактных плашек и latency-tag в dealer/index.html:");
const dealerHtml = fs.readFileSync("dealer/index.html", "utf8");
assert(dealerHtml.includes("Классика • Без анте"), "Пульт должен содержать компактный подзаголовок классики");
assert(dealerHtml.includes("Pro • С анте (BBA)"), "Пульт должен содержать компактный подзаголовок Pro");
assert(dealerHtml.includes("id=\"latency-tag\""), "Пульт должен содержать latency-tag в шапке");
assert(!dealerHtml.includes("btn-colorup"), "В пульте не должно быть ручной кнопки btn-colorup");
assert(dealerHtml.includes("btn-skip-colorup"), "В пульте должна остаться контекстная кнопка btn-skip-colorup");
console.log("   ✅ Компактные плашки и панель действий в dealer/index.html проверены.");

// 3. Проверка стилей ТВ: равная геометрия бейджей формата и уровня
console.log("\n3. Проверка Unified Pill Geometry в tv/styles.css:");
const tvCss = fs.readFileSync("tv/styles.css", "utf8");
assert(tvCss.includes(".format-badge,\n.round-pill,\n.players-pill"), "tv/styles.css должен содержать объединенную геометрию для бейджей");
assert(tvCss.includes("lounge-suits"), "tv/styles.css должен содержать стили для карточных мастей Lounge Mode");
assert(tvCss.includes("lounge-time"), "tv/styles.css должен содержать стили для клубных часов Lounge Mode");
console.log("   ✅ Единая геометрия бейджей и стили Lounge Mode подтверждены.");

// 4. Тестирование логики финального уровня в dealer.js
console.log("\n4. Тестирование безопасного финала и отсутствия сброса блайндов в dealer.js:");

// Моки DOM для dealer.js
const mockElements = {};
function getOrCreateMockEl(id) {
  if (!mockElements[id]) {
    mockElements[id] = {
      id,
      style: {},
      textContent: "",
      disabled: false,
      title: "",
      classList: {
        _classes: new Set(),
        add(c) { this._classes.add(c); },
        remove(c) { this._classes.delete(c); },
        contains(c) { return this._classes.has(c); }
      },
      addEventListener: () => {}
    };
  }
  return mockElements[id];
}

global.document = {
  getElementById: (id) => getOrCreateMockEl(id),
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener: () => {}
};

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

const dealer = require("../dealer/dealer.js");
dealer.initDealerIdentity();
dealer.startTable();

const table = dealer.getMyTable();
const struct = dealer.getActiveStructure(table.structKey);
const maxLevelIdx = struct.levels.length - 1;

// Переводим стол на последний уровень
table.levelIndex = maxLevelIdx;
dealer.renderDealerView();

const roundEl = getOrCreateMockEl("identity-round");
const nextBlindsEl = getOrCreateMockEl("blinds-next");
const stepBtn = getOrCreateMockEl("btn-step");

assert.strictEqual(roundEl.textContent, "ФИНАЛЬНЫЙ УРОВЕНЬ", "На последнем уровне раунд должен называться 'ФИНАЛЬНЫЙ УРОВЕНЬ'");
assert.strictEqual(nextBlindsEl.textContent, "—", "В поле следующих блайндов должен быть прочерк '—'");
assert.strictEqual(stepBtn.disabled, true, "Кнопка 'След. уровень' должна быть заблокирована на финальном уровне");

// Пытаемся нажать nextLevel() на финальном уровне
dealer.nextLevel();
assert.strictEqual(table.levelIndex, maxLevelIdx, "levelIndex НЕ должен инкрементироваться за пределы maxIdx");
assert.notStrictEqual(table.levelIndex, 0, "levelIndex НЕ должен сбрасываться на 0 (первый уровень)!");

// Симулируем истечение времени на финальном уровне
table.levelEndsAt = Date.now() - 1000;
dealer.checkAutoLevelProgression();
assert.strictEqual(table.levelIndex, maxLevelIdx, "Авто-прогрессия НЕ должна сбрасывать уровень на 0!");
assert(table.levelEndsAt > Date.now(), "Таймер финального уровня должен продолжать отсчет!");
console.log("   ✅ Финал в пульте: 'ФИНАЛЬНЫЙ УРОВЕНЬ', '—', кнопка заблокирована, нет сброса на 0.");

// 5. Тестирование безопасного финала и Lounge Mode на ТВ (tv.js)
console.log("\n5. Тестирование отображения финала и Lounge Mode в tv.js:");
const tv = require("../tv/tv.js");

const tvTables = {
  dealer_vlad: {
    id: "dealer_vlad",
    dealerName: "Влад",
    format: "SnG",
    status: "running",
    levelIndex: 20, // Специально передаем заведомо завышенный индекс
    durationSec: 420,
    levelEndsAt: Date.now() + 200000
  }
};

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
  return getOrCreateMockEl(id);
};

tv.setActiveTables(tvTables);
tv.renderTables();

assert(capturedTvHtml.includes("ФИНАЛЬНЫЙ УРОВЕНЬ"), "ТВ должно отображать 'ФИНАЛЬНЫЙ УРОВЕНЬ'");
assert(capturedTvHtml.includes("Блайнды зафиксированы"), "ТВ должно информировать игроков о фиксации блайндов");
assert(!capturedTvHtml.includes("Игра до победителя"), "ТВ не должно содержать устаревшую формулировку 'Игра до победителя'");
assert(!capturedTvHtml.includes("ФИНАЛ</span>"), "Устаревшая формулировка 'ФИНАЛ' в плашке 'Следующие' должна быть заменена на '—'");
assert(capturedTvHtml.includes("—</span>"), "Плашка следующих блайндов на ТВ должна отображать '—'");
console.log("   ✅ ТВ-дашборд безопасно обработал финал: 'ФИНАЛЬНЫЙ УРОВЕНЬ', '—', блайнды зафиксированы.");

// Проверка Lounge Mode на ТВ (0 активных столов)
tv.setActiveTables({});
tv.renderTables();
assert(capturedTvHtml.includes("lounge-suits"), "Lounge Mode должен содержать карточные масти");
assert(capturedTvHtml.includes("♠"), "Lounge Mode должен содержать символ пики");
assert(capturedTvHtml.includes("lounge-time"), "Lounge Mode должен содержать часы");
assert(!capturedTvHtml.includes("АТМОСФЕРА</div>"), "Lounge Mode НЕ должен содержать дублирующий заголовок 'АТМОСФЕРА'");
console.log("   ✅ Lounge Mode на ТВ оформлен стильно без тройных повторов 'Атмосфера'.");

console.log("\n🎉 ВСЕ ТЕСТЫ СПРИНТА 14 УСПЕШНО ПРОЙДЕНЫ!");
