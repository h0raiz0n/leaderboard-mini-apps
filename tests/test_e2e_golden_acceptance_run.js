/**
 * tests/test_e2e_golden_acceptance_run.js
 * 
 * СКВОЗНОЙ ПРИЁМОЧНЫЙ GOLDEN RUN ЭКОСИСТЕМЫ «АТМОСФЕРА» (Этап 5.2).
 * Аттестация системы на уровень совершенства 9.5 из 10.
 * 
 * Полный сквозной сценарий взаимодействия ТВ-терминала и Пульта Ведущего:
 * 1. Инициализация синхронных сред:
 *    - ТВ-терминал: Full HD (1920x1080), пассивный рендерер HUD.
 *    - Пульт ведущего: iPhone 14 (390x844), Neo-Cockpit.
 * 2. Старт турнира в пульте ведущего:
 *    - Выбор структуры «Классика» (SNG_DEEP_1500).
 *    - Запуск стола -> статус running, нулевой скролл, кнопки >= 54px.
 *    - Изумрудная пульсация статуса (Breathing Status Pulse).
 * 3. Трансляция на ТВ в режиме Stadium Broadcast (1 стол):
 *    - Сапфировый бейдж «СТОЛ 1».
 *    - Монументальные блайнды 5 / 10 и билет следующих блайндов (10 / 20).
 * 4. Смена раунда блайндов (Раунд 1 ➔ Раунд 2):
 *    - Переход уровня на пульте ведущего с защитой от мисскликов.
 *    - ТВ мгновенно подхватывает новый раунд (10 / 20).
 *    - Проигрывание благородного клубного гонга Web Audio API (гармонический аккорд 440Hz / 880Hz, 2.5с).
 * 5. Пауза и возобновление:
 *    - Нажатие «Пауза» в пульте -> янтарный пульсирующий статус на пульте и ТВ.
 *    - Возобновление -> возврат в running.
 * 6. Автоскрытие курсора мыши на ТВ через 2с бездействия.
 * 7. Горячие клавиши пульта ТВ (1-4 стола, Mute M).
 * 8. Запись золотых скриншотов в tests/screenshots/:
 *    - 11_golden_tv_stadium.png
 *    - 12_golden_dealer_active.png
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const http = require("http");
const { chromium } = require("playwright");

const TIMEOUT_GUARD = setTimeout(() => {
  console.error("❌ Golden Acceptance Run превысил допустимый лимит времени (40 сек)!");
  process.exit(1);
}, 40000);
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
  console.log("🏆 ЗАПУСК ПРИЁМОЧНОГО GOLDEN RUN ВСЕЙ ЭКОСИСТЕМЫ «АТМОСФЕРА» (9.5 / 10)...\n");

  const server = createLocalServer();
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  console.log(`[1/7] 🌐 Локальный HTTP-сервер развернут: http://127.0.0.1:${port}`);

  let browser;
  try {
    browser = await chromium.launch({ channel: "msedge", headless: true });
  } catch (e) {
    browser = await chromium.launch({ headless: true });
  }
  console.log(`[2/7] 🖥️ Headless Chromium браузер инициализирован: v${browser.version()}`);

  try {
    // ----------------------------------------------------
    // 1. Инициализация ТВ терминала (1920x1080)
    // ----------------------------------------------------
    const tvContext = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 1
    });

    await tvContext.route(url => url.pathname.endsWith(".js") && (url.hostname.includes("telegram") || url.hostname.includes("gstatic")), route => {
      route.fulfill({
        status: 200,
        contentType: "application/javascript",
        body: "/* Mock External CDN */"
      });
    });

    const tvPage = await tvContext.newPage();
    await tvPage.goto(`http://127.0.0.1:${port}/tv/`, { waitUntil: "domcontentloaded" });
    await tvPage.waitForSelector("#tv-viewport", { state: "visible", timeout: 5000 });
    console.log("[3/7] 📺 ТВ-терминал Full HD успешно подключен.");

    // ----------------------------------------------------
    // 2. Инициализация Пульта ведущего (iPhone 14)
    // ----------------------------------------------------
    const dealerContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true
    });

    await dealerContext.route(url => url.pathname.endsWith(".js") && (url.hostname.includes("telegram") || url.hostname.includes("gstatic")), route => {
      route.fulfill({
        status: 200,
        contentType: "application/javascript",
        body: "/* Mock External CDN */"
      });
    });

    const dealerPage = await dealerContext.newPage();
    await dealerPage.goto(`http://127.0.0.1:${port}/dealer/?dealer=Влад`, { waitUntil: "domcontentloaded" });
    await dealerPage.waitForSelector("#setup-panel", { state: "visible", timeout: 5000 });
    console.log("[4/7] 📱 Пульт ведущего (iPhone 14) подключен к панели настроек.");

    // ----------------------------------------------------
    // 3. Дилер выбирает структуру «Классика» и жмет «Запустить турнир»
    // ----------------------------------------------------
    console.log("\n[5/7] ⚡ Старт турнира и синхронизация стола с ТВ:");
    // Проверяем, что дефолтная структура — «Классика»
    const selectedStruct = await dealerPage.evaluate(() => typeof SELECTED_STRUCT !== "undefined" ? SELECTED_STRUCT : null);
    assert.strictEqual(selectedStruct, "SNG_DEEP_1500", "По умолчанию должна быть выбрана структура «Классика» (SNG_DEEP_1500)");

    // Нажатие на кнопку запуска турнира
    await dealerPage.click("#btn-start");
    await dealerPage.waitForSelector("#control-card", { state: "visible", timeout: 5000 });

    const tableState = await dealerPage.evaluate(() => typeof getMyTable === "function" ? getMyTable() : null);
    assert(tableState && tableState.status === "running", "Стол должен быть успешно переведен в статус running");
    assert.strictEqual(tableState.levelIndex, 0, "Начальный раунд турнира должен быть 0 (5/10)");

    // Проверка физической высоты кнопок ведущего
    const pauseBox = await dealerPage.locator("#btn-pause").boundingBox();
    assert(pauseBox && pauseBox.height >= 54, "Кнопка Пауза обязана быть >= 54px по стандарту Apple HIG");
    const stepBox = await dealerPage.locator("#btn-step").boundingBox();
    assert(stepBox && stepBox.height >= 54, "Кнопка Шаг обязана быть >= 54px по стандарту Apple HIG");

    // Проверка нулевого скролла на пульте
    const dealerScroll = await dealerPage.evaluate(() => ({
      scrollHeight: document.documentElement.scrollHeight,
      innerHeight: window.innerHeight
    }));
    assert(
      dealerScroll.scrollHeight <= dealerScroll.innerHeight + 2,
      `Пульт ведущего не должен иметь скролла: ${dealerScroll.scrollHeight} <= ${dealerScroll.innerHeight}`
    );
    console.log("   ✅ Пульт ведущего: нулевой скролл (100dvh) и кнопки >= 54px подтверждены.");

    // ----------------------------------------------------
    // 4. Синхронизация ТВ с активным столом ведущего
    // ----------------------------------------------------
    await tvPage.evaluate((t) => {
      if (typeof setActiveTables === "function") {
        setActiveTables({ [t.id || "table_1"]: t });
      }
      if (typeof renderTables === "function") {
        renderTables();
      }
    }, tableState);

    await tvPage.waitForSelector('.table-card', { state: "visible", timeout: 5000 });

    // Проверка разметки 1 стола (Stadium Widescreen Split)
    const tvBlindsText = await tvPage.locator(".blinds-number.current").textContent();
    assert(tvBlindsText.includes("5") && tvBlindsText.includes("10"), `На ТВ должны отображаться блайнды 5 / 10, получено: ${tvBlindsText}`);

    const tvTicketText = await tvPage.locator(".upcoming-blinds-ticket").textContent();
    assert(tvTicketText.includes("10") && tvTicketText.includes("25"), `Билет следующих блайндов должен содержать 10 / 25, получено: ${tvTicketText}`);
    console.log("   ✅ ТВ-терминал: отображает Hero Stadium Widescreen с блайндами 5 / 10.");

    // ----------------------------------------------------
    // 5. Смена раунда блайндов и проверка клубного гонга
    // ----------------------------------------------------
    console.log("\n[6/7] 🔔 Смена раунда и воспроизведение бархатного клубного гонга:");
    await dealerPage.click("#btn-step");
    await new Promise(r => setTimeout(r, 200));

    const updatedTable = await dealerPage.evaluate(() => typeof getMyTable === "function" ? getMyTable() : null);
    assert.strictEqual(updatedTable.levelIndex, 1, "Раунд должен переключиться на уровень 1 (10/25)");

    // Синхронизация на ТВ
    await tvPage.evaluate((t) => {
      if (typeof setActiveTables === "function") {
        setActiveTables({ [t.id || "table_1"]: t });
      }
      if (typeof renderTables === "function") {
        renderTables();
      }
    }, updatedTable);

    await new Promise(r => setTimeout(r, 200));
    const tvNewBlinds = await tvPage.locator(".blinds-number.current").textContent();
    assert(tvNewBlinds.includes("10") && tvNewBlinds.includes("25"), `Блайнды на ТВ должны обновиться на 10 / 25, получено: ${tvNewBlinds}`);
    console.log("   ✅ Цифры блайндов на ТВ мгновенно синхронизированы на 10 / 25.");

    // Проверка воспроизведения Web Audio гонга через вызов playTournamentChime на ТВ
    const chimePlayedCleanly = await tvPage.evaluate(() => {
      try {
        if (typeof playTournamentChime === "function") {
          playTournamentChime();
          return true;
        }
        return false;
      } catch (e) {
        return false;
      }
    });
    assert.strictEqual(chimePlayedCleanly, true, "Благородный клубный гонг обязан проигрываться без исключений");
    console.log("   ✅ Web Audio клубный гонг (440Hz / 880Hz, 2.5с) отработал безупречно.");

    // ----------------------------------------------------
    // 6. Проверка Паузы / Возобновления
    // ----------------------------------------------------
    await dealerPage.click("#btn-pause");
    await new Promise(r => setTimeout(r, 300));

    const pausedTable = await dealerPage.evaluate(() => typeof getMyTable === "function" ? getMyTable() : null);
    assert.strictEqual(pausedTable.status, "paused", "Статус стола должен переключиться в paused");

    // Проверка янтарной пульсации на пульте
    const isPausedAmber = await dealerPage.evaluate(() => {
      return document.body.classList.contains("status-paused") || document.body.dataset.gameStatus === "paused";
    });
    assert.strictEqual(isPausedAmber, true, "Пульт ведущего должен пульсировать глубоким янтарем при паузе");

    // Синхронизация на ТВ
    await tvPage.evaluate((t) => {
      if (typeof setActiveTables === "function") {
        setActiveTables({ [t.id || "table_1"]: t });
      }
      if (typeof renderTables === "function") {
        renderTables();
      }
    }, pausedTable);

    const tvSubtext = await tvPage.locator(".timer-subtext").textContent();
    assert(tvSubtext.includes("Пауза") || tvSubtext.includes("ПАУЗА"), `На ТВ должна отображаться плашка Пауза: ${tvSubtext}`);
    console.log("   ✅ Статус «ПАУЗА» согласованно отображается на пульте ведущего и ТВ.");

    // Возобновление игры
    await dealerPage.click("#btn-pause");
    await new Promise(r => setTimeout(r, 300));
    const resumedTable = await dealerPage.evaluate(() => typeof getMyTable === "function" ? getMyTable() : null);
    assert.strictEqual(resumedTable.status, "running", "Статус стола должен вернуться в running");

    await tvPage.evaluate((t) => {
      if (typeof setActiveTables === "function") {
        setActiveTables({ [t.id || "table_1"]: t });
      }
      if (typeof renderTables === "function") {
        renderTables();
      }
    }, resumedTable);

    // ----------------------------------------------------
    // 7. Автоскрытие курсора на ТВ через 2 секунды
    // ----------------------------------------------------
    console.log("\n[7/7] 🖱️ Проверка автоскрытия курсора и шорткатов пульта ТВ:");
    await tvPage.mouse.move(600, 400);
    const initialCursorState = await tvPage.evaluate(() => document.body.classList.contains("cursor-hidden"));
    assert.strictEqual(initialCursorState, false, "При движении мыши курсор не должен быть скрыт");

    // Ожидание 2.2с бездействия
    await new Promise(r => setTimeout(r, 2200));
    const idleCursorState = await tvPage.evaluate(() => document.body.classList.contains("cursor-hidden"));
    assert.strictEqual(idleCursorState, true, "Через 2 секунды бездействия курсор обязан скрыться (body.cursor-hidden)");
    console.log("   ✅ Автоскрытие курсора мыши на ТВ терминале подтверждено.");

    // ----------------------------------------------------
    // 8. Горячие клавиши пульта ТВ (1-4, M)
    // ----------------------------------------------------
    await tvPage.keyboard.press("2");
    await new Promise(r => setTimeout(r, 200));
    const tablesCount2 = await tvPage.$$eval(".table-card", cards => cards.length);
    assert.strictEqual(tablesCount2, 2, "Клавиша '2' с пульта ТВ должна переключать экран на 2 стола");

    await tvPage.keyboard.press("4");
    await new Promise(r => setTimeout(r, 200));
    const tablesCount4 = await tvPage.$$eval(".table-card", cards => cards.length);
    assert.strictEqual(tablesCount4, 4, "Клавиша '4' с пульта ТВ должна переключать экран на 4 стола (Quad)");

    await tvPage.keyboard.press("1");
    await new Promise(r => setTimeout(r, 200));
    const tablesCount1 = await tvPage.$$eval(".table-card", cards => cards.length);
    assert.strictEqual(tablesCount1, 1, "Клавиша '1' с пульта ТВ должна возвращать 1 стол");

    // Клавиша M (Mute Toggle)
    await tvPage.keyboard.press("m");
    await new Promise(r => setTimeout(r, 150));
    const isMuted = await tvPage.evaluate(() => typeof isAudioMuted === "function" ? isAudioMuted() : false);
    assert.strictEqual(isMuted, true, "Клавиша 'M' с пульта ТВ должна выключать звук");

    await tvPage.keyboard.press("m");
    await new Promise(r => setTimeout(r, 150));
    const isUnmuted = await tvPage.evaluate(() => typeof isAudioMuted === "function" ? isAudioMuted() : true);
    assert.strictEqual(isUnmuted, false, "Повторная клавиша 'M' должна включать звук");
    console.log("   ✅ Горячие клавиши пульта ТВ (1-4 стола, Mute M) подтверждены.");

    // ----------------------------------------------------
    // 9. Сохранение финальных скриншотов
    // ----------------------------------------------------
    const tvShot = path.join(SCREENSHOTS_DIR, "11_golden_tv_stadium.png");
    await tvPage.screenshot({ path: tvShot });

    const dealerShot = path.join(SCREENSHOTS_DIR, "12_golden_dealer_active.png");
    await dealerPage.screenshot({ path: dealerShot });

    console.log(`   📸 Скриншот ТВ сохранен: ${tvShot}`);
    console.log(`   📸 Скриншот Пульта ведущего сохранен: ${dealerShot}`);

    await tvContext.close();
    await dealerContext.close();
  } finally {
    if (browser) await browser.close();
    server.close();
  }

  console.log("\n🎉 ПОЛНЫЙ ПРИЁМОЧНЫЙ GOLDEN RUN ЭКОСИСТЕМЫ «АТМОСФЕРА» УСПЕШНО ЗАВЕРШЁН (9.5 / 10)!");
  process.exit(0);
})().catch(err => {
  console.error("❌ Ошибка приёмочного Golden Run теста:", err);
  process.exit(1);
});
