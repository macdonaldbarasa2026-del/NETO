import test from "node:test";
import assert from "node:assert/strict";
import { shouldUseWebSearch, summarizeSearchResults } from "./webSearch";

test("detects live info and factual queries that need web search", () => {
  assert.equal(shouldUseWebSearch("What is the latest AI news today?"), true);
  assert.equal(shouldUseWebSearch("Help me write a message"), false);
  assert.equal(shouldUseWebSearch("What is the latest price of Bitcoin right now?"), true);
});

test("summarizes search content into a useful answer payload", () => {
  const result = summarizeSearchResults({
    abstract: "Microsoft launched a new AI feature this week.",
    results: [
      { title: "AI launch update", href: "https://example.com/ai", snippet: "The product launched with new features." }
    ]
  });

  assert.match(result, /Microsoft/i);
  assert.match(result, /AI launch update/i);
});
