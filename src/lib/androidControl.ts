export type AndroidAction =
  | "open_app" | "open_file" | "open_url" | "open_settings" | "make_call"
  | "compose_sms" | "read_screen" | "type_text" | "tap" | "long_press"
  | "scroll" | "swipe" | "go_back" | "go_home" | "copy_text" | "paste_text";

export type AndroidCommand = { type: "android_action"; action: AndroidAction; target?: string; text?: string; url?: string; direction?: "up" | "down" | "left" | "right" };
export type AndroidResult = { ok: boolean; message: string; needsConfirmation?: boolean; choices?: string[] };

declare global { interface Window { NetoNative?: { execute(command: string): string; getCapabilityStatus?(): string } } }

const URL_PATTERN = /^https?:\/\/[\w.-]+(?:\/[^\s]*)?$/i;

/** Local parser: only unambiguous commands are routed to Android. */
export function parseAndroidCommand(input: string): AndroidCommand | null {
  const text = input.trim().replace(/^neto[,:]?\s*/i, "");
  const open = text.match(/^open\s+(?:my\s+)?(.+?)(?:\.|!)*$/i);
  if (open) { const target = open[1].trim(); if (/^(downloads?|files?|documents?)$/i.test(target)) return { type: "android_action", action: "open_file", target }; if (/^settings?$/i.test(target)) return { type: "android_action", action: "open_settings" }; if (URL_PATTERN.test(target)) return { type: "android_action", action: "open_url", url: target }; return { type: "android_action", action: "open_app", target }; }
  if (/^(?:go\s+)?back(?:\.|!)*$/i.test(text)) return { type: "android_action", action: "go_back" };
  if (/^(?:go\s+)?home(?:\.|!)*$/i.test(text)) return { type: "android_action", action: "go_home" };
  const move = text.match(/^(scroll|swipe)\s+(up|down|left|right)(?:\.|!)*$/i);
  if (move) return { type: "android_action", action: move[1].toLowerCase() === "swipe" ? "swipe" : "scroll", direction: move[2].toLowerCase() as AndroidCommand["direction"] };
  const type = text.match(/^(?:type|enter)\s+(.+?)[.!]?$/i);
  if (type) return { type: "android_action", action: "type_text", text: type[1].trim() };
  if (/^read\s+(?:what(?:'s| is)\s+on\s+)?(?:my\s+)?screen(?:\.|!)*$/i.test(text)) return { type: "android_action", action: "read_screen" };
  const call = text.match(/^(?:call|dial)\s+(.+?)(?:\.|!)*$/i);
  if (call) return { type: "android_action", action: "make_call", target: call[1].trim() };
  const sms = text.match(/^(?:text|message)\s+(.+?)\s+(?:saying|that)\s+(.+?)(?:\.|!)*$/i);
  return sms ? { type: "android_action", action: "compose_sms", target: sms[1].trim(), text: sms[2].trim() } : null;
}

export function executeAndroidCommand(command: AndroidCommand): AndroidResult | null {
  if (!window.NetoNative) return null;
  try { const result = JSON.parse(window.NetoNative.execute(JSON.stringify(command))); return typeof result?.ok === "boolean" && typeof result?.message === "string" ? result : { ok: false, message: "NETO could not complete that Android action." }; }
  catch { return { ok: false, message: "NETO could not complete that Android action." }; }
}
