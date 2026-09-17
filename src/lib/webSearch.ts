export type SearchResult = {
  title: string;
  href: string;
  snippet: string;
};

export type SearchPayload = {
  abstract?: string;
  results?: SearchResult[];
  source?: string;
  timestamp?: string;
};

export function shouldUseWebSearch(input: string): boolean {
  const text = (input || "").trim();
  if (!text) return false;

  const lower = text.toLowerCase();
  const liveSignals = [
    "latest", "today", "now", "current", "real time", "realtime", "right now",
    "breaking", "news", "live", "updated", "as of", "this week", "this month",
    "price", "stock", "exchange rate", "weather", "forecast", "release", "new update"
  ];

  if (liveSignals.some((signal) => lower.includes(signal))) return true;
  if (/(what\s+(is|are)\s+the\s+latest|latest\s+.*(news|update|release)|current\s+.*(price|status|weather)|what\s+happened\s+today)/i.test(lower)) return true;
  return false;
}

export function summarizeSearchResults(payload: SearchPayload): string {
  const abstract = payload.abstract || "Web search results were found for this query.";
  const results = Array.isArray(payload.results) ? payload.results : [];

  const topTitle = results[0]?.title ? results[0].title : "Recent web result";
  const topSnippet = results[0]?.snippet ? results[0].snippet : "The latest available information indicates this is the most relevant result.";

  return [
    `I checked the web and the latest relevant result is: ${topTitle}.`,
    `${abstract}`,
    `Key detail: ${topSnippet}`,
    payload.source ? `Source: ${payload.source}` : "",
    payload.timestamp ? `Updated: ${payload.timestamp}` : "",
  ].filter(Boolean).join(" ");
}
