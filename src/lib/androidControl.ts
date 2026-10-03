export type AndroidAction =
  | "open_app"
  | "list_apps"
  | "search_contacts"
  | "open_file"
  | "open_url"
  | "open_settings"
  | "make_call"
  | "compose_sms"
  | "answer_call"
  | "end_call"
  | "read_screen"
  | "type_text"
  | "type_into"
  | "tap"
  | "long_press"
  | "tap_at"
  | "long_press_at"
  | "scroll"
  | "swipe"
  | "swipe_at"
  | "go_back"
  | "go_home"
  | "open_recents"
  | "open_notifications"
  | "open_quick_settings"
  | "open_power_dialog"
  | "take_screenshot"
  | "copy_text"
  | "paste_text"
  | "request_capability"
  | "open_accessibility_settings"
  | "open_app_settings";

export type AndroidCommand = {
  type: "android_action";
  action: AndroidAction;
  target?: string;
  query?: string;
  text?: string;
  url?: string;
  direction?: "up" | "down" | "left" | "right";
  x?: number;
  y?: number;
  x2?: number;
  y2?: number;
  durationMs?: number;
};

export type AndroidChoice = {
  label: string;
  value: string;
  detail?: string;
};

export type AndroidResult = {
  ok: boolean;
  action?: AndroidAction;
  message: string;
  needsConfirmation?: boolean;
  choices?: AndroidChoice[];
  code?: string;
  data?: Record<string, unknown>;
};

export type AndroidCapabilities = Record<string, boolean | string | undefined>;

/** Public contract for the single native bridge, window.NetoNative. */
export const ANDROID_ACTIONS: readonly AndroidAction[] = [
  "open_app",
  "list_apps",
  "search_contacts",
  "open_file",
  "open_url",
  "open_settings",
  "make_call",
  "compose_sms",
  "answer_call",
  "end_call",
  "read_screen",
  "type_text",
  "type_into",
  "tap",
  "long_press",
  "tap_at",
  "long_press_at",
  "scroll",
  "swipe",
  "swipe_at",
  "go_back",
  "go_home",
  "open_recents",
  "open_notifications",
  "open_quick_settings",
  "open_power_dialog",
  "take_screenshot",
  "copy_text",
  "paste_text",
  "request_capability",
  "open_accessibility_settings",
  "open_app_settings",
] as const;

export function isAndroidAction(value: unknown): value is AndroidAction {
  return typeof value === "string" &&
    (ANDROID_ACTIONS as readonly string[]).includes(value);
}

declare global {
  interface Window {
    NetoNative?: {
      execute(command: string): string;
      getCapabilityStatus?(): string;
      startVoice?(language: string): string;
      stopVoice?(): string;
      speak?(text: string, rate: number): string;
      stopSpeaking?(): string;
      signInWithGoogle?(): string;
    };
  }
}

function webUrl(value: string): string | null {
  const candidate = /^https?:\/\//i.test(value)
    ? value
    : `https://${value}`;

  try {
    const parsed = new URL(candidate);
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}

/** Local parser: only clear/unambiguous commands are routed to Android. */
export function parseAndroidCommand(input: string): AndroidCommand | null {
  const text = input.trim().replace(/^neto[,:]?\s*/i, "");

  const settings = text.match(
    /^open\s+(wifi|wi-fi|bluetooth|notifications?|accessibility|app(?:lication)?|display|sound|audio|location|battery|date(?:\s*\/?\s*time)?|time|language|input|keyboard)\s+settings?(?:\.|!)*$/i
  );
  if (settings) {
    return {
      type: "android_action",
      action: "open_settings",
      target: settings[1].toLowerCase(),
    };
  }

  if (/^(?:open|show)\s+(?:recent|recent\s+apps|recents)(?:\.|!)*$/i.test(text)) {
    return { type: "android_action", action: "open_recents" };
  }

  if (/^(?:open|show)\s+(?:notifications?|notification\s+shade)(?:\.|!)*$/i.test(text)) {
    return { type: "android_action", action: "open_notifications" };
  }

  if (/^(?:open|show)\s+(?:quick\s+settings?|quick\s+panel)(?:\.|!)*$/i.test(text)) {
    return { type: "android_action", action: "open_quick_settings" };
  }

  if (/^(?:open|show)\s+(?:power|power\s+menu|power\s+dialog)(?:\.|!)*$/i.test(text)) {
    return { type: "android_action", action: "open_power_dialog" };
  }

  if (/^(?:take|capture)\s+(?:a\s+)?screenshot(?:\.|!)*$/i.test(text)) {
    return { type: "android_action", action: "take_screenshot" };
  }

  if (/^(?:answer|pick\s+up)\s+(?:the\s+)?call(?:\.|!)*$/i.test(text)) {
    return { type: "android_action", action: "answer_call" };
  }

  if (/^(?:end|hang\s*up|disconnect)\s+(?:the\s+)?call(?:\.|!)*$/i.test(text)) {
    return { type: "android_action", action: "end_call" };
  }

  const search = text.match(
    /^(?:search|look\s+up|google)\s+(?:(?:the\s+)?web\s+)?(?:for\s+)?(.+?)(?:\.|!)*$/i
  );
  if (search) {
    return {
      type: "android_action",
      action: "open_url",
      url: `https://www.google.com/search?q=${encodeURIComponent(search[1].trim())}`,
    };
  }

  const tapAt = text.match(
    /^tap\s+at\s+(\d+)\s*,?\s*(\d+)(?:\.|!)*$/i
  );
  if (tapAt) {
    return {
      type: "android_action",
      action: "tap_at",
      x: Number(tapAt[1]),
      y: Number(tapAt[2]),
    };
  }

  const longPressAt = text.match(
    /^long\s+press\s+at\s+(\d+)\s*,?\s*(\d+)(?:\.|!)*$/i
  );
  if (longPressAt) {
    return {
      type: "android_action",
      action: "long_press_at",
      x: Number(longPressAt[1]),
      y: Number(longPressAt[2]),
      durationMs: 650,
    };
  }

  const swipeAt = text.match(
    /^swipe\s+from\s+(\d+)\s*,?\s*(\d+)\s+to\s+(\d+)\s*,?\s*(\d+)(?:\.|!)*$/i
  );
  if (swipeAt) {
    return {
      type: "android_action",
      action: "swipe_at",
      x: Number(swipeAt[1]),
      y: Number(swipeAt[2]),
      x2: Number(swipeAt[3]),
      y2: Number(swipeAt[4]),
      durationMs: 450,
    };
  }

  const click = text.match(
    /^(?:tap|click|press)\s+(.+?)(?:\.|!)*$/i
  );
  if (click && !/^at\s+/i.test(click[1])) {
    return {
      type: "android_action",
      action: "tap",
      target: click[1].trim(),
    };
  }

  const longPress = text.match(
    /^long\s+press\s+(.+?)(?:\.|!)*$/i
  );
  if (longPress) {
    return {
      type: "android_action",
      action: "long_press",
      target: longPress[1].trim(),
    };
  }

  const open = text.match(
    /^open\s+(?:my\s+)?(.+?)(?:\.|!)*$/i
  );
  if (open) {
    const target = open[1].trim();

    if (/^(downloads?|files?|documents?)$/i.test(target)) {
      return {
        type: "android_action",
        action: "open_file",
        target,
      };
    }

    if (/^settings?$/i.test(target)) {
      return {
        type: "android_action",
        action: "open_settings",
      };
    }

    const url = webUrl(target);
    if (
      url &&
      (
        /^https?:\/\//i.test(target) ||
        /^[\w.-]+\.[a-z]{2,}(?:[/:?#]|$)/i.test(target)
      )
    ) {
      return {
        type: "android_action",
        action: "open_url",
        url,
      };
    }

    return {
      type: "android_action",
      action: "open_app",
      target,
    };
  }

  if (/^(?:go\s+)?back(?:\.|!)*$/i.test(text)) {
    return { type: "android_action", action: "go_back" };
  }

  if (/^(?:go\s+)?home(?:\.|!)*$/i.test(text)) {
    return { type: "android_action", action: "go_home" };
  }

  const move = text.match(
    /^(scroll|swipe)\s+(up|down|left|right)(?:\.|!)*$/i
  );
  if (move) {
    return {
      type: "android_action",
      action: move[1].toLowerCase() === "swipe" ? "swipe" : "scroll",
      direction: move[2].toLowerCase() as AndroidCommand["direction"],
    };
  }

  const typeInto = text.match(
    /^(?:type|enter)\s+(.+?)\s+(?:into|in)\s+(.+?)(?:\.|!)*$/i
  );
  if (typeInto) {
    return {
      type: "android_action",
      action: "type_into",
      text: typeInto[1].trim(),
      target: typeInto[2].trim(),
    };
  }

  const type = text.match(
    /^(?:type|enter)\s+(.+?)[.!]?$/i
  );
  if (type) {
    return {
      type: "android_action",
      action: "type_text",
      text: type[1].trim(),
    };
  }

  if (
    /^read\s+(?:what(?:'s| is)\s+on\s+)?(?:my\s+)?screen(?:\.|!)*$/i.test(text)
  ) {
    return {
      type: "android_action",
      action: "read_screen",
    };
  }

  const call = text.match(
    /^(?:call|dial)\s+(.+?)(?:\.|!)*$/i
  );
  if (call) {
    return {
      type: "android_action",
      action: "make_call",
      target: call[1].trim(),
    };
  }

  const sms = text.match(
    /^(?:text|message)\s+(.+?)\s+(?:saying|that)\s+(.+?)(?:\.|!)*$/i
  );
  if (sms) {
    return {
      type: "android_action",
      action: "compose_sms",
      target: sms[1].trim(),
      text: sms[2].trim(),
    };
  }

  return null;
}

export function executeAndroidCommand(
  command: AndroidCommand,
): AndroidResult | null {
  if (!window.NetoNative) {
    return {
      ok: false,
      code: "BRIDGE_UNAVAILABLE",
      message: "Android control is available in the NETO Android app only.",
    };
  }

  try {
    const result = JSON.parse(
      window.NetoNative.execute(JSON.stringify(command)),
    );

    return typeof result?.ok === "boolean" &&
      typeof result?.message === "string"
      ? result
      : {
          ok: false,
          message: "NETO could not complete that Android action.",
        };
  } catch {
    return {
      ok: false,
      message: "NETO could not complete that Android action.",
    };
  }
}

export function getAndroidCapabilities(): AndroidCapabilities | null {
  if (!window.NetoNative?.getCapabilityStatus) return null;

  try {
    const result = JSON.parse(window.NetoNative.getCapabilityStatus());
    return result && typeof result === "object" ? result : null;
  } catch {
    return null;
  }
}
