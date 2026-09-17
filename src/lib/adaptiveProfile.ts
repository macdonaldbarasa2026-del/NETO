export type AdaptiveMode = "default" | "research" | "phone" | "summary" | "focus";

export type AdaptiveProfile = {
  mode: AdaptiveMode;
  pace: "fast" | "balanced" | "calm";
  quickPrompts: string[];
  compactUI: boolean;
};

export function getAdaptiveProfile(history: any[] = [], context: { isPhone?: boolean; width?: number; isOffline?: boolean } = {}): AdaptiveProfile {
  const maxHistory = Array.isArray(history) ? history.slice(-10) : [];
  const text = maxHistory
    .map((entry) => Array.isArray(entry?.parts) ? entry.parts.map((part: any) => typeof part?.text === "string" ? part.text : "").join(" ") : "")
    .join(" ")
    .toLowerCase();

  const usesPhoneIntent = /(call|dial|message|sms|text|phone|contact)/i.test(text);
  const usesResearchIntent = /(research|search|compare|latest|what is|who is|find|news|pricing|feature)/i.test(text);
  const usesSummaryIntent = /(summarize|summary|brief|tl;dr|recap|overview)/i.test(text);
  const isPhone = Boolean(context.isPhone || context.width && context.width < 430);
  const isOffline = Boolean(context.isOffline);

  let mode: AdaptiveMode = "default";
  if (usesPhoneIntent) mode = "phone";
  else if (usesResearchIntent) mode = "research";
  else if (usesSummaryIntent) mode = "summary";
  else if (text.length > 250) mode = "focus";

  let pace: "fast" | "balanced" | "calm" = "balanced";
  if (mode === "research" || mode === "phone") pace = "fast";
  else if (isOffline) pace = "calm";

  const quickPrompts = [] as string[];
  if (mode === "phone") {
    quickPrompts.push("Call someone", "Send a quick message", "Find a contact");
  } else if (mode === "research") {
    quickPrompts.push("Compare options", "Research the latest", "Summarize the findings");
  } else if (mode === "summary") {
    quickPrompts.push("Condense this", "Give me the key points", "Turn this into action steps");
  } else {
    quickPrompts.push("Help me plan", "Explain this simply", "Give me the next step");
  }

  return {
    mode,
    pace,
    quickPrompts: quickPrompts.slice(0, 3),
    compactUI: shouldUseCompactMode(context.width ?? 0, isPhone, isOffline),
  };
}

export function buildAdaptiveSuggestions(history: any[] = []): string[] {
  const profile = getAdaptiveProfile(history);
  const base = [
    "Keep it concise",
    "Give me the direct answer",
    "What should I do next?",
  ];

  if (profile.mode === "phone") {
    return ["Call now", "Message someone", "Prepare a quick action"]; 
  }
  if (profile.mode === "research") {
    return ["Research and compare", "List the top options", "Summarize the findings"]; 
  }
  if (profile.mode === "summary") {
    return ["Summarize the key points", "Give me a quick recap", "Turn this into action steps"]; 
  }
  return base;
}

export function shouldUseCompactMode(width: number, isPhone: boolean, isOffline: boolean): boolean {
  if (isOffline) return true;
  if (isPhone) return true;
  return width > 0 && width < 430;
}
