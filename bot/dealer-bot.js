/**
 * TELEGRAM DEALER BOT (@atmosphere_dealer_bot)
 * Антикафе «Атмосфера»
 * 
 * Закрытый бот для персонала: проверка прав дилеров и запуск пульта управления.
 */

const https = require("https");

// Конфигурация бота
const BOT_CONFIG = {
  TOKEN: process.env.DEALER_BOT_TOKEN || "",
  MINI_APP_URL: process.env.DEALER_MINI_APP_URL || "https://atmosphere-poker.pages.dev/dealer",
  
  // Белый список Telegram ID дилеров и админов
  DEALER_WHITELIST: [
    123456789, // Пример ID администратора
  ]
};

/**
 * Проверка прав доступа пользователя
 */
function isAuthorizedDealer(userId) {
  return BOT_CONFIG.DEALER_WHITELIST.includes(userId);
}

/**
 * Обработка команды /start
 */
function handleStartCommand(chatId, userId, firstName) {
  const isAuth = isAuthorizedDealer(userId);
  
  const text = isAuth
    ? `♠️ <b>Привет, ${firstName}!</b>\n\nТы авторизован как дилер покерного клуба «Атмосфера».\nНажми кнопку ниже, чтобы открыть пульт управления столами.`
    : `⛔️ <b>Доступ ограничен</b>\n\nЭтот бот предназначен только для дилеров и администраторов покерного клуба «Атмосфера».\nТвой Telegram ID: <code>${userId}</code> (передай его администратору для добавления в белый список).`;

  const keyboard = isAuth
    ? {
        inline_keyboard: [
          [
            {
              text: "🎛 Открыть пульт дилера",
              web_app: { url: BOT_CONFIG.MINI_APP_URL }
            }
          ]
        ]
      }
    : null;

  sendTelegramMessage(chatId, text, keyboard);
}

/**
 * Отправка сообщения в Telegram
 */
function sendTelegramMessage(chatId, text, replyMarkup) {
  if (!BOT_CONFIG.TOKEN) {
    console.log(`[DRY-RUN] To ${chatId}: ${text}`);
    return;
  }

  const payload = JSON.stringify({
    chat_id: chatId,
    text: text,
    parse_mode: "HTML",
    reply_markup: replyMarkup
  });

  const req = https.request(`https://api.telegram.org/bot${BOT_CONFIG.TOKEN}/sendMessage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(payload)
    }
  }, (res) => {
    res.on("data", () => {});
  });

  req.on("error", (err) => console.error("Ошибка Telegram API:", err));
  req.write(payload);
  req.end();
}

module.exports = {
  isAuthorizedDealer,
  handleStartCommand,
  sendTelegramMessage,
  BOT_CONFIG
};
