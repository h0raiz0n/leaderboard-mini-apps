/**
 * tests/test_mtt_session_and_lobby.js
 * Unit and integration tests for Sprint 19:
 * MTT Session Isolation, Single Master Lobby, and Ghost Tables Cleanup.
 */

const assert = require("assert");

console.log("▶ Running MTT Session & Lobby Isolation Tests...");

// 1. Test Shared Config MTT Session Path and Filter
const PokerConfig = require("../shared/poker-config.js");

assert.strictEqual(PokerConfig.MTT_SESSION_PATH, "atmosphere/mtt_session", "MTT_SESSION_PATH must be defined correctly in PokerConfig");
assert.strictEqual(typeof PokerConfig.isTableInCurrentMttSession, "function", "isTableInCurrentMttSession must be a function");

const mockSession = {
  sessionId: "mtt_1725000000000",
  status: "lobby",
  masterTableId: "dealer_1"
};

// Test active matching session
const matchingTable = {
  tableId: "dealer_2",
  format: "MTT",
  mttSessionId: "mtt_1725000000000",
  status: "ready"
};
assert.strictEqual(PokerConfig.isTableInCurrentMttSession(matchingTable, mockSession), true, "Matching table should be included in current MTT session");

// Test ghost table from past session
const ghostMttTable = {
  tableId: "dealer_old",
  format: "MTT",
  mttSessionId: "mtt_old_123",
  status: "running"
};
assert.strictEqual(PokerConfig.isTableInCurrentMttSession(ghostMttTable, mockSession), false, "Ghost table from past session should be rejected");

// Test ghost table without mttSessionId
const legacyGhostTable = {
  tableId: "dealer_drugoe",
  format: "SnG",
  status: "running"
};
assert.strictEqual(PokerConfig.isTableInCurrentMttSession(legacyGhostTable, mockSession), false, "Legacy ghost table with no mttSessionId should be rejected");

// Test when no session is active
assert.strictEqual(PokerConfig.isTableInCurrentMttSession(matchingTable, null), false, "No table should match if session is null");

console.log("  ✓ PokerConfig session isolation checks passed.");

// 2. Test TV Logic with Session Isolation
const tv = require("../tv/tv.js");
assert.strictEqual(typeof tv.setCurrentMttSession, "function", "tv.setCurrentMttSession must exist");
assert.strictEqual(typeof tv.getCurrentMttSession, "function", "tv.getCurrentMttSession must exist");

// Set current MTT session to lobby
tv.setCurrentMttSession({
  sessionId: "mtt_999",
  masterTableId: "dealer_1",
  masterDealerName: "Master Dealer",
  status: "lobby",
  createdAt: Date.now()
});

assert.strictEqual(tv.getCurrentMttSession().sessionId, "mtt_999");
assert.strictEqual(tv.getCurrentMttSession().status, "lobby");

console.log("  ✓ TV session tracking passed.");

// 3. Test Dealer Logic session methods
const dealer = require("../dealer/dealer.js");
assert.strictEqual(typeof dealer.setCurrentMttSession, "function", "dealer.setCurrentMttSession must exist");
assert.strictEqual(typeof dealer.getCurrentMttSession, "function", "dealer.getCurrentMttSession must exist");
assert.strictEqual(typeof dealer.cleanupStaleTablesInFirebase, "function", "dealer.cleanupStaleTablesInFirebase must exist");

dealer.setCurrentMttSession({
  sessionId: "mtt_999",
  masterTableId: "dealer_1",
  status: "running"
});
assert.strictEqual(dealer.getCurrentMttSession().sessionId, "mtt_999");
assert.strictEqual(dealer.getCurrentMttSession().status, "running");

console.log("  ✓ Dealer session tracking passed.");

console.log("✅ All MTT Session & Lobby Isolation tests passed successfully!\n");
