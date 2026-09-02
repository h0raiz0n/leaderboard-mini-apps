function getDealerMiniAppUrl() {
  if (typeof getScriptProperty === "function") {
    var u = getScriptProperty("DEALER_APP_URL", "");
    if (u) return u;
  }
  if (typeof PropertiesService !== "undefined" && PropertiesService.getScriptProperties) {
    try {
      var pu = PropertiesService.getScriptProperties().getProperty("DEALER_APP_URL");
      if (pu) return pu;
    } catch (e) {}
  }
  return "https://atmosphere-poker.vercel.app/dealer/";
}

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

  // Защита от дублей повторных вебхуков Telegram
  if (update.update_id) {
    try {
      var cache = CacheService.getScriptCache();
      var key = "TG_UPD_" + update.update_id;
      if (cache.get(key)) {
        return ContentService.createTextOutput(JSON.stringify({ status: "duplicate_skipped" }))
          .setMimeType(ContentService.MimeType.JSON);
      }
      cache.put(key, "1", 300);
    } catch (cacheErr) {}
  }

  // Обработка сообщений в чате (только свежие команды /start)
  if (update.message) {
    var msgDate = update.message.date;
    var nowSec = Math.floor(Date.now() / 1000);
    // Игнорируем сообщения старше 2 минут (старый бэклог очереди)
    if (msgDate && (nowSec - msgDate > 120)) {
      return ContentService.createTextOutput(JSON.stringify({ status: "skipped_old_update" }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    handleDealerMessage(update.message);
  } else if (update.callback_query) {
    if (update.callback_query.id) {
      answerCallbackQuery(update.callback_query.id);
    }
  }

  return ContentService.createTextOutput(JSON.stringify({ status: "ok" }))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Обработка сообщений (строго команда /start)
 */
function handleDealerMessage(msg) {
  var textMsg = String(msg.text || "").trim();
  // Бот молчит на любые сообщения, кроме явной команды /start
  if (!textMsg.startsWith("/start")) {
    return;
  }

  var chatId = msg.chat.id;
  var from = msg.from || {};
  var username = String(from.username || "").toLowerCase().replace(/^@/, "");
  var userId = String(from.id || "");
  
  var registry = (typeof CONFIG !== "undefined" && CONFIG.DEALERS_REGISTRY) 
    ? CONFIG.DEALERS_REGISTRY 
    : { LIST: [], MAP: {} };

  // Проверка белого списка ведущих
  var isAuthorized = false;
  var realDealerName = "";

  if (registry.MAP[username]) {
    isAuthorized = true;
    realDealerName = registry.MAP[username];
  } else if (registry.MAP[userId]) {
    isAuthorized = true;
    realDealerName = registry.MAP[userId];
  }

  if (!isAuthorized) {
    var deniedText = "⛔️ <b>Доступ ограничен</b>\n\n" +
      "Этот бот предназначен исключительно для авторизованных ведущих антикафе «Атмосфера».\n\n" +
      "Ваш Telegram: @" + escapeHtml(username || "не_задан") + " (ID: <code>" + escapeHtml(userId) + "</code>).\n" +
      "Передайте его администратору для добавления в белый список.";
    sendDealerTelegram(chatId, deniedText, null);
    return;
  }

  var text = "♠️ <b>ПУЛЬТ ВЕДУЩЕГО «АТМОСФЕРА»</b>\n\n" +
    "Привет, <b>" + escapeHtml(realDealerName) + "</b>!\n\n" +
    "Нажмите кнопку ниже, чтобы открыть быстрый пульт управления столами турнира (отклик 20мс):";

  var keyboard = [
    [
      {
        text: "🎛 Открыть пульт ведущего",
        web_app: { url: getDealerMiniAppUrl() }
      }
    ]
  ];

  sendDealerTelegram(chatId, text, keyboard);
}

function getActiveDealerBotToken() {
  if (typeof getScriptProperty === "function") {
    var t = getScriptProperty("DEALER_BOT_TOKEN", "");
    if (t) return t;
  }
  if (typeof PropertiesService !== "undefined" && PropertiesService.getScriptProperties) {
    try {
      var pt = PropertiesService.getScriptProperties().getProperty("DEALER_BOT_TOKEN");
      if (pt) return pt;
    } catch (e) {}
  }
  if (typeof process !== "undefined" && process.env && process.env.DEALER_BOT_TOKEN) {
    return process.env.DEALER_BOT_TOKEN;
  }
  if (typeof CONFIG !== "undefined" && CONFIG.DEALER_BOT_TOKEN) {
    return CONFIG.DEALER_BOT_TOKEN;
  }
  return "";
}

/**
 * Вспомогательные функции отправки Telegram сообщений
 */
function sendDealerTelegram(chatId, text, inlineKeyboard) {
  var token = getActiveDealerBotToken();
  if (!token) return;

  var payload = {
    chat_id: chatId,
    text: text,
    parse_mode: "HTML",
    disable_web_page_preview: true
  };
  if (inlineKeyboard && inlineKeyboard.length) {
    payload.reply_markup = { inline_keyboard: inlineKeyboard };
  }

  if (typeof sendDealerTelegramRequest === "function") {
    sendDealerTelegramRequest(token, "sendMessage", payload);
  }
}

function answerCallbackQuery(queryId) {
  var token = getActiveDealerBotToken();
  if (!token || !queryId) return;
  sendDealerTelegramRequest(token, "answerCallbackQuery", { callback_query_id: queryId });
}

function sendDealerTelegramRequest(token, method, payload) {
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
    handleDealerMessage,
    getDealerMiniAppUrl
  };
}
