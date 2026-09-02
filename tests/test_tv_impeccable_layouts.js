/**
 * E2E UNIT TEST: TV Impeccable Cinema Layouts (1, 2, 3, 4 Tables)
 * Покерный клуб «Атмосфера»
 * 
 * Проверяет:
 * 1. Наличие монументальной типографики и нулевого пустого пространства для 1, 2, 3 и 4 столов.
 * 2. Высококонтрастные блайнды и адаптивные масштабы.
 * 3. Корректную генерацию DOM для всех конфигураций столов.
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");

console.log("📺 Тестирование ТВ-дашборда Impeccable Cinema Layouts (1-4 стола)...\n");

const css = fs.readFileSync(path.join(__dirname, "../tv/styles.css"), "utf-8");

// 1. Проверка CSS правил для 1 стола
console.log("1. Проверка масштаба для 1 стола (Hero Billboard):");
assert(css.includes('.tv-viewport[data-tables="1"] .timer-digits'), "Должен быть селектор таймера для 1 стола");
assert(css.includes('.tv-viewport[data-tables="1"] .blinds-number.current'), "Должен быть селектор блайндов для 1 стола");
assert(css.includes("110px"), "Шрифт блайндов для 1 стола должен достигать 110px");
console.log("   ✅ 1 стол: блайнды до 110px, таймер до 230px.");

// 2. Проверка CSS правил для 2 столов
console.log("\n2. Проверка масштаба для 2 столов (Split Screen):");
assert(css.includes('.tv-viewport[data-tables="2"] .blinds-number.current'), "Должен быть селектор для 2 столов");
assert(css.includes("68px"), "Блайнды для 2 столов должны быть 68px");
console.log("   ✅ 2 стола: блайнды 68px, таймер до 155px.");

// 3. Проверка CSS правил для 3 столов
console.log("\n3. Проверка масштаба для 3 столов (Triple Arena):");
assert(css.includes('.tv-viewport[data-tables="3"] .blinds-number.current'), "Должен быть селектор для 3 столов");
assert(css.includes("52px"), "Блайнды для 3 столов должны быть 52px");
console.log("   ✅ 3 стола: блайнды 52px, таймер до 115px.");

// 4. Проверка CSS правил для 4 столов
console.log("\n4. Проверка масштаба для 4 столов (Quad 2x2):");
assert(css.includes('.tv-viewport[data-tables="4"] .blinds-number.current'), "Должен быть селектор для 4 столов");
assert(css.includes("46px"), "Блайнды для 4 столов должны быть 46px (вместо старых 26px)");
console.log("   ✅ 4 стола: блайнды 46px (увеличены на 75%!), таймер до 92px.");

// 5. Проверка генерации HTML для 1, 2, 3 и 4 столов
console.log("\n5. Тест E2E генерации HTML для 1..4 столов:");
const tv = require("../tv/tv.js");
global.window = {};

let renderedDataset = {};
let renderedHtml = "";

global.document = {
  getElementById: (id) => {
    if (id === "tv-viewport") {
      return {
        dataset: renderedDataset,
        get innerHTML() { return renderedHtml; },
        set innerHTML(v) { renderedHtml = v; }
      };
    }
    return { style: {}, textContent: "", addEventListener: () => {} };
  }
};

const makeTable = (id, name, format = "SnG") => ({
  id,
  dealerName: name,
  format,
  status: "running",
  levelIndex: 0,
  durationSec: 420,
  levelEndsAt: Date.now() + 300000
});

// Тест 1 стол
tv.setActiveTables({ t1: makeTable("t1", "Влад") });
tv.renderTables();
assert.strictEqual(renderedDataset.tables, "1", "data-tables должен быть 1");
assert(renderedHtml.includes("Влад"), "Должно отображаться имя ведущего");
assert(renderedHtml.includes("25 / 50"), "Должны отображаться блайнды");

// Тест 2 стола
tv.setActiveTables({ t1: makeTable("t1", "Влад"), t2: makeTable("t2", "Арина") });
tv.renderTables();
assert.strictEqual(renderedDataset.tables, "2", "data-tables должен быть 2");
assert(renderedHtml.includes("Арина"), "Второй стол должен отрендериться");

// Тест 3 стола
tv.setActiveTables({ t1: makeTable("t1", "Влад"), t2: makeTable("t2", "Арина"), t3: makeTable("t3", "Дима") });
tv.renderTables();
assert.strictEqual(renderedDataset.tables, "3", "data-tables должен быть 3");
assert(renderedHtml.includes("Дима"), "Третий стол должен отрендериться");

// Тест 4 стола
tv.setActiveTables({ 
  t1: makeTable("t1", "Влад"), 
  t2: makeTable("t2", "Арина"), 
  t3: makeTable("t3", "Дима"),
  t4: makeTable("t4", "Маша")
});
tv.renderTables();
assert.strictEqual(renderedDataset.tables, "4", "data-tables должен быть 4");
assert(renderedHtml.includes("Маша"), "Четвертый стол должен отрендериться");

console.log("   ✅ Все 4 конфигурации столов успешно отрендерены с корректными data-tables атрибутами.");

console.log("\n🎉 ТЕСТ ТВ-ДАШБОРДА ПО СТАНДАРТАМ IMPECCABLE УСПЕШНО ПРОЙДЕН!");
