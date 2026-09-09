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
    SNG:      { id: '1A66JMY-KDuCq6nMnfbFkawj-nIX_ZKdz5CpcKg6pTgo', sheetName: "Data",     sheet: "Data",     viewUrl: "https://docs.google.com/forms/d/e/1FAIpQLSfCfnN2LS4mAmbQfPtBLZGxPoiYfSqNoaX5xLrmyBr3S5FiEg/viewform" },
    MTT:      { id: '1s-OlXMhdWQEkY0g0i75Jbb1MS5AC0zBZjjYAzWh_KIU', sheetName: "MTT",     sheet: "MTT",     viewUrl: "https://docs.google.com/forms/d/e/1FAIpQLSeIDDkj2iCPtMZm-0K5YdZFlopAR7aPfRer2n1o-FQD-Dr7FQ/viewform" },
    MYSTERY:  { id: '1asemj8eLS8Dyu6P39VHf8v_dR7Cz3fomYfWnqWdIrC8', sheetName: "Mystery", sheet: "Mystery", viewUrl: "https://docs.google.com/forms/d/e/1FAIpQLScFJXRH7bgb2W2aCOeSAKYfL-m4odE14HM5a2eWGz8to4QIlA/viewform" }
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
      { level: 6,  sb: 200,  bb: 400,  ante: 400,  durationSec: 420, label: "200 / 400 (BBA 400)",     isBreak: false },
      { level: 7,  sb: 300,  bb: 600,  ante: 600,  durationSec: 420, label: "300 / 600 (BBA 600)",     isBreak: false },
      { level: 8,  sb: 500,  bb: 1000, ante: 1000, durationSec: 420, label: "500 / 1000 (BBA 1000)",   isBreak: false },
      { level: 9,  sb: 800,  bb: 1600, ante: 1600, durationSec: 360, label: "800 / 1600 (BBA 1600)",   isBreak: false },
      { level: 10, sb: 1000, bb: 2000, ante: 2000, durationSec: 360, label: "1000 / 2000 (BBA 2000)", isBreak: false }
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
        { level: 6,  sb: 200,  bb: 400,  ante: 400,  durationSec: 420, label: "200 / 400 (BBA 400)",     isBreak: false },
        { level: 7,  sb: 300,  bb: 600,  ante: 600,  durationSec: 420, label: "300 / 600 (BBA 600)",     isBreak: false },
        { level: 8,  sb: 500,  bb: 1000, ante: 1000, durationSec: 420, label: "500 / 1000 (BBA 1000)",   isBreak: false },
        { level: 9,  sb: 800,  bb: 1600, ante: 1600, durationSec: 360, label: "800 / 1600 (BBA 1600)",   isBreak: false },
        { level: 10, sb: 1000, bb: 2000, ante: 2000, durationSec: 360, label: "1000 / 2000 (BBA 2000)", isBreak: false }
      ]
    },
    SNG_DEEP_1500: {
      name: "1 500 стек / 10 мин (Классика без анте)",
      stack: 1500,
      levels: [
        { level: 1,  sb: 5,    bb: 10,   ante: 0,    durationSec: 600, label: "5 / 10",                  isBreak: false },
        { level: 2,  sb: 10,   bb: 25,   ante: 0,    durationSec: 600, label: "10 / 25",                 isBreak: false },
        { level: 3,  sb: 25,   bb: 50,   ante: 0,    durationSec: 600, label: "25 / 50",                 isBreak: false },
        { level: 4,  sb: 50,   bb: 100,  ante: 0,    durationSec: 600, label: "50 / 100",                isBreak: false },
        { level: 5,  sb: 100,  bb: 200,  ante: 0,    durationSec: 600, label: "100 / 200",               isBreak: false },
        { level: 6,  sb: 200,  bb: 400,  ante: 0,    durationSec: 600, label: "200 / 400",               isBreak: false },
        { level: 7,  sb: 400,  bb: 800,  ante: 0,    durationSec: 600, label: "400 / 800",               isBreak: false },
        { level: 8,  sb: 800,  bb: 1600, ante: 0,    durationSec: 600, label: "800 / 1600",              isBreak: false },
        { level: 9,  sb: 1000, bb: 2000, ante: 0,    durationSec: 600, label: "1000 / 2000",             isBreak: false }
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

  // Токен бота для дилеров @atmosphere_poker_dealer_bot (задается в Свойствах скрипта)
  DEALER_BOT_TOKEN: ""
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
function formatIsoDateString(d) {
  if (typeof Utilities !== "undefined" && typeof Session !== "undefined") {
    try {
      return Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd");
    } catch (e) {}
  }
  var yr = d.getFullYear();
  var mo = d.getMonth() + 1;
  var da = d.getDate();
  return yr + "-" + (mo < 10 ? "0" + mo : mo) + "-" + (da < 10 ? "0" + da : da);
}

function normalizeDate(rawDate) {
  if (!rawDate) return "";

  // 1. Если передан объект Date
  if (rawDate instanceof Date && !isNaN(rawDate.getTime())) {
    return formatIsoDateString(rawDate);
  }

  // 2. Текстовые даты: проверяем форматы ДД.ММ.ГГГГ и ДД/ММ/ГГГГ СТРОГО ПЕРВЫМИ,
  // чтобы движок JS (V8) не интерпретировал первые 12 дней как месяцы США (MM/DD/YYYY).
  if (typeof rawDate === "string" || rawDate instanceof String) {
    var s = String(rawDate).trim();
    var isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
      return isoMatch[1] + "-" + isoMatch[2] + "-" + isoMatch[3];
    }

    var m = s.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})/);
    if (m) {
      var day = Number(m[1]), mon = Number(m[2]), yr = Number(m[3]);
      if (mon >= 1 && mon <= 12 && day >= 1 && day <= 31) {
        var mm = mon < 10 ? "0" + mon : "" + mon;
        var dd = day < 10 ? "0" + day : "" + day;
        return yr + "-" + mm + "-" + dd;
      }
    }
  }

  // 3. Fallback на new Date(...) для timestamp и иных форматов
  try {
    var d = new Date(rawDate);
    if (!isNaN(d.getTime())) {
      return formatIsoDateString(d);
    }
  } catch (e) {}

  return String(rawDate).trim();
}

/**
 * Определение даты турнирного игрового вечера.
 * Если игра/отправка формы произошла ночью после полуночи (до 06:00 утра),
 * игра относится к предыдущему турнирному вечеру.
 *
 * @param {Date|string} [dateOrTimestamp]
 * @returns {string} YYYY-MM-DD
 */
function getTournamentSessionDate(dateOrTimestamp) {
  var d = null;
  if (dateOrTimestamp instanceof Date && !isNaN(dateOrTimestamp.getTime())) {
    d = dateOrTimestamp;
  } else if (dateOrTimestamp) {
    var s = String(dateOrTimestamp).trim();
    // Если передана чистая дата без времени вида ДД.ММ.ГГГГ или YYYY-MM-DD,
    // считаем её явной датой турнира
    if (/^\d{4}-\d{2}-\d{2}$/.test(s) || /^\d{1,2}[.\/]\d{1,2}[.\/]\d{4}$/.test(s)) {
      return normalizeDate(s);
    }
    try {
      var parsed = new Date(dateOrTimestamp);
      if (!isNaN(parsed.getTime())) d = parsed;
    } catch (e) {}
  }

  if (!d) d = new Date();

  // Если время от 00:00 до 05:59 утра, относим к вечеру предыдущего календарного дня
  var hours = d.getHours();
  if (hours < 6) {
    var prev = new Date(d.getTime() - 24 * 60 * 60 * 1000);
    return formatIsoDateString(prev);
  }
  return formatIsoDateString(d);
}

/**
 * Проверка, участвует ли игрок в лидерборде
 */
function isParticipating(name) {
  if (!name) return false;
  return CONFIG.IGNORE_LIST.indexOf(name.toString().trim()) === -1;
}
