/**
 * UNIT & UI TEST: Tournament Structure Presets & Bottom Sheet Preview Modal
 * Антикафе «Атмосфера»
 */

const assert = require("assert");

console.log("📑 Тестирование пресетов структур и модалки предпросмотра...\n");

// Имитируем DOM-окружение для теста функций dealer.js
global.window = {
  Telegram: { WebApp: { HapticFeedback: { impactOccurred: () => {}, notificationOccurred: () => {} } } }
};

const elements = {};
global.document = {
  getElementById: (id) => {
    if (!elements[id]) {
      elements[id] = {
        id,
        style: {},
        textContent: "",
        innerHTML: "",
        classList: {
          add: () => {},
          remove: () => {}
        }
      };
    }
    return elements[id];
  },
  querySelectorAll: (sel) => {
    if (sel === "#struct-pills .pill") {
      return [
        { dataset: { struct: "SNG_DEEP_1500" }, classList: { add: () => {}, remove: () => {} } },
        { dataset: { struct: "SNG_STANDARD" }, classList: { add: () => {}, remove: () => {} } }
      ];
    }
    return [];
  },
  addEventListener: () => {}
};

const POKER_CONFIG = require("../shared/poker-config.js");
global.POKER_CONFIG = POKER_CONFIG;

const dealerModule = require("../dealer/dealer.js");

// 1. Проверка получения активных структур
console.log("1. Проверка getActiveStructure:");
const classic = dealerModule.getActiveStructure("SNG_DEEP_1500");
assert.ok(classic, "Классическая структура должна быть доступна");
assert.strictEqual(classic.stack, 1500, "Стек классики = 1500");
assert.strictEqual(classic.colorUpAfterLevel, 4, "Color-Up в классике строго после 4 уровня (50/100)");
assert.strictEqual(classic.levels[3].label, "50 / 100");
assert.strictEqual(classic.levels[4].label, "100 / 200");
console.log("   ✅ SNG_DEEP_1500: стек 1500, Color-Up после 4 уровня (50/100).");

const pro = dealerModule.getActiveStructure("SNG_STANDARD");
assert.ok(pro, "Структура Атмосфера Pro должна быть доступна");
assert.strictEqual(pro.stack, 5000, "Стек Pro = 5000");
assert.strictEqual(pro.colorUpAfterLevel, 5, "Color-Up в Pro строго после 5 уровня (150/300)");
assert.strictEqual(pro.levels[4].label, "150 / 300");
assert.strictEqual(pro.levels[5].label, "200 / 400 (BBA 400)");
assert.strictEqual(pro.levels[7].label, "400 / 800 (BBA 800)");
assert.strictEqual(pro.levels[8].label, "600 / 1200 (BBA 1200)");
console.log("   ✅ SNG_STANDARD: стек 5000, Color-Up после 5 уровня (150/300), есть 400/800 и 600/1200 BBA.");

// 2. Проверка функций модалки предпросмотра
console.log("\n2. Тестирование функций Bottom Sheet модалки:");
assert.strictEqual(typeof dealerModule.openStructurePreview, "function");
assert.strictEqual(typeof dealerModule.closeStructurePreview, "function");
assert.strictEqual(typeof dealerModule.applyPreviewedStructure, "function");

// Открываем модалку классики
dealerModule.openStructurePreview("SNG_DEEP_1500");
const backdrop = elements["struct-modal-backdrop"];
const sheet = elements["struct-modal-sheet"];
const title = elements["preview-modal-title"];
const tbody = elements["preview-modal-tbody"];

assert.strictEqual(backdrop.style.display, "block", "Backdrop должен стать видимым");
assert.strictEqual(sheet.style.display, "flex", "Sheet должен стать видимым");
assert(title.textContent.includes("1 500"), "Заголовок должен содержать стек 1 500");
assert(tbody.innerHTML.includes("COLOR-UP"), "Таблица должна содержать строку COLOR-UP");
assert(tbody.innerHTML.includes("50 / 100"), "Таблица должна содержать блайнды 50/100");
console.log("   ✅ openStructurePreview('SNG_DEEP_1500') корректно формирует разметку со строкой Color-Up.");

// Открываем модалку Pro
dealerModule.openStructurePreview("SNG_STANDARD");
assert(title.textContent.includes("5 000"), "Заголовок должен содержать стек 5 000");
assert(tbody.innerHTML.includes("BBA 800"), "Таблица Pro должна содержать BBA 800");
assert(tbody.innerHTML.includes("400 / 800"), "Таблица Pro должна содержать 400 / 800");
console.log("   ✅ openStructurePreview('SNG_STANDARD') отображает BBA бейджи и сглаживающий уровень 400/800.");

// Закрываем модалку
dealerModule.closeStructurePreview();
assert.strictEqual(backdrop.style.display, "none", "Backdrop должен скрыться");
assert.strictEqual(sheet.style.display, "none", "Sheet должен скрыться");
console.log("   ✅ closeStructurePreview() скрывает модалку.");

// Применяем структуру
dealerModule.openStructurePreview("SNG_STANDARD");
dealerModule.applyPreviewedStructure();
assert.strictEqual(backdrop.style.display, "none", "После выбора структура модалка закрывается");
console.log("   ✅ applyPreviewedStructure() успешно выбирает структуру и закрывает шторку.");

console.log("\n🎉 ВСЕ ТЕСТЫ ПРЕДПРОСМОТРА СТРУКТУР И ПРЕСЕТОВ УСПЕШНО ПРОЙДЕНЫ!");
