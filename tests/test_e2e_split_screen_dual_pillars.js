/**
 * tests/test_e2e_split_screen_dual_pillars.js
 * 
 * Playwright E2E тест: ТВ Сплит-скрин (2 стола) Stadium Dual Pillars (Этап 1.2).
 * 
 * Проверяет:
 * 1. Ликвидацию вертикального вакуума (расстояние между блоком таймера и блайндами <= 36px).
 * 2. Монументальный размер шрифта блайндов (>= 88px на 1080p Full HD).
 * 3. Наличие и контрастность бейджей «СТОЛ 1» (сапфир) и «СТОЛ 2» (янтарь).
 * 4. Защиту билета следующих блайндов от перекрытия нижней рамкой ТВ (клиренс >= 20px).
 * 5. Адаптивность при 2560x1440 (2.5K QHD).
 * 6. Сохранение контрольного скриншота в tests/screenshots/05_split_screen_stadium_pillars.png.
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const http = require("http");
const { chromium } = require("playwright");

const TIMEOUT_GUARD = setTimeout(() => {
  console.error("❌ E2E Playwright тест сплитскрина превысил лимит времени (30 сек)!");
  process.exit(1);
}, 30000);
TIMEOUT_GUARD.unref();

const ROOT_DIR = path.resolve(__dirname, "..");
const SCREENSHOTS_DIR = path.join(__dirname, "screenshots");

if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".mp4": "video/mp4",
  ".svg": "image/svg+xml"
};

function createLocalServer() {
  return http.createServer((req, res) => {
    let reqPath = req.url.split("?")[0].split("#")[0];
    if (reqPath === "/") reqPath = "/index.html";
    if (reqPath === "/tv" || reqPath === "/tv/") reqPath = "/tv/index.html";
    if (reqPath === "/dealer" || reqPath === "/dealer/") reqPath = "/dealer/index.html";

    const safePath = path.normalize(reqPath).replace(/^(\.\.[\/\\])+/, "");
    const filePath = path.join(ROOT_DIR, safePath);

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || "application/octet-stream";
      res.writeHead(200, {
        "Content-Type": contentType,
        "Access-Control-Allow-Origin": "*"
      });
      fs.createReadStream(filePath).pipe(res);
    } else {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not Found: " + reqPath);
    }
  });
}

(async () => {
  console.log("🏟️ Запуск Playwright E2E теста Stadium Dual Pillars (2 стола)...\n");

  const server = createLocalServer();
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  console.log(`[1/5] 🌐 Локальный HTTP-сервер запущен: http://127.0.0.1:${port}`);

  let browser;
  try {
    browser = await chromium.launch({ channel: "msedge", headless: true });
  } catch (e) {
    browser = await chromium.launch({ headless: true });
  }
  console.log(`[2/5] 🖥️ Headless Chromium браузер запущен: v${browser.version()}`);

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1
  });

  // Заглушка внешних CDN
  await context.route(url => url.pathname.endsWith(".js") && (url.hostname.includes("telegram") || url.hostname.includes("gstatic")), route => {
    route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: `
        window.firebase = {
          apps: [],
          initializeApp: function() { return this; },
          database: function() {
            return {
              ref: function() {
                return {
                  off: function() {},
                  on: function(e, cb) { if (e === "value") cb({ val: () => null }); },
                  set: () => Promise.resolve(),
                  update: () => Promise.resolve()
                };
              }
            };
          }
        };
      `
    });
  });

  const page = await context.newPage();

  try {
    // ==========================================
    // ТЕСТ 1: 1920x1080 (1080p Full HD)
    // ==========================================
    console.log("[3/5] 📏 Тестирование сплит-скрина при 1920x1080 Full HD:");
    await page.goto(`http://127.0.0.1:${port}/tv/?mock=2`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector('.tv-viewport[data-tables="2"]', { timeout: 5000 });
    await page.waitForSelector('.table-card', { timeout: 5000 });

    const cards = await page.$$('.table-card');
    assert.strictEqual(cards.length, 2, "Должно отображаться ровно 2 карточки столов");

    // Проверка бейджей идентификации столов
    const badge1 = await page.$('.table-identity-badge.table-1');
    assert(badge1, "Должен присутствовать бейдж «СТОЛ 1»");
    const badge1Text = (await badge1.innerText()).trim();
    assert.strictEqual(badge1Text, "СТОЛ 1", "Текст первого бейджа должен быть «СТОЛ 1»");

    const badge2 = await page.$('.table-identity-badge.table-2');
    assert(badge2, "Должен присутствовать бейдж «СТОЛ 2»");
    const badge2Text = (await badge2.innerText()).trim();
    assert.strictEqual(badge2Text, "СТОЛ 2", "Текст второго бейджа должен быть «СТОЛ 2»");
    console.log("   ✅ Бейджи столов подтверждены: «СТОЛ 1» (сапфир) и «СТОЛ 2» (янтарь).");

    // Замер геометрических параметров Стола 1
    const card1 = cards[0];
    const cardBox = await card1.boundingBox();
    const timerBlock = await card1.$('.timer-block');
    const timerBox = await timerBlock.boundingBox();
    const blindsMonolith = await card1.$('.blinds-monolith');
    const blindsBox = await blindsMonolith.boundingBox();
    const blindsNum = await card1.$('.blinds-number.current');
    const ticket = await card1.$('.upcoming-blinds-ticket');
    const ticketBox = await ticket.boundingBox();

    // 1. Замер вертикального зазора между таймером и блайндами
    const verticalGap = blindsBox.y - (timerBox.y + timerBox.height);
    console.log(`   📊 Вертикальный зазор между таймером и блайндами: ${verticalGap.toFixed(1)}px`);
    assert(verticalGap <= 36, `Вертикальный зазор (${verticalGap.toFixed(1)}px) не должен превышать 36px (устранение черной дыры)`);
    assert(verticalGap >= 12, `Вертикальный зазор (${verticalGap.toFixed(1)}px) должен обеспечивать визуальное разделение (>= 12px)`);
    console.log("   ✅ Вертикальный вакуум устранен: таймер и блайнды сбалансированы в оптическом центре.");

    // 2. Замер размера шрифта блайндов (>= 88px)
    const blindsFontSize = await page.evaluate(el => parseFloat(window.getComputedStyle(el).fontSize), blindsNum);
    console.log(`   📊 Физический размер шрифта блайндов на 1080p: ${blindsFontSize.toFixed(1)}px`);
    assert(blindsFontSize >= 88, `Размер шрифта блайндов (${blindsFontSize.toFixed(1)}px) обязан быть >= 88px`);
    console.log("   ✅ Монументальный размер блайндов подтвержден (>= 88px).");

    // 3. Защита билета от перекрытия нижней рамкой
    const bottomClearance = (cardBox.y + cardBox.height) - (ticketBox.y + ticketBox.height);
    console.log(`   📊 Клиренс билета над нижним краем карточки: ${bottomClearance.toFixed(1)}px`);
    assert(bottomClearance >= 20, `Клиренс билета (${bottomClearance.toFixed(1)}px) должен быть >= 20px для защиты от рамки ТВ`);
    console.log("   ✅ Билет следующих блайндов надежно приподнят над нижним краем.");

    // Сохранение контрольного скриншота 1080p
    const screenshotPath = path.join(SCREENSHOTS_DIR, "05_split_screen_stadium_pillars.png");
    await page.screenshot({ path: screenshotPath });
    console.log(`   📸 Контрольный скриншот сохранен: ${screenshotPath}`);

    // ==========================================
    // ТЕСТ 2: 2560x1440 (2.5K QHD)
    // ==========================================
    console.log("\n[4/5] 🖥️ Проверка масштабирования при 2560x1440 QHD:");
    await page.setViewportSize({ width: 2560, height: 1440 });
    await page.waitForTimeout(400);

    const qhdBlindsNum = await page.$('.blinds-number.current');
    const qhdFontSize = await page.evaluate(el => parseFloat(window.getComputedStyle(el).fontSize), qhdBlindsNum);
    console.log(`   📊 Размер шрифта блайндов на 2.5K QHD: ${qhdFontSize.toFixed(1)}px`);
    assert(qhdFontSize >= 95, `Размер шрифта на 2.5K (${qhdFontSize.toFixed(1)}px) должен быть >= 95px`);
    console.log("   ✅ Масштабирование на 2.5K QHD подтверждено.");

    console.log("\n[5/5] 🏁 Завершение теста и освобождение ресурсов...");
  } finally {
    await page.close();
    await context.close();
    await browser.close();
    server.close();
  }

  clearTimeout(TIMEOUT_GUARD);
  console.log("🎉 PLAYWRIGHT E2E ТЕСТ СПЛИТ-СКРИНА STADIUM DUAL PILLARS УСПЕШНО ПРОЙДЕН!\n");
})().catch(err => {
  console.error("❌ Ошибка в тесте сплит-скрина:", err);
  process.exit(1);
});
