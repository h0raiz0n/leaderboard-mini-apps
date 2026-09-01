// ==========================================
// ДВИЖОК ДИЛЕРСКОГО TELEGRAM-БОТА
// @atmosphere_dealer_bot
// ==========================================

/**
 * Главный диспетчер входящих Webhook-запросов от Telegram
 */
function handleDealerBotWebhook(e) {
  if (!e || !e.postData || !e.postData.contents) {
    return ContentService.createTextOutput(JSON.stringify({ status: "empty" }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  var update;
  try {
    update = JSON.parse(e.postData.contents);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: "invalid json" }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // 1. Обработка обычных текстовых сообщений (/start, /help)
  if (update.message) {
    handleDealerMessage(update.message);
  }
  // 2. Обработка нажатий на Inline-кнопки (callback_query)
  else if (update.callback_query) {
    handleDealerCallback(update.callback_query);
  }

  return ContentService.createTextOutput(JSON.stringify({ status: "ok" }))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Обработка сообщений в чате
 */
function handleDealerMessage(msg) {
  var chatId = msg.chat.id;
  var text = (msg.text || "").trim();
  var dealerName = msg.from.first_name || msg.from.username || "Ведущий";

  if (text === "/start" || text === "/new" || text === "Новая игра") {
    sendFormatSelectionMenu(chatId, dealerName);
  } else {
    var helpText = "♠️ <b>Управление турнирами «Атмосфера»</b>\n\n" +
      "Для запуска новой игры отправьте /start или нажмите кнопку ниже:";
    var keyboard = [
      [{ text: "🃏 Запустить игру", callback_data: "menu:formats" }]
    ];
    sendDealerTelegram(chatId, helpText, keyboard);
  }
}

/**
 * Меню выбора формата игры (SnG / Mystery / MTT)
 */
function sendFormatSelectionMenu(chatId, dealerName, messageId) {
  var text = "♠️ <b>ВЫБОР ФОРМАТА ИГРЫ</b>\n" +
    "Ведущий: <b>" + escapeHtml(dealerName) + "</b>\n\n" +
    "Выберите формат запускаемого стола:";

  var keyboard = [
    [
      { text: "🃏 SnG", callback_data: "fmt:Data" },
      { text: "🎯 Mystery Bounty", callback_data: "fmt:Mystery" }
    ],
    [
      { text: "🏆 MTT (Турнир дня)", callback_data: "fmt:MTT" }
    ]
  ];

  if (messageId) {
    editDealerTelegram(chatId, messageId, text, keyboard);
  } else {
    sendDealerTelegram(chatId, text, keyboard);
  }
}

/**
 * Меню выбора структуры блайндов
 */
function sendStructureSelectionMenu(chatId, messageId, formatKey, dealerName) {
  var text = "⏱ <b>ВЫБОР СТРУКТУРЫ БЛАЙНДОВ</b>\n" +
    "Формат: <b>" + escapeHtml(formatKey) + "</b>\n\n" +
    "Выберите темп турнира:";

  var keyboard = [];
  var structures = CONFIG.BLIND_STRUCTURES || {};

  for (var key in structures) {
    var s = structures[key];
    keyboard.push([
      { text: s.name, callback_data: "start:" + formatKey + ":" + key }
    ]);
  }

  keyboard.push([
    { text: "« Назад к форматам", callback_data: "menu:formats" }
  ]);

  editDealerTelegram(chatId, messageId, text, keyboard);
}

/**
 * Обработка нажатий inline-кнопок
 */
function handleDealerCallback(query) {
  var chatId = query.message.chat.id;
  var messageId = query.message.message_id;
  var data = query.data || "";
  var dealerName = query.from.first_name || query.from.username || "Ведущий";
  var dealerId = "dealer_" + String(dealerName).toLowerCase().replace(/[^a-zа-я0-9]/gi, "_");

  // Ответ на callback, чтобы Telegram снял часики с кнопки
  answerCallbackQuery(query.id);

  // Маршрутизация действий
  var parts = data.split(":");
  var action = parts[0];

  if (action === "menu" && parts[1] === "formats") {
    sendFormatSelectionMenu(chatId, dealerName, messageId);
  }
  else if (action === "fmt") {
    var formatKey = parts[1];
    sendStructureSelectionMenu(chatId, messageId, formatKey, dealerName);
  }
  else if (action === "start") {
    var fmt = parts[1];
    var structKey = parts[2];
    startTableGame(chatId, messageId, dealerId, dealerName, fmt, structKey);
  }
  else if (action === "act") {
    var subAction = parts[1];
    var tableId = parts[2];
    processTableAction(chatId, messageId, tableId, dealerName, subAction);
  }
}

/**
 * Запуск игры и отправка живого сообщения управления
 */
function startTableGame(chatId, messageId, dealerId, dealerName, formatKey, structKey) {
  var structureConfig = (CONFIG.BLIND_STRUCTURES && CONFIG.BLIND_STRUCTURES[structKey]) 
    ? CONFIG.BLIND_STRUCTURES[structKey] 
    : CONFIG.BLIND_STRUCTURES.SNG_STANDARD;

  var tableState = {
    id: dealerId,
    dealerName: dealerName,
    format: formatKey,
    structKey: structKey,
    status: "running",
    levelIndex: 0,
    startedAt: Date.now(),
    durationSec: structureConfig.levels[0].durationSec,
    elapsedBeforePause: 0,
    isPostGameBreak: false,
    createdAt: Date.now()
  };

  // Синхронизируем с Firebase шиной
  syncTableToFirebase(dealerId, tableState);

  // Отрисовываем сообщение управления в Telegram
  var view = buildDealerControlView(tableState, structureConfig);
  editDealerTelegram(chatId, messageId, view.text, view.keyboard);
}

/**
 * Обработка действий: Пауза, Резюм, След. раунд, Сброс, Финиш
 */
function processTableAction(chatId, messageId, tableId, dealerName, subAction) {
  var table = getTableFromFirebase(tableId);
  if (!table) {
    sendDealerTelegram(chatId, "⚠️ Стол не найден или завершён. Отправьте /start для новой игры.");
    return;
  }

  var structKey = table.structKey || "SNG_STANDARD";
  var structureConfig = (CONFIG.BLIND_STRUCTURES && CONFIG.BLIND_STRUCTURES[structKey]) 
    ? CONFIG.BLIND_STRUCTURES[structKey] 
    : CONFIG.BLIND_STRUCTURES.SNG_STANDARD;

  var now = Date.now();

  // 1. Пауза
  if (subAction === "pause") {
    if (table.status === "running") {
      table.status = "paused";
      table.elapsedBeforePause = (table.elapsedBeforePause || 0) + Math.floor((now - table.startedAt) / 1000);
      table.startedAt = null;
    }
  }
  // 2. Продолжить
  else if (subAction === "resume") {
    if (table.status === "paused") {
      table.status = "running";
      table.startedAt = now;
    }
  }
  // 3. Следующий уровень
  else if (subAction === "next") {
    if (table.levelIndex < structureConfig.levels.length - 1) {
      table.levelIndex += 1;
      table.durationSec = structureConfig.levels[table.levelIndex].durationSec;
      table.elapsedBeforePause = 0;
      table.startedAt = (table.status === "running") ? now : null;
    }
  }
  // 4. Сброс (только первые 3 минуты)
  else if (subAction === "reset") {
    var elapsedTotal = (table.elapsedBeforePause || 0) + (table.startedAt ? Math.floor((now - table.startedAt) / 1000) : 0);
    if (table.levelIndex === 0 && elapsedTotal <= 180) {
      table.status = "idle";
      syncTableToFirebase(tableId, table);
      sendFormatSelectionMenu(chatId, dealerName, messageId);
      return;
    } else {
      // Таймаут истёк — сброс заблокирован
      sendDealerTelegram(chatId, "⚠️ Время для отмены запуска истекло. Для завершения используйте кнопку «Завершить игру».");
      return;
    }
  }
  // 5. Завершение игры
  else if (subAction === "finish") {
    table.status = "idle";
    table.isPostGameBreak = true;
    table.nextGameAt = now + (10 * 60 * 1000); // 10 минут
    syncTableToFirebase(tableId, table);

    // Генерация предзаполненной формы
    var formUrl = buildPrefilledFormUrl(table.format, dealerName);
    var finishText = "🏁 <b>ИГРА ЗАВЕРШЕНА!</b>\n\n" +
      "На телевизоре запущен 10-минутный перерыв до следующего стола.\n\n" +
      "Нажмите кнопку ниже, чтобы внести 1, 2, 3 места:";
    var finishKeyboard = [
      [{ text: "📝 Внести результаты в форму", url: formUrl }],
      [{ text: "🃏 Запустить следующую игру", callback_data: "menu:formats" }]
    ];

    editDealerTelegram(chatId, messageId, finishText, finishKeyboard);
    return;
  }

  // Сохраняем обновлённое состояние и обновляем экран
  syncTableToFirebase(tableId, table);
  var view = buildDealerControlView(table, structureConfig);
  editDealerTelegram(chatId, messageId, view.text, view.keyboard);
}

/**
 * Сборка текста и кнопок активного управления
 */
function buildDealerControlView(table, structureConfig) {
  var currentLvl = structureConfig.levels[table.levelIndex] || structureConfig.levels[0];
  var nextLvl = structureConfig.levels[table.levelIndex + 1] || null;

  var now = Date.now();
  var elapsed = table.elapsedBeforePause || 0;
  if (table.status === "running" && table.startedAt) {
    elapsed += Math.floor((now - table.startedAt) / 1000);
  }
  var remaining = Math.max(0, table.durationSec - elapsed);
  var min = Math.floor(remaining / 60);
  var sec = remaining % 60;
  var timeFormatted = (min < 10 ? "0" : "") + min + ":" + (sec < 10 ? "0" : "") + sec;

  var statusLine = table.status === "running" 
    ? "🟢 <b>ИДЁТ ИГРА</b> (" + timeFormatted + ")"
    : "⏸ <b>НА ПАУЗЕ</b> (" + timeFormatted + ")";

  if (currentLvl.isBreak) {
    statusLine = "☕️ <b>ПЕРЕРЫВ + COLOR-UP</b> (" + timeFormatted + ")";
  }

  var text = "♠️ <b>СТОЛ ВЕДУЩЕГО " + escapeHtml(table.dealerName).toUpperCase() + "</b>\n" +
    "───────────────────────────\n" +
    "🏆 <b>Формат:</b> " + escapeHtml(table.format) + " (" + structureConfig.stack + " стек)\n" +
    "⏱ <b>" + (currentLvl.isBreak ? "Перерыв" : "Раунд " + currentLvl.level) + ":</b> " + currentLvl.label + "\n" +
    "👉 <b>Следующий:</b> " + (nextLvl ? nextLvl.label : "ФИНАЛ") + "\n" +
    "📊 <b>Статус:</b> " + statusLine + "\n" +
    "───────────────────────────";

  var keyboard = [];
  var row1 = [];

  if (table.status === "running") {
    row1.push({ text: "⏸ Пауза", callback_data: "act:pause:" + table.id });
  } else {
    row1.push({ text: "▶️ Продолжить", callback_data: "act:resume:" + table.id });
  }
  row1.push({ text: "⏩ След. раунд", callback_data: "act:next:" + table.id });
  keyboard.push(row1);

  // Кнопка сброса доступна только в первые 3 минуты первого раунда
  var totalElapsed = (table.elapsedBeforePause || 0) + (table.startedAt ? Math.floor((now - table.startedAt) / 1000) : 0);
  if (table.levelIndex === 0 && totalElapsed <= 180) {
    keyboard.push([
      { text: "❌ Сбросить запуск (ошибка)", callback_data: "act:reset:" + table.id }
    ]);
  }

  keyboard.push([
    { text: "🏁 Завершить игру", callback_data: "act:finish:" + table.id }
  ]);

  return { text: text, keyboard: keyboard };
}

/**
 * Генерация ссылки на предзаполненную Google Form
 */
function buildPrefilledFormUrl(formatName, dealerName) {
  var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  
  var formConfig = CONFIG.FORMS.SNG;
  if (formatName === "Mystery Bounty" || formatName === "Mystery") {
    formConfig = CONFIG.FORMS.MYSTERY;
  } else if (formatName === "MTT") {
    formConfig = CONFIG.FORMS.MTT;
  }

  var baseViewUrl = "https://docs.google.com/forms/d/e/" + formConfig.id + "/viewform";
  
  // ID полей для автозаполнения (настраиваются в CONFIG)
  var entryIds = CONFIG.FORM_ENTRY_IDS || { DATE: "entry.1615126251", DEALER: "entry.1887911518" };
  var entryDate = entryIds.DATE || "entry.1615126251";
  var entryDealer = entryIds.DEALER || "entry.1887911518";
  
  return baseViewUrl + "?usp=pp_url&" + encodeURIComponent(entryDate) + "=" + encodeURIComponent(today) +
    "&" + encodeURIComponent(entryDealer) + "=" + encodeURIComponent(dealerName);
}

/**
 * Вспомогательные функции отправки Telegram сообщений
 */
function sendDealerTelegram(chatId, text, inlineKeyboard) {
  var token = getScriptProperty("DEALER_BOT_TOKEN", getScriptProperty("TELEGRAM_BOT_TOKEN", ""));
  if (!token) return;

  var payload = {
    chat_id: chatId,
    text: text,
    parse_mode: "HTML",
    disable_web_page_preview: true
  };
  if (inlineKeyboard && inlineKeyboard.length) {
    payload.reply_markup = JSON.stringify({ inline_keyboard: inlineKeyboard });
  }

  sendTelegramApiRequest(token, "sendMessage", payload);
}

function editDealerTelegram(chatId, messageId, text, inlineKeyboard) {
  var token = getScriptProperty("DEALER_BOT_TOKEN", getScriptProperty("TELEGRAM_BOT_TOKEN", ""));
  if (!token) return;

  var payload = {
    chat_id: chatId,
    message_id: messageId,
    text: text,
    parse_mode: "HTML",
    disable_web_page_preview: true
  };
  if (inlineKeyboard && inlineKeyboard.length) {
    payload.reply_markup = JSON.stringify({ inline_keyboard: inlineKeyboard });
  }

  sendTelegramApiRequest(token, "editMessageText", payload);
}

function answerCallbackQuery(queryId) {
  var token = getScriptProperty("DEALER_BOT_TOKEN", getScriptProperty("TELEGRAM_BOT_TOKEN", ""));
  if (!token || !queryId) return;
  sendTelegramApiRequest(token, "answerCallbackQuery", { callback_query_id: queryId });
}

function sendTelegramApiRequest(token, method, payload) {
  try {
    var url = "https://api.telegram.org/bot" + token + "/" + method;
    var options = {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };
    UrlFetchApp.fetch(url, options);
  } catch (err) {
    Logger.log("Telegram API Error (" + method + "): " + err.message);
  }
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    handleDealerBotWebhook,
    buildDealerControlView,
    buildPrefilledFormUrl,
    escapeHtml
  };
}
