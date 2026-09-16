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
      shortDesc: "Базовая структура без анте",
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
    },
    SNG_STANDARD: {
      id: "SNG_STANDARD",
      name: "5 000 стек / 7 мин (Атмосфера Pro с BBA)",
      shortDesc: "Big Blind Ante с 6 уровня",
      stack: 5000,
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
      shortDesc: "3-часовой турнир, BBA с 6 уровня, перерывы на объединение столов",
      stack: 5000,
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
  },

  // Допустимые структуры по форматам
  FORMAT_STRUCTURES: {
    SnG: ["SNG_DEEP_1500", "SNG_STANDARD"],
    Mystery: ["SNG_DEEP_1500", "SNG_STANDARD"],
    MTT: ["MTT_PRO_5000"]
  },

  getAllowedStructuresForFormat: function(format) {
    if (format === "MTT") return ["MTT_PRO_5000"];
    if (format === "Mystery") return ["SNG_DEEP_1500", "SNG_STANDARD"];
    return ["SNG_DEEP_1500", "SNG_STANDARD"];
  },

  // Путь к активной сессии МТТ в Firebase
  MTT_SESSION_PATH: "atmosphere/mtt_session",

  // Проверка принадлежности стола к текущей сессии МТТ
  isTableInCurrentMttSession: function(table, currentSession) {
    if (!table || !currentSession || !currentSession.sessionId) return false;
    if (table.format !== "MTT") return false;
    if (table.dissolved) return false;
    return table.mttSessionId === currentSession.sessionId;
  },

  // ==========================================
  // ДЕКЛАРАТИВНЫЙ ЧИСТЫЙ РАСЧЕТ ВРЕМЕНИ И УРОВНЕЙ (STAGE 4)
  // ==========================================
  formatTime: function(totalSeconds) {
    const s = Math.max(0, Math.floor(totalSeconds));
    const min = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  },

  calculateTournamentProgress: function(structure, startedAt, totalPausedMs = 0, pausedAt = null, now = Date.now(), options = {}) {
    let levels = [];
    if (Array.isArray(structure)) {
      levels = structure;
    } else if (structure && Array.isArray(structure.levels)) {
      levels = structure.levels;
    } else if (typeof structure === "string" && POKER_CONFIG.BLIND_STRUCTURES && POKER_CONFIG.BLIND_STRUCTURES[structure]) {
      levels = POKER_CONFIG.BLIND_STRUCTURES[structure].levels;
    } else if (POKER_CONFIG.BLIND_STRUCTURES && POKER_CONFIG.BLIND_STRUCTURES.SNG_DEEP_1500) {
      levels = POKER_CONFIG.BLIND_STRUCTURES.SNG_DEEP_1500.levels;
    }

    if (!levels || levels.length === 0) {
      levels = [
        { level: 1, sb: 25, bb: 50, ante: 0, durationSec: 600, label: "25 / 50", isBreak: false }
      ];
    }

    const isPaused = Boolean(pausedAt && pausedAt > 0);
    const effectiveNow = isPaused ? pausedAt : now;

    if ((!startedAt || startedAt <= 0) && (options.remainingMs === undefined || options.remainingMs === null)) {
      const firstLevel = levels[0];
      const durSec = firstLevel.durationSec || 600;
      return {
        levelIndex: 0,
        levelNumber: firstLevel.level || 1,
        currentLevel: firstLevel,
        nextLevel: levels[1] || null,
        sb: firstLevel.sb || 0,
        bb: firstLevel.bb || 0,
        ante: firstLevel.ante || 0,
        label: firstLevel.label || `${firstLevel.sb || 0} / ${firstLevel.bb || 0}`,
        isBreak: Boolean(firstLevel.isBreak),
        isPaused: false,
        isOvertime: false,
        elapsedMs: 0,
        levelElapsedMs: 0,
        levelRemainingMs: durSec * 1000,
        levelRemainingSec: durSec,
        levelDurationSec: durSec,
        totalTournamentElapsedSec: 0,
        formattedRemaining: POKER_CONFIG.formatTime(durSec),
        levelEndsAt: null
      };
    }

    const elapsedMs = Math.max(0, (effectiveNow - startedAt) - (totalPausedMs || 0));
    const totalTournamentElapsedSec = Math.floor(elapsedMs / 1000);

    let accumulatedMs = 0;
    let targetIndex = 0;
    let levelElapsedMs = 0;
    let levelRemainingMs = 0;
    let isOvertime = false;

    if (options.manualLevelIndex !== undefined && options.manualLevelIndex !== null) {
      targetIndex = Math.min(Math.max(0, options.manualLevelIndex), levels.length - 1);
      const lvlDurMs = (levels[targetIndex].durationSec || 600) * 1000;
      if (options.remainingMs !== undefined && options.remainingMs !== null) {
        levelRemainingMs = Math.max(0, options.remainingMs);
        levelElapsedMs = Math.max(0, lvlDurMs - levelRemainingMs);
      } else {
        levelElapsedMs = 0;
        levelRemainingMs = lvlDurMs;
      }
      if (options.isOvertime || (targetIndex === levels.length - 1 && levelRemainingMs === 0)) {
        isOvertime = true;
        if (options.overtimeMs) {
          levelElapsedMs = lvlDurMs + options.overtimeMs;
        }
      }
    } else {
      let found = false;
      for (let i = 0; i < levels.length; i++) {
        const lvlDurationMs = (levels[i].durationSec || 600) * 1000;
        if (elapsedMs < accumulatedMs + lvlDurationMs) {
          targetIndex = i;
          levelElapsedMs = elapsedMs - accumulatedMs;
          levelRemainingMs = lvlDurationMs - levelElapsedMs;
          found = true;
          break;
        }
        accumulatedMs += lvlDurationMs;
      }

      if (!found) {
        targetIndex = levels.length - 1;
        const lastLvlDurMs = (levels[targetIndex].durationSec || 600) * 1000;
        const prevLevelsMs = accumulatedMs - lastLvlDurMs;
        levelElapsedMs = elapsedMs - prevLevelsMs;
        levelRemainingMs = 0;
        isOvertime = true;
      }
    }

    const currentLevel = levels[targetIndex];
    const nextLevel = levels[targetIndex + 1] || null;
    const levelRemainingSec = Math.ceil(levelRemainingMs / 1000);
    const levelDurationSec = currentLevel.durationSec || 600;

    return {
      levelIndex: targetIndex,
      levelNumber: currentLevel.level || (targetIndex + 1),
      currentLevel,
      nextLevel,
      sb: currentLevel.sb,
      bb: currentLevel.bb,
      ante: currentLevel.ante || 0,
      label: currentLevel.label || `${currentLevel.sb} / ${currentLevel.bb}`,
      isBreak: Boolean(currentLevel.isBreak),
      isPaused,
      isOvertime,
      elapsedMs,
      levelElapsedMs,
      levelRemainingMs,
      levelRemainingSec,
      levelDurationSec,
      totalTournamentElapsedSec,
      formattedRemaining: POKER_CONFIG.formatTime(levelRemainingSec),
      levelEndsAt: isPaused ? null : (effectiveNow + levelRemainingMs)
    };
  },

  calculateTableProgress: function(table, now = Date.now()) {
    if (!table) return this.calculateTournamentProgress(null, null, 0, null, now);
    const structKey = table.structKey || table.structureId;
    let structure = table.customStructure || (structKey && this.BLIND_STRUCTURES && this.BLIND_STRUCTURES[structKey]);
    
    // Если структура явно не задана через structKey/customStructure, формируем ее с учетом table.durationSec
    if (!structure) {
      const dur = table.durationSec || 420;
      const baseStruct = (this.BLIND_STRUCTURES && this.BLIND_STRUCTURES.SNG_STANDARD) || (this.BLIND_STRUCTURES && this.BLIND_STRUCTURES.SNG_DEEP_1500);
      if (baseStruct && baseStruct.levels) {
        structure = {
          levels: baseStruct.levels.map(l => Object.assign({}, l, { durationSec: dur }))
        };
      } else {
        structure = {
          levels: [
            { level: 1, sb: 25, bb: 50, ante: 0, durationSec: dur, label: "25 / 50", isBreak: false }
          ]
        };
      }
    } else if (table.durationSec && structure.levels && structure.levels[0] && structure.levels[0].durationSec !== table.durationSec && !table.structKey) {
      structure = {
        levels: structure.levels.map(l => Object.assign({}, l, { durationSec: table.durationSec }))
      };
    }

    const pausedAt = (table.status === "paused") ? (table.pausedAt || now) : null;
    
    const options = {};
    if (table.requireManualStep && table.levelIndex !== undefined && table.levelIndex !== null) {
      options.manualLevelIndex = table.levelIndex;
      options.remainingMs = (table.remainingMs !== undefined && table.remainingMs !== null) ? table.remainingMs : 0;
    } else if (table.levelEndsAt && table.status === "running") {
      options.manualLevelIndex = (table.levelIndex !== undefined && table.levelIndex !== null) ? table.levelIndex : 0;
      if (now <= table.levelEndsAt) {
        options.remainingMs = table.levelEndsAt - now;
      } else {
        options.remainingMs = 0;
        options.isOvertime = true;
        options.overtimeMs = now - table.levelEndsAt;
      }
    } else if (table.remainingMs !== undefined && table.remainingMs !== null && table.status === "paused") {
      options.manualLevelIndex = (table.levelIndex !== undefined && table.levelIndex !== null) ? table.levelIndex : 0;
      options.remainingMs = table.remainingMs;
    }

    return this.calculateTournamentProgress(
      structure,
      table.startedAt,
      table.totalPausedMs || 0,
      pausedAt,
      now,
      options
    );
  }
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = POKER_CONFIG;
}
