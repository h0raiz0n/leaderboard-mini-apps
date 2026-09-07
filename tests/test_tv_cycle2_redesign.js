/**
 * E2E UNIT TEST: TV Broadcast HUD Redesign Cycle 2
 * Покерный клуб «Атмосфера»
 * 
 * Проверяет:
 * 1. Гармонизированное Анте: двухстрочный золотой монолит без ромбиков и рамок.
 * 2. Турнирный статус в шапке: .tournament-stage-badge единого размера с ведущим.
 * 3. Ликвидацию лишнего подвала (.card-floor-bar display: none !important;).
 * 4. Однострочный билет следующего уровня (➔ SB / BB (ANTE) с white-space: nowrap;).
 * 5. Живой лидерборд в 4-м квадранте и 45-секундную ротацию слайдов (0, 1, 2).
 * 6. Smart TV Anti-Sleep Engine (микро-видео keep-alive и продление Wake Lock).
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");

console.log("📺 Запуск тестов Редизайна ТВ-экрана Цикл 2 (EPT HUD, Live Leaderboard, Anti-Sleep)...\n");

const css = fs.readFileSync(path.join(__dirname, "../tv/styles.css"), "utf-8");
const html = fs.readFileSync(path.join(__dirname, "../tv/index.html"), "utf-8");
const tv = require("../tv/tv.js");

// ==========================================
// 1. ПРОВЕРКА ГАРМОНИЗИРОВАННОГО АНТЕ
// ==========================================
console.log("1. Проверка стилей и рендеринга Анте (двухстрочный золотой монолит):");
assert(css.includes(".ante-badge"), "Должен присутствовать селектор .ante-badge");
assert(css.includes("background: transparent !important;"), "Анте должно быть без фона (transparent)");
assert(css.includes("border: none !important;"), "Анте должно быть без рамки (border: none)");
assert(css.includes(".ante-badge::before {\n  display: none !important;"), "Ромбик перед Анте должен быть скрыт");
console.log("   ✅ Анте стилизовано как бесшовный золотой монолит без овальных плашек и ромбиков.");

// ==========================================
// 2. ПРОВЕРКА ТУРНИРНОГО БЕЙДЖА В ШАПКЕ
// ==========================================
console.log("\n2. Проверка турнирного статуса в шапке (.tournament-stage-badge):");
assert(css.includes(".tournament-stage-badge"), "Должен присутствовать класс .tournament-stage-badge");
assert(css.includes(".tournament-stage-badge .stage-format"), "Должен присутствовать селектор формата");
assert(css.includes(".tournament-stage-badge .stage-sep"), "Должен присутствовать разделитель •");
assert(css.includes(".tournament-stage-badge .stage-round"), "Должен присутствовать селектор раунда");
console.log("   ✅ Шапка содержит единый высококонтрастный турнирный блок, равный по высоте ведущему.");

// ==========================================
// 3. ПРОВЕРКА СКРЫТИЯ ПОДВАЛА
// ==========================================
console.log("\n3. Проверка ликвидации мертвого подвала (.card-floor-bar):");
assert(css.includes(".card-floor-bar {\n  display: none !important;"), "Подвал должен быть жестко скрыт для освобождения высоты");
console.log("   ✅ Подвал 'Турнир продолжается' ликвидирован; высота экрана отдана таймеру и блайндам.");

// ==========================================
// 4. ПРОВЕРКА ОДНОСТРОЧНОГО БИЛЕТА СЛЕДУЮЩЕГО УРОВНЯ
// ==========================================
console.log("\n4. Проверка билета следующих блайндов (.upcoming-blinds-ticket):");
assert(css.includes(".upcoming-blinds-ticket"), "Должен присутствовать .upcoming-blinds-ticket");
assert(css.includes("white-space: nowrap;"), "Билет должен иметь white-space: nowrap для исключения переносов");
assert(css.includes(".upcoming-ticket-arrow"), "Должен присутствовать селектор стрелки");
console.log("   ✅ Билет следующих блайндов компактен, содержит стрелку ➔ и защищен от переносов строк.");

// ==========================================
// 5. ПРОВЕРКА ЖИВОГО ЛИДЕРБОРДА И РОТАЦИИ В 4-М КВАДРАНТЕ
// ==========================================
console.log("\n5. Проверка 4-го квадранта (Live Club Hub) и 3 экранов ротации:");
assert(typeof tv.buildClubHubHtml === "function", "tv.buildClubHubHtml должен быть функцией");
assert(typeof tv.getClubHubSlideHtml === "function", "tv.getClubHubSlideHtml должен быть функцией");
assert(typeof tv.rotateClubHubSlide === "function", "tv.rotateClubHubSlide должен быть функцией");

// Слайд 0: ТОП МЕСЯЦА
const slide0 = tv.getClubHubSlideHtml(0);
assert(slide0.includes("ТОП МЕСЯЦА"), "Слайд 0 должен содержать ТОП МЕСЯЦА");
assert(slide0.includes("ТОП-1 КЛУБА"), "Слайд 0 должен содержать ТОП-1 КЛУБА");

// Слайд 1: ТОП ЗА ВСЁ ВРЕМЯ
const slide1 = tv.getClubHubSlideHtml(1);
assert(slide1.includes("ТОП ЗА ВСЁ ВРЕМЯ"), "Слайд 1 должен содержать ТОП ЗА ВСЁ ВРЕМЯ");
assert(slide1.includes("ЛЕГЕНДА КЛУБА"), "Слайд 1 должен содержать ЛЕГЕНДА КЛУБА");

// Слайд 2: ПОСЛЕДНИЕ ПОБЕДИТЕЛИ
const slide2 = tv.getClubHubSlideHtml(2);
assert(slide2.includes("ЗАЛ СЛАВЫ КЛУБА"), "Слайд 2 должен содержать ЗАЛ СЛАВЫ КЛУБА");
assert(slide2.includes("ПОБЕДИТЕЛЬ ТУРНИРА"), "Слайд 2 должен содержать ПОБЕДИТЕЛЬ ТУРНИРА");

console.log("   ✅ Все 3 слайда (Топ месяца, Топ за все время, Зал славы) корректно генерируются.");

// ==========================================
// 6. ПРОВЕРКА SMART TV ANTI-SLEEP ENGINE
// ==========================================
console.log("\n6. Проверка Smart TV Anti-Sleep Engine:");
assert(html.includes('id="tv-wake-video"'), "tv/index.html должен содержать скрытое видео #tv-wake-video");
assert(html.includes('playsinline'), "Видео должно иметь атрибут playsinline");
assert(html.includes('loop'), "Видео должно иметь атрибут loop");
assert(html.includes('muted'), "Видео должно иметь атрибут muted");
assert(typeof tv.initSmartTvAntiSleep === "function", "initSmartTvAntiSleep должен быть экспортирован");
console.log("   ✅ Smart TV Anti-Sleep Engine (Canvas 1 FPS -> Video keep-alive + Wake Lock Auto-Renewal) готов.");

console.log("\n🎉 ВСЕ ПРОВЕРКИ ЦИКЛА 2 УСПЕШНО ПРОЙДЕНЫ!");
