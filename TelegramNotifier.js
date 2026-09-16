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
 * Проверка статуса бота и прав в чате через Telegram API.
 */
function inspectTelegramChat() {
  var token = getBotToken();
  var chatId = getChatId();
  if (!token || !chatId) {
    return { ok: false, error: "Token or ChatId missing" };
  }

  var out = { chatId: chatId };
  try {
    var meRes = UrlFetchApp.fetch("https://api.telegram.org/bot" + token + "/getMe", { muteHttpExceptions: true });
    out.me = JSON.parse(meRes.getContentText());
  } catch (e) {
    out.me = { error: e.message };
  }

  try {
    var chatRes = UrlFetchApp.fetch("https://api.telegram.org/bot" + token + "/getChat?chat_id=" + encodeURIComponent(chatId), { muteHttpExceptions: true });
    out.chat = JSON.parse(chatRes.getContentText());
  } catch (e) {
    out.chat = { error: e.message };
  }

  if (out.me && out.me.result && out.me.result.id) {
    try {
      var memberRes = UrlFetchApp.fetch("https://api.telegram.org/bot" + token + "/getChatMember?chat_id=" + encodeURIComponent(chatId) + "&user_id=" + out.me.result.id, { muteHttpExceptions: true });
      out.botMember = JSON.parse(memberRes.getContentText());
    } catch (e) {
      out.botMember = { error: e.message };
    }
  }

  return out;
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
    payload.reply_markup = { inline_keyboard: buttons };
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
    var statusCode = response.getResponseCode();
    var respText = response.getContentText();
    Logger.log("Telegram Response [" + statusCode + "]: " + respText);
    var isOk = (statusCode === 200);
    try {
      var props = PropertiesService.getScriptProperties();
      props.setProperty("LAST_TG", statusCode + "|" + respText.substring(0, 300));
      if (!isOk) {
        props.setProperty("LAST_TG_ERR", statusCode + ": " + respText.substring(0, 300));
      }
    } catch (e2) {}
    return { ok: isOk, code: statusCode, response: respText };
  } catch (e) {
    Logger.log("Ошибка отправки в Telegram: " + e.message);
    try {
      var props2 = PropertiesService.getScriptProperties();
      props2.setProperty("LAST_TG", "NETERR|" + e.message.substring(0, 200));
      props2.setProperty("LAST_TG_ERR", "NETERR: " + e.message.substring(0, 200));
    } catch (e2) {}
    return { ok: false, error: e.message };
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

/**
 * Формирование форматированного HTML-текста сообщения для Telegram.
 */
function buildNotificationText(format, date, dealer, gameNumber, items) {
  var titleEmoji = format === "Mystery Bounty" ? "🎯" : (format === "MTT" ? "🏆" : "🃏");
  var safeFormat = escapeTelegramHtml(format);
  var safeDealer = escapeTelegramHtml(dealer);
  var safeDate = escapeTelegramHtml(date);

  var text = titleEmoji + " <b>РЕЗУЛЬТАТЫ ИГРЫ [" + safeFormat.toUpperCase() + "]</b>\n";
  text += "📅 <b>Дата:</b> " + safeDate + "\n";
  text += "🎩 <b>Ведущий:</b> " + safeDealer + " (" + Number(gameNumber || 1) + "-я игра у ведущего за сегодня)\n";
  text += "───────────────────────────\n";

  var placesText = "";
  var koText = "";

  for (var i = 0; i < (items || []).length; i++) {
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
  return text;
}

function notifyGameResult(format, date, dealer, gameNumber, items) {
  var text = buildNotificationText(format, date, dealer, gameNumber, items);
  return sendTelegramMessage(text);
}

/**
 * Безопасное получение таблицы (активной или по ID).
 */
function getAdminSpreadsheet() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (ss) return ss;
  } catch (e) {}

  var pubId = getScriptProperty("PUBLIC_SPREADSHEET_ID", CONFIG.PUBLIC_SPREADSHEET_ID);
  if (pubId && pubId.indexOf("ВСТАВЬ") === -1) {
    try {
      return SpreadsheetApp.openById(pubId);
    } catch (e2) {}
  }
  return null;
}

/**
 * Повторная (или ручная) отправка победного поста в Telegram для любой игры из DB_Results.
 * @param {string} gameId ID игры (например, H_MTT_2026-09-16_...)
 * @returns {Object} { success: boolean, message: string }
 */
function resendGameNotification(gameId) {
  if (!gameId) return { success: false, message: "Не указан gameId" };

  var ss = getAdminSpreadsheet();
  if (!ss) return { success: false, message: "Не удалось открыть таблицу" };
  var dbSheet = ss.getSheetByName(CONFIG.SHEETS.RESULTS);
  if (!dbSheet) return { success: false, message: "Лист DB_Results не найден" };

  var data = dbSheet.getDataRange().getValues();
  if (data.length <= 1) return { success: false, message: "DB_Results пуст" };

  var format = "";
  var rawDate = "";
  var dealer = "";
  var items = [];

  for (var r = 1; r < data.length; r++) {
    var rowGid = String(data[r][CONFIG.DB_COL.GAME_ID] || "").trim();
    if (rowGid === gameId) {
      if (!format) format = String(data[r][CONFIG.DB_COL.FORMAT] || "").trim();
      if (!rawDate) rawDate = data[r][CONFIG.DB_COL.DATE];
      if (!dealer) dealer = String(data[r][CONFIG.DB_COL.DEALER] || "").trim();

      var player = String(data[r][CONFIG.DB_COL.PLAYER] || "").trim();
      var event = String(data[r][CONFIG.DB_COL.EVENT] || "").trim();
      var points = Number(data[r][CONFIG.DB_COL.POINTS]) || 0;

      items.push({
        player: player,
        event: event,
        points: points,
        isParticipating: isParticipating(player)
      });
    }
  }

  if (!items.length) {
    return { success: false, message: "Игра с ID " + gameId + " не найдена в DB_Results" };
  }

  var nickMap = typeof buildNickMap === "function" ? buildNickMap(ss) : {};
  var notifyItems = [];
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    notifyItems.push({
      event: it.event,
      playerNick: (typeof pushNick === "function") ? pushNick(nickMap, it.player) : it.player,
      points: it.points,
      isParticipating: it.isParticipating
    });
  }

  var dateStr = normalizeDate(rawDate);
  var dealerCount = 1;
  try {
    if (typeof countDealerGamesToday === "function") {
      dealerCount = countDealerGamesToday(ss, format, dateStr, dealer, gameId);
    }
  } catch (e) {}

  var res = notifyGameResult(format, rawDate, dealer, dealerCount, notifyItems);
  return { success: true, message: "Уведомление для игры [" + format + " · " + dealer + "] отправлено в Telegram", result: res };
}

/**
 * Отправить уведомление для самой последней игры из DB_Results (или последнего MTT).
 * @param {string} [formatFilter] Опциональный фильтр формата ("MTT", "SnG", "Mystery Bounty")
 */
function resendLatestGame(formatFilter) {
  var ss = getAdminSpreadsheet();
  if (!ss) return { success: false, message: "Не удалось открыть таблицу" };
  var dbSheet = ss.getSheetByName(CONFIG.SHEETS.RESULTS);
  if (!dbSheet) return { success: false, message: "Лист DB_Results не найден" };

  var data = dbSheet.getDataRange().getValues();
  if (data.length <= 1) return { success: false, message: "DB_Results пуст" };

  var targetGameId = "";
  for (var r = data.length - 1; r >= 1; r--) {
    var gid = String(data[r][CONFIG.DB_COL.GAME_ID] || "").trim();
    var fmt = String(data[r][CONFIG.DB_COL.FORMAT] || "").trim();
    if (gid) {
      if (!formatFilter || fmt.toLowerCase() === formatFilter.toLowerCase()) {
        targetGameId = gid;
        break;
      }
    }
  }

  if (!targetGameId) {
    return { success: false, message: "Подходящая игра не найдена" };
  }

  return resendGameNotification(targetGameId);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    escapeTelegramHtml: escapeTelegramHtml,
    buildNotificationText: buildNotificationText
  };
}