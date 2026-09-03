/**
 * E2E UNIT TEST: TV DOM-Patching, MTT BB Stack & Network Ping Display
 * Покерный клуб «Атмосфера»
 */

const assert = require("assert");

console.log("⚡ Тестирование TV DOM-Patching, среднего стека в BB и пинг-индикатора...\n");

// Мок DOM с поддержкой querySelector и мутаций
class MockElement {
  constructor(tag = "div", id = "") {
    this.tagName = tag.toUpperCase();
    this.id = id;
    this._innerHTML = "";
    this._textContent = "";
    this.dataset = {};
    this.style = {};
    this.classList = {
      _classes: new Set(),
      add: (c) => this.classList._classes.add(c),
      remove: (c) => this.classList._classes.delete(c),
      toggle: (c, force) => {
        if (force === undefined) {
          if (this.classList._classes.has(c)) this.classList._classes.delete(c);
          else this.classList._classes.add(c);
        } else if (force) this.classList._classes.add(c);
        else this.classList._classes.delete(c);
      },
      contains: (c) => this.classList._classes.has(c)
    };
    this.children = [];
  }

  get textContent() { return this._textContent; }
  set textContent(v) { this._textContent = String(v); }

  get innerHTML() { return this._innerHTML; }
  set innerHTML(v) {
    this._innerHTML = String(v);
    this._parseChildren(this._innerHTML);
  }

  _parseChildren(html) {
    this.children = [];
    const idMatches = [...html.matchAll(/id="([^"]+)"/g)];
    idMatches.forEach(m => {
      const el = new MockElement("div", m[1]);
      this.children.push(el);
      registry[m[1]] = el;
    });
  }

  querySelector(selector) {
    if (selector.startsWith("#")) {
      const id = selector.substring(1);
      return registry[id] || null;
    }
    const fakeEl = new MockElement("div");
    return fakeEl;
  }
}

const registry = {};

global.document = {
  getElementById: (id) => registry[id] || null,
  querySelector: (s) => registry[s.replace("#", "")] || null,
  addEventListener: () => {}
};

global.window = {};
global.POKER_CONFIG = require("../shared/poker-config.js");

const tv = require("../tv/tv.js");

const viewport = new MockElement("main", "tv-viewport");
registry["tv-viewport"] = viewport;

const pingBadge = new MockElement("div", "net-status-badge");
registry["net-status-badge"] = pingBadge;
const pingVal = new MockElement("span", "net-ping-val");
registry["net-ping-val"] = pingVal;

// 1. Тест пинг-индикатора
console.log("1. Проверка обновления сетевого пинга:");
tv.updateNetPingDisplay(18, "WS");
assert.strictEqual(pingVal.textContent, "18 ms (WS)");
assert(pingBadge.className.includes("fast"), "Пинг 18ms должен быть fast");

tv.updateNetPingDisplay(320, "REST");
assert.strictEqual(pingVal.textContent, "320 ms (REST)");
assert(pingBadge.className.includes("medium"), "Пинг 320ms должен быть medium");
console.log("   ✅ Пинг-индикатор корректно отображает задержку и источник (WS/REST).");

// 2. Тест среднего стека в BB (МТТ)
console.log("\n2. Проверка расчета среднего стека в BB для МТТ:");
const mttTables = {
  dealer_vlad: {
    id: "dealer_vlad",
    dealerName: "Влад",
    format: "MTT",
    status: "running",
    levelIndex: 1, // Уровень 2: 50 / 100 (BB = 100)
    playersCount: 7,
    initialPlayers: 9,
    durationSec: 420,
    levelEndsAt: Date.now() + 300000
  },
  dealer_arina: {
    id: "dealer_arina",
    dealerName: "Арина",
    format: "MTT",
    status: "running",
    levelIndex: 1,
    playersCount: 8,
    initialPlayers: 9,
    durationSec: 420,
    levelEndsAt: Date.now() + 300000
  }
};

tv.setActiveTables(mttTables);
tv.renderTables();

const avgStackEl = registry["mtt-val-avg"];
assert(avgStackEl, "Элемент mtt-val-avg должен быть создан");
// Всего фишек: 18 игроков * 5000 = 90 000 фишек. Игроков осталось: 15. Avg stack = 6 000. BB = 100. Avg BB = 60 BB.
assert(avgStackEl.innerHTML.includes("BB"), "В плашке среднего стека должны присутствовать BB");
assert(avgStackEl.innerHTML.includes("60 BB"), "Средний стек должен быть равен 60 BB");
console.log("   ✅ Средний стек корректно вычислен в BB: " + avgStackEl.innerHTML);

// 3. Тест DOM-Patching
console.log("\n3. Проверка DOM-Patching (отсутствие деструктивной перезаписи HTML):");
const initialHtml = viewport.innerHTML;
let innerHtmlReassigned = false;

// Подменяем сеттер viewport.innerHTML чтобы отследить лишние присваивания
const originalSet = Object.getOwnPropertyDescriptor(MockElement.prototype, "innerHTML").set;
Object.defineProperty(viewport, "innerHTML", {
  get() { return this._innerHTML; },
  set(v) {
    innerHtmlReassigned = true;
    originalSet.call(this, v);
  },
  configurable: true
});

// Вызываем повторный рендер (эмуляция тика 250 мс)
tv.renderTables();
assert.strictEqual(innerHtmlReassigned, false, 
  "КРИТИЧНО: При тике таймера innerHTML НЕ должен перезаписываться с нуля (DOM-Patching)!");
console.log("   ✅ DOM-каркас сохранен без пересоздания, текстовые ноды обновлены точечно.");

console.log("\n🎉 ТЕСТ TV DOM-PATCHING, BB СТЕКА И ПИНГА УСПЕШНО ПРОЙДЕН!");
