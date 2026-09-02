/**
 * UNIT TEST: Vercel Serverless Telegram Webhook Handler
 * Антикафе «Атмосфера»
 */

const assert = require("assert");
const handler = require("../api/dealer-bot.js");

console.log("🤖 Тестирование Vercel Serverless Webhook для Telegram-бота...\n");

// 1. GET запрос (Health Check)
const mockRes = () => {
  const res = {
    _status: 200,
    _data: null,
    status(code) {
      this._status = code;
      return this;
    },
    json(data) {
      this._data = data;
      return this;
    }
  };
  return res;
};

async function testHealthCheck() {
  const res = mockRes();
  await handler({ method: "GET" }, res);
  assert.strictEqual(res._status, 200);
  assert.strictEqual(res._data.status, "alive");
  console.log("1. Health Check (GET /api/dealer-bot): ✅ 200 OK");
}

async function testStartAuthorized() {
  const res = mockRes();
  await handler({
    method: "POST",
    body: {
      update_id: 12345,
      message: {
        chat: { id: 777123 },
        from: { id: 777123, username: "vlad_a17" },
        text: "/start"
      }
    }
  }, res);

  assert.strictEqual(res._status, 200);
  assert.strictEqual(res._data.ok, true);
  assert.strictEqual(res._data.authorized, true);
  assert.strictEqual(res._data.dealer, "Тест");
  console.log("2. Авторизация @vlad_a17 (Тест) через /start: ✅ 200 OK, доступ предоставлен!");
}

async function testStartUnauthorized() {
  const res = mockRes();
  await handler({
    method: "POST",
    body: {
      update_id: 12346,
      message: {
        chat: { id: 888123 },
        from: { id: 888123, username: "unknown_intruder_xyz" },
        text: "/start"
      }
    }
  }, res);

  assert.strictEqual(res._status, 200);
  assert.strictEqual(res._data.ok, true);
  assert.strictEqual(res._data.authorized, false);
  console.log("3. Блокировка неизвестного пользователя: ✅ 200 OK, доступ ограничен.");
}

async function testNonStartIgnored() {
  const res = mockRes();
  await handler({
    method: "POST",
    body: {
      update_id: 12347,
      message: {
        chat: { id: 777123 },
        from: { id: 777123, username: "vlad_a17" },
        text: "Привет как дела"
      }
    }
  }, res);

  assert.strictEqual(res._status, 200);
  assert.strictEqual(res._data.status, "ignored_non_start");
  console.log("4. Игнорирование не-/start сообщений (режим тишины): ✅ 200 OK, бот молчит.");
}

async function run() {
  await testHealthCheck();
  await testStartAuthorized();
  await testStartUnauthorized();
  await testNonStartIgnored();
  console.log("\n🎉 ВСЕ ТЕСТЫ VERCEL SERVERLESS WEBHOOK УСПЕШНО ПРОЙДЕНЫ!");
}

run();
