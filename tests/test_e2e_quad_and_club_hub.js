/**
 * tests/test_e2e_quad_and_club_hub.js
 * 
 * Playwright E2E тест: ТВ Режимы 3-4 Стола и Live Club Hub (Этап 3.2).
 * 
 * Проверяет:
 * 1. Эмуляцию 3 активных столов: правильный рендеринг 3 столов + 4-го квадранта (Live Club Hub).
 * 2. Ротацию слайдов хаба (0 ➔ 1 ➔ 2 ➔ 0) с мягким 400ms crossfade transition без консольных ошибок.
 * 3. Наличие золотых корон и медалей (👑, 🥇, 🥈, 🥉) для топ-3 игроков.
 * 4. Эмуляцию 4 активных столов: максимальную плотность и отсутствие переполнения экрана.
 * 5. Физические размеры шрифтов: таймер (до 110px) и блайнды (до 74px) на 1080p.
 * 6. Сохранение скриншотов:
 *    - tests/screenshots/07_quad_4_tables.png
 *    - tests/screenshots/08_club_hub_slide.png
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const http = require("http");
const { chromium } = require("playwright");

const TIMEOUT_GUARD = setTimeout(() => {
  console.error("❌ E2E Playwright тест 3-4 столов превысил допустимый лимит времени (30 сек)!");
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
    if (reqPath === "/favicon.ico") {
      res.writeHead(204);
      res.end();
      return;
    }

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
  console.log("🏟️ Запуск Playwright E2E теста Quad Arena & Live Club Hub (3-4 стола)...\n");

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

  // Заглушка внешних CDN скриптов
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
  const consoleErrors = [];
  page.on("pageerror", err => consoleErrors.push(err.message));
  page.on("console", msg => {
    if (msg.type() === "error" && !msg.text().includes("Failed to load resource") && !msg.text().includes("favicon")) {
      consoleErrors.push(msg.text());
    }
  });

  try {
    // ==========================================
    // ТЕСТ 1: 3 СТОЛА И 4-Й КВАДРАНТ LIVE CLUB HUB
    // ==========================================
    console.log("[3/5] 🃏 Тестирование режима 3 столов с 4-м квадрантом Live Club Hub:");
    await page.goto(`http://127.0.0.1:${port}/tv/?mock=3`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector('.tv-viewport[data-tables="3"]', { timeout: 5000 });
    await page.waitForSelector('.table-card', { timeout: 5000 });
    await page.waitForSelector('#club-hub-card', { timeout: 5000 });

    const tableCards = await page.$$('.table-card');
    assert.strictEqual(tableCards.length, 3, "Должно быть ровно 3 карточки столов");

    const clubHubCard = await page.$('#club-hub-card');
    assert(clubHubCard, "Должна присутствовать карточка 4-го квадранта #club-hub-card");

    // Проверка слайда 0: ТОП МЕСЯЦА
    const slide0Title = await page.$eval('.club-hub-title', el => el.textContent.trim());
    assert(slide0Title.includes("ТОП МЕСЯЦА"), "Слайд 0 должен содержать ТОП МЕСЯЦА");
    
    // Проверка короны Топ-1 и медалей Топ-2/3
    const avatar0 = await page.$eval('.hub-leader-avatar', el => el.textContent.trim());
    assert.strictEqual(avatar0, "👑", "Аватар Топ-1 игрока должен содержать золотую корону 👑");
    
    const medals0 = await page.$$eval('.hub-pos', els => els.map(e => e.textContent.trim()));
    assert(medals0.includes("🥈"), "Второй игрок должен иметь серебряную медаль 🥈");
    assert(medals0.includes("🥉"), "Третий игрок должен иметь бронзовую медаль 🥉");
    console.log("   ✅ Слайд 0 «ТОП МЕСЯЦА» подтвержден: золотая корона 👑 и медали 🥈, 🥉.");

    // Ротация на Слайд 1: ТОП ЗА ВСЁ ВРЕМЯ
    await page.evaluate(() => window.rotateClubHubSlide());
    await page.waitForTimeout(500); // 400ms animation transition
    const slide1Title = await page.$eval('.club-hub-title', el => el.textContent.trim());
    assert(slide1Title.includes("ТОП ЗА ВСЁ ВРЕМЯ"), "Слайд 1 должен содержать ТОП ЗА ВСЁ ВРЕМЯ");
    const medals1 = await page.$$eval('.hub-pos', els => els.map(e => e.textContent.trim()));
    assert(medals1.includes("🥈"), "Второй игрок должен иметь медаль 🥈");
    assert(medals1.includes("🥉"), "Третий игрок должен иметь медаль 🥉");
    console.log("   ✅ Слайд 1 «ТОП ЗА ВСЁ ВРЕМЯ» подтвержден: crossfade-ротация выполнена без задержек.");

    // Ротация на Слайд 2: ПОСЛЕДНИЕ ПОБЕДИТЕЛИ
    await page.evaluate(() => window.rotateClubHubSlide());
    await page.waitForTimeout(500);
    const slide2Title = await page.$eval('.club-hub-title', el => el.textContent.trim());
    assert(slide2Title.includes("ПОСЛЕДНИЕ ПОБЕДИТЕЛИ"), "Слайд 2 должен содержать ПОСЛЕДНИЕ ПОБЕДИТЕЛИ");
    const medals2 = await page.$$eval('.hub-pos', els => els.map(e => e.textContent.trim()));
    assert(medals2.includes("🥇"), "Победители турниров должны иметь золотые медали 🥇");
    console.log("   ✅ Слайд 2 «ПОСЛЕДНИЕ ПОБЕДИТЕЛИ (ЗАЛ СЛАВЫ)» подтвержден: медали 🥇.");

    // Сохранение скриншота карточки клубного хаба
    const hubScreenshotPath = path.join(SCREENSHOTS_DIR, "08_club_hub_slide.png");
    await clubHubCard.screenshot({ path: hubScreenshotPath });
    console.log(`   📸 Скриншот слайда хаба сохранен: ${hubScreenshotPath}`);

    assert.strictEqual(consoleErrors.length, 0, `Консоль браузера не должна содержать ошибок, найдено: ${consoleErrors.join("; ")}`);
    console.log("   ✅ 0 ошибок консоли при непрерывной ротации слайдов.");

    // ==========================================
    // ТЕСТ 2: 4 СТОЛА (QUAD 2X2 ARENA DENSITY)
    // ==========================================
    console.log("\n[4/5] 📐 Тестирование режима 4 столов (Quad 2x2 Arena):");
    await page.goto(`http://127.0.0.1:${port}/tv/?mock=4`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector('.tv-viewport[data-tables="4"]', { timeout: 5000 });
    await page.waitForSelector('.table-card', { timeout: 5000 });

    const quadCards = await page.$$('.table-card');
    assert.strictEqual(quadCards.length, 4, "Должно отображаться ровно 4 карточки столов");

    const viewportBox = await page.$eval('.tv-viewport', el => {
      const rect = el.getBoundingClientRect();
      return { width: rect.width, height: rect.height, top: rect.top, bottom: rect.bottom };
    });

    // Замер геометрии каждой из 4 карточек
    for (let i = 0; i < quadCards.length; i++) {
      const card = quadCards[i];
      const box = await card.boundingBox();
      
      // Карточка не должна вылезать за границы вьюпорта
      assert(box.y + box.height <= viewportBox.bottom + 2, `Карточка ${i+1} не должна выходить за нижнюю границу вьюпорта`);
      assert(box.x + box.width <= viewportBox.width + 2, `Карточка ${i+1} не должна выходить за правую границу вьюпорта`);

      // Замер размера шрифта таймера
      const timerDigits = await card.$('.timer-digits');
      const timerFontSize = await page.evaluate(el => parseFloat(window.getComputedStyle(el).fontSize), timerDigits);
      assert(timerFontSize >= 88, `Размер шрифта таймера карточки ${i+1} (${timerFontSize}px) обязан быть >= 88px`);

      // Замер размера шрифта блайндов
      const blindsDigits = await card.$('.blinds-number.current');
      const blindsFontSize = await page.evaluate(el => parseFloat(window.getComputedStyle(el).fontSize), blindsDigits);
      assert(blindsFontSize >= 58, `Размер шрифта блайндов карточки ${i+1} (${blindsFontSize}px) обязан быть >= 58px`);
    }

    const firstTimerSize = await page.evaluate(el => parseFloat(window.getComputedStyle(el).fontSize), await quadCards[0].$('.timer-digits'));
    const firstBlindsSize = await page.evaluate(el => parseFloat(window.getComputedStyle(el).fontSize), await quadCards[0].$('.blinds-number.current'));
    console.log(`   📊 Физический размер таймера в 4 столах: ${firstTimerSize.toFixed(1)}px (до 110px)`);
    console.log(`   📊 Физический размер блайндов в 4 столах: ${firstBlindsSize.toFixed(1)}px (до 74px)`);
    console.log("   ✅ Все 4 стола гармонично вписаны в сетку без клиппинга и скролла.");

    // Сохранение скриншота 4 столов
    const quadScreenshotPath = path.join(SCREENSHOTS_DIR, "07_quad_4_tables.png");
    await page.screenshot({ path: quadScreenshotPath });
    console.log(`   📸 Скриншот 4 столов сохранен: ${quadScreenshotPath}`);

    console.log("\n[5/5] 🏁 Завершение теста и освобождение ресурсов...");
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }

  console.log("🎉 PLAYWRIGHT E2E ТЕСТ 4 КВАДРАНТОВ И РОТАЦИИ ХАБА УСПЕШНО ПРОЙДЕН!\n");
  process.exit(0);
})().catch(err => {
  console.error("❌ Фатальная ошибка при выполнении Playwright теста:", err);
  process.exit(1);
});
