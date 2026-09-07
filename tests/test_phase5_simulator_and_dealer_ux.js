/**
 * UNIT TEST: Phase 5 - TV 1-4 Table Simulator, 3-4 Table Legibility & Dealer One-Hand UX
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");

console.log("🛠️ Запуск тестов Этапа 5: TV Simulator, Legibility 3-4 столов и Dealer One-Hand UX...\n");

// 1. Мок окружения
const domElements = {
  "tv-sim-toolbar": { style: { display: "none" } },
  "tv-sim-toggle-btn": { classList: { classes: new Set(), add(c) { this.classes.add(c); }, remove(c) { this.classes.delete(c); }, contains(c) { return this.classes.has(c); } } },
  "tv-viewport": { dataset: {}, classList: { toggle: () => {}, remove: () => {} }, innerHTML: "" },
  "header-clock": { textContent: "" },
  "net-ping-val": { textContent: "" },
  "net-status-badge": { className: "" },
  "time-adjust-row": { style: {} },
  "undo-level-snackbar": { style: { display: "none" }, classList: { classes: new Set(), add(c) { this.classes.add(c); }, remove(c) { this.classes.delete(c); }, contains(c) { return this.classes.has(c); } } },
  "undo-snackbar-msg": { textContent: "" },
  "btn-undo-level": { textContent: "" },
  "btn-pause": { textContent: "" },
  "btn-step": { textContent: "", disabled: false },
  "confirm-step-toast": { style: { display: "none" }, classList: { add: () => {}, remove: () => {} } },
  "blinds-current": { textContent: "" },
  "blinds-next": { textContent: "" },
  "timer-digits": { textContent: "", style: {} },
  "timer-status": { textContent: "", style: {} },
  "identity-round": { textContent: "", style: {} }
};

global.document = {
  getElementById(id) {
    if (!domElements[id]) {
      domElements[id] = { style: {}, textContent: "", classList: { classes: new Set(), add(c) { this.classes.add(c); }, remove(c) { this.classes.delete(c); }, contains(c) { return this.classes.has(c); }, toggle(c, f) { if (f === undefined) { if (this.classes.has(c)) this.classes.delete(c); else this.classes.add(c); } else if (f) this.classes.add(c); else this.classes.delete(c); } } };
    }
    if (!domElements[id].style) domElements[id].style = {};
    if (!domElements[id].classList) {
      domElements[id].classList = { classes: new Set(), add(c) { this.classes.add(c); }, remove(c) { this.classes.delete(c); }, contains(c) { return this.classes.has(c); }, toggle(c, f) { if (f === undefined) { if (this.classes.has(c)) this.classes.delete(c); else this.classes.add(c); } else if (f) this.classes.add(c); else this.classes.delete(c); } };
    }
    return domElements[id];
  },
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener: () => {}
};

global.window = {
  addEventListener: () => {},
  location: { search: "" },
  Telegram: {
    WebApp: {
      ready: () => {},
      expand: () => {},
      initDataUnsafe: { user: { username: "h0raiz0n", id: 247164413 } },
      HapticFeedback: { impactOccurred: () => {}, notificationOccurred: () => {} }
    }
  }
};

global.localStorage = {
  _store: {},
  getItem(k) { return this._store[k] || null; },
  setItem(k, v) { this._store[k] = String(v); },
  removeItem(k) { delete this._store[k]; }
};

global.POKER_CONFIG = require("../shared/poker-config.js");
const tv = require("../tv/tv.js");
const dealer = require("../dealer/dealer.js");

// ==========================================
// ТЕСТ 1: СИМУЛЯТОР ТВ-ЭКРАНА
// ==========================================
console.log("[1] Тестирование переключателя и состояний симулятора ТВ:");

// 1.1. Проверка toggleTvSimulator
assert.strictEqual(typeof tv.toggleTvSimulator, "function", "tv.toggleTvSimulator должен быть функцией");
assert.strictEqual(tv.isSimulationMode(), false, "По умолчанию симуляция отключена");

tv.toggleTvSimulator();
assert.strictEqual(domElements["tv-sim-toolbar"].style.display, "flex", "Панель симулятора должна открыться (display: flex)");
assert.strictEqual(domElements["tv-sim-toggle-btn"].classList.contains("active"), true, "Кнопка шестеренки должна стать active");

tv.toggleTvSimulator();
assert.strictEqual(domElements["tv-sim-toolbar"].style.display, "none", "Панель симулятора должна скрыться (display: none)");
assert.strictEqual(domElements["tv-sim-toggle-btn"].classList.contains("active"), false, "Кнопка шестеренки должна потерять active");

// 1.2. Проверка генерации 1, 2, 3, 4 столов
[1, 2, 3, 4].forEach(count => {
  tv.setSimulatedTables(count);
  assert.strictEqual(tv.isSimulationMode(), true, `При вызове setSimulatedTables(${count}) режим симуляции должен быть активен`);
  assert.strictEqual(domElements["tv-viewport"].dataset.tables, String(count), `Viewport должен получить dataset.tables = "${count}"`);
  console.log(`   ✓ Симуляция ${count} стола(ов): успешно отрендерено, dataset.tables="${count}"`);
});

// 1.3. Проверка симуляции перерыва
tv.setSimulatedBreak();
assert.strictEqual(tv.isSimulationMode(), true);
console.log("   ✓ Симуляция экрана перерыва (☕ Перерыв): успешно активирована");

// 1.4. Проверка симуляции алерта 25 секунд
tv.setSimulatedAlert();
assert.strictEqual(tv.isSimulationMode(), true);
console.log("   ✓ Симуляция алерта 25 секунд (⚠️ Алерт): успешно активирована");

// 1.5. Проверка возврата к живому Firebase
tv.resetToLiveFirebase();
assert.strictEqual(tv.isSimulationMode(), false, "resetToLiveFirebase() должен отключить SIMULATION_MODE");
console.log("   ✓ Сброс к живому Firebase: режим симуляции отключен (SIMULATION_MODE = false)");

// ==========================================
// ТЕСТ 2: ВАЛИДАЦИЯ СТИЛЕЙ ДЛЯ 3 И 4 СТОЛОВ
// ==========================================
console.log("\n[2] Проверка CSS-стилей читаемости (3 и 4 стола) в tv/styles.css:");
const tvCss = fs.readFileSync(path.join(__dirname, "../tv/styles.css"), "utf-8");

// Проверка 4 столов: двухколоночная сетка
assert(tvCss.includes('.tv-viewport[data-tables="4"] .table-card'), "Стили для data-tables=4 должны присутствовать");
assert(tvCss.includes('grid-template-areas'), "Стили для data-tables=4 должны использовать grid-template-areas");
assert(tvCss.includes('"timer blinds"'), "Интерьер карточки 4 столов должен разделять таймер и блайнды по колонкам");
assert(tvCss.includes('clamp(86px, 12vh, 108px)'), "Шрифт таймера 4 столов должен быть увеличен (минимум 86-108px)");
assert(tvCss.includes('clamp(56px, 8vh, 72px)'), "Шрифт блайндов 4 столов должен быть увеличен (минимум 56-72px)");

// Проверка скрытия информационного шума на 4 столах
assert(tvCss.includes('.tv-viewport[data-tables="4"] .timer-subtext {\n  display: none;'), "Подпись 'Идёт уровень' должна быть скрыта для 4 столов");
assert(tvCss.includes('.tv-viewport[data-tables="4"] .blinds-caption {\n  display: none;'), "Подпись 'Текущие блайнды' должна быть скрыта для 4 столов");

// Проверка 3 столов: увеличенные размеры
assert(tvCss.includes('clamp(100px, 15vh, 136px)'), "Шрифт таймера 3 столов должен быть увеличен (100-136px)");
assert(tvCss.includes('clamp(58px, 9vh, 76px)'), "Шрифт блайндов 3 столов должен быть увеличен (58-76px)");
console.log("   ✓ Стили для 3 и 4 столов содержат двухколоночный сплит, увеличенные шрифты и устранение визуального шума.");

// ==========================================
// ТЕСТ 3: ОДНОРУЧНЫЙ ДИЗАЙН ПУЛЬТА ДИЛЕРА (UX)
// ==========================================
console.log("\n[3] Проверка логики быстрого управления в пульте ведущего:");

dealer.startTable();
const table = dealer.getMyTable();
assert.strictEqual(table.status, "running", "Стол должен быть в статусе running");

// 3.1. Быстрая корректировка времени (+1м / -1м)
const initialRemaining = table.remainingMs;
dealer.adjustLevelTime(60);
assert(Math.abs(table.remainingMs - (initialRemaining + 60000)) <= 100, "adjustLevelTime(+60) должен добавить 60 секунд к remainingMs");

dealer.adjustLevelTime(-60);
assert(Math.abs(table.remainingMs - initialRemaining) <= 100, "adjustLevelTime(-60) должен убавить 60 секунд обратно");

// Проверка нижнего лимита времени (не меньше 5 секунд)
dealer.adjustLevelTime(-100000);
assert.strictEqual(table.remainingMs, 5000, "adjustLevelTime не должен уменьшать оставшееся время ниже 5 секунд");
console.log("   ✓ Кнопки +1м / -1м корректно изменяют время уровня с защитой 5 секунд.");

// 3.2. Мгновенный шаг уровня с отменой (Undo)
table.levelIndex = 0;
dealer.stepLevelWithUndo();
assert.strictEqual(table.levelIndex, 1, "stepLevelWithUndo() должен мгновенно переключить на уровень 1");
assert.strictEqual(domElements["undo-level-snackbar"].style.display, "flex", "Снекбар отмены должен отобразиться (display: flex)");
assert(dealer.getPrevLevelState() !== null, "Предыдущее состояние должно сохраниться в PREV_LEVEL_STATE");

// Проверка отмены шага уровня (Undo)
dealer.undoStepLevel();
assert.strictEqual(table.levelIndex, 0, "undoStepLevel() должен вернуть стол обратно на уровень 0");
assert.strictEqual(domElements["undo-level-snackbar"].style.display, "none", "Снекбар должен скрыться после отмены");
assert.strictEqual(dealer.getPrevLevelState(), null, "PREV_LEVEL_STATE должен очиститься");
console.log("   ✓ Шаг уровня в один клик с 3-секундным окном Undo работает безупречно.");

// 3.3. Проверка вызова handleStepClick при наличии снэкбара в DOM
dealer.handleStepClick();
assert.strictEqual(table.levelIndex, 1, "handleStepClick() при наличии undo-level-snackbar должен сразу активировать шаг");
dealer.undoStepLevel();
assert.strictEqual(table.levelIndex, 0, "Успешный откат после handleStepClick()");

// ==========================================
// ТЕСТ 4: ПРОВЕРКА HTML РАЗМЕТКИ
// ==========================================
console.log("\n[4] Проверка разметки в tv/index.html и dealer/index.html:");
const tvHtml = fs.readFileSync(path.join(__dirname, "../tv/index.html"), "utf-8");
const dealerHtml = fs.readFileSync(path.join(__dirname, "../dealer/index.html"), "utf-8");

assert(tvHtml.includes('id="tv-sim-toolbar"'), "tv/index.html должен содержать #tv-sim-toolbar");
assert(tvHtml.includes('id="tv-sim-toggle-btn"'), "tv/index.html должен содержать кнопку #tv-sim-toggle-btn");
assert(dealerHtml.includes('id="time-adjust-row"'), "dealer/index.html должен содержать блок #time-adjust-row (+1м/-1м)");
assert(dealerHtml.includes('id="undo-level-snackbar"'), "dealer/index.html должен содержать #undo-level-snackbar");
console.log("   ✓ Вся необходимая разметка присутствует в index.html для ТВ и Пульта.");

console.log("\n🎉 ВСЕ ТЕСТЫ ЭТАПА 5 УСПЕШНО ПРОЙДЕНЫ!");
