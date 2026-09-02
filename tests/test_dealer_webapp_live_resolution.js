/**
 * UNIT TEST: Dealer WebApp Live Resolution for @vlad_a17
 * Антикафе «Атмосфера»
 */

const assert = require("assert");

console.log("🃏 Тестирование сквозной авторизации в WebApp для @vlad_a17...\n");

// Мок окружения браузера в Telegram
global.window = {
  Telegram: {
    WebApp: {
      ready: () => {},
      expand: () => {},
      initDataUnsafe: {
        user: {
          id: 247164413,
          username: "vlad_a17",
          first_name: "Vlad"
        }
      },
      HapticFeedback: {
        impactOccurred: () => {},
        notificationOccurred: () => {}
      }
    }
  },
  location: { search: "" }
};

global.localStorage = {
  _store: {},
  getItem(k) { return this._store[k] || null; },
  setItem(k, v) { this._store[k] = String(v); },
  removeItem(k) { delete this._store[k]; }
};

global.sessionStorage = {
  _store: {},
  getItem(k) { return this._store[k] || null; },
  setItem(k, v) { this._store[k] = String(v); }
};

const domElements = {
  "dealer-badge": { textContent: "" },
  "identity-name": { textContent: "" },
  "setup-panel": { style: { display: "" } },
  "control-card": { style: { display: "" } },
  "game-btn-stack": { style: { display: "" } },
  "post-game-panel": { style: { display: "" } },
  "running-btn-row": { style: { display: "" } },
  "btn-pause": { textContent: "" },
  "btn-colorup": { style: { display: "" } },
  "btn-reset": { style: { display: "" } },
  "btn-finish": { style: { display: "" } },
  "identity-round": { textContent: "" },
  "blinds-current": { textContent: "" },
  "blinds-next": { textContent: "" },
  "timer-digits": { textContent: "", style: {} },
  "timer-status": { textContent: "" }
};

global.document = {
  getElementById: (id) => domElements[id] || { style: {}, textContent: "" },
  addEventListener: () => {}
};

// Мок fetch для Firebase
global.fetch = async (url) => {
  if (url.includes("dealers_registry.json")) {
    return {
      ok: true,
      json: async () => ({
        LIST: ["Арина", "Влад", "Тест"],
        MAP: { "h0raiz0n": "Влад", "vlad_a17": "Тест" }
      })
    };
  }
  return { ok: false };
};

const dealerEngine = require("../dealer/dealer.js");

async function testResolution() {
  // Вызываем инициализацию
  dealerEngine.initDealerIdentity();

  // Ждем микротаски для завершения fetchDynamicDealersRegistryAndRetry
  await new Promise(r => setTimeout(r, 50));

  assert.strictEqual(domElements["dealer-badge"].textContent, "Тест", "Бейдж ведущего должен отображать 'Тест'");
  assert.strictEqual(domElements["identity-name"].textContent, "Тест", "Имя в шапке должно отображать 'Тест'");
  console.log("1. Динамическая верификация через Firebase: ✅ Успешно авторизован как 'Тест'");

  // Проверка сохраненного кэша в localStorage
  const savedReg = JSON.parse(global.localStorage.getItem("atmosphere_dealers_registry"));
  assert(savedReg && savedReg.MAP["vlad_a17"] === "Тест", "Реестр должен сохраниться в localStorage");
  console.log("2. Кэширование реестра в localStorage: ✅ Успешно сохранено");
}

testResolution().then(() => {
  console.log("\n🎉 ВСЕ ТЕСТЫ АВТОРИЗАЦИИ WEBAPP ДЛЯ НОВЫХ ВЕДУЩИХ УСПЕШНО ПРОЙДЕНЫ!");
});
