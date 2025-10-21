import { createOpenAI } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";

export const chatToneCategories = [
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
  "unknown",
] as const;

export type ChatTone = (typeof chatToneCategories)[number];

const ChatToneSchema = z.object({
  tone: z.enum(chatToneCategories),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .default(0.5),
  rationale: z.string().default(""),
});

export type ChatToneResult = z.infer<typeof ChatToneSchema>;

const positiveRegex = /\b(gg|nice|awesome|love|great|amazing|thanks|thank you|appreciate|well played|wp|so good|cool)\b/i;
const hypeRegex = /\b(pog|insane|let's go|hype|massive|huge|fire|cracked|goat|legend|unstoppable|carry|clutch)\b/i;
const humorRegex = /\b(lol|lul|haha|lmao|rofl|xd|hehe|😂|🤣|lmao|joke|funny|dead|i'm dying|i am dying)\b/i;
const toxicRegex =
  /\b(kys|die|trash|sucks|hate|stupid|idiot|worst|loser|bot|pathetic|garbage|terrible|awful|kill yourself|hate you|hate u|noob)\b/i;
const criticalRegex =
  /\b(bad|boring|cringe|annoying|lame|trash|terrible|hate|never|awful|useless|slow|weak|bronze|fail|sad|disappointing|frustrating)\b/i;
const spamRegex =
  /(http(s)?:\/\/|www\.|\b(?:[a-z0-9-]+\.){1,3}(?:com|net|org|gg|xyz|shop|store|info|ru|io|co)\b|\bfree\b.*\b(followers?|viewers?|subs?)\b|\bbuy\b.*\b(followers?|viewers?|subs?)\b|\bpromo\b|\bfollow back\b|\bremove the space\b|\bstreamboo\b|\bbest viewers\b)/i;
const spamHandleRegex = /@[a-z0-9]{6,}/i;
const constructiveRegex =
  /\b(should|maybe|consider|try|could|recommend|suggest|idea|feedback|tip|advice|perhaps|what if|swap|switch|change|adjust|improve)\b/i;
const sarcasticRegex = /\b(sure|yeah right|totally|as if|wow just wow|nice job|great|amazing)\b/i;

const AI_COOLDOWN_MS = 15 * 60 * 1000;
let chatToneAiCooldownUntil = 0;
let chatToneAiCooldownLogged = false;
let chatToneAiResumeLogged = false;

function isQuotaOrRateLimitError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const maybeAny = error as Record<string, unknown>;
  const statusCode =
    (maybeAny as any).statusCode ?? (maybeAny as any).status ?? (maybeAny as any)?.response?.status;
  if (typeof statusCode === "number" && statusCode === 429) {
    return true;
  }

  const message = typeof maybeAny.message === "string" ? maybeAny.message.toLowerCase() : "";
  if (message.includes("quota") || message.includes("rate limit")) {
    return true;
  }

  const dataError =
    (maybeAny.data && typeof maybeAny.data === "object"
      ? (maybeAny.data as Record<string, unknown>).error
      : undefined) ?? maybeAny.error;

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

function heuristicTone(text: string): ChatToneResult {
  const trimmed = text.trim();
  if (!trimmed) {
    return { tone: "unknown", confidence: 0, rationale: "Empty message" };
  }

  if (spamRegex.test(trimmed) || spamHandleRegex.test(trimmed)) {
    return { tone: "spam", confidence: 0.82, rationale: "Matches spam-like pattern" };
  }

  if (toxicRegex.test(trimmed)) {
    return { tone: "toxic", confidence: 0.75, rationale: "Matches toxic language pattern" };
  }

  if (criticalRegex.test(trimmed)) {
    return { tone: "critical", confidence: 0.65, rationale: "Matches critical language pattern" };
  }

  if (constructiveRegex.test(trimmed)) {
    return { tone: "constructive", confidence: 0.6, rationale: "Contains constructive feedback" };
  }

  if (hypeRegex.test(trimmed)) {
    return { tone: "hype", confidence: 0.65, rationale: "Matches hype language" };
  }

  if (positiveRegex.test(trimmed)) {
    return { tone: "supportive", confidence: 0.6, rationale: "Contains supportive language" };
  }

  if (humorRegex.test(trimmed)) {
    return { tone: "humor", confidence: 0.55, rationale: "Contains laughter markers" };
  }

  if (sarcasticRegex.test(trimmed)) {
    return { tone: "sarcastic", confidence: 0.45, rationale: "Possible sarcasm keywords" };
  }

  if (trimmed.trim().endsWith("?")) {
    return { tone: "question", confidence: 0.5, rationale: "Ends with a question mark" };
  }

  if (trimmed.length < 5) {
    return { tone: "informational", confidence: 0.3, rationale: "Very short/ambiguous message" };
  }

  return { tone: "unknown", confidence: 0.2, rationale: "No strong tone detected" };
}

export async function classifyChatTone(
  message: string,
  options: { author?: string; recentMessages?: string[] } = {}
): Promise<ChatToneResult> {
  const heuristic = heuristicTone(message);
  const trimmed = message.trim();
  if (!trimmed) {
    return heuristic;
  }

  const normalized = trimmed.toLowerCase();
  const recentMatches =
    options.recentMessages?.filter(
      (recent) => recent.trim().toLowerCase() === normalized
    ).length ?? 0;

  if (recentMatches >= 2) {
    return { tone: "spam", confidence: 0.8, rationale: "Repeated identical message" };
  }

  if (heuristic.tone === "spam" && heuristic.confidence >= 0.75) {
    return heuristic;
  }

  const apiKey = process.env.VERCEL_AI_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return heuristic;
  }

  const now = Date.now();
  if (chatToneAiCooldownUntil && now >= chatToneAiCooldownUntil) {
    chatToneAiCooldownUntil = 0;
    chatToneAiCooldownLogged = false;
    chatToneAiResumeLogged = false;
    console.info("[chat-tone] Resuming OpenAI-assisted tone classification after cooldown.");
  }

  if (chatToneAiCooldownUntil && now < chatToneAiCooldownUntil) {
    if (!chatToneAiCooldownLogged) {
      const remainingMinutes = Math.ceil((chatToneAiCooldownUntil - now) / 60000);
      console.warn(
        `[chat-tone] OpenAI quota hit; using heuristics for approximately ${remainingMinutes} minute${
          remainingMinutes === 1 ? "" : "s"
        }.`
      );
      chatToneAiCooldownLogged = true;
    }
    return heuristic;
  }

  try {
    const openai = createOpenAI({ apiKey });
    const recentSnippet =
      options.recentMessages && options.recentMessages.length > 0
        ? options.recentMessages
            .slice(-6)
            .map((entry) => entry.trim())
            .filter(Boolean)
            .join("\n")
        : null;
    const systemPrompt = `You label Twitch chat messages for a streamer-facing dashboard.
Keep it brief and pick the single best category.
Categories:
- hype: energetic hype, celebration, cheering
- supportive: encouragement, gratitude, friendly chatter
- humor: jokes, playful banter, laughter
- informational: factual statements, bookkeeping, schedule updates
- question: a question or help request
- constructive: respectful suggestions or feedback with actionable tone
- critical: negative sentiment without slurs or harassment
- sarcastic: dry or ironic comments with unclear intent
- toxic: harassment, slurs, bullying, hate, threats
- spam: copy-pasted promos, obvious spam links, attention-begging blasts
- system: bot-like commands, moderator notices
- unknown: anything that doesn't fit elsewhere

Return tone plus a short rationale.`;

    const { object } = await generateObject({
      model: openai("gpt-4.1-mini"),
      system: systemPrompt,
      prompt: [
        recentSnippet ? `Recent context:\n${recentSnippet}\n` : "",
        `Message from ${options.author ?? "viewer"}:\n${trimmed}\n`,
        "Respond with tone, confidence (0-1), and rationale (<=50 chars).",
      ]
        .filter(Boolean)
        .join("\n"),
      schema: ChatToneSchema,
    });

    if (chatToneAiCooldownUntil) {
      chatToneAiCooldownUntil = 0;
      chatToneAiCooldownLogged = false;
      if (!chatToneAiResumeLogged) {
        console.info("[chat-tone] OpenAI quota recovered; tone classification re-enabled.");
        chatToneAiResumeLogged = true;
      }
    }

    if (!object?.tone) {
      return heuristic;
    }

    return {
      tone: object.tone,
      confidence: object.confidence ?? 0.7,
      rationale: object.rationale ?? "",
    };
  } catch (error) {
    console.warn("[chat-tone] Failed to classify chat tone", error);
    if (isQuotaOrRateLimitError(error)) {
      chatToneAiCooldownUntil = Date.now() + AI_COOLDOWN_MS;
      chatToneAiCooldownLogged = false;
      chatToneAiResumeLogged = false;
      console.warn(
        `[chat-tone] OpenAI quota exceeded. Falling back to heuristics for the next ${AI_COOLDOWN_MS / 60000} minutes.`
      );
    }
    return heuristic;
  }
}
