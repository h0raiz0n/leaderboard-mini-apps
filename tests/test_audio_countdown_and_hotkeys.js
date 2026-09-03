/**
 * E2E UNIT TEST: TV Web Audio Countdown & Hotkeys (Space, N, P, +, -)
 * Покерный клуб «Атмосфера»
 */

const assert = require("assert");

console.log("⌨️ Тестирование Web Audio 5-секундного отсчета и горячих клавиш на ТВ...\n");

const playedTicks = [];
let chimePlayed = false;

// Эмуляция Web Audio API
global.window = {
  AudioContext: class {
    constructor() {
      this.state = "running";
      this.currentTime = 0;
      this.destination = {};
    }
    resume() {
      this.state = "running";
      return Promise.resolve();
    }
    createOscillator() {
      return {
        type: "",
        frequency: {
          setValueAtTime: (f) => { playedTicks.push(f); },
          exponentialRampToValueAtTime: () => {}
        },
        connect: () => {},
        start: () => {},
        stop: () => {}
      };
    }
    createGain() {
      return {
        gain: {
          setValueAtTime: () => {},
          exponentialRampToValueAtTime: () => {}
        },
        connect: () => {}
      };
    }
  }
};

const keyListeners = [];
global.document = {
  getElementById: () => ({ 
    dataset: {}, 
    style: {}, 
    textContent: "", 
    classList: { toggle: () => {}, add: () => {}, remove: () => {} },
    querySelector: () => ({ style: {}, textContent: "" })
  }),
  querySelector: () => ({ 
    dataset: {}, 
    style: {}, 
    textContent: "", 
    classList: { toggle: () => {}, add: () => {}, remove: () => {} }, 
    addEventListener: () => {},
    querySelector: () => ({ style: {}, textContent: "" })
  }),
  addEventListener: (event, handler) => {
    if (event === "keydown") keyListeners.push(handler);
  },
  fullscreenElement: null,
  documentElement: {
    requestFullscreen: async () => {}
  }
};

global.POKER_CONFIG = require("../shared/poker-config.js");
const tv = require("../tv/tv.js");

// 1. Тест воспроизведения тиков отсчета (Countdown)
console.log("1. Проверка генерации звуковых тиков на 5..1 секундах:");
tv.playCountdownTick(5);
tv.playCountdownTick(4);
tv.playCountdownTick(1);

assert(playedTicks.length >= 3, "Должно быть сгенерировано как минимум 3 тика");
assert.strictEqual(playedTicks[0], 600, "Тик на 5с должен быть 600 Гц");
assert.strictEqual(playedTicks[2], 720, "Тик на 1с должен быть повышен до 720 Гц");
console.log("   ✅ Процедурные синусоидальные тики 600-720 Гц корректно сгенерированы.");

// 2. Тест горячих клавиш на ТВ (Hotkeys)
console.log("\n2. Проверка горячих клавиш управления на ТВ:");
const testTable = {
  id: "table_vlad",
  dealerName: "Влад",
  status: "running",
  format: "SnG",
  levelIndex: 0,
  durationSec: 420,
  levelEndsAt: Date.now() + 180000 // 3 минуты
};

tv.setActiveTables({ table_vlad: testTable });
tv.initTvHotkeys();

// Имитируем нажатие клавиш через зарегистрированные обработчики
const triggerKey = (key, code = "") => {
  keyListeners.forEach(fn => fn({ key, code, preventDefault: () => {} }));
};

// 2.1. Пробел -> Пауза
triggerKey(" ", "Space");
assert.strictEqual(testTable.status, "paused", "Пробел должен поставить стол на паузу");
console.log("   ✅ [Space]: Стол успешно переведен на паузу.");

// 2.2. Пробел -> Возобновление
triggerKey(" ", "Space");
assert.strictEqual(testTable.status, "running", "Повторный пробел должен возобновить игру");
console.log("   ✅ [Space]: Стол успешно возобновлен.");

// 2.3. N -> Следующий уровень
triggerKey("N");
assert.strictEqual(testTable.levelIndex, 1, "Клавиша N должна переключить уровень вперед");
console.log("   ✅ [N]: Переключение на следующий раунд (уровень 2).");

// 2.4. P -> Предыдущий уровень
triggerKey("P");
assert.strictEqual(testTable.levelIndex, 0, "Клавиша P должна вернуть предыдущий уровень");
console.log("   ✅ [P]: Откат на предыдущий раунд (уровень 1).");

// 2.5. Стрелка вправо (+) -> +1 минута (60 сек)
const beforeAdd = testTable.levelEndsAt;
triggerKey("ArrowRight");
assert.strictEqual(testTable.levelEndsAt, beforeAdd + 60000, "Стрелка вправо должна добавить 60 секунд к таймеру");
console.log("   ✅ [ArrowRight / +]: К таймеру добавлено +60 секунд.");

// 2.6. Стрелка влево (-) -> -1 минута (60 сек)
const beforeSub = testTable.levelEndsAt;
triggerKey("ArrowLeft");
assert.strictEqual(testTable.levelEndsAt, beforeSub - 60000, "Стрелка влево должна отнять 60 секунд от таймера");
console.log("   ✅ [ArrowLeft / -]: От таймера отнято -60 секунд.");

console.log("\n🎉 ТЕСТ WEB AUDIO COUNTDOWN И ГОРЯЧИХ КЛАВИШ УСПЕШНО ПРОЙДЕН!");
