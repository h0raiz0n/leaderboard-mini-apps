/**
 * TEST: Game Counter, Date Normalization & Midnight Session Rollover
 * Проверка устранения бага V8-парсинга дат (1-12 числа), ночных турниров после 00:00
 * и корректности подсчета игр ведущего за день для Telegram-пушей.
 * Антикафе «Атмосфера»
 */

const assert = require("assert");

// Изоляция сетевых вызовов
require("./network_guard.js");

// Подгружаем конфигурацию
global.CONFIG = require("../shared/poker-config.js");
global.CONFIG.IGNORE_LIST = ["СВОБОДНО", "-", "НЕ УКАЗАН", "НЕТ"];
global.CONFIG.DB_COL = {
  GAME_ID: 0,
  DATE: 1,
  FORMAT: 2,
  DEALER: 3,
  PLAYER: 4,
  EVENT: 5,
  POINTS: 6,
  IS_ITM: 7
};
global.CONFIG.FORMATS = {
  Data: { name: "SnG", startCol: 3, places: [] }
};
global.CONFIG.SHEETS = {
  RESULTS: "DB_Results",
  PLAYERS: "DB_Players"
};
global.Logger = { log: () => {} };

// Загружаем Config.js и Normalizer.js
const fs = require("fs");
const configCode = fs.readFileSync("Config.js", "utf8");
eval(configCode);

const normalizerCode = fs.readFileSync("Normalizer.js", "utf8");
eval(normalizerCode);

console.log("♠️ Тестирование нормализации дат, ночных сессий и счётчика игр...\n");

// 1. Проверка устранения бага парсинга V8 (первые 12 дней месяца)
console.log("1. Проверка нормализации дат ДД.ММ.ГГГГ (1–12 число месяца):");
assert.strictEqual(normalizeDate("07.09.2026"), "2026-09-07", "07.09.2026 должно парситься как 2026-09-07 (не июль 9!)");
assert.strictEqual(normalizeDate("01.03.2026"), "2026-03-01", "01.03.2026 должно парситься как 2026-03-01");
assert.strictEqual(normalizeDate("12.11.2026"), "2026-11-12", "12.11.2026 должно парситься как 2026-11-12");
assert.strictEqual(normalizeDate("15.09.2026"), "2026-09-15", "15.09.2026 должно парситься как 2026-09-15");
assert.strictEqual(normalizeDate("2026-09-07"), "2026-09-07", "ISO формат не должен ломаться");
console.log("   ✅ Все даты месяца от 01 до 31 парсятся строго в порядке День-Месяц-Год.");

// 2. Проверка турнирного вечера (ночной овертайм до 06:00 утра)
console.log("\n2. Проверка окна турнирного вечера (getTournamentSessionDate):");
// Турнир начался в 22:30 7 сентября
const eveningTime = new Date("2026-09-07T22:30:00");
assert.strictEqual(getTournamentSessionDate(eveningTime), "2026-09-07", "Вечерняя игра 22:30 относится к текущему дню");

// Турнир завершился в 01:45 ночи 8 сентября (фактически это продолжение вечера 7 сентября)
const midnightTime = new Date("2026-09-08T01:45:00");
assert.strictEqual(getTournamentSessionDate(midnightTime), "2026-09-07", "Ночная игра 01:45 должна относиться к вечеру 7 сентября");

// Утренняя игра в 09:00 8 сентября — это уже новый день
const morningTime = new Date("2026-09-08T09:00:00");
assert.strictEqual(getTournamentSessionDate(morningTime), "2026-09-08", "Утренняя игра после 06:00 относится к 8 сентября");
console.log("   ✅ Ночной турнир после полуночи корректно относится к предыдущему игровому вечеру.");

// 3. Проверка счетчика игр ведущего за день (countDealerGamesToday)
console.log("\n3. Проверка подсчета игр конкретного ведущего за дату:");
const mockDbRows = [
  // Заголовок
  ["GAME_ID", "DATE", "FORMAT", "DEALER", "PLAYER", "EVENT", "POINTS", "IS_ITM"],
  // Игра 1 (Паша, вечер 7 сентября)
  ["G_001", "2026-09-07", "SnG", "Паша", "Иван", "1 место", 5, "ДА"],
  ["G_001", "2026-09-07", "SnG", "Паша", "Петр", "2 место", 3, "ДА"],
  // Игра 2 (Маша, вечер 7 сентября)
  ["G_002", "2026-09-07", "SnG", "Маша", "Олег", "1 место", 5, "ДА"],
  // Игра 3 (Паша, вечер 7 сентября)
  ["G_003", "2026-09-07", "SnG", "Паша", "Сергей", "1 место", 5, "ДА"],
  // Игра Паши за другой день (6 сентября)
  ["G_000", "2026-09-06", "SnG", "Паша", "Иван", "1 место", 5, "ДА"]
];

const mockSpreadsheet = {
  getSheetByName: (name) => {
    if (name === "DB_Results") {
      return {
        getDataRange: () => ({
          getValues: () => mockDbRows
        })
      };
    }
    return {
      getDataRange: () => ({ getValues: () => [] })
    };
  }
};

const pashaCount = countDealerGamesToday(mockSpreadsheet, "Data", "2026-09-07", "Паша", "G_003");
assert.strictEqual(pashaCount, 2, "У Паши 7 сентября ровно 2 уникальные игры (G_001 и G_003)");

const mashaCount = countDealerGamesToday(mockSpreadsheet, "Data", "2026-09-07", "Маша", "G_002");
assert.strictEqual(mashaCount, 1, "У Маши 7 сентября ровно 1 игра (G_002)");

const newDealerCount = countDealerGamesToday(mockSpreadsheet, "Data", "2026-09-07", "Влад", "G_NEW");
assert.strictEqual(newDealerCount, 1, "Для новой игры нового дилера минимум 1");
console.log("   ✅ countDealerGamesToday корректно фильтрует по ведущему и дате (Паша=2, Маша=1, Влад=1).");

// 4. Проверка текста уведомления Telegram
console.log("\n4. Проверка текста Telegram-уведомления:");
const tgNotifierCode = fs.readFileSync("TelegramNotifier.js", "utf8");
assert.ok(
  tgNotifierCode.includes("-я игра у ведущего за сегодня"),
  "Шаблон TelegramNotifier.js должен содержать согласованный текст '-я игра у ведущего за сегодня'"
);
console.log("   ✅ Текст уведомления соответствует формату: '🎩 Ведущий: Паша (X-я игра у ведущего за сегодня)'.");

console.log("\n🎉 ВСЕ ТЕСТЫ СЧЁТЧИКА ИГР И ДАТ УСПЕШНО ПРОЙДЕНЫ!");
