/**
 * UNIT TEST: DEALER BOT ENGINE
 * Антикафе «Атмосфера»
 */

const assert = require("assert");

// Мокаем глобальные объекты Apps Script для изолированного тестирования
global.CONFIG = require("../shared/poker-config.js");
global.CONFIG.BLIND_STRUCTURES = {
  SNG_STANDARD: {
    name: "5 000 стек / 7 мин (Стандарт)",
    stack: 5000,
    levels: global.CONFIG.SNG_STRUCTURE.levels
  },
  SNG_TURBO: {
    name: "5 000 стек / 5 мин (Турбо)",
    stack: 5000,
    levels: global.CONFIG.SNG_STRUCTURE.levels
  }
};
global.CONFIG.FORMS = {
  SNG: { id: "1A66JMY-SNG-TEST" },
  MYSTERY: { id: "1asemj8e-MYSTERY-TEST" },
  MTT: { id: "1s-OlXMhd-MTT-TEST" }
};
global.Utilities = {
  formatDate: () => "2026-09-01"
};
global.Session = {
  getScriptTimeZone: () => "GMT+3"
};

const dealerBot = require("../DealerBot.js");

console.log("♠️ Тестирование логики дилерского Telegram-бота...\n");

// 1. Проверка генерации текста и кнопок управления столом
console.log("1. Тест генерации сообщения управления столом:");
const tableRunning = {
  id: "dealer_vlad",
  dealerName: "Влад",
  format: "SnG",
  status: "running",
  levelIndex: 0,
  startedAt: Date.now() - 60000, // 1 мин прошло
  durationSec: 420,
  elapsedBeforePause: 0
};

const view1 = dealerBot.buildDealerControlView(tableRunning, global.CONFIG.BLIND_STRUCTURES.SNG_STANDARD);
assert(view1.text.includes("СТОЛ ВЕДУЩЕГО ВЛАД"), "Текст должен содержать имя ведущего");
assert(view1.text.includes("25 / 50"), "Текст должен содержать текущие блайнды");
assert(view1.text.includes("🟢 <b>ИДЁТ ИГРА</b>"), "Статус должен быть активным");

// Проверка кнопок
const buttonTexts1 = view1.keyboard.flat().map(b => b.text);
assert(buttonTexts1.includes("⏸ Пауза"), "Должна быть кнопка Пауза");
assert(buttonTexts1.includes("⏩ След. раунд"), "Должна быть кнопка След. раунд");
assert(buttonTexts1.includes("❌ Сбросить запуск (ошибка)"), "На 1-й минуте ДОЛЖНА быть кнопка сброса");
assert(buttonTexts1.includes("🏁 Завершить игру"), "Должна быть кнопка Завершить");
console.log("   ✅ Сообщение активного стола и кнопки сформированы корректно.");

// 2. Тест защиты от сброса (исчезновение кнопки отмены после 3 минут)
console.log("\n2. Тест тайм-аута кнопки отмены запуска:");
const tableLate = {
  id: "dealer_vlad",
  dealerName: "Влад",
  format: "SnG",
  status: "running",
  levelIndex: 0,
  startedAt: Date.now() - 240000, // 4 мин прошло (> 180 сек)
  durationSec: 420,
  elapsedBeforePause: 0
};

const viewLate = dealerBot.buildDealerControlView(tableLate, global.CONFIG.BLIND_STRUCTURES.SNG_STANDARD);
const buttonTextsLate = viewLate.keyboard.flat().map(b => b.text);
assert(!buttonTextsLate.includes("❌ Сбросить запуск (ошибка)"), "После 3 минут кнопка сброса ОБЯЗАНА исчезнуть!");
console.log("   ✅ Защита от случайного сброса работает (кнопка исчезла через 3 мин).");

// 3. Тест генерации предзаполненной ссылки Google Form
console.log("\n3. Тест генератора предзаполненной Google Form:");
const formUrl = dealerBot.buildPrefilledFormUrl("SnG", "Влад");
console.log("   Сгенерированный URL: " + formUrl);
assert(formUrl.includes("1A66JMY-SNG-TEST"), "URL должен содержать ID правильной формы");
assert(formUrl.includes("2026-09-01"), "URL должен содержать сегодняшнюю дату");
assert(formUrl.includes("%D0%92%D0%BB%D0%B0%D0%B4") || formUrl.includes("Влад"), "URL должен содержать имя дилера");
console.log("   ✅ Предзаполненная ссылка формируется корректно.");

console.log("\n🎉 ВСЕ ТЕСТЫ ДИЛЕРСКОГО БОТА УСПЕШНО ПРОЙДЕНЫ!");
