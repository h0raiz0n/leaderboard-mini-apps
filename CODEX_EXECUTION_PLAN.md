# CODEX MASTER EXECUTION PLAN: POKER LEADERBOARD & MINI APP
> **Target Quality**: 9.5+ / 10 Engineering Excellence, Consistency & Performance.
> **Execution Model**: OpenAI Codex (5.5 xhigh) / Anthropic Claude / Antigravity Autonomous Agent.
> **Deployment Target**: Google Apps Script Web App (`AKfycbwXrgT_FBDueyA4ap3gryOQQfxBqiv2GJL_H4Ejt3bQhOdZThoMW_j61T-C7Oq4ZTTseg`) & GitHub Repository (`main`).

---

## 1. TECHNICAL CONTEXT & SYSTEM ARCHITECTURE

### 1.1 Project Overview & Purpose
This system is an automated live analytics engine and Telegram Mini App for the **"Атмосфера" (Atmosphere)** Poker Club.
It manages games across 3 formats (**SnG**, **MTT**, **Mystery Bounty**), aggregates player points, computes monthly rankings and achievements, maintains historical player cards, tracks host activity, and pushes real-time game results to Telegram.

### 1.2 Data Flow Pipeline
```
[ Google Forms: SnG / MTT / Mystery ] 
         │ (onFormSubmit live event or AdminTools manual input)
         ▼
[ Code.js: processFormSubmit (with LockService mutex) ]
         │ 1. Normalizer.js -> cleanPlayerName, normalizeFormRow, unifiedGameId
         ▼
[ Google Sheets: DB_Results ] ──► [ Leaderboard.js: calculateLeaderboard ]
         │ (Stores: gameId, date, format, dealer, player, event, pts, isItm)
         ├───────────────────────► [ Local Leaderboard Sheet & Public Leaderboard Sheet ]
         ▼
[ Analytics.js: invalidateAnalyticsCache & warmAllCaches ]
         │ (Writes to DynamicChunkedCache: DGET_current, DGET_all_slim, DGET_halloffame, DGET_dealers_cur, DGET_mttpodium)
         ▼
[ TelegramNotifier.js: notifyGameResult ] ──► Telegram Channel (Push Notifications)
         ▲
         │ (doGet API: ?type=bundle, ?type=current, ?type=player, ?type=dealers, ?type=halloffame)
[ Telegram Mini App: index.html ] 
  (Progressive Hydration, LocalStorage bundle cache, BackButton gesture stack, Responsive UI)
```

### 1.3 Core Rules & Scoring Formulas (Single Source of Truth)
- **Game Formats**:
  - **SnG**: 1st place = 10 pts, 2nd place = 6 pts, 3rd place = 3 pts (all ITM = "ДА"). No KOs.
  - **MTT**: 1st = 30 pts, 2nd = 20 pts, 3rd = 14 pts, 4th = 9 pts, 5th = 5 pts (all ITM = "ДА"). No KOs.
  - **Mystery Bounty**: 1st = 10 pts, 2nd = 6 pts, 3rd = 3 pts (ITM = "ДА") + 2 Knockouts (+20 pts each, ITM = "НЕТ").
- **Monthly Achievements (Active for 'month' period only)**:
  - **Ranks**: FISH (0–5 ITM, +0 pts) → SHARK (6–11 ITM, +15 pts) → LEGEND (12–17 ITM, +35 pts) → BOSS (18+ ITM, +50 pts).
  - **ITM Stack**: Thresholds: Level 1 (3 ITM, +5 pts), Level 2 (7 ITM, +10 pts), Level 3 (12 ITM, +15 pts), Level 4 (18 ITM, +20 pts), Level 5 (25 ITM, +25 pts), Level 6 (33 ITM, +30 pts)... Step increases by +1 each level.
  - **Full Set**: Complete trios of 1st + 2nd + 3rd places: `Math.min(gold, silver, bronze) * 10 pts`.
  - **Double**: Two or more 1st place wins on the same calendar date with the same host: `Math.floor(winsByDateHost / 2) * 10 pts`.
- **Terminology Rule**:
  - Everywhere in Russian UI, forms, and logs, the role is **"Ведущий"** (host), NEVER "дилер".

---

## 2. MASTER TASK CHECKLIST (ALTERNATING IMPLEMENTATION & E2E VERIFICATION)

> **Rules of Execution**:
> 1. Execute tasks strictly in sequential order.
> 2. Each Implementation task (`.1`) MUST be immediately followed by its Verification & Deploy task (`.2`).
> 3. After completing each task, mark `[ ]` as `[x]` and record a brief execution summary in the Log section below it.
> 4. NEVER leave uncommitted or undeployed code.

---

### PHASE 1: BACKEND LOGIC HARDENING, TERMINOLOGY & RACE-SAFETY

- [ ] **TASK 1.1 [IMPLEMENTATION]: Unified Host Terminology & AdminTools Concurrency Lock**
  - **Files**: `AdminTools.js`, `GameManager.html`, `Formatting.js`, `Config.js`, `TelegramNotifier.js`.
  - **Objectives**:
    1. Replace all occurrences of "дилер", "dealer" in UI labels, placeholders, logs, and toasts with "Ведущий" / "ведущий".
    2. Wrap `adminSaveGame` and `adminDeleteGame` in `AdminTools.js` with `LockService.getScriptLock()` (25s timeout) to prevent data corruption during simultaneous form submits.
    3. Ensure `AdminTools.js` properly refreshes analytics cache (`invalidateAnalyticsCache()`) upon save or delete.

- [ ] **TASK 1.2 [E2E VERIFICATION & DEPLOY]: Validate AdminTools & Normalizer Suite**
  - **Action**:
    1. Run `node tests/test_engine.js` and verify zero errors.
    2. Execute `clasp push && clasp deploy -i AKfycbwXrgT_FBDueyA4ap3gryOQQfxBqiv2GJL_H4Ejt3bQhOdZThoMW_j61T-C7Oq4ZTTseg -d "Phase 1 - AdminTools LockService & Host Terminology"`.
    3. Git commit & push: `git commit -am "fix(core): harmonize host terminology and add LockService to admin tools" && git push origin main`.
  - **Verification Log**: *(Record test output and deployment version)*

---

### PHASE 2: ANALYTICS & PLAYER CARD DATA ENGINE PERFECTION

- [ ] **TASK 2.1 [IMPLEMENTATION]: Fix Player Card Scoping Bug & Enrich Data Contract**
  - **Files**: `Analytics.js`, `Leaderboard.js`.
  - **Objectives**:
    1. Fix variable scoping and boundary bug in `computePlayerCard` (milestone buffer calculation when a player has 0 monthly games or when there are < 9 players on the leaderboard).
    2. Ensure `computePlayerCard` accurately emits `firstWinDate`, `lastWinDate`, `pointsByFormat` (SnG, MTT, Mystery), `winsByFormat`, and `mttPodiumStats` for all players.
    3. Ensure `takeSnapshot()` in `Code.js` is idempotent (updates existing row if run on the same date instead of duplicating).

- [ ] **TASK 2.2 [E2E VERIFICATION & DEPLOY]: API Contract & Test Suite Validation**
  - **Action**:
    1. Add unit test to `tests/test_engine.js` covering `computePlayerCard` data structure and milestone edge cases. Run `node tests/test_engine.js`.
    2. Verify live API response for `?type=player&name=Молодой%20Блондин` and `?type=bundle`.
    3. Execute `clasp push && clasp deploy -i AKfycbwXrgT_FBDueyA4ap3gryOQQfxBqiv2GJL_H4Ejt3bQhOdZThoMW_j61T-C7Oq4ZTTseg -d "Phase 2 - Player Card engine bugfixes & snapshot idempotency"`.
    4. Git commit & push: `git commit -am "fix(analytics): fix player card milestone calculation and snapshot idempotency" && git push origin main`.
  - **Verification Log**: *(Record test output and deployment version)*

---

### PHASE 3: FRONTEND MINI APP DATA VISUALIZATION & FULL UTILIZATION

- [ ] **TASK 3.1 [IMPLEMENTATION]: Render Format Breakdown, Win Dates & Rich Stats in Player Card**
  - **Files**: `index.html`.
  - **Objectives**:
    1. In `#panel-player` (`renderPlayer`): Visualize `pointsByFormat` and `winsByFormat` (SnG vs MTT vs Mystery chips/bars) so players see where their points come from.
    2. Render `firstWinDate` and `lastWinDate` badges in the player's career statistics block.
    3. Polish milestone cards (Top 9, Top 3, #1) with clear positive buffer indications for leaders and point-gap indicators for chasers.
    4. Ensure clean fallback states for new players without monthly or all-time games.

- [ ] **TASK 3.2 [E2E VERIFICATION & DEPLOY]: Visual & Interaction Testing of Player Card**
  - **Action**:
    1. Run `node .agent/skills/impeccable/scripts/detect.mjs --json index.html` to audit UI patterns.
    2. Verify live HTML rendering with sample player data.
    3. Execute `clasp push && clasp deploy -i AKfycbwXrgT_FBDueyA4ap3gryOQQfxBqiv2GJL_H4Ejt3bQhOdZThoMW_j61T-C7Oq4ZTTseg -d "Phase 3 - Rich player card statistics and format breakdown"`.
    4. Git commit & push: `git commit -am "feat(ui): visualize points by format, win dates, and milestone buffers in player card" && git push origin main`.
  - **Verification Log**: *(Record test output and deployment version)*

---

### PHASE 4: DEAD CODE PURGE & PERFORMANCE HYGIENE

- [ ] **TASK 4.1 [IMPLEMENTATION]: Clean Dead Code, Unused CSS, and Redundant Helpers**
  - **Files**: `index.html`, `Analytics.js`, `Code.js`, `Formatting.js`.
  - **Objectives**:
    1. Remove any dead or obsolete functions across GAS files (e.g. redundant format mappers or legacy diagnostic functions that are never called).
    2. Remove unused CSS selectors and redundant inline styles in `index.html`.
    3. Optimize bundle payload size in `Analytics.js` (`slimAllStats` and `slimCurrentRows`) to eliminate unused fields over the wire.

- [ ] **TASK 4.2 [E2E VERIFICATION & DEPLOY]: Complete System Regression & E2E Validation**
  - **Action**:
    1. Run full unit test suite: `node tests/test_engine.js`.
    2. Test all API endpoints: `?type=bundle`, `?type=current`, `?type=leaderboard`, `?type=halloffame`, `?type=dealers`, `?type=player&name=...`.
    3. Execute `clasp push && clasp deploy -i AKfycbwXrgT_FBDueyA4ap3gryOQQfxBqiv2GJL_H4Ejt3bQhOdZThoMW_j61T-C7Oq4ZTTseg -d "Phase 4 - Dead code cleanup and payload optimization"`.
    4. Git commit & push: `git commit -am "chore(perf): purge dead code and optimize wire payloads" && git push origin main`.
  - **Verification Log**: *(Record test output and deployment version)*

---

## 3. AUDIT TRAIL & LOGS
*(Execution logs and test runs will be recorded here by Codex as tasks are completed)*
