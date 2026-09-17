import test from "node:test";
import assert from "node:assert/strict";
import { getAdaptiveProfile, buildAdaptiveSuggestions, shouldUseCompactMode } from "./adaptiveProfile";

test("adaptive profile detects a research-heavy user", () => {
  const profile = getAdaptiveProfile([
    { role: "user", parts: [{ text: "Research the best AI tools" }] },
    { role: "user", parts: [{ text: "Compare the pricing and features" }] },
    { role: "user", parts: [{ text: "Summarize what you found" }] }
  ] as any, { isPhone: true, width: 390, isOffline: false } as any);

  assert.equal(profile.mode, "research");
  assert.ok(profile.pace === "fast" || profile.pace === "balanced");
  assert.ok(profile.quickPrompts.length > 0);
});

test("adaptive suggestions prioritize the user’s recent intent", () => {
  const suggestions = buildAdaptiveSuggestions([
    { role: "user", parts: [{ text: "Call my mom" }] },
    { role: "model", parts: [{ text: "I can prepare a call action." }] }
  ] as any);

  assert.ok(suggestions.some((item) => item.toLowerCase().includes("call") || item.toLowerCase().includes("message")));
});

test("compact mobile layout activates on narrow phones", () => {
  assert.equal(shouldUseCompactMode(390, true, false), true);
  assert.equal(shouldUseCompactMode(820, false, false), false);
});
