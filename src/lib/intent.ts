export type UserIntentCategory = "chat" | "device" | "search" | "summary" | "creative" | "assistant";

export type IntentSignal = {
  category: UserIntentCategory;
  confidence: number;
  actionLabel: string;
  suggestion: string;
};

export function detectUserIntent(input: string): IntentSignal {
  const text = (input || "").trim();
  if (!text) {
    return {
      category: "chat",
      confidence: 0.35,
      actionLabel: "Continue",
      suggestion: "Ask Neto anything or start a voice conversation.",
    };
  }

  const lower = text.toLowerCase();

  if (/(call|dial|phone|sms|text message|message .* to|schedule .* call|contact)/i.test(lower)) {
    return {
      category: "device",
      confidence: 0.96,
      actionLabel: "Call / Message",
      suggestion: "This looks like a phone action. I’ll prepare the correct Android call or SMS flow.",
    };
  }

  if (/(search|look up|find|research|latest|news|compare|what is|who is|where is)/i.test(lower)) {
    return {
      category: "search",
      confidence: 0.93,
      actionLabel: "Research",
      suggestion: "This likely needs web research or a fact check before answering.",
    };
  }

  if (/(summarize|summary|brief|tl;dr|condense|recap|overview)/i.test(lower)) {
    return {
      category: "summary",
      confidence: 0.94,
      actionLabel: "Summarize",
      suggestion: "This looks like a summary or quick digest request.",
    };
  }

  if (/(plan|brainstorm|idea|strategy|build|app|design|prototype|roadmap|launch)/i.test(lower)) {
    return {
      category: "creative",
      confidence: 0.87,
      actionLabel: "Plan",
      suggestion: "This sounds like a strategy, product, or creative planning task.",
    };
  }

  if (/(assistant|help me|can you|please|how do i|what should i do|explain)/i.test(lower)) {
    return {
      category: "assistant",
      confidence: 0.82,
      actionLabel: "Assist",
      suggestion: "This is a general assistant request; I’ll respond with a direct answer and next steps.",
    };
  }

  return {
    category: "chat",
    confidence: 0.68,
    actionLabel: "Chat",
    suggestion: "This is a general chat request. I’ll answer naturally and keep it concise.",
  };
}

export function buildQuickIntentActions() {
  return [
    { label: "Call", value: "call someone", description: "Make a call or prepare a contact action" },
    { label: "Message", value: "send a text message", description: "Draft SMS or WhatsApp-like messaging" },
    { label: "Research", value: "research this topic", description: "Look up facts, comparisons, and latest updates" },
    { label: "Summarize", value: "summarize this text", description: "Condense long content into key points" },
    { label: "Plan", value: "create a plan", description: "Generate strategy, roadmap, or next steps" },
  ];
}
