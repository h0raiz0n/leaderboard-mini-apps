/**
 * Vercel Serverless Function: Telegram Webhook for @atmosphere_poker_dealer_bot
 * Антикафе «Атмосфера»
 */

const https = require("https");

const DEALER_BOT_TOKEN = process.env.DEALER_BOT_TOKEN || "";
const FIREBASE_DB_URL = process.env.FIREBASE_DB_URL || "https://atmosphere-poker-default-rtdb.europe-west1.firebasedatabase.app";
const MINI_APP_URL = process.env.MINI_APP_URL || "https://atmosphere-poker.vercel.app/dealer";

// Дефолтный реестр на случай недоступности Firebase
const FALLBACK_REGISTRY = {
  LIST: ["Арина", "Арташес", "Влад", "Всеволод", "Дима", "Маша", "Нинель", "Паша", "Рома", "Саша", "Тимур", "Эмилия"],
  MAP: {
    "arina_makk": "Арина",
    "arbuzmane": "Арташес",
    "h0raiz0n": "Влад",
    "dsh838": "Всеволод",
    "sntrpe": "Дима",
    "starynskaya": "Маша",
    "ninel_mr": "Нинель",
    "trick_str": "Паша",
    "klimovichroman": "Рома",
    "alexsan2186": "Саша",
    "hezadono": "Тимур",
    "assyyyra": "Эмилия"
  }
};

async function getLiveDealersRegistry() {
  return new Promise((resolve) => {
    https.get(`${FIREBASE_DB_URL}/atmosphere/dealers_registry.json`, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed && parsed.MAP) {
            resolve(parsed);
            return;
          }
        } catch (e) {}
        resolve(FALLBACK_REGISTRY);
      });
    }).on("error", () => resolve(FALLBACK_REGISTRY));
  });
}

function sendTelegramMessage(chatId, text, inlineKeyboard) {
  return new Promise((resolve) => {
    const payload = JSON.stringify({
      chat_id: chatId,
      text: text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      reply_markup: inlineKeyboard ? { inline_keyboard: inlineKeyboard } : undefined
    });

    const req = https.request(`https://api.telegram.org/bot${DEALER_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload)
      }
    }, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => resolve(data));
    });

    req.on("error", () => resolve(null));
    req.write(payload);
    req.end();
  });
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

module.exports = async function handler(req, res) {
  // Telegram Webhook всегда ждет 200 OK
  if (req.method === "GET") {
    return res.status(200).json({ status: "alive", service: "atmosphere-dealer-bot" });
  }

  if (req.method !== "POST") {
    return res.status(200).json({ ok: true });
  }

  const update = req.body;
  if (!update || !update.message) {
    return res.status(200).json({ ok: true, status: "ignored" });
  }

  const msg = update.message;
  const textMsg = String(msg.text || "").trim();

  // Бот отвечает ТОЛЬКО на команду /start (строгий режим тишины)
  if (!textMsg.startsWith("/start")) {
    return res.status(200).json({ ok: true, status: "ignored_non_start" });
  }

  const chatId = msg.chat.id;
  const from = msg.from || {};
  const username = String(from.username || "").toLowerCase().replace(/^@/, "").trim();
  const userId = String(from.id || "").trim();

  const registry = await getLiveDealersRegistry();

  let isAuthorized = false;
  let realDealerName = "";

  if (username && registry.MAP[username]) {
    isAuthorized = true;
    realDealerName = registry.MAP[username];
  } else if (userId && registry.MAP[userId]) {
    isAuthorized = true;
    realDealerName = registry.MAP[userId];
  }

  if (!isAuthorized) {
    const deniedText = "🔒 <b>Вход для ведущих «Атмосфера»</b>\n\n" +
      "Ваш Telegram: @" + escapeHtml(username || "не_задан") + " (ID: <code>" + escapeHtml(userId) + "</code>).\n\n" +
      "Если вы приглашённый или разовый ведущий, нажмите кнопку ниже и введите <b>Master PIN</b> (<code>7777</code>) для входа:";
    
    const pinKeyboard = [
      [
        {
          text: "🔑 Открыть пульт (вход по PIN)",
          web_app: { url: MINI_APP_URL }
        }
      ]
    ];

    await sendTelegramMessage(chatId, deniedText, pinKeyboard);
    return res.status(200).json({ ok: true, authorized: false, pin_offered: true });
  }

  const welcomeText = "♠️ <b>ПУЛЬТ ВЕДУЩЕГО «АТМОСФЕРА»</b>\n\n" +
    "Привет, <b>" + escapeHtml(realDealerName) + "</b>!\n\n" +
    "Нажмите кнопку ниже, чтобы открыть быстрый пульт управления столами турнира (отклик 20мс):";

  const keyboard = [
    [
      {
        text: "🎛 Открыть пульт ведущего",
        web_app: { url: MINI_APP_URL }
      }
    ]
  ];

  await sendTelegramMessage(chatId, welcomeText, keyboard);
  return res.status(200).json({ ok: true, authorized: true, dealer: realDealerName });
};
