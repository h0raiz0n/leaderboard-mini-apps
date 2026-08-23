// ==========================================
// НАСТРОЙКИ TELEGRAM
// ==========================================
// Токен бота и chat-id НЕ хранятся в коде — читаются из скриптовых свойств
// (PropertiesService). Задайте их один раз через Setup.js:
//   setSecret("TELEGRAM_BOT_TOKEN", "ваш_токен")
//   setSecret("TELEGRAM_CHAT_ID", "ваш_chat_id")
// Проверить: showConfiguredSecrets().

var PUBLIC_LEADERBOARD_URL = "https://docs.google.com/spreadsheets/d/1yd6rCcxjNfAMDlogApadgKoIdY70U_cIRhH9cK1xBZ8/edit?usp=sharing";

// Ссылка на Telegram Mini App (Direct Link из BotFather /myapps).
// Обычная URL-кнопка — Telegram открывает Mini App нативно.
var TELEGRAM_MINI_APP_URL = "https://t.me/atmosphere_poker_leaderboard_bot/atmosphere_poker_miniapp";

/**
 * Получение токена из скриптовых свойств.
 */
function getBotToken() {
  return getScriptProperty("TELEGRAM_BOT_TOKEN", "");
}

function getChatId() {
  return getScriptProperty("TELEGRAM_CHAT_ID", "");
}

/**
 * Диагностика уведомлений: заданы ли секреты (токен маскируется).
 * Используется через ?type=diag для проверки без открытия редактора.
 */
function telegramDiag() {
  var token = getBotToken();
  var chat = getChatId();
  return {
    tokenSet: !!token,
    tokenStart: token ? token.substring(0, 10) + "…" : "(не задан)",
    chatIdSet: !!chat,
    chatId: chat ? chat : "(не задан)"
  };
}

/**
 * Вернуть публичный URL лидерборда (учитывая скриптовые свойства).
 * @returns {string} URL или "" если не настроен.
 */
function resolvedSheetsUrl() {
  var pub = getScriptProperty("PUBLIC_SPREADSHEET_ID", CONFIG.PUBLIC_SPREADSHEET_ID);
  if (pub && pub.indexOf("ВСТАВЬ") === -1 && pub.indexOf("ВАШ_") === -1) {
    return "https://docs.google.com/spreadsheets/d/" + pub + "/edit?usp=sharing";
  }
  if (PUBLIC_LEADERBOARD_URL && PUBLIC_LEADERBOARD_URL.indexOf("ВАШ_") === -1 &&
      PUBLIC_LEADERBOARD_URL.indexOf("ВСТАВЬ") === -1) {
    return PUBLIC_LEADERBOARD_URL;
  }
  return "";
}

/**
 * Собрать inline-кнопки (reply_markup) под текстом сообщения.
 * Кнопка «Mini App» появится только после деплоя Web App и прописки
 * TELEGRAM_MINI_APP_URL. Кнопка «Лидерборд (Sheets)» — если задан URL.
 * @returns {Array} массив рядов кнопок (для Telegram inline_keyboard)
 */
function buildInlineKeyboard() {
  var sheetsUrl = resolvedSheetsUrl();

  var row = [];
  if (sheetsUrl) row.push({ text: "📊 Лидерборд (Sheets)", url: sheetsUrl });
  // Mini App — обычная URL-кнопка с t.me-ссылкой (Direct Link из BotFather).
  // Так же, как кнопка «Лидерборд (Sheets)». Telegram открывает Mini App нативно.
  if (TELEGRAM_MINI_APP_URL && TELEGRAM_MINI_APP_URL.indexOf("ВАШ") === -1 && TELEGRAM_MINI_APP_URL.indexOf("ВСТАВЬ") === -1) {
    row.push({ text: "🕹️ Mini App", url: TELEGRAM_MINI_APP_URL });
  }

  var buttons = [];
  if (row.length) buttons.push(row);
  return buttons;
}

/**
 * Отправка сообщения в Telegram с inline-кнопками под текстом.
 * @param {string} messageText текст сообщения (HTML).
 * @param {Array}  [keyboard] готовые кнопки; иначе соберутся автоматически.
 */
function sendTelegramMessage(messageText, keyboard) {
  var token = getBotToken();
  if (!token || token.indexOf("ВАШ_") > -1 || token.indexOf("ВСТАВЬ") > -1) {
    Logger.log("⚠️ Telegram Bot Token не настроен корректно!");
    return;
  }

  var chatId = getChatId();
  if (!chatId) {
    Logger.log("⚠️ TELEGRAM_CHAT_ID не задан в скриптовых свойствах!");
    return;
  }
  var payload = {
    chat_id: chatId,
    text: messageText,
    parse_mode: "HTML",
    disable_web_page_preview: true
  };

  var buttons = keyboard || buildInlineKeyboard();
  if (buttons && buttons.length) {
    payload.reply_markup = JSON.stringify({ inline_keyboard: buttons });
  }

  var url = "https://api.telegram.org/bot" + token + "/sendMessage";
  var options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  try {
    var response = UrlFetchApp.fetch(url, options);
    var respText = response.getContentText();
    Logger.log("Telegram Response: " + respText);
    try {
      PropertiesService.getScriptProperties().setProperty("LAST_TG", response.getResponseCode() + "|" + respText.substring(0, 300));
    } catch (e2) {}
  } catch (e) {
    Logger.log("Ошибка отправки в Telegram: " + e.message);
    try {
      PropertiesService.getScriptProperties().setProperty("LAST_TG", "NETERR|" + e.message.substring(0, 200));
    } catch (e2) {}
  }
}

/**
 * Экранирование спецсимволов HTML для безопасной отправки в Telegram (parse_mode: HTML).
 * @param {*} str
 * @returns {string}
 */
function escapeTelegramHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function notifyGameResult(format, date, dealer, gameNumber, items) {
  var titleEmoji = format === "Mystery Bounty" ? "🎯" : (format === "MTT" ? "🏆" : "🃏");
  var safeFormat = escapeTelegramHtml(format);
  var safeDealer = escapeTelegramHtml(dealer);
  var safeDate = escapeTelegramHtml(date);

  var text = titleEmoji + " <b>РЕЗУЛЬТАТЫ ИГРЫ [" + safeFormat.toUpperCase() + "]</b>\n";
  text += "📅 <b>Дата:</b> " + safeDate + "\n";
  text += "🎩 <b>Ведущий:</b> " + safeDealer + " (" + Number(gameNumber || 1) + "-я игра за сегодня)\n";
  text += "───────────────────────────\n";

  var placesText = "";
  var koText = "";

  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    var placePrefix = "";
    var safeNick = escapeTelegramHtml(item.playerNick);

    if (item.event === "1 место") placePrefix = "🥇 <b>1 место:</b> ";
    else if (item.event === "2 место") placePrefix = "🥈 <b>2 место:</b> ";
    else if (item.event === "3 место") placePrefix = "🥉 <b>3 место:</b> ";
    else if (item.event === "4 место") placePrefix = "4️⃣ <b>4 место:</b> ";
    else if (item.event === "5 место") placePrefix = "5️⃣ <b>5 место:</b> ";

    if (placePrefix !== "") {
      if (item.isParticipating) {
        placesText += placePrefix + safeNick + " (+" + item.points + " очков)\n";
      } else {
        placesText += placePrefix + "<i>не участвует в лидерборде</i>\n";
      }
    } else if (item.event === "Нокаут" && item.isParticipating) {
      koText += "  🎯 " + safeNick + " (+" + item.points + " очков KO)\n";
    }
  }

  text += placesText;

  if (koText !== "") {
    text += "\n<b>Выбивание (Bounty):</b>\n" + koText;
  }

  text += "───────────────────────────\n";
  text += "📊 <i>Полный лидерборд и статистика — по кнопкам ниже.</i>";

  sendTelegramMessage(text);
}