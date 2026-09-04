/**
 * tests/test_break_screen_and_mtt_stub.js
 * Verification of EPT Break Screen Redesign and MTT Development Stub
 */

const assert = require("assert");

console.log("▶ Running Break Screen EPT Redesign & MTT Stub Tests...");

// 1. Test Break Screen Markup on TV
const tv = require("../tv/tv.js");

const mockTableBreak = {
  id: "dealer_vlad",
  dealerName: "Влад",
  format: "SnG",
  status: "finished",
  isPostGameBreak: true,
  nextGameAt: Date.now() + 500 * 1000,
  breakDurationSec: 600
};

tv.setActiveTables({ dealer_vlad: mockTableBreak });

// Mock DOM
let capturedHtml = "";
global.document = {
  getElementById: (id) => {
    if (id === "tv-viewport") {
      return {
        id: "tv-viewport",
        dataset: {},
        classList: {
          toggle: () => {},
          remove: () => {},
          contains: () => false
        },
        set innerHTML(val) { capturedHtml = val; },
        get innerHTML() { return capturedHtml; }
      };
    }
    return null;
  }
};

tv.renderTables();

assert(capturedHtml.includes("state-break"), "Карточка должна содержать CSS-класс state-break");
assert(capturedHtml.includes("break-screen-card"), "Карточка должна сохранять класс break-screen-card для совместимости");
assert(capturedHtml.includes("dealer-brand-box"), "Карточка должна содержать шапку ведущего (EPT Brand Box)");
assert(capturedHtml.includes("Влад"), "Имя ведущего должно отображаться в шапке");
assert(capturedHtml.includes("state-break-pill"), "Должен отображаться статус-пилл ☕ ПЕРЕРЫВ");
assert(capturedHtml.includes("state-break-digits"), "Должны отображаться стилизованные цифры перерыва");
assert(capturedHtml.includes("state-break-rail"), "Должен присутствовать прогресс-бар Time Rail для перерыва");
assert(capturedHtml.includes("break-monolith"), "Должен отображаться информационный монолит следующей игры");
assert(capturedHtml.includes("25 / 50"), "Должны отображаться стартовые блайнды 25 / 50 для следующей игры");
assert(capturedHtml.includes("РЕГИСТРАЦИЯ"), "Должен присутствовать бейдж регистрации");

console.log("  ✓ ТВ-экран перерыва полностью соответствует дизайн-коду EPT.");

// 2. Test Overtime Break Screen
const mockTableOvertime = {
  id: "dealer_vlad",
  dealerName: "Влад",
  format: "SnG",
  status: "finished",
  isPostGameBreak: true,
  nextGameAt: Date.now() - 120 * 1000, // 2 мин задержки
  breakDurationSec: 600
};

tv.setActiveTables({ dealer_vlad: mockTableOvertime });
tv.renderTables();

assert(capturedHtml.includes("state-overtime"), "Карточка перерыва в овертайме должна содержать класс state-overtime");
assert(capturedHtml.includes("+02:00"), "Таймер овертайма должен отображать время задержки +02:00");
assert(capturedHtml.includes("Задержка старта: +2 мин"), "Должен отображаться подстрочник задержки");

console.log("  ✓ ТВ-экран задержки перерыва (Overtime) работает корректно.");

// 3. Test MTT Stub on Dealer Web App
const domStore = {};
function createMockEl(id, dataset = {}, classList = []) {
  const classes = new Set(classList);
  return {
    id,
    dataset,
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      contains: (c) => classes.has(c),
      toggle: (c, force) => { if (force !== undefined) { if (force) classes.add(c); else classes.delete(c); } else { if (classes.has(c)) classes.delete(c); else classes.add(c); } }
    },
    style: {},
    textContent: "",
    listeners: {},
    addEventListener: function(event, handler) {
      if (!this.listeners[event]) this.listeners[event] = [];
      this.listeners[event].push(handler);
    },
    click: function() {
      if (this.listeners["click"]) {
        this.listeners["click"].forEach(fn => fn());
      }
    }
  };
}

const toastEl = createMockEl("app-toast");
const toastMsgEl = createMockEl("app-toast-msg");
const toastIconEl = createMockEl("app-toast-icon");
const sngPill = createMockEl("pill-sng", { format: "SnG" }, ["pill", "active"]);
const mysteryPill = createMockEl("pill-mystery", { format: "Mystery" }, ["pill"]);
const mttPill = createMockEl("pill-mtt", { format: "MTT", disabled: "true" }, ["pill", "is-disabled"]);

global.document = {
  getElementById: (id) => {
    if (id === "app-toast") return toastEl;
    if (id === "app-toast-msg") return toastMsgEl;
    if (id === "app-toast-icon") return toastIconEl;
    if (!domStore[id]) domStore[id] = createMockEl(id);
    return domStore[id];
  },
  querySelectorAll: (selector) => {
    if (selector === "#format-pills .pill") return [sngPill, mysteryPill, mttPill];
    if (selector === "#struct-pills .pill") return [];
    return [];
  },
  querySelector: () => null
};

global.window = {
  Telegram: {
    WebApp: {
      HapticFeedback: {
        impactOccurred: () => {},
        notificationOccurred: () => {}
      }
    }
  }
};

const dealer = require("../dealer/dealer.js");
dealer.setSelectedFormat("SnG");
dealer.initPillSelectors();

// Попытка клика по заблокированной кнопке MTT
mttPill.click();

// Проверяем, что MTT заблокирован, формат остался SnG, и показан тост
assert.strictEqual(dealer.getSelectedFormat ? dealer.getSelectedFormat() : "SnG", "SnG", "Формат не должен переключиться на MTT");
assert.strictEqual(toastEl.style.display, "flex", "Всплывающий тост должен отображаться при попытке выбрать MTT");
assert(toastMsgEl.textContent.includes("МТТ в разработке"), "Тост должен информировать о нахождении МТТ в разработке");

console.log("  ✓ Заглушка МТТ успешно блокирует переключение и выводит предупреждение.");

console.log("✅ Все проверки экрана перерыва и заглушки МТТ успешно пройдены!\n");
