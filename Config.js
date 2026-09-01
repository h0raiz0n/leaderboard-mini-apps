// ==========================================
// ЦЕНТРАЛЬНАЯ КОНФИГУРАЦИЯ ПРОЕКТА
// ==========================================
// Единый источник правды для форматов игр, форм, таблиц и настроек.
// Любые правки правил очков / мест / форм делаются ТОЛЬКО здесь.

var CONFIG = {
  // Название клуба
  CLUB_NAME: "Атмосфера",

  // Реестр официальных дилеров клуба (маппинг с Google Form)
  DEALERS_REGISTRY: {
    LIST: [
      "Арина",
      "Арташес",
      "Влад",
      "Всеволод",
      "Дима",
      "Маша",
      "Нинель",
      "Паша",
      "Рома",
      "Саша",
      "Тимур",
      "Эмилия"
    ],
    MAP: {
      "arina_makk": "Арина",
      "arbuzmane": "Арташес",
      "h0raiz0n": "Влад",
      "dsh838": "Всеволод",
      "sntrpe": "Дима",
      "starynskaya": "Маша",
      "ninel_mr": "Нинель",
      "trick_str": "Паша",
      "klimovichroman": "Рома",
      "alexsan2186": "Саша",
      "hezadono": "Тимур",
      "assyyyra": "Эмилия"
    }
  },

  // Имена листов в основной (админской) таблице
  SHEETS: {
    PLAYERS: "PlayersDB",
    RESULTS: "DB_Results",
    LEADERBOARD: "Leaderboard",
    SNAPSHOTS: "Snapshots",
    // Листы-приёмники сырых данных из Google Forms
    RAW_SNG: "Data",
    RAW_MTT: "MTT",
    RAW_MYSTERY: "Mystery",
    // Служебный лист для журнала бэкфилла (создаётся при необходимости)
    BACKFILL_LOG: "BackfillLog"
  },

  // Игроки, исключаемые из лидерборда / нормализации
  IGNORE_LIST: ["Not participating", "Guest", "Аноним", ""],

  // ID связки Google Forms <-> листы-приёмники
  FORMS: {
    SNG:      { id: '1A66JMY-KDuCq6nMnfbFkawj-nIX_ZKdz5CpcKg6pTgo', sheetName: "Data",     sheet: "Data" },
    MTT:      { id: '1s-OlXMhdWQEkY0g0i75Jbb1MS5AC0zBZjjYAzWh_KIU', sheetName: "MTT",     sheet: "MTT" },
    MYSTERY:  { id: '1asemj8eLS8Dyu6P39VHf8v_dR7Cz3fomYfWnqWdIrC8', sheetName: "Mystery", sheet: "Mystery" }
  },

  // Заголовки вопросов В ФОРМАХ, по которым обновляются списки игроков
  FORM_TITLES: {
    SNG:     ["1 МЕСТО", "2 МЕСТО", "3 МЕСТО"],
    MTT:     ["1 МЕСТО", "2 МЕСТО", "3 МЕСТО", "4 МЕСТО", "5 МЕСТО"],
    MYSTERY: ["1 МЕСТО", "2 МЕСТО", "3 МЕСТО", "ОЧКИ ЗА ВЫБИВАНИЕ 1", "ОЧКИ ЗА ВЫБИВАНИЕ 2"]
  },

  // Определение форматов: места (события) и очки.
  // Индекс "startCol" — с какой колонки (0-based) начинаются значения мест в строке формы.
  // Колонка 0 = timestamp, 1 = дата, 2 = ведущий, 3+ = места/нокауты (см. процесс форм).
  FORMATS: {
    "Data": {
      formatName: "SnG",
      startCol: 3,
      places: [
        { name: "1 место", pts: 10, isItm: "ДА" },
        { name: "2 место", pts: 6,  isItm: "ДА" },
        { name: "3 место", pts: 3,  isItm: "ДА" }
      ],
      // Нокауты отсутствуют в этом формате
      koStartCol: null,
      koPts: 0
    },
    "MTT": {
      formatName: "MTT",
      startCol: 3,
      places: [
        { name: "1 место", pts: 30, isItm: "ДА" },
        { name: "2 место", pts: 20, isItm: "ДА" },
        { name: "3 место", pts: 14, isItm: "ДА" },
        { name: "4 место", pts: 9,  isItm: "ДА" },
        { name: "5 место", pts: 5,  isItm: "ДА" }
      ],
      koStartCol: null,
      koPts: 0
    },
    "Mystery": {
      formatName: "Mystery Bounty",
      startCol: 3,
      places: [
        { name: "1 место", pts: 10, isItm: "ДА" },
        { name: "2 место", pts: 6,  isItm: "ДА" },
        { name: "3 место", pts: 3,  isItm: "ДА" }
      ],
      // Нокауты: колонки 6 и 7 (0-based), каждый по 20 очков, НЕ являются ITM
      koStartCol: 6,
      koCount: 2,
      koPts: 20,
      koColIsItm: "НЕТ"
    }
  },

  // Индексы колонок в ДБ-результатах (DB_Results), 0-based
  DB_COL: {
    GAME_ID:   0,
    DATE:      1,
    FORMAT:    2,
    DEALER:    3,
    PLAYER:    4,
    EVENT:     5,
    POINTS:    6,
    IS_ITM:    7
  },

  // ID публичной (внешней) таблицы лидерборда
  PUBLIC_SPREADSHEET_ID: "1yd6rCcxjNfAMDlogApadgKoIdY70U_cIRhH9cK1xBZ8",

  SNG_STRUCTURE: {
    formatName: "SnG",
    startingStack: 5000,
    startingBb: 50,
    startingDepthBb: 100,
    chipsDistribution: [
      { denom: 1000, count: 3, total: 3000 },
      { denom: 500,  count: 2, total: 1000 },
      { denom: 100,  count: 8, total: 800  },
      { denom: 50,   count: 2, total: 100  },
      { denom: 25,   count: 4, total: 100  }
    ],
    interGameBreakMinutes: 10,
    levels: [
      { level: 1,  sb: 25,   bb: 50,   ante: 0,    durationSec: 420, label: "25 / 50",                 isBreak: false },
      { level: 2,  sb: 50,   bb: 100,  ante: 0,    durationSec: 420, label: "50 / 100",                isBreak: false },
      { level: 3,  sb: 75,   bb: 150,  ante: 0,    durationSec: 420, label: "75 / 150",                isBreak: false },
      { level: 4,  sb: 100,  bb: 200,  ante: 0,    durationSec: 420, label: "100 / 200",               isBreak: false },
      { level: 5,  sb: 150,  bb: 300,  ante: 0,    durationSec: 420, label: "150 / 300",               isBreak: false },
      { level: 6,  sb: 0,    bb: 0,    ante: 0,    durationSec: 300, label: "ПЕРЕРЫВ (5 МИН)",          isBreak: true },
      { level: 7,  sb: 200,  bb: 400,  ante: 400,  durationSec: 420, label: "200 / 400 (BBA 400)",     isBreak: false },
      { level: 8,  sb: 300,  bb: 600,  ante: 600,  durationSec: 420, label: "300 / 600 (BBA 600)",     isBreak: false },
      { level: 9,  sb: 500,  bb: 1000, ante: 1000, durationSec: 420, label: "500 / 1000 (BBA 1000)",   isBreak: false },
      { level: 10, sb: 800,  bb: 1600, ante: 1600, durationSec: 360, label: "800 / 1600 (BBA 1600)",   isBreak: false },
      { level: 11, sb: 1000, bb: 2000, ante: 2000, durationSec: 360, label: "1000 / 2000 (BBA 2000)", isBreak: false }
    ]
  },

  BLIND_STRUCTURES: {
    SNG_STANDARD: {
      name: "5 000 стек / 7 мин (Стандарт с BBA)",
      stack: 5000,
      levels: [
        { level: 1,  sb: 25,   bb: 50,   ante: 0,    durationSec: 420, label: "25 / 50",                 isBreak: false },
        { level: 2,  sb: 50,   bb: 100,  ante: 0,    durationSec: 420, label: "50 / 100",                isBreak: false },
        { level: 3,  sb: 75,   bb: 150,  ante: 0,    durationSec: 420, label: "75 / 150",                isBreak: false },
        { level: 4,  sb: 100,  bb: 200,  ante: 0,    durationSec: 420, label: "100 / 200",               isBreak: false },
        { level: 5,  sb: 150,  bb: 300,  ante: 0,    durationSec: 420, label: "150 / 300",               isBreak: false },
        { level: 6,  sb: 0,    bb: 0,    ante: 0,    durationSec: 300, label: "ПЕРЕРЫВ (5 МИН)",          isBreak: true },
        { level: 7,  sb: 200,  bb: 400,  ante: 400,  durationSec: 420, label: "200 / 400 (BBA 400)",     isBreak: false },
        { level: 8,  sb: 300,  bb: 600,  ante: 600,  durationSec: 420, label: "300 / 600 (BBA 600)",     isBreak: false },
        { level: 9,  sb: 500,  bb: 1000, ante: 1000, durationSec: 420, label: "500 / 1000 (BBA 1000)",   isBreak: false },
        { level: 10, sb: 800,  bb: 1600, ante: 1600, durationSec: 360, label: "800 / 1600 (BBA 1600)",   isBreak: false },
        { level: 11, sb: 1000, bb: 2000, ante: 2000, durationSec: 360, label: "1000 / 2000 (BBA 2000)", isBreak: false }
      ]
    },
    SNG_CLASSIC: {
      name: "5 000 стек / 7 мин (Классика без анте)",
      stack: 5000,
      levels: [
        { level: 1,  sb: 25,   bb: 50,   ante: 0,    durationSec: 420, label: "25 / 50",                 isBreak: false },
        { level: 2,  sb: 50,   bb: 100,  ante: 0,    durationSec: 420, label: "50 / 100",                isBreak: false },
        { level: 3,  sb: 75,   bb: 150,  ante: 0,    durationSec: 420, label: "75 / 150",                isBreak: false },
        { level: 4,  sb: 100,  bb: 200,  ante: 0,    durationSec: 420, label: "100 / 200",               isBreak: false },
        { level: 5,  sb: 150,  bb: 300,  ante: 0,    durationSec: 420, label: "150 / 300",               isBreak: false },
        { level: 6,  sb: 0,    bb: 0,    ante: 0,    durationSec: 300, label: "ПЕРЕРЫВ (5 МИН)",          isBreak: true },
        { level: 7,  sb: 200,  bb: 400,  ante: 0,    durationSec: 420, label: "200 / 400",               isBreak: false },
        { level: 8,  sb: 300,  bb: 600,  ante: 0,    durationSec: 420, label: "300 / 600",               isBreak: false },
        { level: 9,  sb: 500,  bb: 1000, ante: 0,    durationSec: 420, label: "500 / 1000",              isBreak: false },
        { level: 10, sb: 800,  bb: 1600, ante: 0,    durationSec: 360, label: "800 / 1600",              isBreak: false },
        { level: 11, sb: 1000, bb: 2000, ante: 0,    durationSec: 360, label: "1000 / 2000",             isBreak: false }
      ]
    }
  },

  // Лимиты бэкфилла: сколько игр обрабатывать за один запуск
  BACKFILL_CHUNK: 100,

  // Кэш аналитики (сек): сколько времени держать ALL_TIME_STATS в кэше.
  // Данные меняются только в игровые дни и кэш сбрасывается при записи.
  ANALYTICS_CACHE_TTL: 900,

  // Дни недели, когда проводятся игры и когда делать СНАПШОТ лидерборда.
  // JS: 0=воскресенье ... 3=среда, 5=пятница, 6=суббота (игры 3 раза/нед).
  // takeSnapshot сам пропустит остальные дни — можно смело ставить ежедневный триггер.
  SNAPSHOT_DAYS: [3, 5, 6],

  // … (необязательно) часы проведения игр в местном времени для нотификаций.
  // Лидирует только для удобства чтения; сами фактические триггеры настраиваются в UI.
  GAME_HOURS: { 3: 19, 5: 19, 6: 17 },


  // ID полей для автоматического предзаполнения Google Form (дата и ведущий)
  FORM_ENTRY_IDS: {
    DATE: "entry.1615126251",
    DEALER: "entry.1887911518"
  },

  // Базовый URL шины Firebase Realtime Database
  FIREBASE_DB_URL: "https://atmosphere-poker-default-rtdb.europe-west1.firebasedatabase.app",

  // Токен бота для дилеров @atmosphere_poker_dealer_bot
  DEALER_BOT_TOKEN: "8946471319:AAHKuZK8hcgebOvuNyHi21o5tjlbU7S0hG8"
};

// ==========================================
// УТИЛИТЫ
// ==========================================

/**
 * Безопасное чтение секрета из скриптовых свойств с fallback на CONFIG.
 * Так секреты можно не хранить в тексте скрипта.
 */
function getScriptProperty(key, fallback) {
  try {
    var props = PropertiesService.getScriptProperties();
    var val = props.getProperty(key);
    if (val) return val;
  } catch (e) {
    Logger.log("Не удалось прочитать свойство " + key + ": " + e.message);
  }
  if (CONFIG && CONFIG[key]) return CONFIG[key];
  return fallback;
}

/**
 * Нормализация даты к строке YYYY-MM-DD (в таймзоне проекта).
 * Устойчива к date-объектам, строкам и числам.
 * Дополнительно парсит текстовые даты вида ДД.ММ.ГГГГ / ДД/ММ/ГГГГ
 * (некоторые формы отдают дату именно так — раньше такие значения
 * «выпадали» из расчётов и ломали gameId).
 */
function normalizeDate(rawDate) {
  if (!rawDate) return "";
  try {
    var d = new Date(rawDate);
    if (!isNaN(d.getTime())) {
      return Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd");
    }
  } catch (e) {}

  // Текстовые даты ДД.ММ.ГГГГ / ДД/ММ/ГГГГ (с валидацией дня/месяца)
  if (typeof rawDate === "string" || rawDate instanceof String) {
    var m = String(rawDate).match(/^\s*(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})\s*$/);
    if (m) {
      var day = Number(m[1]), mon = Number(m[2]), yr = Number(m[3]);
      if (mon >= 1 && mon <= 12 && day >= 1 && day <= 31) {
        var d2 = new Date(yr, mon - 1, day);
        if (d2.getDate() === day && d2.getMonth() === mon - 1 && d2.getFullYear() === yr) {
          return Utilities.formatDate(d2, Session.getScriptTimeZone(), "yyyy-MM-dd");
        }
      }
    }
  }

  return rawDate.toString().trim();
}

/**
 * Проверка, участвует ли игрок в лидерборде
 */
function isParticipating(name) {
  if (!name) return false;
  return CONFIG.IGNORE_LIST.indexOf(name.toString().trim()) === -1;
}
