// ==========================================
// ЕДИНАЯ КОНФИГУРАЦИЯ ПОКЕРНЫХ СТРУКТУР И ТАЙМЕРОВ
// Антикафе «Атмосфера»
// ==========================================

const POKER_CONFIG = {
  CLUB_NAME: "Атмосфера",
  
  // Стандартная структура SnG / Mystery Bounty (Стек 5 000 фишек — 100 BB)
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
      { level: 6,  sb: 0,    bb: 0,    ante: 0,    durationSec: 300, label: "ПЕРЕРЫВ И COLOR-UP $25/$50", isBreak: true },
      { level: 7,  sb: 200,  bb: 400,  ante: 400,  durationSec: 420, label: "200 / 400 (BBA 400)",     isBreak: false },
      { level: 8,  sb: 300,  bb: 600,  ante: 600,  durationSec: 420, label: "300 / 600 (BBA 600)",     isBreak: false },
      { level: 9,  sb: 500,  bb: 1000, ante: 1000, durationSec: 420, label: "500 / 1000 (BBA 1000)",   isBreak: false },
      { level: 10, sb: 800,  bb: 1600, ante: 1600, durationSec: 360, label: "800 / 1600 (BBA 1600)",   isBreak: false },
      { level: 11, sb: 1000, bb: 2000, ante: 2000, durationSec: 360, label: "1000 / 2000 (BBA 2000)", isBreak: false }
    ]
  },

  // Google Forms для внесения результатов
  FORMS: {
    SNG: {
      id: "1A66JMY-KDuCq6nMnfbFkawj-nIX_ZKdz5CpcKg6pTgo",
      viewUrl: "https://docs.google.com/forms/d/e/1A66JMY-KDuCq6nMnfbFkawj-nIX_ZKdz5CpcKg6pTgo/viewform"
    },
    MTT: {
      id: "1s-OlXMhdWQEkY0g0i75Jbb1MS5AC0zBZjjYAzWh_KIU",
      viewUrl: "https://docs.google.com/forms/d/e/1s-OlXMhdWQEkY0g0i75Jbb1MS5AC0zBZjjYAzWh_KIU/viewform"
    },
    MYSTERY: {
      id: "1asemj8eLS8Dyu6P39VHf8v_dR7Cz3fomYfWnqWdIrC8",
      viewUrl: "https://docs.google.com/forms/d/e/1asemj8eLS8Dyu6P39VHf8v_dR7Cz3fomYfWnqWdIrC8/viewform"
    }
  }
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = POKER_CONFIG;
}
