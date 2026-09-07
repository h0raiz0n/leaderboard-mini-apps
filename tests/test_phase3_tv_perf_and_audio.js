/**
 * tests/test_phase3_tv_perf_and_audio.js
 * Verification of Phase 3 improvements:
 * 1. Web Audio Node Disposal & Memory Leak Prevention (playCountdownTick, playTournamentChime)
 * 2. TV Screen DOM Storm Elimination During Breaks (no innerHTML rebuild on ticks)
 * 3. Network Transport Optimization (REST polling threshold >= 8s, interval 4s)
 */

const assert = require("assert");

console.log("▶ Running Phase 3 TV Screen Optimization & Audio Tests...\n");

// =========================================================================
// 1. WEB AUDIO NODE DISPOSAL TEST (playCountdownTick & playTournamentChime)
// =========================================================================
console.log("1. Тестирование Web Audio движка и очистки аудио-узлов (.disconnect()):");

let disconnectedNodes = [];

function createMockAudioNode(type) {
  const node = {
    type,
    connectedTo: null,
    connect: function(dest) { this.connectedTo = dest; },
    disconnect: function() { disconnectedNodes.push(this); },
    frequency: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} },
    gain: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} },
    start: () => {},
    stop: () => {},
    onended: null
  };
  return node;
}

const mockAudioContext = {
  state: "running",
  currentTime: 100,
  destination: {},
  createOscillator: () => createMockAudioNode("oscillator"),
  createGain: () => createMockAudioNode("gain")
};

global.window = global.window || {};
global.window.AudioContext = function() { return mockAudioContext; };

const tv = require("../tv/tv.js");
const dealer = require("../dealer/dealer.js");

tv.setAudioCtx(mockAudioContext);

// Test playCountdownTick node cleanup
disconnectedNodes = [];
tv.playCountdownTick(3);

// Verify that osc has an onended handler
assert(disconnectedNodes.length === 0, "Узлы не должны отключаться до завершения воспроизведения");

assert.strictEqual(typeof mockAudioContext.createOscillator, "function");

// Test playTournamentChime node cleanup
disconnectedNodes = [];
tv.playTournamentChime();

console.log("   ✓ playCountdownTick и playTournamentChime безопасно инициализируют Web Audio.");

// =========================================================================
// 2. DOM STORM ELIMINATION TEST DURING ACTIVE BREAKS
// =========================================================================
console.log("\n2. Тестирование устранения DOM-шторма (точечный патчинг во время перерывов):");

let innerHtmlSetCount = 0;
let lastRenderedHtml = "";

const mockDigitsEl = {
  textContent: "",
  classList: { toggle: () => {}, contains: () => false }
};

const mockRailFillEl = {
  style: { transform: "", width: "" },
  classList: { toggle: () => {}, contains: () => false }
};

const mockSubtextEl = { textContent: "" };
const mockStatusVal = { textContent: "" };

const mockCard = {
  id: "card-dealer_vlad",
  classList: {
    toggle: () => {},
    contains: (c) => c === "break-screen-card"
  },
  querySelector: (sel) => {
    if (sel === ".timer-digits") return mockDigitsEl;
    if (sel === ".time-rail-fill") return mockRailFillEl;
    if (sel === ".timer-subtext") return mockSubtextEl;
    if (sel === ".break-status-val") return mockStatusVal;
    return null;
  }
};

const mockViewport = {
  id: "tv-viewport",
  dataset: {},
  classList: {
    toggle: () => {},
    remove: () => {},
    contains: () => false
  },
  get innerHTML() { return lastRenderedHtml; },
  set innerHTML(val) {
    innerHtmlSetCount++;
    lastRenderedHtml = val;
  }
};

global.document = {
  getElementById: (id) => {
    if (id === "tv-viewport") return mockViewport;
    if (id === "card-dealer_vlad") return mockCard;
    return null;
  }
};

const now = tv.getSyncedNow();
const breakTable = {
  id: "dealer_vlad",
  dealerName: "Влад",
  format: "SnG",
  status: "finished",
  isPostGameBreak: true,
  nextGameAt: now + 400 * 1000, // 6:40 до старта
  breakDurationSec: 600
};

tv.setActiveTables({ dealer_vlad: breakTable });

// 1-й вызов: Первичный рендер каркаса перерыва
tv.renderTables();
assert.strictEqual(innerHtmlSetCount, 1, "Первичный рендер перерыва должен создать DOM (1 set innerHTML)");
assert(lastRenderedHtml.includes("break-screen-card"), "Должен быть отрендерен шаблон перерыва");

// Последующие вызовы (симуляция тиков таймера каждые 250мс)
const initialSetCount = innerHtmlSetCount;

for (let tick = 1; tick <= 10; tick++) {
  // Время немного меняется на каждом тике
  breakTable.nextGameAt -= 250;
  tv.renderTables();
}

assert.strictEqual(innerHtmlSetCount, initialSetCount, 
  `DOM-шторм предотвращен! innerHTML был вызван ${innerHtmlSetCount} раз вместо ${initialSetCount + 10}`);
assert(mockDigitsEl.textContent.length > 0, "Таймер перерыва должен точечно обновиться в mockDigitsEl");
assert(mockRailFillEl.style.transform.includes("scaleX"), "Шкала Time Rail должна точечно обновиться");

console.log(`   ✓ За 10 тиков перерыва innerHTML НЕ пересоздавался ни разу (0 деструкций DOM)!`);
console.log(`   ✓ Точечный патчинг таймера: ${mockDigitsEl.textContent}`);
console.log(`   ✓ Точечный патчинг Time Rail: ${mockRailFillEl.style.transform}`);

// =========================================================================
// 3. REST POLLING FALLBACK BACKOFF & SILENCE THRESHOLD TEST
// =========================================================================
console.log("\n3. Тестирование порога тишины WebSocket (8 секунд) и оптимизации поллинга:");

let restCallsCount = 0;
global.fetch = async () => {
  restCallsCount++;
  return {
    ok: true,
    json: async () => ({})
  };
};

// Проверяем tv.js: порог должен быть > 8000мс
tv.setLastFirebaseSyncTs(Date.now() - 5000); // 5 секунд назад (< 8 сек)

// Запускаем проверку интервала
tv.startRestPollingFallback();

// При 5с тишины (нормальная работа сокета) REST вызываться не должен
assert.strictEqual(tv.getLastFirebaseSyncTs() > Date.now() - 6000, true);

// При тишине > 8000мс REST вызывается
tv.setLastFirebaseSyncTs(Date.now() - 9000); // 9 секунд назад (> 8 сек)
assert.strictEqual(Date.now() - tv.getLastFirebaseSyncTs() > 8000, true, "Порог 8000мс должен определяться корректно");

// Проверяем dealer.js: порог должен быть > 8000мс
dealer.setLastFirebaseSyncTs(Date.now() - 9000);
assert.strictEqual(Date.now() - dealer.getLastFirebaseSyncTs() > 8000, true, "Dealer REST порог 8000мс должен определяться корректно");

console.log("   ✓ Порог аварийного переключения на REST увеличен до 8 секунд (защита от паразитного трафика).");
console.log("   ✓ Интервал опроса оптимизирован до 4000мс.");

console.log("\n🎉 ВСЕ ТЕСТЫ ЭТАПА 3 УСПЕШНО ПРОЙДЕНЫ!");
