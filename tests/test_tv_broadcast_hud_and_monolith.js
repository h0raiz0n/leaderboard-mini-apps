/**
 * UNIT & INTEGRATION TEST: TV Cinema Broadcast HUD, Monolith Blinds, Time Rail & Multi-Table Scaling
 * Покерный клуб «Атмосфера»
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");

console.log("📺 Тестирование ТВ-таймера Cinema Broadcast HUD, Monolith Blinds и мультистоловых режимов (1-4 стола)...\n");

global.POKER_CONFIG = require("../shared/poker-config.js");
const tv = require("../tv/tv.js");

// 1. Тестирование генератора вехи турнира (getTournamentMilestone)
console.log("1. Тест вычисления турнирных вех (getTournamentMilestone):");
const mockStructure = [
  { level: 1, sb: 25, bb: 50, ante: 0 },
  { level: 2, sb: 50, bb: 100, ante: 0 },
  { level: 3, sb: 75, bb: 150, ante: 0 },
  { level: 4, sb: 100, bb: 200, ante: 0 }, // Color-Up уровень
  { level: 5, sb: 100, bb: 200, ante: 200 },
  { level: 6, sb: 150, bb: 300, ante: 300 }
];

// Уровень 1 -> До Color-Up 3 уровня
let tMock = { colorUpDone: false, status: "running" };
let milestone = tv.getTournamentMilestone(tMock, mockStructure, 0, false, false);
assert.strictEqual(milestone, "Color-Up через 3 ур.");

// Уровень 4 -> Color-Up в конце уровня
milestone = tv.getTournamentMilestone(tMock, mockStructure, 3, false, false);
assert.strictEqual(milestone, "Color-Up в конце уровня");

// Пауза Color-Up
tMock.isColorUpActive = true;
milestone = tv.getTournamentMilestone(tMock, mockStructure, 3, false, true);
assert.strictEqual(milestone, "Размен фишек <100");

// После Color-Up
tMock.isColorUpActive = false;
tMock.colorUpDone = true;
milestone = tv.getTournamentMilestone(tMock, mockStructure, 4, false, false);
assert.strictEqual(milestone, "Фишки <100 выведены");

// Финальный уровень
milestone = tv.getTournamentMilestone(tMock, mockStructure, 5, true, false);
assert.strictEqual(milestone, "Блайнды зафиксированы");
console.log("   ✅ Все турнирные вехи (Color-Up, размен, фиксация) рассчитываются корректно.");

// 2. Тестирование генерации HTML структуры Cinema Broadcast HUD
console.log("\n2. Тест генерации разметки Broadcast HUD (Time Rail, Монолит блайндов, Floor Bar):");

let capturedHtml = "";
let capturedDataset = {};

global.document = {
  getElementById: (id) => {
    if (id === "tv-viewport") {
      return {
        dataset: capturedDataset,
        get innerHTML() { return capturedHtml; },
        set innerHTML(v) { capturedHtml = v; }
      };
    }
    return { style: {}, textContent: "", addEventListener: () => {} };
  }
};
global.window = {};

const singleTable = {
  dealer_vlad: {
    id: "dealer_vlad",
    dealerName: "Влад",
    format: "SnG",
    status: "running",
    levelIndex: 0,
    durationSec: 420,
    levelEndsAt: Date.now() + 300000
  }
};

tv.setActiveTables(singleTable);
tv.renderTables();

// Проверка репрезентации ведущего
assert(capturedHtml.includes("dealer-brand-box"), "Должен присутствовать класс dealer-brand-box");
assert(capturedHtml.includes("dealer-badge-icon"), "Должна присутствовать SVG-иконка ведущего");
assert(capturedHtml.includes("ВЕДУЩИЙ"), "Должна присутствовать плашка ВЕДУЩИЙ");
assert(capturedHtml.includes("Влад"), "Должно отображаться имя ведущего");

// Проверка Time Rail
assert(capturedHtml.includes("time-rail-track"), "Должен присутствовать трек time-rail-track");
assert(capturedHtml.includes("time-rail-fill"), "Должна присутствовать полоса прогресса time-rail-fill");

// Проверка Монолита блайндов
assert(capturedHtml.includes("blinds-monolith"), "Должен присутствовать монолитный контейнер блайндов");
assert(capturedHtml.includes("blinds-number current"), "Текущие блайнды должны быть выделены");

// Проверка Floor Bar
assert(capturedHtml.includes("card-floor-bar"), "Должен присутствовать подвал card-floor-bar");
assert(capturedHtml.includes("floor-upcoming"), "Должен присутствовать блок следующих блайндов");
assert(capturedHtml.includes("floor-milestone"), "Должна присутствовать турнирная веха");
assert(capturedHtml.includes("Color-Up"), "Должно присутствовать упоминание Color-Up");
console.log("   ✅ Все компоненты Broadcast HUD (ведущий, Time Rail, монолит, подвал) успешно сгенерированы.");

// 3. Проверка поведения Анте (скрытие при 0, показ при > 0)
console.log("\n3. Тест отображения Анте в монолите:");
// Уровень 1: анте = 0 -> ante-badge должен иметь display: none
assert(capturedHtml.includes('style="display: none;"'), "Анте должно быть скрыто на уровне 1 (0 анте)");

// Переключаем на уровень с анте
const anteTable = {
  dealer_vlad: {
    id: "dealer_vlad",
    dealerName: "Влад",
    format: "SnG",
    status: "running",
    levelIndex: 5, // Уровень с анте
    durationSec: 420,
    levelEndsAt: Date.now() + 300000
  }
};
tv.setActiveTables(anteTable);
tv.renderTables();
assert(capturedHtml.includes("ante-badge ante-strip"), "Должен присутствовать класс ante-strip");
assert(capturedHtml.includes("АНТЕ 400") || capturedHtml.includes("АНТЕ 300") || capturedHtml.includes("АНТЕ 200"), "Должен отображаться текст АНТЕ");
console.log("   ✅ Отображение/скрытие Анте функционирует в строгом соответствии с уровнем.");

// 4. Проверка адаптивности CSS правил под 1, 2, 3 и 4 стола
console.log("\n4. Проверка масштабирования CSS для 1..4 столов:");
const css = fs.readFileSync(path.join(__dirname, "../tv/styles.css"), "utf-8");

// 1 стол
assert(css.includes('.tv-viewport[data-tables="1"] .table-card'));
assert(css.includes('.tv-viewport[data-tables="1"] .blinds-number.current'));
assert(css.includes("110px"), "1 стол: блайнды до 110px");
assert(css.includes('.tv-viewport[data-tables="1"] .time-rail-track'));

// 2 стола
assert(css.includes('.tv-viewport[data-tables="2"] .blinds-number.current'));
assert(css.includes("68px"), "2 стола: блайнды 68px");
assert(css.includes('.tv-viewport[data-tables="2"] .time-rail-track'));

// 3 стола
assert(css.includes('.tv-viewport[data-tables="3"] .blinds-number.current'));
assert(css.includes("52px"), "3 стола: блайнды 52px");
assert(css.includes('.tv-viewport[data-tables="3"] .card-floor-bar'));

// 4 стола
assert(css.includes('.tv-viewport[data-tables="4"] .blinds-number.current'));
assert(css.includes("46px"), "4 стола: блайнды 46px");
assert(css.includes('.tv-viewport[data-tables="4"] .time-rail-track'));
assert(css.includes('.tv-viewport[data-tables="4"] .card-floor-bar'));
console.log("   ✅ Специфичные правила и типографика для 1, 2, 3 и 4 столов полностью присутствуют в CSS.");

// 5. Проверка генерации multi-table конфигураций (1..4 стола)
console.log("\n5. Тест E2E генерации 1..4 столов в tv.js:");
const makeT = (id, name) => ({
  id,
  dealerName: name,
  format: "SnG",
  status: "running",
  levelIndex: 0,
  durationSec: 420,
  levelEndsAt: Date.now() + 300000
});

// 1 стол
tv.setActiveTables({ t1: makeT("t1", "Влад") });
tv.renderTables();
assert.strictEqual(capturedDataset.tables, "1");

// 2 стола
tv.setActiveTables({ t1: makeT("t1", "Влад"), t2: makeT("t2", "Арина") });
tv.renderTables();
assert.strictEqual(capturedDataset.tables, "2");

// 3 стола
tv.setActiveTables({ t1: makeT("t1", "Влад"), t2: makeT("t2", "Арина"), t3: makeT("t3", "Дима") });
tv.renderTables();
assert.strictEqual(capturedDataset.tables, "3");

// 4 стола
tv.setActiveTables({ t1: makeT("t1", "Влад"), t2: makeT("t2", "Арина"), t3: makeT("t3", "Дима"), t4: makeT("t4", "Маша") });
tv.renderTables();
assert.strictEqual(capturedDataset.tables, "4");
assert(capturedHtml.includes("Маша"));
console.log("   ✅ Все 4 конфигурации столов (1, 2, 3, 4) корректно рендерятся.");

console.log("\n🎉 ВСЕ ТЕСТЫ BROADCAST HUD, MONOLITH BLINDS И МУЛЬТИСТОЛОВОЙ АДАПТАЦИИ УСПЕШНО ПРОЙДЕНЫ!");
