// ==========================================
// ЕДИНАЯ КОНФИГУРАЦИЯ ПОКЕРНЫХ СТРУКТУР И ТАЙМЕРОВ
// Антикафе «Атмосфера»
// ==========================================

const POKER_CONFIG = {
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
      { level: 8,  sb: 400,  bb: 800,  ante: 800,  durationSec: 420, label: "400 / 800 (BBA 800)",     isBreak: false },
      { level: 9,  sb: 600,  bb: 1200, ante: 1200, durationSec: 420, label: "600 / 1200 (BBA 1200)",   isBreak: false },
      { level: 10, sb: 1000, bb: 2000, ante: 2000, durationSec: 420, label: "1000 / 2000 (BBA 2000)", isBreak: false },
      { level: 11, sb: 1500, bb: 3000, ante: 3000, durationSec: 420, label: "1500 / 3000 (BBA 3000)", isBreak: false }
    ]
  },

  // Пресеты структур блайндов для ТВ и пульта
  BLIND_STRUCTURES: {
    SNG_DEEP_1500: {
      id: "SNG_DEEP_1500",
      name: "1 500 стек / 10 мин (Классика)",
      shortDesc: "Базовая структура без анте, Color-Up после 50/100",
      stack: 1500,
      colorUpAfterLevel: 4, // после 50/100
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
    },
    SNG_STANDARD: {
      id: "SNG_STANDARD",
      name: "5 000 стек / 7 мин (Атмосфера Pro с BBA)",
      shortDesc: "Big Blind Ante с 6 уровня, Color-Up после 150/300",
      stack: 5000,
      colorUpAfterLevel: 5, // после 150/300
      levels: [
        { level: 1,  sb: 25,   bb: 50,   ante: 0,    durationSec: 420, label: "25 / 50",                 isBreak: false },
        { level: 2,  sb: 50,   bb: 100,  ante: 0,    durationSec: 420, label: "50 / 100",                isBreak: false },
        { level: 3,  sb: 75,   bb: 150,  ante: 0,    durationSec: 420, label: "75 / 150",                isBreak: false },
        { level: 4,  sb: 100,  bb: 200,  ante: 0,    durationSec: 420, label: "100 / 200",               isBreak: false },
        { level: 5,  sb: 150,  bb: 300,  ante: 0,    durationSec: 420, label: "150 / 300",               isBreak: false },
        { level: 6,  sb: 200,  bb: 400,  ante: 400,  durationSec: 420, label: "200 / 400 (BBA 400)",     isBreak: false },
        { level: 7,  sb: 300,  bb: 600,  ante: 600,  durationSec: 420, label: "300 / 600 (BBA 600)",     isBreak: false },
        { level: 8,  sb: 400,  bb: 800,  ante: 800,  durationSec: 420, label: "400 / 800 (BBA 800)",     isBreak: false },
        { level: 9,  sb: 600,  bb: 1200, ante: 1200, durationSec: 420, label: "600 / 1200 (BBA 1200)",   isBreak: false },
        { level: 10, sb: 1000, bb: 2000, ante: 2000, durationSec: 420, label: "1000 / 2000 (BBA 2000)", isBreak: false },
        { level: 11, sb: 1500, bb: 3000, ante: 3000, durationSec: 420, label: "1500 / 3000 (BBA 3000)", isBreak: false }
      ]
    },
    MTT_PRO_5000: {
      id: "MTT_PRO_5000",
      name: "5 000 стек / 10 мин (Атмосфера МТТ Pro)",
      shortDesc: "3-часовой турнир, BBA с 6 уровня, Color-Up 2 мин после 150/300, перерывы на объединение столов",
      stack: 5000,
      colorUpAfterLevel: 5, // после 150/300
      lateRegLevels: 5,
      bbaStartLevel: 6,
      levels: [
        { level: 1,  sb: 25,    bb: 50,    ante: 0,     durationSec: 600, label: "25 / 50",                 isBreak: false },
        { level: 2,  sb: 50,    bb: 100,   ante: 0,     durationSec: 600, label: "50 / 100",                isBreak: false },
        { level: 3,  sb: 75,    bb: 150,   ante: 0,     durationSec: 600, label: "75 / 150",                isBreak: false },
        { level: 4,  sb: 100,   bb: 200,   ante: 0,     durationSec: 600, label: "100 / 200",               isBreak: false },
        { level: 5,  sb: 150,   bb: 300,   ante: 0,     durationSec: 600, label: "150 / 300",               isBreak: false },
        { level: 6,  sb: 200,   bb: 400,   ante: 400,   durationSec: 600, label: "200 / 400 (BBA 400)",     isBreak: false },
        { level: 7,  sb: 300,   bb: 600,   ante: 600,   durationSec: 600, label: "300 / 600 (BBA 600)",     isBreak: false },
        { level: 8,  sb: 400,   bb: 800,   ante: 800,   durationSec: 600, label: "400 / 800 (BBA 800)",     isBreak: false },
        { level: 9,  sb: 600,   bb: 1200,  ante: 1200,  durationSec: 600, label: "600 / 1200 (BBA 1200)",   isBreak: false },
        { level: 10, sb: 800,   bb: 1600,  ante: 1600,  durationSec: 600, label: "800 / 1600 (BBA 1600)",   isBreak: false },
        { level: 11, sb: 1000,  bb: 2000,  ante: 2000,  durationSec: 600, label: "1000 / 2000 (BBA 2000)", isBreak: false },
        { level: 12, sb: 1500,  bb: 3000,  ante: 3000,  durationSec: 600, label: "1500 / 3000 (BBA 3000)", isBreak: false },
        { level: 13, sb: 2000,  bb: 4000,  ante: 4000,  durationSec: 600, label: "2000 / 4000 (BBA 4000)", isBreak: false },
        { level: 14, sb: 3000,  bb: 6000,  ante: 6000,  durationSec: 600, label: "3000 / 6000 (BBA 6000)", isBreak: false },
        { level: 15, sb: 4000,  bb: 8000,  ante: 8000,  durationSec: 600, label: "4000 / 8000 (BBA 8000)", isBreak: false },
        { level: 16, sb: 6000,  bb: 12000, ante: 12000, durationSec: 600, label: "6000 / 12000 (BBA 12000)", isBreak: false },
        { level: 17, sb: 10000, bb: 20000, ante: 20000, durationSec: 600, label: "10000 / 20000 (BBA 20000)", isBreak: false }
      ]
    }
  },

  // ID полей для автоматического предзаполнения Google Form (дата и ведущий)
  FORM_ENTRY_IDS: {
    DATE: "entry.1615126251",
    DEALER: "entry.1887911518"
  },

  // Master PIN для авторизации ведущих в браузере (вне Telegram)
  MASTER_DEALER_PIN: "7777",

  // Базовый URL шины Firebase Realtime Database
  FIREBASE_DB_URL: "https://atmosphere-poker-default-rtdb.europe-west1.firebasedatabase.app",

  // Google Forms для внесения результатов
  FORMS: {
    SNG: {
      id: "1FAIpQLSfCfnN2LS4mAmbQfPtBLZGxPoiYfSqNoaX5xLrmyBr3S5FiEg",
      viewUrl: "https://docs.google.com/forms/d/e/1FAIpQLSfCfnN2LS4mAmbQfPtBLZGxPoiYfSqNoaX5xLrmyBr3S5FiEg/viewform"
    },
    MTT: {
      id: "1FAIpQLSeIDDkj2iCPtMZm-0K5YdZFlopAR7aPfRer2n1o-FQD-Dr7FQ",
      viewUrl: "https://docs.google.com/forms/d/e/1FAIpQLSeIDDkj2iCPtMZm-0K5YdZFlopAR7aPfRer2n1o-FQD-Dr7FQ/viewform"
    },
    MYSTERY: {
      id: "1FAIpQLScFJXRH7bgb2W2aCOeSAKYfL-m4odE14HM5a2eWGz8to4QIlA",
      viewUrl: "https://docs.google.com/forms/d/e/1FAIpQLScFJXRH7bgb2W2aCOeSAKYfL-m4odE14HM5a2eWGz8to4QIlA/viewform"
    }
  }
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = POKER_CONFIG;
}
