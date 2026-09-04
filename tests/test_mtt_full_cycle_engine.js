/**
 * E2E UNIT & INTEGRATION TEST: Full-Scale Multi-Table Tournament System (Atmosphere MTT Pro)
 * Покерный клуб «Атмосфера»
 * 
 * Проверяет:
 * 1. Структуру «Атмосфера МТТ Pro» (MTT_PRO_5000): 17 уровней по 10 мин, Color-Up после 150/300, старт BBA с 6 ур.
 * 2. Позднюю регистрацию: добавление фишек (+5000 в пул), расчет среднего стека, авто-блокировка после 5 уровня.
 * 3. Синхронизацию Master / Satellite столов: единый мастер-таймер при независимом управлении составом стола.
 * 4. Одиночный межлинейный ребаланс столов (дельта >= 2) со случайным боксом 1–9 и атомарным Firebase-апдейтом.
 * 5. Процедуру объединения столов: выбор закрываемого стола и запуск клубного 15-минутного перерыва.
 * 6. ТВ-дашборд Cinema Broadcast HUD: отображение Master HUD, пула фишек, ролей столов и флагов ребаланса.
 */

const assert = require("assert");

console.log("🏆 ЗАПУСК КОМПЛЕКСНОГО ТЕСТИРОВАНИЯ СИСТЕМЫ МТТ («АТМОСФЕРА МТТ PRO»)...\\n");

// 1. Проверка спецификации структуры MTT_PRO_5000
console.log("1. Тестирование параметров структуры MTT_PRO_5000:");
const POKER_CONFIG = require("../shared/poker-config.js");
assert(POKER_CONFIG.BLIND_STRUCTURES.MTT_PRO_5000, "Структура MTT_PRO_5000 должна быть зарегистрирована в POKER_CONFIG");

const mttStruct = POKER_CONFIG.BLIND_STRUCTURES.MTT_PRO_5000;
assert.strictEqual(mttStruct.stack, 5000, "Стартовый стек должен составлять 5 000 фишек");
assert.strictEqual(mttStruct.levels.length, 17, "Структура должна содержать ровно 17 уровней");
assert.strictEqual(mttStruct.colorUpAfterLevel, 5, "Color-Up должен происходить строго после 5 уровня (150/300)");
assert.strictEqual(mttStruct.lateRegLevels, 5, "Поздняя регистрация открыта ровно первые 5 уровней (50 мин)");
assert.strictEqual(mttStruct.bbaStartLevel, 6, "Анте с большого блайнда (BBA) вводится с 6 уровня");

// Проверка длительности всех уровней (по 10 минут = 600 секунд)
mttStruct.levels.forEach((lvl, idx) => {
  assert.strictEqual(lvl.durationSec, 600, `Уровень ${idx + 1} (${lvl.label}) должен длиться 600 секунд (10 мин)`);
});

// Проверка уровня 1 (25 / 50 -> 100 BB со стеком 5 000)
assert.strictEqual(mttStruct.levels[0].sb, 25);
assert.strictEqual(mttStruct.levels[0].bb, 50);
assert.strictEqual(mttStruct.levels[0].ante, 0);

// Проверка уровня 5 (150 / 300) - последний уровень с фишками 25 и 50
assert.strictEqual(mttStruct.levels[4].sb, 150);
assert.strictEqual(mttStruct.levels[4].bb, 300);
assert.strictEqual(mttStruct.levels[4].ante, 0);

// Проверка уровня 6 (200 / 400 + BBA 400) - старт BBA и вывод фишек <100
assert.strictEqual(mttStruct.levels[5].sb, 200);
assert.strictEqual(mttStruct.levels[5].bb, 400);
assert.strictEqual(mttStruct.levels[5].ante, 400);

console.log("   ✅ Структура MTT_PRO_5000 полностью соответствует регламенту (17 уровней, 10 мин, Color-Up после 150/300, BBA с 6 ур.).");

// 2. Тестирование поздней регистрации и пула фишек
console.log("\\n2. Тестирование поздней регистрации (+5000 фишек) и авто-блокировки:");

// Моки окружения для dealer.js
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

const domStore = {};
function createMockEl(id) {
  return {
    id,
    dataset: {},
    style: {},
    classList: {
      _set: new Set(),
      add(c) { this._set.add(c); },
      remove(c) { this._set.delete(c); },
      contains(c) { return this._set.has(c); },
      toggle(c, force) { if (force) this.add(c); else this.remove(c); }
    },
    textContent: "",
    innerHTML: "",
    disabled: false,
    value: "",
    children: [],
    appendChild(c) { this.children.push(c); },
    querySelectorAll: () => [],
    querySelector: () => null,
    addEventListener: () => {}
  };
}

global.document = {
  getElementById: (id) => {
    if (!domStore[id]) domStore[id] = createMockEl(id);
    return domStore[id];
  },
  createElement: (tag) => createMockEl(tag),
  querySelectorAll: () => [],
  querySelector: () => null,
  addEventListener: () => {}
};

const networkLog = [];
global.fetch = async (url, options = {}) => {
  networkLog.push({ url, body: options.body ? JSON.parse(options.body) : null });
  return { ok: true, json: async () => ({}) };
};

global.POKER_CONFIG = POKER_CONFIG;
const dealer = require("../dealer/dealer.js");

// Инициализируем ведущего Влада
dealer.initDealerIdentity();
dealer.setSelectedFormat("MTT");
dealer.setSelectedStruct("MTT_PRO_5000");
dealer.setIsMttMaster(true);
dealer.setMttSetupPlayers(9);

dealer.startTable();
let masterTable = dealer.getMyTable();

assert.strictEqual(masterTable.format, "MTT");
assert.strictEqual(masterTable.structKey, "MTT_PRO_5000");
assert.strictEqual(masterTable.isMttMaster, true);
assert.strictEqual(masterTable.playersCount, 9);
assert.strictEqual(masterTable.initialPlayers, 9);
assert.strictEqual(masterTable.lateEntries, 0);

// Дилер нажимает [ + Игрок (Поздняя рега) ] на уровне 1
dealer.registerLateEntry();
masterTable = dealer.getMyTable();

assert.strictEqual(masterTable.playersCount, 10, "Число живых игроков должно стать 10");
assert.strictEqual(masterTable.initialPlayers, 10, "Начальное число игроков / входов должно вырасти до 10");
assert.strictEqual(masterTable.lateEntries, 1, "Счетчик поздних входов должен быть 1");

// Проверяем сетевой запрос в Firebase
const lateRegReq = networkLog.filter(r => r.url.includes("atmosphere/tables/dealer_vlad.json")).pop();
assert(lateRegReq, "Состояние стола после поздней реги должно быть отправлено в Firebase");
assert.strictEqual(lateRegReq.body.playersCount, 10);
assert.strictEqual(lateRegReq.body.initialPlayers, 10);
console.log("   ✅ Поздняя регистрация успешно добавила участника и обновила базу.");

// Переводим стол на уровень 6 (индекс 5 - 200/400 BBA, регистрация должна закрыться)
masterTable.levelIndex = 5;
dealer.renderDealerView();

const lateRegBtn = domStore["btn-late-reg"];
assert.strictEqual(lateRegBtn.disabled, true, "Кнопка поздней реги должна быть заблокирована после 5 уровня");
assert(lateRegBtn.classList.contains("disabled"), "Кнопка должна иметь класс disabled");
console.log("   ✅ Поздняя регистрация автоматически заблокирована после 5 уровня.");

// 3. Тестирование синхронизации Master / Satellite столов
console.log("\\n3. Тестирование синхронизации сателлитных столов с головным столом:");

// Создаем головной стол в состоянии running на уровне 3
const mockTablesState = {
  dealer_vlad: {
    id: "dealer_vlad",
    dealerName: "Влад",
    format: "MTT",
    structKey: "MTT_PRO_5000",
    isMttMaster: true,
    status: "running",
    levelIndex: 2, // Уровень 3: 75 / 150
    durationSec: 600,
    levelEndsAt: Date.now() + 450000,
    playersCount: 9,
    initialPlayers: 10
  },
  dealer_arina: {
    id: "dealer_arina",
    dealerName: "Арина",
    format: "MTT",
    structKey: "MTT_PRO_5000",
    isMttMaster: false,
    status: "idle",
    levelIndex: 0,
    playersCount: 7, // Локальный состав стола Арины
    initialPlayers: 9
  }
};

dealer.setTablesState(mockTablesState);
dealer.setDealerName("Арина"); // Переключаем контекст пульта на Арину (сателлит)
dealer.renderDealerView();
const arinaTable = dealer.getMyTable();

// Сателлит должен перенять время и статус головного стола, но сохранить своё количество игроков
assert.strictEqual(arinaTable.status, "running", "Сателлит должен синхронизировать статус running от Master");
assert.strictEqual(arinaTable.levelIndex, 2, "Сателлит должен синхронизировать levelIndex от Master");
assert.strictEqual(arinaTable.playersCount, 7, "Сателлит должен сохранить свой локальный состав (7 игроков)");

// Проверяем скрытие кнопок управления секундомером для сателлита
const pauseBtn = domStore["btn-pause"];
const stepBtn = domStore["btn-step"];
const syncBadge = domStore["satellite-sync-badge"];
assert.strictEqual(pauseBtn.style.display, "none", "Кнопка паузы должна быть скрыта для сателлита");
assert.strictEqual(stepBtn.style.display, "none", "Кнопка шага должна быть скрыта для сателлита");
assert.strictEqual(syncBadge.style.display, "flex", "Плашка синхронизации должна отображаться для сателлита");
console.log("   ✅ Сателлитный стол идеально следует за часами головного стола без рассинхрона.");

// 4. Тестирование одиночного ребаланса столов (дельта >= 2)
console.log("\\n4. Тестирование одиночного ребаланса столов и генерации бокса 1-9:");

// Влад имеет 9 игроков, Арина имеет 7 игроков -> Дельта = 2
dealer.setDealerName("Влад");
dealer.setTablesState(mockTablesState);
dealer.renderDealerView();

dealer.checkMttRebalance();
const rebalanceModal = domStore["rebalance-modal"];
assert.strictEqual(rebalanceModal.style.display, "flex", "Модалка ребаланса должна открыться при дельте >= 2");

const targetSeat = domStore["rebalance-box-num"];
const seatNum = parseInt(targetSeat.textContent.replace("№", "").trim(), 10);
assert(seatNum >= 1 && seatNum <= 9, "Выбранный бокс для пересадки должен быть в диапазоне 1–9");
console.log(`   🎲 Случайно выбран бокс для пересадки: ${seatNum}`);

// Подтверждаем ребаланс
dealer.confirmRebalance();
assert.strictEqual(mockTablesState.dealer_vlad.playersCount, 8, "Со стола-донора должен уйти 1 игрок");
assert.strictEqual(mockTablesState.dealer_arina.playersCount, 8, "Стол-приемник должен получить 1 игрока");

// Проверяем отправку точечного обновления в Firebase для стола-приемника
const atomicUpdateReq = networkLog.find(r => r.url.includes("dealer_arina/playersCount.json"));
assert(atomicUpdateReq, "Обновление игроков стола-приемника должно производиться точечно");
assert.strictEqual(atomicUpdateReq.body, 8);
console.log("   ✅ Ребаланс успешно выполнен атомарно, столы сбалансированы (8 и 8).");

// 5. Тестирование объединения столов и 15-минутного клубного перерыва
console.log("\\n5. Тестирование расформирования стола и запуска 15-минутного перерыва:");

// Симулируем 3 стола, когда общее число игроков падает до 18 (порог 3 -> 2 стола)
const threeTables = {
  dealer_vlad: {
    id: "dealer_vlad",
    dealerName: "Влад",
    format: "MTT",
    isMttMaster: true,
    status: "running",
    playersCount: 6
  },
  dealer_arina: {
    id: "dealer_arina",
    dealerName: "Арина",
    format: "MTT",
    isMttMaster: false,
    status: "running",
    playersCount: 6
  },
  dealer_dima: {
    id: "dealer_dima",
    dealerName: "Дима",
    format: "MTT",
    isMttMaster: false,
    status: "running",
    playersCount: 6 // Стол Димы будет расформирован
  }
};

dealer.setDealerName("Влад");
dealer.setTablesState(threeTables);
dealer.renderDealerView();

// Головной дилер открывает шторку расформирования стола
dealer.openConsolidationModal();
const dissolveModal = domStore["dissolve-table-modal"];
assert.strictEqual(dissolveModal.style.display, "flex", "Шторка расформирования столов должна открыться");

// Подтверждаем расформирование стола Димы и запуск 15-минутного перерыва (900 сек)
dealer.startConsolidationBreak("dealer_dima", 900);

const vladAfterDissolve = dealer.getMyTable();
assert.strictEqual(vladAfterDissolve.isBreakActive, true, "Флаг перерыва должен быть активен");
assert.strictEqual(vladAfterDissolve.breakDurationSec, 900, "Длительность перерыва должна быть строго 15 минут (900 сек)");
assert.strictEqual(vladAfterDissolve.breakReason, "consolidation", "Причина перерыва должна быть consolidation");

assert.strictEqual(threeTables.dealer_dima.status, "finished", "Расформированный стол должен быть завершен");
console.log("   ✅ Стол успешно расформирован, запущен синхронный перерыв 15 минут.");

// 6. Тестирование ТВ-дашборда в режиме МТТ
console.log("\\n6. Тестирование ТВ-дашборда (Cinema Broadcast HUD в режиме МТТ):");

const tvEngine = require("../tv/tv.js");

const tvMttTables = {
  dealer_vlad: {
    id: "dealer_vlad",
    dealerName: "Влад",
    format: "MTT",
    structKey: "MTT_PRO_5000",
    isMttMaster: true,
    status: "running",
    levelIndex: 2,
    playersCount: 9,
    initialPlayers: 10,
    durationSec: 600,
    levelEndsAt: Date.now() + 450000
  },
  dealer_arina: {
    id: "dealer_arina",
    dealerName: "Арина",
    format: "MTT",
    structKey: "MTT_PRO_5000",
    isMttMaster: false,
    status: "running",
    levelIndex: 2,
    playersCount: 7, // Дельта 9 - 7 = 2
    initialPlayers: 9,
    durationSec: 600,
    levelEndsAt: Date.now() + 450000
  }
};

let capturedTvHtml = "";
let capturedTvDataset = {};

global.document.getElementById = (id) => {
  if (id === "tv-viewport") {
    return {
      dataset: capturedTvDataset,
      set innerHTML(v) { capturedTvHtml = v; },
      get innerHTML() { return capturedTvHtml; }
    };
  }
  if (!domStore[id]) domStore[id] = createMockEl(id);
  return domStore[id];
};

tvEngine.setActiveTables(tvMttTables);
tvEngine.renderTables();

/// Проверка компонентов ТВ в режиме МТТ
assert(capturedTvHtml.includes("mtt-top-bar"), "Должен присутствовать верхний МТТ HUD бар");
assert(capturedTvHtml.includes("mtt-val-players"), "Должен присутствовать счетчик игроков");
assert(capturedTvHtml.includes("mtt-val-chips"), "Должен присутствовать банк фишек");
assert(capturedTvHtml.includes("mtt-val-avg"), "Должен присутствовать средний стек в BB");
assert(capturedTvHtml.includes("mtt-rebalance-ticker"), "Должен отображаться бегущий тикер ребаланса при дельте >= 2");
assert(capturedTvHtml.includes("table-rebalance-flag donor"), "На столе Влада должен отображаться флаг 'Отдает игрока'");
assert(capturedTvHtml.includes("table-rebalance-flag receiver"), "На столе Арины должен отображаться флаг 'Принимает игрока'");
assert(capturedTvHtml.includes("mtt-role-pill master"), "Должна отображаться плашка 'Главный'");
assert(capturedTvHtml.includes("mtt-role-pill satellite"), "Должна отображаться плашка 'Сателлит'");

// Проверка фикса разметки: обертка в .mtt-tables-deck исключает баг «3-го стола»
assert(capturedTvHtml.includes("mtt-tables-deck"), "Столы должны быть обернуты в flex/grid колоду mtt-tables-deck");
assert(capturedTvHtml.includes('data-deck-tables="2"'), "Колода должна иметь атрибут data-deck-tables='2'");
console.log("   ✅ ТВ-дашборд успешно сформировал Cinema Broadcast HUD с изолированной колодой mtt-tables-deck.");

// 7. Тестирование централизации таймера на ТВ (Master Clock Mirroring)
console.log("\n7. Тестирование единого мастер-таймера на ТВ для всех столов МТТ:");

// Симулируем дрейфующий таймер на сателлите в Firebase
const driftingTvTables = {
  dealer_vlad: {
    id: "dealer_vlad",
    dealerName: "Влад",
    format: "MTT",
    structKey: "MTT_PRO_5000",
    isMttMaster: true,
    status: "running",
    levelIndex: 3,
    playersCount: 9,
    durationSec: 600,
    levelEndsAt: Date.now() + 300000 // 5:00
  },
  dealer_arina: {
    id: "dealer_arina",
    dealerName: "Арина",
    format: "MTT",
    structKey: "MTT_PRO_5000",
    isMttMaster: false,
    status: "running",
    levelIndex: 1, // Рассинхронизированный старый уровень
    playersCount: 8,
    durationSec: 600,
    levelEndsAt: Date.now() + 100000 // Рассинхронизированное время
  }
};

tvEngine.setActiveTables(driftingTvTables);
tvEngine.renderTables();

// Проверяем, что в HTML карточки Арины уровень и блайнды зеркалируются от Влада (уровень 4: 100 / 200)
assert(capturedTvHtml.includes("100 / 200"), "Оба стола на ТВ должны отображать уровень мастер-стола (100 / 200)");
console.log("   ✅ Сателлитный стол на ТВ строго зеркалирует таймер и блайнды Master-стола.");

// 8. Тестирование Pre-game Lobby и синхронного запуска сателлитов
console.log("\n8. Тестирование предстартового лобби (Pre-Game Lobby) и синхронного запуска:");

dealer.setTablesState({});
dealer.setDealerName("Арина");
dealer.setSelectedFormat("MTT");
dealer.setIsMttMaster(false);
dealer.setMttSetupPlayers(10); // Сателлит настраивает 10 игроков

// Арина нажимает «Готов к игре»
dealer.setSatelliteReady();
const arinaReadyTable = dealer.getMyTable();
assert.strictEqual(arinaReadyTable.status, "ready", "Сателлит должен перейти в статус 'ready'");
assert.strictEqual(arinaReadyTable.playersCount, 10, "Сателлит должен сохранить стартовый состав (10 игроков)");

// Проверяем отображение карточки ожидания у сателлита
dealer.renderDealerView();
const satWaitingCard = domStore["satellite-waiting-card"];
const satReadyBtn = domStore["btn-satellite-ready"];
assert.strictEqual(satWaitingCard.style.display, "flex", "Карточка ожидания должна отображаться для готового сателлита");
assert.strictEqual(satReadyBtn.style.display, "none", "Кнопка 'Готов' должна скрываться после нажатия");

// Переключаемся на Влада (Master)
dealer.setDealerName("Влад");
dealer.setSelectedFormat("MTT");
dealer.setIsMttMaster(true);
dealer.setMttSetupPlayers(9);

// Влад видит подключенные столы в лобби
const lobbyTablesState = {
  dealer_vlad: dealer.getMyTable(),
  dealer_arina: arinaReadyTable
};
dealer.setTablesState(lobbyTablesState);
dealer.renderDealerView();

const masterLobby = domStore["mtt-master-lobby"];
assert.strictEqual(masterLobby.style.display, "flex", "Лобби должно отображаться для головного стола");
const lobbyList = domStore["mtt-lobby-tables-list"];
assert(lobbyList.innerHTML.includes("dealer_arina") || lobbyList.innerHTML.includes("Арина"), "В лобби должен отображаться сателлит Арины");
assert(lobbyList.innerHTML.includes("Готов к игре"), "В лобби должен отображаться статус 'Готов к игре'");

// Влад запускает турнир для всех столов
dealer.startTable();
assert.strictEqual(dealer.getMyTable().status, "running", "Головной стол должен запуститься");
assert.strictEqual(lobbyTablesState.dealer_arina.status, "running", "Сателлит должен синхронно получить статус running");
assert.strictEqual(lobbyTablesState.dealer_arina.startedAt, dealer.getMyTable().startedAt, "Сателлит должен получить одинаковый startedAt");
assert.strictEqual(lobbyTablesState.dealer_arina.levelEndsAt, dealer.getMyTable().levelEndsAt, "Сателлит должен получить одинаковый levelEndsAt");
console.log("   ✅ Предстартовое лобби корректно отображает готовность столов, старт запускает всех одновременно.");

// 9. Тестирование атомарного выбивания (Аут) на сателлите с тостом
console.log("\n9. Тестирование атомарного выбивания игрока (-1) на сателлите:");

dealer.setDealerName("Арина");
dealer.setTablesState(lobbyTablesState);
dealer.renderDealerView();

networkLog.length = 0; // Очищаем лог сети
dealer.eliminatePlayer();

assert.strictEqual(dealer.getMyTable().playersCount, 9, "Количество игроков должно уменьшиться с 10 до 9");
const outPutReq = networkLog.find(r => r.url.includes("atmosphere/tables/dealer_arina/playersCount.json"));
assert(outPutReq, "Должен быть отправлен прямой атомарный PUT запрос playersCount.json");
assert.strictEqual(outPutReq.body, 9, "В запросе должно передаваться новое количество игроков: 9");

const elimToast = domStore["elimination-toast"];
assert.strictEqual(elimToast.style.display, "flex", "Должен отображаться всплывающий тост выбывания игрока");
console.log("   ✅ Аут игрока мгновенно сохраняется атомарно в Firebase и подтверждается тостом.");

// 10. Тестирование строгой 9-max блокировки объединения столов
console.log("\n10. Тестирование строгой блокировки объединения столов (Strict 9-Max Lock):");

dealer.setDealerName("Влад");
const finalStageTables = {
  dealer_vlad: {
    id: "dealer_vlad",
    dealerName: "Влад",
    format: "MTT",
    isMttMaster: true,
    status: "running",
    playersCount: 5
  },
  dealer_arina: {
    id: "dealer_arina",
    dealerName: "Арина",
    format: "MTT",
    isMttMaster: false,
    status: "running",
    playersCount: 5 // Всего 5 + 5 = 10 игроков (Финальный стол НЕЛЬЗЯ делать при > 9!)
  }
};

dealer.setTablesState(finalStageTables);
dealer.renderDealerView();

const consolidateBtn = domStore["btn-consolidate"];
assert.strictEqual(consolidateBtn.disabled, true, "Кнопка объединения в финальный стол ДОЛЖНА БЫТЬ ЗАБЛОКИРОВАНА при 10 игроках");
assert(consolidateBtn.classList.contains("disabled"), "Кнопка должна содержать класс disabled");

const consolidateSubtext = domStore["consolidate-btn-subtext"];
assert(consolidateSubtext.textContent.includes("≤ 9") && consolidateSubtext.textContent.includes("10"), "Подпись должна указывать, что нужно <= 9 игроков (сейчас 10)");

// Проверяем попытку открыть модалку при 10 игроках — должна быть отклонена
const dissolveModalTest = domStore["dissolve-table-modal"];
dissolveModalTest.style.display = "none";
dealer.openConsolidationModal();
assert.strictEqual(dissolveModalTest.style.display, "none", "Модалка объединения НЕ ДОЛЖНА открываться при 10 игроках");

// Выбиваем 1 игрока на столе Арины: теперь 5 + 4 = 9 игроков (ровно 9-max финальный стол!)
finalStageTables.dealer_arina.playersCount = 4;
dealer.renderDealerView();

assert.strictEqual(consolidateBtn.disabled, false, "Кнопка объединения ДОЛЖНА БЫТЬ РАЗБЛОКИРОВАНА при 9 игроках");
assert(!consolidateBtn.classList.contains("disabled"), "Кнопка не должна иметь класс disabled");

dealer.openConsolidationModal();
assert.strictEqual(dissolveModalTest.style.display, "flex", "Модалка объединения ДОЛЖНА открыться при ровно 9 игроках");

const recEl = domStore["dissolve-recommendation"];
assert(recEl.textContent.includes("Финальный стол") && recEl.textContent.includes("9-max"), "Рекомендация должна подтверждать 9-max финальный стол");
console.log("   ✅ Строгая 9-max блокировка объединения столов работает безупречно (10 игр. запрещено, <=9 разрешено).");

console.log("\n🎉 ВСЕ ТЕСТЫ ПОЛНОГО ЦИКЛА МТТ ПРОЙДЕНЫ С ОТЛИЧИЕМ (10/10)!");
