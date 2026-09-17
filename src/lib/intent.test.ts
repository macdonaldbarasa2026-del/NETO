import test from "node:test";
import assert from "node:assert/strict";
import { detectUserIntent, buildQuickIntentActions } from "./intent";

test("detectUserIntent identifies device calls and search requests", () => {
  assert.equal(detectUserIntent("Call my mom").category, "device");
  assert.equal(detectUserIntent("Search for latest AI news").category, "search");
  assert.equal(detectUserIntent("Summarize this report").category, "summary");
});

test("quick intent actions include the right mobile shortcuts", () => {
  const actions = buildQuickIntentActions();
  assert.ok(actions.some((item) => item.label === "Call"));
  assert.ok(actions.some((item) => item.label === "Research"));
  assert.ok(actions.some((item) => item.label === "Summarize"));
});
