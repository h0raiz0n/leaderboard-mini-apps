/**
 * Скрипт безопасной настройки меню Telegram-бота и Webhook
 * Антикафе «Атмосфера»
 * 
 * Использование:
 *   node scripts/setup_bot_menu.js <NEW_TOKEN> [COMMAND]
 * 
 * Команды:
 *   set-menu    - Привязать правильный Vercel Mini App к кнопке меню возле поля ввода
 *   reset-menu  - Удалить web_app кнопку меню (вернуть стандартную кнопку команд)
 *   set-webhook - Зарегистрировать вебхук Google Apps Script
 */

const https = require("https");

const token = process.argv[2] || process.env.DEALER_BOT_TOKEN;
const action = process.argv[3] || "set-menu";

const MINI_APP_URL = process.env.DEALER_APP_URL || "https://atmosphere-poker.vercel.app/dealer";
const GAS_WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbyzs6Hg0NDyslhh9HQV17HGxTBTqyhxZV-alqFbm0XQWc5YVsydPNk9ZubagpTaMsSE4Q/exec";

if (!token) {
  console.error("❌ Ошибка: Не указан токен бота!");
  console.log("\nИспользование:");
  console.log("  node scripts/setup_bot_menu.js <ВАШ_НОВЫЙ_ТОКЕН> [set-menu|reset-menu|set-webhook]");
  console.log("Или через переменную окружения в PowerShell:");
  console.log('  $env:DEALER_BOT_TOKEN="<ТОКЕН>"; node scripts/setup_bot_menu.js\n');
  process.exit(1);
}

function tgRequest(method, payloadObj) {
  return new Promise((resolve, reject) => {
    const payload = payloadObj ? JSON.stringify(payloadObj) : "";
    const options = {
      method: payloadObj ? "POST" : "GET",
      headers: payloadObj ? {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload)
      } : {}
    };

    const req = https.request(`https://api.telegram.org/bot${token}/${method}`, options, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve({ ok: false, error: data });
        }
      });
    });

    req.on("error", reject);
    if (payloadObj) req.write(payload);
    req.end();
  });
}

async function run() {
  console.log("🔍 Проверка токена бота...");
  const me = await tgRequest("getMe");
  if (!me.ok) {
    console.error("❌ Токен невалиден или отозван:", me.description || me.error);
    process.exit(1);
  }
  console.log(`✅ Бот подтвержден: @${me.result.username} (${me.result.first_name})`);

  if (action === "reset-menu") {
    console.log("\n🔘 Сброс кнопки меню к стандартному списку команд...");
    const res = await tgRequest("setChatMenuButton", {
      menu_button: { type: "commands" }
    });
    console.log("Результат:", res);
  } else if (action === "set-menu") {
    console.log(`\n🔘 Привязка кнопки меню к Mini App: ${MINI_APP_URL}...`);
    const res = await tgRequest("setChatMenuButton", {
      menu_button: {
        type: "web_app",
        text: "🎛 Пульт",
        web_app: { url: MINI_APP_URL }
      }
    });
    console.log("Результат установки кнопки меню:", res);
  }

  console.log("\n📋 Обновление списка команд (/start, /help)...");
  await tgRequest("setMyCommands", {
    commands: [
      { command: "start", description: "Открыть пульт управления турниром" },
      { command: "help", description: "Инструкция для ведущего" }
    ]
  });

  if (action === "set-webhook" || process.argv[3] === "all") {
    console.log(`\n🔗 Установка Webhook на Google Apps Script: ${GAS_WEBHOOK_URL}...`);
    const hookRes = await tgRequest("setWebhook", {
      url: GAS_WEBHOOK_URL,
      drop_pending_updates: true
    });
    console.log("Результат установки Webhook:", hookRes);
  }

  const hookInfo = await tgRequest("getWebhookInfo");
  console.log("\n📊 Текущее состояние Webhook:", hookInfo.result ? {
    url: hookInfo.result.url,
    has_custom_certificate: hookInfo.result.has_custom_certificate,
    pending_update_count: hookInfo.result.pending_update_count,
    last_error_message: hookInfo.result.last_error_message
  } : hookInfo);

  console.log("\n🎉 Настройка завершена успешно!");
}

run().catch(err => {
  console.error("❌ Фатальная ошибка:", err.message);
  process.exit(1);
});
