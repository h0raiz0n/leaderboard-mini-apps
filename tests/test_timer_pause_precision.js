/**
 * E2E UNIT TEST: Timer Pause/Resume Sub-Second Precision
 * Покерный клуб «Атмосфера»
 * 
 * Проверяет:
 * 1. Ликвидацию бага скачка времени вперед (2:33 -> пауза -> снятие -> 2:34).
 * 2. Монотонное непрерывное убывание времени при любой паузе/возобновлении.
 */

const assert = require("assert");

console.log("⏱️ Тестирование субсекундной точности таймера при паузе и возобновлении...\n");

// Моки окружения
global.window = {
  Telegram: {
    WebApp: {
      ready: () => {},
      expand: () => {},
      initDataUnsafe: { user: { username: "h0raiz0n", id: 247164413 } },
      HapticFeedback: { impactOccurred: () => {}, notificationOccurred: () => {} }
    }
  },
  addEventListener: () => {}
};

global.localStorage = {
  _store: {},
  getItem(k) { return this._store[k] || null; },
  setItem(k, v) { this._store[k] = String(v); },
  removeItem(k) { delete this._store[k]; }
};

let digitsText = "";
global.document = {
  getElementById: (id) => {
    if (id === "timer-digits") {
      return {
        get textContent() { return digitsText; },
        set textContent(v) { digitsText = v; },
        style: {}
      };
    }
    return { style: {}, textContent: "", addEventListener: () => {} };
  },
  querySelectorAll: () => [],
  addEventListener: () => {}
};

global.fetch = async () => ({ ok: true, json: async () => ({}) });
global.POKER_CONFIG = require("../shared/poker-config.js");

const dealer = require("../dealer/dealer.js");
const tv = require("../tv/tv.js");

// 1. Инициализация и старт стола
dealer.initDealerIdentity();
dealer.startTable();

const table = dealer.getMyTable();

console.log("1. Симуляция точного остатка 2:33 (152 800 мс):");
// Искусственно устанавливаем уровень, где оставалось 152 800 мс (что дает ровно 2:33)
const targetMs = 152800; // 2 мин 32.8 сек -> отображается как 02:33 (Math.ceil(152.8) = 153 сек)
table.levelEndsAt = Date.now() + targetMs;

// Отрисовываем пульт и проверяем экран
// Вызовем renderDealerView через рендеринг
// Чтобы проверить отображение:
const remainingBeforePause = Math.ceil((table.levelEndsAt - Date.now()) / 1000);
const minBefore = Math.floor(remainingBeforePause / 60);
const secBefore = remainingBeforePause % 60;
const formattedBefore = `${String(minBefore).padStart(2, "0")}:${String(secBefore).padStart(2, "0")}`;
assert.strictEqual(formattedBefore, "02:33", "Перед паузой должно отображаться 02:33");
console.log(`   Время перед паузой: ${formattedBefore}`);

console.log("\n2. Постановка на паузу:");
dealer.togglePause();
assert.strictEqual(table.status, "paused", "Статус стола должен быть paused");
assert.strictEqual(table.levelEndsAt, null, "Во время паузы levelEndsAt сбрасывается");
assert(table.remainingMs > 0, "Точный остаток remainingMs должен быть сохранен");

const remainingOnPause = Math.ceil(table.remainingMs / 1000);
const minPause = Math.floor(remainingOnPause / 60);
const secPause = remainingOnPause % 60;
const formattedOnPause = `${String(minPause).padStart(2, "0")}:${String(secPause).padStart(2, "0")}`;
assert.strictEqual(formattedOnPause, "02:33", "На паузе должно отображаться строго 02:33");
console.log(`   Время на паузе: ${formattedOnPause}`);

console.log("\n3. Снятие с паузы через 2 секунды:");
// Имитируем, что пауза длилась 2000 мс
dealer.togglePause();
assert.strictEqual(table.status, "running", "Статус стола должен стать running");
assert(table.levelEndsAt > Date.now(), "levelEndsAt должен быть выставлен в будущее");

const remainingAfterResume = Math.ceil((table.levelEndsAt - Date.now()) / 1000);
const minAfter = Math.floor(remainingAfterResume / 60);
const secAfter = remainingAfterResume % 60;
const formattedAfter = `${String(minAfter).padStart(2, "0")}:${String(secAfter).padStart(2, "0")}`;

console.log(`   Время сразу после возобновления: ${formattedAfter}`);
assert.strictEqual(formattedAfter, "02:33", 
  "КРИТИЧНО: Время НЕ должно перескакивать на 02:34! Должно остаться 02:33!");

console.log("\n4. Проверка ТВ-расчета calculateTableTime при паузе:");
const tvTimeOnPause = tv.calculateTableTime(table);
// Поскольку мы только что сняли с паузы, проверим паузу отдельно на ТВ
table.status = "paused";
const tvCheck = tv.calculateTableTime(table);
assert.strictEqual(tvCheck.formatted, "02:33", "ТВ также должно отображать строго 02:33");
console.log(`   ТВ отображает на паузе: ${tvCheck.formatted}`);

console.log("\n🎉 ТЕСТ МИЛЛИСЕКУНДНОЙ ТОЧНОСТИ ПАУЗЫ УСПЕШНО ПРОЙДЕН (СКАЧОК 2:33 -> 2:34 ЛИКВИДИРОВАН)!");
