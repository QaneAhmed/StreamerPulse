import { NextResponse } from "next/server";
import { z } from "zod";
import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";
import { coachSystemPrompt } from "@/lib/ai/prompts";

const AI_COOLDOWN_MS = 15 * 60 * 1000;
let coachAiCooldownUntil = 0;
let coachAiCooldownLogged = false;

function isQuotaOrRateLimitError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const record = error as Record<string, unknown>;
  const statusCode =
    (record as any).statusCode ?? (record as any).status ?? (record as any)?.response?.status;
  if (typeof statusCode === "number" && statusCode === 429) {
    return true;
  }
  const message = typeof record.message === "string" ? record.message.toLowerCase() : "";
  if (message.includes("quota") || message.includes("rate limit")) {
    return true;
  }
  const dataError =
    (record.data && typeof record.data === "object"
      ? (record.data as Record<string, unknown>).error
      : undefined) ?? record.error;
  if (dataError && typeof dataError === "object") {
    const code = (dataError as Record<string, unknown>).code;
    const type = (dataError as Record<string, unknown>).type;
    if (typeof code === "string" && code.toLowerCase().includes("quota")) {
      return true;
    }
    if (typeof type === "string" && type.toLowerCase().includes("quota")) {
      return true;
    }
  }
  return false;
}

const TONE_VALUES = [
  "hype",
  "supportive",
  "humor",
  "informational",
  "question",
  "constructive",
  "critical",
  "sarcastic",
  "toxic",
  "spam",
  "system",
  "neutral",
  "unknown",
] as const;

type ToneValue = (typeof TONE_VALUES)[number];

const ToneEnum = z.enum(TONE_VALUES);

const ALERT_TYPES = [
  "tone_dip",
  "spam_warning",
  "hype_spike",
  "constructive_feedback",
  "viewer_question",
  "momentum_shift",
  "welcome_newcomer",
  "status_update",
] as const;

type AlertType = (typeof ALERT_TYPES)[number];

const AlertTypeEnum = z.enum(ALERT_TYPES);

const MetricsSchema = z
  .object({
    messageRate: z.number().optional(),
    uniqueChatters: z.number().optional(),
    newcomers: z.number().optional(),
    sentiment: z.number().optional(),
    trend: z.number().optional(),
  })
  .partial()
  .default({});

const BaselineSnapshotSchema = z
  .object({
    short: z.number().nullable().optional(),
    long: z.number().nullable().optional(),
    std: z.number().nullable().optional(),
    samples: z.number().nullable().optional(),
    ready: z.boolean().optional(),
  })
  .optional();

const BaselineSchema = z
  .object({
    messageRate: BaselineSnapshotSchema,
    uniqueChatters: BaselineSnapshotSchema,
    newcomers: BaselineSnapshotSchema,
  })
  .partial()
  .optional();

const MessageSchema = z.object({
  id: z.string().optional(),
  author: z.string().default("anon"),
  text: z.string().default(""),
  timestamp: z.number().default(() => Date.now()),
  tone: ToneEnum.optional(),
  toneConfidence: z.number().min(0).max(1).optional(),
});

const HistorySchema = z
  .object({
    previousAlert: z
      .object({
        type: z.string(),
        priority: z.enum(["high", "medium", "low"]),
        timestamp: z.number().optional(),
        message: z.string().optional(),
      })
      .nullable()
      .optional(),
    previousTone: ToneEnum.nullable().optional(),
    secondsSinceLastAlert: z.number().nullable().optional(),
  })
  .optional();

const SessionSchema = z
  .object({
    startedAt: z.number().nullable().optional(),
    durationSeconds: z.number().nullable().optional(),
  })
  .optional();

const RequestSchema = z.object({
  messages: z.array(MessageSchema).max(60),
  metrics: MetricsSchema.optional(),
  history: HistorySchema,
  session: SessionSchema,
  baseline: BaselineSchema,
});

type AlertPriority = "high" | "medium" | "low";

const BASE_ALERT_RESPONSE_LIMIT = 5;
const DEFAULT_ALERT_COOLDOWN_MS = 30_000;
const HIGH_PRIORITY_COOLDOWN_MS = 15_000;
const NEWCOMER_ALERT_COOLDOWN_MS = 3 * 60_000;
const TOXIC_ALERT_WINDOW_MS = 30_000;
const NEGATIVE_ALERT_WINDOW_MS = 20_000;

const priorityWeight = { high: 3, medium: 2, low: 1 } as const;
const alertCooldowns = new Map<string, { timestamp: number; priority: AlertPriority }>();
const MAX_ALERT_RESPONSE_LIMIT = 8;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function surgeZThreshold(uniqueChatters: number, baselineReady: boolean) {
  const base = baselineReady ? 1.2 : 1.6;
  const adjustment = Math.log1p(Math.max(uniqueChatters - 5, 0)) * 0.25;
  return base + adjustment;
}

function surgePercentThreshold(uniqueChatters: number, baselineReady: boolean) {
  const base = baselineReady ? 30 : 45;
  const adjustment = Math.log1p(Math.max(uniqueChatters - 5, 0)) * 8;
  return base + adjustment;
}

function strongSurgeZThreshold(uniqueChatters: number, baselineReady: boolean) {
  return surgeZThreshold(uniqueChatters, baselineReady) + 0.8;
}

function minUniqueForSurge(uniqueChatters: number, baselineReady: boolean) {
  return baselineReady ? 3 : 5;
}

function newcomerRatioThreshold(uniqueChatters: number, baselineReady: boolean) {
  const base = baselineReady ? 0.12 : 0.22;
  const adjustment = Math.log1p(Math.max(uniqueChatters - 5, 0)) * 0.015;
  return clamp(base + adjustment, 0.12, 0.35);
}

function computeDynamicCooldown(baseMs: number, intensity: number | null | undefined) {
  if (!intensity || intensity <= 0) {
    return baseMs;
  }
  const normalized = clamp(intensity, 0.5, 4);
  return Math.max(baseMs / (1 + normalized), baseMs * 0.3);
}

function shouldEmitAlert(
  key: string,
  timestamp: number,
  priority: AlertPriority,
  cooldownMs: number = DEFAULT_ALERT_COOLDOWN_MS
) {
  const existing = alertCooldowns.get(key);
  if (existing) {
    const elapsed = timestamp - existing.timestamp;
    const existingWeight = priorityWeight[existing.priority] ?? 0;
    const nextWeight = priorityWeight[priority] ?? 0;
    if (elapsed < cooldownMs && nextWeight <= existingWeight) {
      return false;
    }
  }
  alertCooldowns.set(key, { timestamp, priority });
  return true;
}

const AiAlertSchema = z.object({
  type: AlertTypeEnum,
  priority: z.enum(["high", "medium", "low"]),
  title: z.string().min(3).max(60),
  message: z.string().min(1).max(110),
  confidence: z.number().min(0).max(1).optional(),
  reasons: z.array(z.string().min(1).max(120)).max(3).optional(),
  linkedMessages: z.array(z.string()).max(5).optional(),
});

type AiAlert = z.infer<typeof AiAlertSchema>;

const POSITIVE_TONES = new Set<ToneValue>(["hype", "supportive", "humor", "constructive"]);
const HYPE_TONES = new Set<ToneValue>(["hype", "supportive"]);
const HUMOR_TONES = new Set<ToneValue>(["humor"]);
const NEGATIVE_TONES = new Set<ToneValue>(["critical", "sarcastic", "toxic"]);
const TOXIC_TONES = new Set<ToneValue>(["toxic"]);
const QUESTION_TONES = new Set<ToneValue>(["question"]);
const SPAM_TONES = new Set<ToneValue>(["spam"]);
const CONSTRUCTIVE_TONES = new Set<ToneValue>(["constructive"]);

const TOXIC_REGEX =
  /(kys|kill yourself|die|uninstall|worthless|garbage|trash|pathetic|awful|hate you|hate u|loser|idiot|dumb|stupid|worst|trashcan|noob|bot|kill it|leave)/i;
const CRITICAL_REGEX =
  /(hate|bad|terrible|trash|cringe|annoying|boring|sucks|never|awful|useless|will never|can't win|lame|weak|bronze|throwing|choke|fail)/i;
const HUMOR_REGEX = /(lul|lol|haha|lmao|rofl|xd|hehe|😂|🤣|lmfao|dead)/i;
const HYPE_REGEX = /(pog|hype|let's go|omg|fire|goat|legend|insane|massive|huge|cracked|clutch|carry|ggs)/i;
const SUPPORT_REGEX =
  /(gg|nice|awesome|love|great|amazing|well played|wp|thanks|thank you|appreciate|proud|good job|ggez|solid|clean)/i;
const QUESTION_REGEX = /(\?|^\s*(who|what|where|when|why|how|can|does|is|are|should)\b)/i;
const CONSTRUCTIVE_REGEX =
  /\b(should|maybe|consider|try|could|recommend|suggest|idea|feedback|tip|advice|perhaps|next time|what if)\b/i;
const SPAM_REGEX =
  /(http(s)?:\/\/|www\.|\b(?:[a-z0-9-]+\.){1,3}(?:com|net|org|gg|xyz|shop|store|info|ru|io|co)\b|discord\.gg|free\s+followers|free\s+viewers|buy\s+(?:viewers|followers|subs)|best\s+(?:viewers|followers)|promo|follow\s+me|remove\s+the\s+space|streamboo)/i;
const SARCASM_REGEX = /\b(sure|yeah right|totally|great job|amazing work|wow just wow|nice play)\b/i;
const SYSTEM_REGEX = /^([!\/][a-z0-9_-]+|\*{2}|\[mod\])/i;

const FRESH_CHATTER_WINDOW_MS = 5 * 60 * 1000;
const RECENT_WINDOW_COUNT = 12;
const AUTHOR_MEMORY_MS = 6 * 60 * 60 * 1000;

const calmAlertMessage = "All Calm: Chat is steady—no notable shifts yet.";

function buildCalmAlert(timestamp: number) {
  return {
    id: `status-all-calm-${timestamp}`,
    message: calmAlertMessage,
    tone: "neutral" as const,
    priority: "low" as const,
    updatedAt: timestamp,
  };
}

const sessionAuthorMemory = new Map<string, number>();

function normalizeAuthor(author: string) {
  return author.trim().toLowerCase();
}

function pruneAuthorMemory(now: number) {
  for (const [key, lastSeen] of sessionAuthorMemory) {
    if (now - lastSeen > AUTHOR_MEMORY_MS) {
      sessionAuthorMemory.delete(key);
    }
  }
}

function hasSeenAuthor(author: string) {
  return sessionAuthorMemory.has(normalizeAuthor(author));
}

function rememberAuthor(author: string, timestamp: number) {
  sessionAuthorMemory.set(normalizeAuthor(author), timestamp);
}

type ClassifiedMessage = z.infer<typeof MessageSchema> & {
  tone: ToneValue;
  confidence: number;
};

function inferToneFromText(text: string): ToneValue {
  const content = text.trim();
  if (!content) {
    return "unknown";
  }

  if (SPAM_REGEX.test(content)) {
    return "spam";
  }
  if (SYSTEM_REGEX.test(content)) {
    return "system";
  }
  if (TOXIC_REGEX.test(content)) {
    return "toxic";
  }
  if (CRITICAL_REGEX.test(content)) {
    return "critical";
  }
  if (SARCASM_REGEX.test(content)) {
    return "sarcastic";
  }
  if (HYPE_REGEX.test(content)) {
    return "hype";
  }
  if (SUPPORT_REGEX.test(content)) {
    return "supportive";
  }
  if (HUMOR_REGEX.test(content)) {
    return "humor";
  }
  if (CONSTRUCTIVE_REGEX.test(content)) {
    return "constructive";
  }
  if (QUESTION_REGEX.test(content) || content.endsWith("?")) {
    return "question";
  }
  if (content.length <= 3) {
    return "informational";
  }
  return "neutral";
}

function resolveTone(message: z.infer<typeof MessageSchema>): ClassifiedMessage {
  const providedTone = message.tone;
  if (providedTone && TONE_VALUES.includes(providedTone)) {
    return {
      ...message,
      tone: providedTone,
      confidence: message.toneConfidence ?? 0.7,
    };
  }

  const inferredTone = inferToneFromText(message.text);
  let confidence = 0.45;

  if (SPAM_TONES.has(inferredTone) || TOXIC_TONES.has(inferredTone)) {
    confidence = 0.75;
  } else if (NEGATIVE_TONES.has(inferredTone) || POSITIVE_TONES.has(inferredTone)) {
    confidence = 0.6;
  } else if (QUESTION_TONES.has(inferredTone)) {
    confidence = 0.55;
  }

  return {
    ...message,
    tone: inferredTone,
    confidence,
  };
}

function truncateMessage(text: string, maxLength = 90) {
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength - 1)}…`;
}

export async function POST(request: Request) {
  let payload: z.infer<typeof RequestSchema>;

  try {
    const json = await request.json();
    payload = RequestSchema.parse(json);
  } catch (error) {
    console.warn("[coach] Invalid payload", error);
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const now = Date.now();
  pruneAuthorMemory(now);

  const orderedMessages = [...payload.messages]
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(-80);

  if (!orderedMessages.length) {
    const timestamp = now;
    return NextResponse.json({
      alerts: [buildCalmAlert(timestamp)],
      ai: null,
      toneSummary: {
        counts: {},
        total: 0,
        recent: {
          positive: 0,
          negative: 0,
          toxic: 0,
        },
        ratios: {
          positive: 0,
          negative: 0,
          toxic: 0,
        },
        latestTone: "unknown",
      },
    });
  }

  const classifiedMessages = orderedMessages.map(resolveTone);
  const toneCounts = classifiedMessages.reduce<Record<ToneValue, number>>((acc, message) => {
    acc[message.tone] = (acc[message.tone] ?? 0) + 1;
    return acc;
  }, {} as Record<ToneValue, number>);

  const totalMessages = classifiedMessages.length;
  const positiveCount = Array.from(POSITIVE_TONES).reduce(
    (acc, tone) => acc + (toneCounts[tone] ?? 0),
    0
  );
  const hypeCount = Array.from(HYPE_TONES).reduce((acc, tone) => acc + (toneCounts[tone] ?? 0), 0);
  const humorCount = Array.from(HUMOR_TONES).reduce((acc, tone) => acc + (toneCounts[tone] ?? 0), 0);
  const constructiveCount = Array.from(CONSTRUCTIVE_TONES).reduce(
    (acc, tone) => acc + (toneCounts[tone] ?? 0),
    0
  );
  const supportiveCount = toneCounts.supportive ?? 0;
  const negativeCount = Array.from(NEGATIVE_TONES).reduce(
    (acc, tone) => acc + (toneCounts[tone] ?? 0),
    0
  );
  const toxicCount = Array.from(TOXIC_TONES).reduce((acc, tone) => acc + (toneCounts[tone] ?? 0), 0);
  const spamCount = Array.from(SPAM_TONES).reduce((acc, tone) => acc + (toneCounts[tone] ?? 0), 0);

  const recentWindow = classifiedMessages.slice(-RECENT_WINDOW_COUNT);
  const recentNegative = recentWindow.filter((message) => NEGATIVE_TONES.has(message.tone)).length;
  const recentToxic = recentWindow.filter((message) => TOXIC_TONES.has(message.tone)).length;
  const recentPositive = recentWindow.filter((message) => POSITIVE_TONES.has(message.tone)).length;
  const latestMessage = classifiedMessages[classifiedMessages.length - 1];
  const latestTone = latestMessage?.tone ?? "unknown";
  const latestByTone = (tones: Iterable<ToneValue>) => {
    const toneSet = new Set<ToneValue>(tones);
    return [...classifiedMessages].reverse().find((message) => toneSet.has(message.tone));
  };
  const latestToxic = latestByTone(TOXIC_TONES);
  const latestNegative = latestByTone(NEGATIVE_TONES);
  const latestPositive = latestByTone(POSITIVE_TONES);

  const metrics = {
    messageRate: Number.isFinite(payload.metrics?.messageRate ?? 0)
      ? payload.metrics?.messageRate ?? 0
      : 0,
    uniqueChatters: Number.isFinite(payload.metrics?.uniqueChatters ?? 0)
      ? payload.metrics?.uniqueChatters ?? 0
      : 0,
    newcomers: Number.isFinite(payload.metrics?.newcomers ?? 0)
      ? payload.metrics?.newcomers ?? 0
      : 0,
    sentiment: Number.isFinite(payload.metrics?.sentiment ?? 0)
      ? payload.metrics?.sentiment ?? 0
      : 0,
    trend: Number.isFinite(payload.metrics?.trend ?? 0)
      ? payload.metrics?.trend ?? 0
      : 0,
  };
  const historyInfo = payload.history ?? null;
  const sessionInfo = payload.session ?? null;
  const baseline = payload.baseline ?? {};

  const messageBaseline = baseline?.messageRate;
  const uniqueBaseline = baseline?.uniqueChatters;
  const newcomersBaseline = baseline?.newcomers;

  const messageRateValue = metrics.messageRate;
  const uniqueChattersValue = metrics.uniqueChatters;
  const newcomersValue = metrics.newcomers;
  const trendValue = metrics.trend;

  const messageBaselineReady = Boolean(
    messageBaseline?.ready &&
      typeof messageBaseline?.long === "number" &&
      messageBaseline.long !== null
  );
  const messageBaselineLong = messageBaselineReady ? messageBaseline!.long! : null;
  const messageBaselineStd =
    messageBaselineReady && typeof messageBaseline?.std === "number"
      ? Math.max(messageBaseline!.std! ?? 0, 0.25)
      : null;
  const messageRateZ =
    messageBaselineReady && messageBaselineStd
      ? (messageRateValue - (messageBaselineLong ?? 0)) / messageBaselineStd
      : null;
  const messageDeltaPercent =
    messageBaselineReady && messageBaselineLong && Math.abs(messageBaselineLong) > 0.1
      ? ((messageRateValue - messageBaselineLong) / Math.abs(messageBaselineLong)) * 100
      : null;

  const uniqueBaselineReady = Boolean(
    uniqueBaseline?.ready &&
      typeof uniqueBaseline?.long === "number" &&
      uniqueBaseline.long !== null
  );
  const uniqueBaselineLong = uniqueBaselineReady ? uniqueBaseline!.long! : null;
  const uniqueBaselineStd =
    uniqueBaselineReady && typeof uniqueBaseline?.std === "number"
      ? Math.max(uniqueBaseline!.std! ?? 0, 0.25)
      : null;
  const uniqueDeltaPercent =
    uniqueBaselineReady && uniqueBaselineLong && Math.abs(uniqueBaselineLong) > 0.1
      ? ((uniqueChattersValue - uniqueBaselineLong) / Math.abs(uniqueBaselineLong)) * 100
      : null;

  const newcomersBaselineReady = Boolean(
    newcomersBaseline?.ready &&
      typeof newcomersBaseline?.long === "number" &&
      newcomersBaseline.long !== null
  );
  const newcomersBaselineLong = newcomersBaselineReady ? newcomersBaseline!.long! : null;
  const newcomersBaselineStd =
    newcomersBaselineReady && typeof newcomersBaseline?.std === "number"
      ? Math.max(newcomersBaseline!.std! ?? 0, 0.25)
      : null;
  const newcomersZ =
    newcomersBaselineReady && newcomersBaselineStd
      ? (newcomersValue - (newcomersBaselineLong ?? 0)) / newcomersBaselineStd
      : null;
  const newcomersDeltaPercent =
    newcomersBaselineReady && newcomersBaselineLong && Math.abs(newcomersBaselineLong) > 0.1
      ? ((newcomersValue - newcomersBaselineLong) / Math.abs(newcomersBaselineLong)) * 100
      : null;
  const newcomerRatio = newcomersValue / Math.max(uniqueChattersValue, 1);
  const newcomerRatioThresholdValue = newcomerRatioThreshold(
    uniqueChattersValue,
    newcomersBaselineReady
  );

  const negativeRatio = totalMessages > 0 ? negativeCount / totalMessages : 0;
  const toxicRatio = totalMessages > 0 ? toxicCount / totalMessages : 0;
  const positiveRatio = totalMessages > 0 ? positiveCount / totalMessages : 0;

  const hasToxic = toxicCount > 0;
  const hasCritical = negativeCount - toxicCount > 0;
  const latestToneIsPositive = POSITIVE_TONES.has(latestTone);
  const positiveMoodDominant =
    metrics.sentiment >= 0.2 &&
    positiveRatio >= Math.max(0.5, negativeRatio * 1.5) &&
    recentNegative === 0 &&
    !hasToxic &&
    !hasCritical;
  const allowPositiveLift =
    latestToneIsPositive ||
    (positiveCount > 0 &&
      !hasToxic &&
      !hasCritical &&
      recentNegative === 0 &&
      !NEGATIVE_TONES.has(latestTone));

  const authorsSeen = new Set<string>();
  const newChatters: string[] = [];
  classifiedMessages.forEach(({ author }) => {
    const key = author.toLowerCase();
    if (!authorsSeen.has(key)) {
      authorsSeen.add(key);
      newChatters.push(author);
    }
  });

  const latestTimestamp = latestMessage?.timestamp ?? Date.now();
  const sessionStart = typeof sessionInfo?.startedAt === "number" ? sessionInfo.startedAt : null;
  const sessionAgeSeconds = sessionStart ? Math.max(0, (latestTimestamp - sessionStart) / 1000) : Infinity;

  const heuristicAlerts: Array<{
    id: string;
    message: string;
    tone: "positive" | "neutral" | "negative";
    priority: "high" | "medium" | "low";
    updatedAt: number;
  }> = [];

  const pushAlert = (
    id: string,
    message: string,
    tone: "positive" | "neutral" | "negative",
    priority: AlertPriority,
    updatedAt: number = latestTimestamp,
    options?: { cooldownKey?: string; cooldownMs?: number }
  ) => {
    const key = options?.cooldownKey ?? id;
    const cooldownMs = options?.cooldownMs ?? DEFAULT_ALERT_COOLDOWN_MS;
    if (!shouldEmitAlert(key, updatedAt, priority, cooldownMs)) {
      return;
    }
    const alertId = `${id}-${updatedAt}`;
    heuristicAlerts.push({ id: alertId, message, tone, priority, updatedAt });
  };

  // New chatter detection
  const latestMessageByAuthor = new Map<string, ClassifiedMessage>();
  [...classifiedMessages]
    .reverse()
    .forEach((message) => {
      const key = message.author.toLowerCase();
      if (!latestMessageByAuthor.has(key)) {
        latestMessageByAuthor.set(key, message);
      }
    });

  const freshNewChatters = Array.from(latestMessageByAuthor.values()).filter((message) => {
    const key = normalizeAuthor(message.author);
    if (hasSeenAuthor(key)) {
      return false;
    }
    return latestTimestamp - message.timestamp <= FRESH_CHATTER_WINDOW_MS;
  });
  if (freshNewChatters.length > 0 && uniqueChattersValue >= 2) {
    const sortedFresh = [...freshNewChatters].sort((a, b) => b.timestamp - a.timestamp);
    const totalFresh = sortedFresh.length;
    const anchor = sortedFresh[0];
    const anchorName = anchor.author;
    const anchorLower = anchorName.toLowerCase();
    const fellowNames = sortedFresh.slice(1, Math.min(totalFresh, 6)).map((item) => item.author);
    const extraCount = Math.max(0, totalFresh - 1 - fellowNames.length);

    let messageText = `Say hi to ${anchorName}!`;
    if (fellowNames.length > 0) {
      messageText += ` Also new: ${fellowNames.join(", ")}`;
      if (extraCount > 0) {
        messageText += ` +${extraCount} more`;
      }
      messageText += ".";
    } else {
      messageText += " They just sent their first message.";
    }

    const newcomerPriority: "high" | "medium" | "low" =
      totalFresh >= 6 ? "high" : totalFresh >= 3 ? "medium" : "low";

    pushAlert(
      `new-chatter-batch-${anchorLower}-${anchor.timestamp}`,
      messageText,
      "positive",
      newcomerPriority,
      anchor.timestamp,
      {
        cooldownKey: `new-chatter:${anchorLower}`,
        cooldownMs: computeDynamicCooldown(
          NEWCOMER_ALERT_COOLDOWN_MS,
          Math.max(newcomersZ ?? 0, newcomerRatio / Math.max(newcomerRatioThresholdValue, 0.01) - 1)
        ),
      }
    );

    sortedFresh.forEach((message) => rememberAuthor(message.author, message.timestamp));
  } else if (
    uniqueChattersValue >= 3 &&
    (newcomersBaselineReady
      ? (newcomersZ ?? 0) >= 1.2 || newcomerRatio >= newcomerRatioThresholdValue
      : newcomerRatio >= 0.3 || newcomersValue >= 5)
  ) {
    const mentioned = newChatters.slice(0, 3).join(", ");
    const newcomerPriority = newcomersBaselineReady
      ? (newcomersZ ?? 0) >= 2 || (newcomersDeltaPercent ?? 0) >= 120
        ? "high"
        : "medium"
      : newcomersValue >= 10
      ? "high"
      : "medium";
    pushAlert(
      "new-chatters",
      mentioned ? `New chatters arriving: ${mentioned}` : "A wave of new chatters just joined.",
      "neutral",
      newcomerPriority,
      latestTimestamp,
      {
        cooldownKey: "new-chatter:batch",
        cooldownMs: computeDynamicCooldown(
          NEWCOMER_ALERT_COOLDOWN_MS,
          Math.max(newcomersZ ?? 0, newcomerRatio / Math.max(newcomerRatioThresholdValue, 0.01) - 1)
        ),
      }
    );
  } else if (newChatters.length > 0 && uniqueChattersValue >= 2) {
    const name = newChatters[0];
    const key = name.toLowerCase();
    pushAlert(
      `new-chatter-rolling-${key}-${latestTimestamp}`,
      `${name} just hopped into chat for the first time.`,
      "positive",
      "low",
      latestTimestamp,
      {
        cooldownKey: `new-chatter:${key}`,
        cooldownMs: computeDynamicCooldown(
          NEWCOMER_ALERT_COOLDOWN_MS,
          Math.max(newcomersZ ?? 0, newcomerRatio / Math.max(newcomerRatioThresholdValue, 0.01) - 1)
        ),
      }
    );
    rememberAuthor(name, latestTimestamp);
  }

  const returningBounce = authorsSeen.size >= 15 && (
    uniqueBaselineReady
      ? (uniqueDeltaPercent ?? 0) >= -15
      : uniqueChattersValue - authorsSeen.size >= 5
  );
  if (returningBounce) {
    pushAlert(
      "returning-chatters",
      "Lots of familiar names are active—shout them out.",
      "neutral",
      "low",
      latestTimestamp,
      {
        cooldownKey: "returning-chatters",
        cooldownMs: computeDynamicCooldown(90_000, Math.abs(uniqueDeltaPercent ?? 0) / 25),
      }
    );
  }

  if (uniqueChattersValue >= 200) {
    const parts: string[] = [];
    if (messageBaselineReady && typeof messageDeltaPercent === "number") {
      parts.push(`${Math.round(messageDeltaPercent)}% vs typical pace`);
    }
    if (newcomersValue > 0) {
      parts.push(`${newcomersValue} newcomers`);
    }
    if (typeof metrics.sentiment === "number") {
      parts.push(`sentiment ${(metrics.sentiment * 100).toFixed(0)}%`);
    }
    const summaryMessage = parts.length > 0
      ? `Pulse summary: ${parts.join(" · ")}`
      : "Pulse summary: chat steady.";

    pushAlert(
      "audience-summary",
      summaryMessage,
      "neutral",
      "medium",
      latestTimestamp,
      {
        cooldownKey: "audience-summary",
        cooldownMs: computeDynamicCooldown(45_000, Math.max(messageRateZ ?? 0, newcomerRatio)),
      }
    );
  }

  const minUniqueRequired = minUniqueForSurge(uniqueChattersValue, messageBaselineReady);
  const dynamicSurgeZ = surgeZThreshold(uniqueChattersValue, messageBaselineReady);
  const dynamicSurgePercent = surgePercentThreshold(uniqueChattersValue, messageBaselineReady);

  const surgeThresholdMet =
    sessionAgeSeconds >= 30 &&
    uniqueChattersValue >= minUniqueRequired &&
    (messageBaselineReady
      ? (messageRateZ ?? 0) >= dynamicSurgeZ || (messageDeltaPercent ?? 0) >= dynamicSurgePercent
      : messageRateValue >= 20 || trendValue >= 15);

  if (surgeThresholdMet) {
    const surgeIsNegative =
      hasToxic ||
      hasCritical ||
      recentNegative >= 1 ||
      NEGATIVE_TONES.has(latestTone);
    const strongSurge =
      messageBaselineReady
        ? (messageRateZ ?? 0) >= strongSurgeZThreshold(uniqueChattersValue, messageBaselineReady) ||
          (messageDeltaPercent ?? 0) >= dynamicSurgePercent * 2
        : messageRateValue >= 60 || trendValue >= 35;
    const surgeIntensity = Math.max(
      messageRateZ ?? 0,
      (messageDeltaPercent ?? 0) / Math.max(dynamicSurgePercent, 1)
    );
    if (surgeIsNegative) {
      pushAlert(
        "velocity-surge-negative",
        "Chat is spiking but the mood is sour—acknowledge the frustration.",
        "negative",
        strongSurge || recentNegative >= 4 ? "high" : "medium",
        latestTimestamp,
        {
          cooldownKey: "velocity-surge-negative",
          cooldownMs: computeDynamicCooldown(
            strongSurge ? HIGH_PRIORITY_COOLDOWN_MS : DEFAULT_ALERT_COOLDOWN_MS,
            surgeIntensity
          ),
        }
      );
    } else if (allowPositiveLift) {
      pushAlert(
        "velocity-surge-positive",
        "Chat is surging—lean into the moment!",
        "positive",
        strongSurge ? "high" : "medium",
        latestTimestamp,
        {
          cooldownKey: "velocity-surge-positive",
          cooldownMs: computeDynamicCooldown(
            strongSurge ? HIGH_PRIORITY_COOLDOWN_MS : DEFAULT_ALERT_COOLDOWN_MS,
            surgeIntensity
          ),
        }
      );
    } else {
      pushAlert(
        "velocity-surge-monitor",
        "Chat is heating up—watch the tone before diving in.",
        "neutral",
        "medium",
        latestTimestamp,
        {
          cooldownKey: "velocity-surge-monitor",
          cooldownMs: computeDynamicCooldown(DEFAULT_ALERT_COOLDOWN_MS, surgeIntensity / 2),
        }
      );
    }
  }

  const positiveEligible =
    sessionAgeSeconds >= 30 &&
    uniqueChattersValue >= 3 &&
    uniqueChattersValue < 200 &&
    (messageBaselineReady ? (messageRateZ ?? 0) >= 0.8 : messageRateValue >= 10);

  const latestHype = latestByTone(HYPE_TONES);
  if (positiveEligible && allowPositiveLift && hypeCount >= 1 && latestHype) {
    pushAlert(
      `chat-hype-${latestHype.timestamp}`,
      "Chat is hyped—amplify the momentum!",
      "positive",
      hypeCount >= 3 ? "high" : "medium",
      latestHype.timestamp
    );
  }

  const latestHumor = latestByTone(HUMOR_TONES);
  if (positiveEligible && allowPositiveLift && humorCount >= 1 && latestHumor) {
    pushAlert(
      `chat-laughter-${latestHumor.timestamp}`,
      "Chat is laughing—lean into the bit!",
      "positive",
      humorCount >= 3 ? "high" : "medium",
      latestHumor.timestamp
    );
  }

  const latestSupportive = latestByTone(["supportive"]);
  if (positiveEligible && allowPositiveLift && supportiveCount >= 1 && latestSupportive) {
    pushAlert(
      `chat-support-${latestSupportive.timestamp}`,
      "Viewers are showing love—acknowledge them!",
      "positive",
      supportiveCount >= 3 ? "medium" : "low",
      latestSupportive.timestamp
    );
  }

  if (
    positiveEligible &&
    constructiveCount >= 1 &&
    (!hasToxic || constructiveCount > toxicCount)
  ) {
    const latestConstructive = latestByTone(CONSTRUCTIVE_TONES);
    pushAlert(
      "constructive-feedback",
      "Chat is offering suggestions—acknowledge the feedback.",
      "neutral",
      constructiveCount >= 3 ? "medium" : "low",
      latestConstructive?.timestamp ?? latestTimestamp
    );
  }

  // Question alerts are intentionally suppressed in this beta build because we
  // cannot yet detect whether the streamer has already acknowledged the
  // question. Surfacing them without that context led to noisy reminders, so we
  // skip emitting them for now.

  if (spamCount >= 1) {
    pushAlert(
      "spam-warning",
      spamCount >= 3 ? "Spam surge—moderators should clean chat." : "Spam is popping up—keep an eye on chat.",
      "negative",
      spamCount >= 3 ? "high" : "medium"
    );
  }

  const latestToxicAge = latestToxic ? latestTimestamp - latestToxic.timestamp : Infinity;
  const latestNegativeAge = latestNegative ? latestTimestamp - latestNegative.timestamp : Infinity;

  if (hasToxic && latestToxicAge <= TOXIC_ALERT_WINDOW_MS) {
    const severe = toxicCount >= 2 || recentToxic >= 2 || metrics.sentiment <= -0.2;
    const timestamp = latestToxic?.timestamp ?? latestTimestamp;
    pushAlert(
      "tone-dip",
      severe
        ? "Chat is turning hostile—step in quickly."
        : "Toxic language detected—reset the tone fast.",
      "negative",
      severe ? "high" : "medium",
      timestamp,
      { cooldownKey: "tone-dip", cooldownMs: severe ? HIGH_PRIORITY_COOLDOWN_MS : 60_000 }
    );
  } else if (
    !positiveMoodDominant &&
    (hasCritical ||
      negativeRatio >= 0.05 ||
      metrics.sentiment <= -0.1 ||
      recentNegative >= 1 ||
      NEGATIVE_TONES.has(latestTone))
  ) {
    if (latestNegativeAge <= NEGATIVE_ALERT_WINDOW_MS) {
      const toneDipPriority: "high" | "medium" =
        metrics.sentiment <= -0.2 || negativeRatio >= 0.15 || recentNegative >= 3 ? "high" : "medium";
      const timestamp = latestNegative?.timestamp ?? latestTimestamp;
      pushAlert(
        "tone-dip",
        "Mood dipped—address concerns before they spread.",
        "negative",
        toneDipPriority,
        timestamp,
        { cooldownKey: "tone-dip", cooldownMs: toneDipPriority === "high" ? HIGH_PRIORITY_COOLDOWN_MS : 60_000 }
      );
    }
  } else if (
    messageBaselineReady
      ? (messageRateZ ?? 0) <= -1.4 || (messageDeltaPercent ?? 0) <= -35
      : trendValue <= -20 && messageRateValue <= 12
  ) {
    pushAlert(
      "momentum-drop",
      "Momentum is cooling—try a new prompt.",
      "neutral",
      "medium",
      latestTimestamp,
      { cooldownKey: "momentum-drop", cooldownMs: 60_000 }
    );
  }

  const apiKey = process.env.VERCEL_AI_API_KEY || process.env.OPENAI_API_KEY;
  let aiAlertResult: AiAlert | null = null;

  if (apiKey) {
    const now = Date.now();
    if (coachAiCooldownUntil && now >= coachAiCooldownUntil) {
      coachAiCooldownUntil = 0;
      coachAiCooldownLogged = false;
      console.info("[coach] Resuming AI-assisted alerts after cooldown.");
    }

    if (coachAiCooldownUntil && now < coachAiCooldownUntil) {
      if (!coachAiCooldownLogged) {
        const remainingMinutes = Math.ceil((coachAiCooldownUntil - now) / 60000);
        console.warn(
          `[coach] Skipping OpenAI alert generation for approximately ${remainingMinutes} minute${
            remainingMinutes === 1 ? "" : "s"
          } (cooldown).`
        );
        coachAiCooldownLogged = true;
      }
    } else {
      try {
        const openai = createOpenAI({ apiKey });
        const windowPayload = {
          messages: classifiedMessages.slice(-40).map((message, index) => ({
            id: message.id ?? `msg-${index}-${message.timestamp}`,
            author: message.author,
            text: message.text,
            timestamp: message.timestamp,
            tone: message.tone,
            toneConfidence: message.confidence ?? null,
          })),
          metrics: {
            messageRate: messageRateValue,
            uniqueChatters: uniqueChattersValue,
            newcomers: freshNewChatters.length,
            sentiment: metrics.sentiment,
            trend: metrics.trend,
            spamCandidates: toneCounts.spam ?? 0,
            hypeCandidates: hypeCount,
          },
          history: {
            previousAlert: historyInfo?.previousAlert ?? null,
            previousTone: historyInfo?.previousTone ?? null,
            secondsSinceLastAlert: historyInfo?.secondsSinceLastAlert ?? null,
          },
          session: {
            startedAt: sessionInfo?.startedAt ?? null,
            durationSeconds: sessionInfo?.durationSeconds ?? null,
          },
        };

        const response = await generateText({
          model: openai("gpt-4o-mini"),
          system: coachSystemPrompt.trim(),
          prompt:
            JSON.stringify({ window: windowPayload }, null, 2) +
            "\n\nRespond ONLY with valid JSON matching the schema described in the system prompt.",
        });

        const raw = response.text.trim();
        try {
          const parsed = JSON.parse(raw);
          const validated = AiAlertSchema.parse(parsed);
          aiAlertResult = validated;
        } catch (error) {
          console.warn("[coach] Failed to parse AI alert", error, raw);
        }
      } catch (error) {
        if (isQuotaOrRateLimitError(error)) {
          coachAiCooldownUntil = Date.now() + AI_COOLDOWN_MS;
          coachAiCooldownLogged = false;
          console.warn(
            `[coach] OpenAI quota exceeded. Pausing AI alert generation for ${AI_COOLDOWN_MS / 60000} minutes.`
          );
        } else {
          console.warn("[coach] Failed to generate AI alert", error);
        }
      }
    }
  }

  if (aiAlertResult?.type === "viewer_question") {
    aiAlertResult = null;
  }
  if (
    aiAlertResult?.type === "tone_dip" &&
    latestToxicAge > TOXIC_ALERT_WINDOW_MS &&
    latestNegativeAge > NEGATIVE_ALERT_WINDOW_MS
  ) {
    aiAlertResult = null;
  }

  classifiedMessages.forEach((message) => rememberAuthor(message.author, message.timestamp));

  const toneFromAlertType = (type: AlertType): "positive" | "neutral" | "negative" => {
    switch (type) {
      case "hype_spike":
      case "welcome_newcomer":
        return "positive";
      case "tone_dip":
      case "spam_warning":
        return "negative";
      default:
        return "neutral";
    }
  };

  const heuristicSorted = heuristicAlerts
    .slice()
    .sort((a, b) => {
      const timeDelta = b.updatedAt - a.updatedAt;
      if (timeDelta !== 0) {
        return timeDelta;
      }
      return priorityWeight[b.priority] - priorityWeight[a.priority];
    });

  let fallbackBase: string | null = null;

  if (!aiAlertResult && heuristicSorted.length > 0) {
    const primary = heuristicSorted[0];
    const inferredType = (() => {
      if (primary.id.startsWith("spam-warning")) return "spam_warning";
      if (primary.id.startsWith("tone-dip")) return "tone_dip";
      if (primary.id.startsWith("velocity-surge-positive")) return "hype_spike";
      if (primary.id.startsWith("velocity-surge-negative")) return "tone_dip";
      if (primary.id.startsWith("velocity-surge-monitor")) return "momentum_shift";
      if (primary.id.startsWith("chat-hype") || primary.id.startsWith("chat-laughter") || primary.id.startsWith("chat-support")) {
        return "hype_spike";
      }
      if (primary.id.startsWith("constructive-feedback")) return "constructive_feedback";
      if (primary.id.startsWith("momentum-drop")) return "momentum_shift";
      if (primary.id.startsWith("new-chatter")) return "welcome_newcomer";
      if (primary.id.startsWith("returning-chatters")) return "status_update";
      return "status_update";
    })() as AlertType;

    aiAlertResult = {
      type: inferredType,
      priority: primary.priority,
      title: primary.message.length > 60 ? primary.message.slice(0, 57) + "…" : primary.message,
      message: primary.message,
      confidence: 0.6,
      reasons: [],
      linkedMessages: [],
    };

    const lastDash = primary.id.lastIndexOf("-");
    fallbackBase = lastDash > 0 ? primary.id.slice(0, lastDash) : primary.id;
  }

  const finalAlerts: typeof heuristicAlerts = [];
  const heuristicMessages = new Set(heuristicSorted.map((alert) => alert.message));

  if (aiAlertResult && heuristicMessages.has(aiAlertResult.message)) {
    aiAlertResult = null;
  }

  if (aiAlertResult) {
    const aiCooldownKey = `ai:${aiAlertResult.type}`;
    const aiCooldownMs = aiAlertResult.priority === "high" ? HIGH_PRIORITY_COOLDOWN_MS : 45_000;
    if (shouldEmitAlert(aiCooldownKey, latestTimestamp, aiAlertResult.priority, aiCooldownMs)) {
      const aiCard = {
        id: `ai-${aiAlertResult.type}-${latestTimestamp}`,
        message: (aiAlertResult.title
          ? `${aiAlertResult.title}: ${aiAlertResult.message}`
          : aiAlertResult.message
        ).slice(0, 140),
        tone: toneFromAlertType(aiAlertResult.type),
        priority: aiAlertResult.priority,
        updatedAt: latestTimestamp,
      } as const;
      finalAlerts.push(aiCard);
    }
  }

  const deduped: typeof heuristicAlerts = [];
  const seenBases = new Set<string>();
  if (fallbackBase) {
    seenBases.add(fallbackBase);
  }

  const considerAlert = (alert: typeof heuristicAlerts[number]) => {
    const baseIdIndex = alert.id.lastIndexOf("-");
    const baseId = baseIdIndex > 0 ? alert.id.slice(0, baseIdIndex) : alert.id;
    if (seenBases.has(baseId)) {
      return;
    }
    seenBases.add(baseId);
    deduped.push(alert);
  };

  for (const alert of heuristicSorted) {
    considerAlert(alert);
  }

  const combinedAlerts = [...finalAlerts, ...deduped]
    .filter((alert, index, arr) => arr.findIndex((a) => a.id === alert.id) === index)
    .sort((a, b) => {
      const timeDelta = b.updatedAt - a.updatedAt;
      if (timeDelta !== 0) {
        return timeDelta;
      }
      return priorityWeight[b.priority] - priorityWeight[a.priority];
    });

  const seenMessages = new Set<string>();
  const uniqueAlerts = combinedAlerts.filter((alert) => {
    const normalized = `${alert.tone}:${alert.priority}:${alert.message.trim().toLowerCase()}`;
    if (seenMessages.has(normalized)) {
      return false;
    }
    seenMessages.add(normalized);
    return true;
  });

  const alertBudget = Math.max(
    3,
    Math.min(
      MAX_ALERT_RESPONSE_LIMIT,
      BASE_ALERT_RESPONSE_LIMIT + Math.floor(Math.log2(Math.max(uniqueChattersValue, 1)))
    )
  );

  const limitedAlerts = uniqueAlerts.slice(0, alertBudget);

  const shouldEmitCalm =
    limitedAlerts.length === 0 &&
    messageRateValue <= 0 &&
    uniqueChattersValue <= 0 &&
    newcomersValue <= 0 &&
    sessionAgeSeconds > 90;

  let alertsResult = limitedAlerts;
  if (shouldEmitCalm) {
    if (shouldEmitAlert("calm", latestTimestamp, "low", 60_000)) {
      alertsResult = [buildCalmAlert(latestTimestamp)];
    }
  }

  return NextResponse.json({
    alerts: alertsResult,
    ai: aiAlertResult,
    toneSummary: {
      counts: toneCounts,
      total: totalMessages,
      recent: {
        positive: recentPositive,
        negative: recentNegative,
        toxic: recentToxic,
      },
      ratios: {
        positive: Number.isFinite(positiveRatio) ? Number(positiveRatio.toFixed(3)) : 0,
        negative: Number.isFinite(negativeRatio) ? Number(negativeRatio.toFixed(3)) : 0,
        toxic: Number.isFinite(toxicRatio) ? Number(toxicRatio.toFixed(3)) : 0,
      },
      latestTone,
    },
  });
}
