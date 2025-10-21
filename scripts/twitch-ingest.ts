#!/usr/bin/env tsx

import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });
loadEnv();
import { createHash, randomUUID } from "crypto";
import { generateObject } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";
import tmi from "tmi.js";
import Sentiment from "sentiment";
import { ConvexHttpClient } from "convex/browser";
import type { Id } from "../convex/_generated/dataModel";
import {
  buildMoodAnalysisUserPrompt,
  moodAnalysisSystemPrompt,
  type MoodPromptMessage,
  type MoodAnalysisContext,
} from "../src/lib/ai/prompts";
import {
  classifyChatTone,
  type ChatTone,
  type ChatToneResult,
} from "../src/lib/ai/chat-tone";

type TokenRow = {
  name: string;
  count: number;
};

type EventItem = {
  id: string;
  title: string;
  detail: string;
  timestamp: number;
};

type ChatMessagePayload = {
  id: string;
  author: string;
  text: string;
  timestamp: number;
  tone: ChatTone;
  toneConfidence: number;
  toneRationale?: string;
};

type BaselineSnapshot = {
  short: number | null;
  long: number | null;
  std: number | null;
  samples: number;
  ready: boolean;
};

type AggregatedSnapshot = {
  messageRate: number;
  trendPercent: number;
  sentiment: number;
  uniqueChatters: number;
  newcomers: number;
  topTokens: TokenRow[];
  topEmotes: TokenRow[];
  event?: EventItem;
  baseline: {
    messageRate: BaselineSnapshot;
    uniqueChatters: BaselineSnapshot;
    newcomers: BaselineSnapshot;
  };
};

type MessageRecord = {
  id: string;
  timestamp: number;
  authorHash: string;
  authorDisplay?: string;
  tokens: string[];
  emotes: string[];
  sentiment: number;
  tone: ChatTone;
  toneConfidence: number;
};

const GLOBAL_TWITCH_EMOTES = new Set(
  [
    ":)", ":(", ":D", ":O", ":P", ":Z", ":\\", ":|", ":/", ":o", ":p", ":z", ">(", ";)", "<3",
    "4Head", "8-)", "8-)", "AmbessaLove", "ANELE", "AndalusianCrush", "AnotherRecord", "ArgieB8",
    "ArsonNoSexy", "AsexualPride", "AsianGlow", "B)", "B-)", "BCWarrior", "BF6Hype", "BOP",
    "BabyRage", "BangbooBounce", "BatChest", "BegWan", "BigBrother", "BigPhish", "BigSad",
    "BisexualPride", "BlackLivesMatter", "BlargNaut", "BloodTrail", "BrainSlug", "BratChat",
    "BrokeBack", "BuddhaBar", "CaitThinking", "CaitlynS", "CarlSmile", "ChefFrank", "ChewyYAY",
    "Cinheimer", "CoolCat", "CoolStoryBob", "CorgiDerp", "CrreamAwk", "CurseLit", "DAESuppy",
    "DBstyle", "DansGame", "DarkKnight", "DarkMode", "DarthJarJar", "DatSheffy", "DendiFace",
    "DinoDance", "DogFace", "DoritosChip", "DxCat", "EarthDay", "EkkoChest", "EleGiggle",
    "EntropyWins", "ExtraLife", "FBBlock", "FBCatch", "FBChallenge", "FBPass", "FBPenalty",
    "FBRun", "FBSpiral", "FBtouchdown", "FC26GOOOAL", "FUNgineer", "FaZe", "FailFish",
    "FallCry", "FallHalp", "FallWinning", "FamilyMan", "FeelsVi", "FeverFighter", "FlawlessVictory",
    "FootBall", "FootGoal", "FootYellow", "ForSigmar", "FrankerZ", "FreakinStinkin", "FutureMan",
    "GRASSLORD", "GayPride", "GenderFluidPride", "Getcamped", "GingerPower", "GivePLZ", "GlitchCat",
    "GlitchLit", "GlitchNRG", "GoatEmotey", "GoldPLZ", "GrammarKing", "HSCheers", "HSWP",
    "HarleyWink", "HassaanChop", "HeyGuys", "HolidayCookie", "HolidayLog", "HolidayPresent",
    "HolidaySanta", "HolidayTree", "HotPokket", "HungryPaimon", "ImTyping", "IntersexPride",
    "InuyoFace", "ItsBoshyTime", "JKanStyle", "Jebaited", "Jebasted", "JinxLUL", "JonCarnage",
    "KAPOW", "KEKHeim", "Kappa", "KappaClaus", "KappaPride", "KappaRoss", "KappaWealth", "Kappu",
    "Keepo", "KevinTurtle", "KingWorldCup", "Kippa", "KomodoHype", "KonCha", "Kreygasm", "LUL",
    "LaundryBasket", "Lechonk", "LesbianPride", "LionOfYara", "MVGame", "Mafiathon3", "Mau5",
    "MaxLOL", "McDZombieHamburglar", "MechaRobot", "MegaphoneZ", "MercyWing1", "MercyWing2",
    "MikeHogu", "MingLee", "ModLove", "MorphinTime", "MrDestructoid", "MyAvatar", "NRWylder",
    "NewRecord", "NiceTry", "NinjaGrumpy", "NomNom", "NonbinaryPride", "NotATK", "NotLikeThis",
    "O.O", "O.o", "OSFrog", "O_O", "O_o", "OhMyDog", "OneHand", "OpieOP", "OptimizePrime",
    "PJSalt", "PJSugar", "PMSTwin", "PRChase", "PanicVis", "PansexualPride", "PartyHat",
    "PartyTime", "PeoplesChamp", "PermaSmug", "PewPewPew", "PicoMause", "PikaRamen", "PinkMercy",
    "PipeHype", "PixelBob", "PizzaTime", "PogBones", "PogChamp", "Poooound", "PopCorn", "PopGhost",
    "PopNemo", "PoroSad", "PotFriend", "PowerUpL", "PowerUpR", "PraiseIt", "PrimeMe", "PunOko",
    "PunchTrees", "R)", "R-)", "RaccAttack", "RalpherZ", "RedCoat", "ResidentSleeper", "RitzMitz",
    "RlyTho", "RuleFive", "RyuChamp", "SMOrc", "SSSsss", "SUBprise", "SUBtember", "SabaPing",
    "SeemsGood", "SeriousSloth", "ShadyLulu", "ShazBotstix", "Shush", "SingsMic", "SingsNote",
    "SmoocherZ", "SnakeInBox", "SoBayed", "SoonerLater", "Squid1", "Squid2", "Squid3", "Squid4",
    "StinkyCheese", "StinkyGlitch", "StoneLightning", "StrawBeary", "StreamerU", "SuperVinlin",
    "SwiftRage", "TBAngel", "TF2John", "TPFufun", "TPcrunchyroll", "TTours", "TWITH", "TakeNRG",
    "TearGlove", "TehePelo", "ThankEgg", "TheIlluminati", "TheRinger", "TheTarFu", "TheThing",
    "ThunBeast", "TinyFace", "TombRaid", "TooSpicy", "TransgenderPride", "TriHard", "TwitchConHYPE",
    "TwitchLit", "TwitchRPG", "TwitchSings", "TwitchUnity", "TwitchVotes", "UWot", "UnSane",
    "UncleNox", "VirtualHug", "VoHiYo", "VoteNay", "VoteYea", "WTRuck", "WeDidThat", "WholeWheat",
    "WhySoSerious", "WutFace", "YouDontSay", "YouWHY", "ZLANsup", "bleedPurple", "cmonBruh",
    "copyThis", "duDudu", "imGlitch", "mcaT", "panicBasket", "pastaThat", "riPepperonis",
    "twitchRaid", ";P", ";p", ";-)", ";-P", ";-p", "o.O", "o.o", "o_O", "o_o"
  ].map((name) => name.toLowerCase())
);

const sentimentAnalyzer = new Sentiment();

const ONE_MINUTE = 60 * 1000;
const TEN_MINUTES = 10 * ONE_MINUTE;
const FIVE_MINUTES = 5 * ONE_MINUTE;
const STREAM_STATUS_POLL_INTERVAL = 5 * 1000;
const SHORT_EMA_SECONDS = 20;
const LONG_EMA_SECONDS = 180;
const BASELINE_READY_SECONDS = 90;

type BaselineAccumulator = {
  short: number;
  long: number;
  variance: number;
  initialized: boolean;
  elapsed: number;
};

function createBaselineAccumulator(): BaselineAccumulator {
  return {
    short: 0,
    long: 0,
    variance: 0,
    initialized: false,
    elapsed: 0,
  };
}

class MetricsAggregator {
  private messages: MessageRecord[] = [];
  private firstSeen = new Map<string, number>();
  private seenAuthors = new Set<string>();
  private lastTrendRate = 0;
  private events: EventItem[] = [];
  private lastEventAt = 0;
  private baselineStates = {
    messageRate: createBaselineAccumulator(),
    uniqueChatters: createBaselineAccumulator(),
    newcomers: createBaselineAccumulator(),
  };
  private lastBaselineTimestamp = 0;

  reset() {
    this.messages = [];
    this.firstSeen.clear();
    this.seenAuthors.clear();
    this.lastTrendRate = 0;
    this.events = [];
    this.lastEventAt = 0;
    this.baselineStates = {
      messageRate: createBaselineAccumulator(),
      uniqueChatters: createBaselineAccumulator(),
      newcomers: createBaselineAccumulator(),
    };
    this.lastBaselineTimestamp = 0;
  }

  ingest(record: MessageRecord): AggregatedSnapshot {
    const previousRate = this.lastTrendRate;
    this.messages.push(record);
    if (!this.firstSeen.has(record.authorHash)) {
      this.firstSeen.set(record.authorHash, record.timestamp);
    }
    if (!this.seenAuthors.has(record.authorHash)) {
      this.seenAuthors.add(record.authorHash);
    }

    this.prune(record.timestamp);

    const recentMessages = this.messages.filter(
      (message) => record.timestamp - message.timestamp <= ONE_MINUTE
    );
    const messageRate = recentMessages.length;

    const sentimentWindow = this.messages.filter(
      (message) => record.timestamp - message.timestamp <= FIVE_MINUTES
    );
    const averageSentiment =
      sentimentWindow.reduce((acc, message) => acc + message.sentiment, 0) /
      (sentimentWindow.length || 1);
    const normalizedSentiment = Math.max(-1, Math.min(1, averageSentiment));

    const chatterWindow = this.messages.filter(
      (message) => record.timestamp - message.timestamp <= TEN_MINUTES
    );
    const uniqueChatters = new Set(chatterWindow.map((message) => message.authorHash)).size;

    const newcomers = Array.from(this.firstSeen.values()).filter(
      (firstSeenAt) => record.timestamp - firstSeenAt <= TEN_MINUTES
    ).length;

    const tokenCounts = new Map<string, number>();
    const emoteCounts = new Map<
      string,
      {
        name: string;
        count: number;
      }
    >();
    chatterWindow.forEach((message) => {
      const messageEmoteSet = new Set(message.emotes.map((emote) => emote.toLowerCase()));
      message.tokens.forEach((token) => {
        if (GLOBAL_TWITCH_EMOTES.has(token) || messageEmoteSet.has(token)) {
          return;
        }
        tokenCounts.set(token, (tokenCounts.get(token) ?? 0) + 1);
      });
      message.emotes.forEach((emote) => {
        const key = emote.toLowerCase();
        const existing = emoteCounts.get(key);
        if (existing) {
          existing.count += 1;
        } else {
          emoteCounts.set(key, { name: emote, count: 1 });
        }
      });
    });

    const topEmotes = Array.from(emoteCounts.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 6)
      .map(({ name, count }) => ({ name, count }));

    const emoteKeySet = new Set(topEmotes.map((emote) => emote.name.toLowerCase()))
      ;

    const topTokens = Array.from(tokenCounts.entries())
      .filter(([name]) => !GLOBAL_TWITCH_EMOTES.has(name) && !emoteKeySet.has(name.toLowerCase()))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name, count]) => ({ name, count }));

    const now = record.timestamp;
    let dtSeconds = 0;
    if (this.lastBaselineTimestamp === 0) {
      this.lastBaselineTimestamp = now;
    } else {
      dtSeconds = Math.max(0.25, (now - this.lastBaselineTimestamp) / 1000);
      this.lastBaselineTimestamp = now;
    }

    this.updateBaseline(this.baselineStates.messageRate, messageRate, dtSeconds);
    this.updateBaseline(this.baselineStates.uniqueChatters, uniqueChatters, dtSeconds);
    this.updateBaseline(this.baselineStates.newcomers, newcomers, dtSeconds);

    const baselineSnapshot = {
      messageRate: this.snapshotBaseline(this.baselineStates.messageRate),
      uniqueChatters: this.snapshotBaseline(this.baselineStates.uniqueChatters),
      newcomers: this.snapshotBaseline(this.baselineStates.newcomers),
    };

    const baselineRate = baselineSnapshot.messageRate.long ?? messageRate;
    const baselineReady = baselineSnapshot.messageRate.ready;

    let event: EventItem | undefined;
    const ratioToBaseline = baselineRate > 0 ? messageRate / baselineRate : 0;
    const eventThreshold = baselineReady ? 1.4 : 1.8;
    if (
      baselineRate > 0 &&
      ratioToBaseline >= eventThreshold &&
      record.timestamp - this.lastEventAt > 20 * 1000
    ) {
      event = {
        id: `spike-${record.timestamp}`,
        title: "Message spike detected",
        detail: `Velocity is ${Math.round(ratioToBaseline * 100)}% of baseline.`,
        timestamp: record.timestamp,
      };
      this.events.unshift(event);
      this.events = this.events.slice(0, 20);
      this.lastEventAt = record.timestamp;
    }

    this.lastTrendRate = messageRate;
    const trendPercent =
      previousRate === 0 ? 0 : ((messageRate - previousRate) / previousRate) * 100;

    return {
      messageRate,
      trendPercent,
      sentiment: normalizedSentiment,
      uniqueChatters,
      newcomers,
      topTokens,
      topEmotes,
      event,
      baseline: baselineSnapshot,
    };
  }

  getTimelinePoint(timestamp: number) {
    return {
      timestamp,
      velocity: this.lastTrendRate,
    };
  }

  get eventsHistory() {
    return this.events.slice();
  }

  private updateBaseline(state: BaselineAccumulator, value: number, dtSeconds: number) {
    if (!state.initialized || !Number.isFinite(state.short) || dtSeconds === 0) {
      state.short = value;
      state.long = value;
      state.variance = 0;
      state.initialized = true;
      state.elapsed = 0;
      return;
    }

    const alphaShort = 1 - Math.exp(-dtSeconds / SHORT_EMA_SECONDS);
    const alphaLong = 1 - Math.exp(-dtSeconds / LONG_EMA_SECONDS);

    state.short += alphaShort * (value - state.short);

    const deltaLong = value - state.long;
    state.long += alphaLong * deltaLong;
    state.variance = Math.max(
      0,
      (1 - alphaLong) * state.variance + alphaLong * deltaLong * deltaLong
    );
    state.elapsed = Math.min(state.elapsed + dtSeconds, LONG_EMA_SECONDS * 12);
  }

  private snapshotBaseline(state: BaselineAccumulator): BaselineSnapshot {
    if (!state.initialized) {
      return { short: null, long: null, std: null, samples: 0, ready: false };
    }
    return {
      short: Number.isFinite(state.short) ? state.short : null,
      long: Number.isFinite(state.long) ? state.long : null,
      std: Number.isFinite(state.variance) ? Math.sqrt(Math.max(state.variance, 0)) : null,
      samples: Number.isFinite(state.elapsed) ? state.elapsed : 0,
      ready:
        state.elapsed >= BASELINE_READY_SECONDS &&
        Number.isFinite(state.long) &&
        Math.abs(state.long) > 0.1,
    };
  }

  private prune(now: number) {
    this.messages = this.messages.filter((message) => now - message.timestamp <= TEN_MINUTES);
    for (const [hash, firstSeenAt] of this.firstSeen.entries()) {
      if (now - firstSeenAt > TEN_MINUTES) {
        this.firstSeen.delete(hash);
      }
    }
  }
}

const LLM_INTERVAL_MS = 10000;
const MAX_MESSAGES_PER_LLM_CALL = 40;
const MAX_BUFFERED_MESSAGES = 200;
const AI_QUOTA_COOLDOWN_MS = 15 * 60 * 1000;

const moodAnalysisSchema = z.object({
  moodScore: z
    .number()
    .min(-1)
    .max(1),
  moodBalance: z.object({
    positive: z.number().min(0).max(100),
    neutral: z.number().min(0).max(100),
    negative: z.number().min(0).max(100),
  }),
  summary: z.object({
    message: z.string().min(1),
    tone: z.enum(["positive", "neutral", "negative"]),
  }),
  themes: z
    .array(
      z.object({
        label: z.string().min(1),
        confidence: z.number().min(0).max(1).optional(),
      })
    )
    .optional(),
});

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function isQuotaOrRateLimitError(error: unknown) {
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

function computeMoodContext(messages: ChatMessagePayload[]): MoodAnalysisContext {
  const authors = new Set<string>();
  const messageCounts = new Map<string, number>();
  const authorLabels = new Map<string, string>();
  let laughter = 0;
  let hype = 0;
  let negative = 0;
  const wordCounts = new Map<string, number>();

  messages.forEach((message) => {
    const authorKey = message.author.toLowerCase();
    authors.add(authorKey);
    messageCounts.set(authorKey, (messageCounts.get(authorKey) ?? 0) + 1);
    if (!authorLabels.has(authorKey)) {
      authorLabels.set(authorKey, message.author);
    }
    const lower = message.text.toLowerCase();
    const tone = message.tone;

    if (tone === "humor") {
      laughter += 1;
    } else if (/(lul|lol|haha|lmao|rofl|xd)/.test(lower)) {
      laughter += 1;
    }

    if (tone === "hype" || tone === "supportive") {
      hype += 1;
    } else if (/(pog|hype|let's go|omg|fire|goat|pogchamp)/.test(lower)) {
      hype += 1;
    }

    if (tone === "critical" || tone === "sarcastic" || tone === "toxic") {
      negative += 1;
    } else if (/(mad|wtf|cringe|angry|hate|terrible|trash|annoyed|upset|frustrated)/.test(lower)) {
      negative += 1;
    }

    const tokens = lower.match(/[a-z0-9']+/g) ?? [];
    tokens
      .filter((token) => token.length > 2 && !GLOBAL_TWITCH_EMOTES.has(token))
      .forEach((token) => {
        wordCounts.set(token, (wordCounts.get(token) ?? 0) + 1);
      });
  });

  const topWords = Array.from(wordCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word]) => word);

  const messageCount = messages.length;
  const safeCount = messageCount || 1;
  const newChatterEntries = Array.from(messageCounts.entries()).filter(([, count]) => count === 1);
  const newChatterCount = newChatterEntries.length;
  const newChatterNames = newChatterEntries
    .map(([key]) => authorLabels.get(key) ?? key)
    .slice(0, 5);

  return {
    messageCount,
    uniqueChatters: authors.size,
    topWords,
    laughterRatio: laughter / safeCount,
    hypeRatio: hype / safeCount,
    negativeRatio: negative / safeCount,
    newChatterCount,
    newChatterNames,
  };
}

function createFallbackSummary(
  tone: "positive" | "neutral" | "negative",
  context: MoodAnalysisContext
) {
  const primaryWord = context.topWords[0];

  if (context.newChatterCount > 0) {
    return {
      message: `👋 ${context.newChatterNames.join(", ") || "New viewers"} just joined—say hello!`,
      tone: "positive",
    };
  }

  if (context.laughterRatio > 0.02) {
    return {
      message: `😂 Chat can’t stop laughing${primaryWord ? ` about "${primaryWord}"` : "!"}`,
      tone: "positive",
    };
  }

  if (context.hypeRatio > 0.02) {
    return {
      message: `🚀 Hype spike—${primaryWord ? `"${primaryWord}"` : "that moment"} is going wild!`,
      tone: "positive",
    };
  }

  if (context.negativeRatio > 0.02) {
    return {
      message: `⚠️ Chat sounds frustrated${primaryWord ? ` about "${primaryWord}"` : " right now"}.`,
      tone: "negative",
    };
  }

  if (primaryWord) {
    return {
      message: `💬 Lots of talk about "${primaryWord}" in chat.`,
      tone,
    };
  }

  return {
    message: "📡 Chat is steady and tuned in—waiting for the next spark.",
    tone,
  };
}

type AuthMode = "oauth" | "anonymous";
type Tags = Record<string, any>;

function isAuthFailure(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.toLowerCase().includes("authentication failed");
}

function describeAuthMode(mode: AuthMode) {
  return mode === "oauth" ? "authenticated" : "anonymous";
}

function safeEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const twitchClientId = safeEnv("TWITCH_CLIENT_ID");
const twitchClientSecret = safeEnv("TWITCH_CLIENT_SECRET");
const explicitChannel = process.env.TWITCH_CHANNEL?.toLowerCase();
const explicitChannelId = process.env.TWITCH_CHANNEL_ID;
const explicitChannelDisplay = process.env.TWITCH_CHANNEL_DISPLAY_NAME;
let userAccessToken = safeEnv("TWITCH_USER_ACCESS_TOKEN");
let userRefreshToken = safeEnv("TWITCH_USER_REFRESH_TOKEN");
const convexUrl =
  process.env.NEXT_PUBLIC_CONVEX_URL ??
  process.env.CONVEX_URL ??
  (() => {
    throw new Error("Set NEXT_PUBLIC_CONVEX_URL or CONVEX_URL");
  })();
const convexAdminKey = safeEnv("CONVEX_ADMIN_KEY");
const convexAdminIdentity = process.env.CONVEX_ADMIN_IDENTITY
  ? JSON.parse(process.env.CONVEX_ADMIN_IDENTITY)
  : undefined;
const liveFeedUrl = process.env.LIVE_FEED_URL ?? "http://localhost:3000/api/live-feed";

let tokenExpiry = Date.now() + 3 * 60 * 60 * 1000;
let moodAiCooldownUntil = 0;
let moodAiCooldownLogged = false;
let moodAiResumeLogged = false;

async function refreshUserToken() {
  const params = new URLSearchParams({
    client_id: twitchClientId,
    client_secret: twitchClientSecret,
    refresh_token: userRefreshToken,
    grant_type: "refresh_token",
  });

  const response = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Failed to refresh Twitch token: ${response.status} ${errorBody}`);
  }

  const body: {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    scope: string[];
    token_type: "bearer";
  } = await response.json();

  userAccessToken = body.access_token;
  userRefreshToken = body.refresh_token;
  tokenExpiry = Date.now() + body.expires_in * 1000;

  console.log("[twitch] Refreshed user access token. Update TWITCH_USER_REFRESH_TOKEN with:");
  console.log(userRefreshToken);
}

async function ensureFreshToken() {
  const margin = 15 * 60 * 1000;
  if (Date.now() > tokenExpiry - margin) {
    await refreshUserToken();
  }
}

async function tryRefreshTokenSilently() {
  try {
    await refreshUserToken();
    return true;
  } catch (error) {
    console.error("[twitch] Token refresh failed after authentication error", error);
    return false;
  }
}

function hashAuthor(userId: string | undefined, login: string) {
  const hash = createHash("sha256");
  hash.update(userId ?? login);
  return hash.digest("hex");
}

function tokenizeMessage(message: string) {
  return message
    .split(/\s+/g)
    .map((token) => token.replace(/[^a-zA-Z0-9']/g, "").toLowerCase())
    .filter((token) => token.length > 2 && !GLOBAL_TWITCH_EMOTES.has(token));
}

function extractEmotes(message: string, tags: Tags) {
  const raw = tags.emotes;
  if (!raw) {
    return [];
  }

  const emoteTag =
    typeof raw === "string"
      ? raw
      : Array.isArray(raw)
        ? raw.join("/")
        : String(raw);

  if (!emoteTag || emoteTag === "null") {
    return [];
  }

  const emotes: string[] = [];
  const segments = emoteTag.split("/");
  segments.forEach((segment) => {
    const [emoteId, ranges] = segment.split(":");
    if (!ranges) return;
    ranges.split(",").forEach((range) => {
      const [start, end] = range.split("-").map((value) => Number.parseInt(value, 10));
      const code = message.slice(start, end + 1);
      if (code) {
        emotes.push(code);
      } else {
        emotes.push(emoteId);
      }
    });
  });
  return emotes;
}

function extractFallbackEmotes(message: string) {
  const candidates = new Set<string>();
  message.split(/\s+/g).forEach((segment) => {
    const trimmed = segment.trim();
    if (!trimmed) return;
    const sanitized = trimmed.replace(/[^0-9A-Za-z:()<>;\-_]/g, "");
    if (!sanitized) return;
    const lookup = sanitized.toLowerCase();
    if (GLOBAL_TWITCH_EMOTES.has(lookup)) {
      candidates.add(sanitized);
    }
  });
  return Array.from(candidates);
}

async function sendLiveFeedUpdates(channel: string | { channelLogin?: string; channel?: string }, updates: unknown[]) {
  if (updates.length === 0) {
    return;
  }

  let channelSlug = "";
  if (typeof channel === "string") {
    channelSlug = channel.trim().toLowerCase();
  } else if (channel && typeof channel === "object") {
    channelSlug =
      channel.channel?.toLowerCase()?.trim?.() ?? channel.channelLogin?.toLowerCase()?.trim?.() ?? "";
  }
  if (!channelSlug) {
    console.warn("[live-feed] Skipping broadcast due to missing channel identifier");
    return;
  }

  if (process.env.NODE_ENV !== "production") {
    console.log("[live-feed] Posting updates", {
      channel: channelSlug,
      count: updates.length,
      sample: (updates[0] as any)?.type ?? null,
    });
  }

  const normalizedUpdates = updates.map((update) => {
    if (update && typeof update === "object") {
      return {
        channel: channelSlug,
        channelLogin: channelSlug,
        channelSlug,
        ...update,
      };
    }

    return {
      channel: channelSlug,
      channelLogin: channelSlug,
      channelSlug,
      payload: update,
    };
  });

  const response = await fetch(liveFeedUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      channel: channelSlug,
      channelLogin: channelSlug,
      channelSlug,
      updates: normalizedUpdates,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    console.warn(
      "[live-feed] Failed to POST update",
      response.status,
      text,
      JSON.stringify({ channel: channelSlug, channelLogin: channelSlug, channelSlug, updates })
    );
  }
}

async function postLiveFeed(channel: string | { channelLogin?: string; channel?: string }, update: unknown) {
  await sendLiveFeedUpdates(channel, [update]);
}

async function main() {
  const convex = new ConvexHttpClient(convexUrl);
  (convex as any).setAdminAuth?.(convexAdminKey, convexAdminIdentity);

  const aggregator = new MetricsAggregator();
  let pendingMessages: ChatMessagePayload[] = [];
  let llmProcessing = false;
  let llmApiMissingLogged = false;
  let lastBroadcastFingerprint: string | null = null;
  let startingSession = false;

  let activeStreamId: Id<"streams"> | null = null;
  let sessionStartedAt: number | null = null;
  let authMode: AuthMode = "oauth";
  let statusPollTimer: ReturnType<typeof setInterval> | null = null;
  let lastReportedStatus: "live" | "offline" = "offline";

  const integration = await resolveIntegration(convex);
  console.log("[ingestion] Using integration", integration);
  const twitchChannel = integration.channelLogin.toLowerCase();
  const twitchUsername = (process.env.TWITCH_USERNAME ?? integration.channelLogin).toLowerCase();
  const channelDisplayName = integration.channelDisplayName ?? integration.channelLogin;
  const preferredAuth: AuthMode = userAccessToken ? "oauth" : "anonymous";

  const connectionConfig = {
    reconnect: true,
    secure: true,
    timeout: 60000,
    reconnectInterval: 10000,
    maxReconnectInterval: 60000,
  };

  async function analyzeChatSlice(messages: ChatMessagePayload[]) {
    const apiKey = process.env.VERCEL_AI_API_KEY;
  if (!apiKey) {
    if (!llmApiMissingLogged) {
      console.warn(
        "[ai] VERCEL_AI_API_KEY not set. Mood analysis will be skipped until the key is provided."
      );
      llmApiMissingLogged = true;
    }
    return null;
  }

  const now = Date.now();
  if (moodAiCooldownUntil && now >= moodAiCooldownUntil) {
    moodAiCooldownUntil = 0;
    moodAiCooldownLogged = false;
    moodAiResumeLogged = false;
    console.info("[ai] Resuming mood analysis after cooldown.");
  }

  if (moodAiCooldownUntil && now < moodAiCooldownUntil) {
    if (!moodAiCooldownLogged) {
      const remainingMinutes = Math.ceil((moodAiCooldownUntil - now) / 60000);
      console.warn(
        `[ai] Skipping mood analysis during cooldown window (~${remainingMinutes} minute${
          remainingMinutes === 1 ? "" : "s"
        } remaining).`
      );
      moodAiCooldownLogged = true;
    }
    return null;
  }

    const contextSource = messages.slice(-MAX_MESSAGES_PER_LLM_CALL);

    const slice = contextSource.map((message) => ({
        author: message.author,
        text: message.text,
        timestamp: message.timestamp,
      })) satisfies MoodPromptMessage[];

    const context = computeMoodContext(contextSource);

    if (slice.length === 0) {
      return null;
    }

    try {
      const openai = createOpenAI({ apiKey });
      const { object } = await generateObject({
        model: openai("gpt-4.1-mini"),
        system: moodAnalysisSystemPrompt.trim(),
        prompt: buildMoodAnalysisUserPrompt(slice, context),
        schema: moodAnalysisSchema,
      });

      if (!object) {
        return null;
      }

      const tone: "positive" | "neutral" | "negative" =
        object.summary?.tone ?? (object.moodScore > 0.02 ? "positive" : object.moodScore < -0.02 ? "negative" : "neutral");

      const summary = object.summary ?? createFallbackSummary(tone, context);

      let themes = Array.isArray(object.themes)
        ? object.themes
            .filter((theme) => theme && typeof theme.label === "string" && theme.label)
            .slice(0, 10)
            .map((theme) => ({
              label: theme.label,
              confidence: clampNumber(theme.confidence ?? 0.4, 0, 1),
            }))
        : [];

      if (themes.length === 0) {
        themes = context.topWords.slice(0, 10).map((word, index) => ({
          label: word,
          confidence: clampNumber(0.7 - index * 0.05, 0.1, 1),
        }));
      }

      return {
        moodScore: object.moodScore,
        moodBalance: object.moodBalance,
        sampleSize: context.messageCount,
        generatedAt: Date.now(),
        summary,
        themes,
      };
    } catch (error) {
      console.error("[ai] Mood analysis failed", error);
      throw error;
    }
  }

  setInterval(() => {
    if (llmProcessing || pendingMessages.length === 0) {
      return;
    }

    const batch = pendingMessages.splice(0, pendingMessages.length);
    llmProcessing = true;

    analyzeChatSlice(batch)
      .then(async (result) => {
        if (moodAiCooldownUntil) {
          moodAiCooldownUntil = 0;
          moodAiCooldownLogged = false;
          if (!moodAiResumeLogged) {
            console.info("[ai] Mood analysis resumed after cooldown.");
            moodAiResumeLogged = true;
          }
        }
        if (!result) {
          if (process.env.VERCEL_AI_API_KEY) {
            pendingMessages.unshift(...batch);
            if (pendingMessages.length > MAX_BUFFERED_MESSAGES) {
              pendingMessages = pendingMessages.slice(-MAX_BUFFERED_MESSAGES);
            }
          }
          return;
        }

        const fingerprint = JSON.stringify({
          message: result.summary.message,
          tone: result.summary.tone,
          sampleSize: result.sampleSize,
        });

        if (fingerprint !== lastBroadcastFingerprint) {
          await postLiveFeed(twitchChannel, {
            type: "ai-mood",
            payload: {
              moodScore: result.moodScore,
              moodBalance: result.moodBalance,
              sampleSize: result.sampleSize,
              generatedAt: result.generatedAt,
              summary: result.summary,
              themes: result.themes,
            },
          });
          lastBroadcastFingerprint = fingerprint;
        }

        await postLiveFeed(twitchChannel, {
          type: "metrics",
          payload: {
            sentiment: result.moodScore,
          },
        });

        await postLiveFeed(twitchChannel, {
          type: "audience",
          payload: {
            sentimentScore: result.moodScore,
          },
        });
      })
      .catch((error) => {
        console.error("[ai] Unable to deliver mood analysis", error);
        if (isQuotaOrRateLimitError(error)) {
          moodAiCooldownUntil = Date.now() + AI_QUOTA_COOLDOWN_MS;
          moodAiCooldownLogged = false;
          moodAiResumeLogged = false;
          console.warn(
            `[ai] OpenAI quota exceeded. Pausing mood analysis for ${AI_QUOTA_COOLDOWN_MS / 60000} minutes.`
          );
          pendingMessages = [];
        } else {
          pendingMessages.unshift(...batch);
          if (pendingMessages.length > MAX_BUFFERED_MESSAGES) {
            pendingMessages = pendingMessages.slice(-MAX_BUFFERED_MESSAGES);
          }
        }
      })
      .finally(() => {
        llmProcessing = false;
      });
  }, LLM_INTERVAL_MS);

  function buildClient(mode: AuthMode) {
    const identity =
      mode === "oauth"
        ? {
            username: twitchUsername,
            password: `oauth:${userAccessToken}`,
          }
        : undefined;

    return new tmi.Client({
      identity,
      channels: [twitchChannel],
      options: { debug: false },
      connection: connectionConfig,
      logger: {
        info: () => {},
        warn: (message: unknown) => console.warn(`[twitch warning] ${message}`),
        error: (message: unknown) => console.error(`[twitch error] ${message}`),
      },
    });
  }

  async function fetchStreamLive(login: string) {
    await ensureFreshToken();
    const response = await fetch(`https://api.twitch.tv/helix/streams?user_login=${login}`, {
      method: "GET",
      headers: {
        "Client-Id": twitchClientId,
        Authorization: `Bearer ${userAccessToken}`,
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to fetch stream status: ${response.status} ${text}`);
    }

    const body: { data?: Array<{ type?: string | null }> } = await response.json();
    const isLive = Array.isArray(body.data)
      ? body.data.some((stream) => (stream.type ?? "").toLowerCase() === "live")
      : false;

    return isLive;
  }

  async function startIngestionSession(now: number) {
    if (activeStreamId || startingSession) {
      return;
    }
    startingSession = true;
    try {
      const session = await (convex as any).mutation("ingestion/startSession:startSession", {
        channelId: integration.channelId,
        channelLogin: twitchChannel,
        channelDisplayName,
        streamKey: `${twitchChannel}-${now}`,
      });

      aggregator.reset();
      pendingMessages = [];
      await postLiveFeed(twitchChannel, {
        type: "reset",
        channel: twitchChannel,
        channelLogin: twitchChannel,
      });

      activeStreamId = session.streamId;
      sessionStartedAt = now;
      lastReportedStatus = "live";

      await postLiveFeed(twitchChannel, {
        type: "session",
        channel: twitchChannel,
        channelLogin: twitchChannel,
        payload: {
          status: "listening",
          channel: channelDisplayName,
          channelLogin: twitchChannel,
          startedAt: now,
        },
      });
    } catch (error) {
      const err = error as any;
      console.error("[ingestion] Failed to start session", {
        message: err?.message,
        data: err?.data,
        code: err?.code,
        stack: err instanceof Error ? err.stack : undefined,
      });
    } finally {
      startingSession = false;
    }
  }

  async function endIngestionSession(endedAt: number | null = null) {
    if (!activeStreamId) {
      aggregator.reset();
      pendingMessages = [];
      lastReportedStatus = "offline";
      await postLiveFeed(twitchChannel, {
        type: "session",
        channel: twitchChannel,
        channelLogin: twitchChannel,
        payload: {
          status: "idle",
          channel: channelDisplayName,
          channelLogin: twitchChannel,
          startedAt: null,
        },
      });
      return;
    }
    const finalEndedAt = endedAt ?? Date.now();
    try {
      await (convex as any).mutation("ingestion/endSession:endSession", {
        streamId: activeStreamId,
        endedAt: finalEndedAt,
      });
    } catch (error) {
      console.error("[ingestion] Failed to end session", error);
    }

    activeStreamId = null;
    sessionStartedAt = null;
    lastReportedStatus = "offline";
    aggregator.reset();
    pendingMessages = [];

    await postLiveFeed(twitchChannel, {
      type: "session",
      channel: twitchChannel,
      channelLogin: twitchChannel,
      payload: {
        status: "idle",
        channel: channelDisplayName,
        channelLogin: twitchChannel,
        startedAt: null,
      },
    });
  }

  async function evaluateStreamStatus(context: string) {
    try {
      const isLive = await fetchStreamLive(twitchChannel);

      if (isLive && !activeStreamId) {
        const now = Date.now();
        console.log(`[twitch] Stream is live (detected via ${context}). Starting ingestion.`);
        await startIngestionSession(now);
      } else if (!isLive && activeStreamId) {
        console.log(`[twitch] Stream went offline (detected via ${context}). Ending ingestion.`);
        await endIngestionSession();
      } else if (isLive && lastReportedStatus !== "live") {
        lastReportedStatus = "live";
        await postLiveFeed(twitchChannel, {
          type: "session",
          channel: twitchChannel,
          channelLogin: twitchChannel,
          payload: {
            status: "listening",
            channel: channelDisplayName,
            channelLogin: twitchChannel,
            startedAt: sessionStartedAt,
          },
        });
      } else if (!isLive && lastReportedStatus !== "offline") {
        lastReportedStatus = "offline";
        aggregator.reset();
        pendingMessages = [];
        await postLiveFeed(twitchChannel, {
          type: "session",
          channel: twitchChannel,
          channelLogin: twitchChannel,
          payload: {
            status: "idle",
            channel: channelDisplayName,
            channelLogin: twitchChannel,
            startedAt: null,
          },
        });
      }
    } catch (error) {
      console.error(`[twitch] Failed to evaluate stream status (${context})`, error);
    }
  }

  function wireClient(instance: any) {
    instance.on("connected", async () => {
      try {
        if (authMode === "oauth") {
          await ensureFreshToken();
        }
        const now = Date.now();
        console.log(
          `[twitch] Connected to #${twitchChannel} (${describeAuthMode(authMode)} mode)`
        );
        await evaluateStreamStatus("connection");
        if (statusPollTimer) {
          clearInterval(statusPollTimer);
        }
        statusPollTimer = setInterval(() => {
          evaluateStreamStatus("poll").catch((error) => {
            console.error("[twitch] Stream status poll failed", error);
          });
        }, STREAM_STATUS_POLL_INTERVAL);
      } catch (error) {
        console.error("[ingestion] Failed to start session", error);
      }
    });

    instance.on("reconnect", () => {
      console.warn("[twitch] Attempting to reconnect…");
    });

    instance.on("ping", () => {
      if (typeof console.debug === "function") {
        console.debug("[twitch] Ping sent");
      }
    });

    instance.on("pong", (latency: number) => {
      if (typeof console.debug === "function") {
        console.debug(`[twitch] Pong received (${latency}ms)`);
      }
    });

    instance.on("disconnected", async () => {
      console.warn("[twitch] Disconnected from chat");
      if (statusPollTimer) {
        clearInterval(statusPollTimer);
        statusPollTimer = null;
      }
      await endIngestionSession();
    });

    instance.on("message", async (channelName: string, tags: Tags, message: string, self: boolean) => {
      if (self) return;

      if (authMode === "oauth") {
        try {
          await ensureFreshToken();
        } catch (error) {
          console.error("[twitch] Token refresh failed", error);
          return;
        }
      }

      if (!activeStreamId) {
        return;
      }

      const messageId = (tags.id as string) ?? randomUUID();
      const authorDisplay =
        (tags["display-name"] as string) ?? (tags.username as string) ?? "anon";
      const timestamp = Number.parseInt((tags["tmi-sent-ts"] as string) ?? `${Date.now()}`, 10);
      const tokens = tokenizeMessage(message);
      const emotes = extractEmotes(message, tags);
      const fallbackEmotes = extractFallbackEmotes(message);
      const allEmotes = Array.from(new Set([...emotes, ...fallbackEmotes]));
      const sentimentScoreRaw = sentimentAnalyzer.analyze(message).score;
      const sentimentScore = Math.max(-1, Math.min(1, sentimentScoreRaw / 10));
      const authorHash = hashAuthor(
        tags["user-id"] as string | undefined,
        tags.username ?? authorDisplay
      );
      const toneContext = pendingMessages.slice(-6).map((entry) => `${entry.author}: ${entry.text}`);
      const toneResult: ChatToneResult = await classifyChatTone(message, {
        author: authorDisplay,
        recentMessages: toneContext,
      });

      try {
        await (convex as any).mutation("ingestion/appendChatMessage:appendChatMessage", {
          streamId: activeStreamId,
          messageId,
          authorDisplay,
          authorHash,
          text: message,
          emotes: countEmotes(allEmotes),
          postedAt: timestamp,
          tone: toneResult.tone === "unknown" ? undefined : toneResult.tone,
          toneConfidence: toneResult.confidence,
          toneRationale: toneResult.rationale,
        });
      } catch (error) {
        console.error("[convex] Failed to append chat message", error);
      }

      const snapshot = aggregator.ingest({
        id: messageId,
        timestamp,
        authorHash,
        authorDisplay,
        tokens,
        emotes: allEmotes,
        sentiment: sentimentScore,
        tone: toneResult.tone,
        toneConfidence: toneResult.confidence,
      });

      const chatPayload: ChatMessagePayload = {
        id: messageId,
        author: authorDisplay,
        text: message,
        timestamp,
        tone: toneResult.tone,
        toneConfidence: toneResult.confidence,
        toneRationale: toneResult.rationale,
      };

      pendingMessages.push(chatPayload);
      if (pendingMessages.length > MAX_BUFFERED_MESSAGES) {
        pendingMessages = pendingMessages.slice(-MAX_BUFFERED_MESSAGES);
      }

      const liveFeedBatch: unknown[] = [
        {
          type: "chat",
          channel: twitchChannel,
          channelLogin: twitchChannel,
          payload: { ...chatPayload, channel: twitchChannel, channelLogin: twitchChannel },
        },
        {
          type: "metrics",
          channel: twitchChannel,
          channelLogin: twitchChannel,
          payload: {
            channel: twitchChannel,
            channelLogin: twitchChannel,
            messageRate: snapshot.messageRate,
            sentiment: snapshot.sentiment,
            uniqueChatters: snapshot.uniqueChatters,
            trend: snapshot.trendPercent,
            baseline: snapshot.baseline,
          },
        },
        {
          type: "audience",
          channel: twitchChannel,
          channelLogin: twitchChannel,
          payload: {
            channel: twitchChannel,
            channelLogin: twitchChannel,
            uniqueChatters: snapshot.uniqueChatters,
            newcomers: snapshot.newcomers,
            sentimentScore: snapshot.sentiment,
            baseline: {
              uniqueChatters: snapshot.baseline.uniqueChatters,
              newcomers: snapshot.baseline.newcomers,
            },
          },
        },
        {
          type: "tokens",
          channel: twitchChannel,
          channelLogin: twitchChannel,
          payload: {
            channel: twitchChannel,
            channelLogin: twitchChannel,
            tokens: snapshot.topTokens,
            emotes: snapshot.topEmotes,
          },
        },
        {
          type: "timeline",
          channel: twitchChannel,
          channelLogin: twitchChannel,
          payload: {
            channel: twitchChannel,
            channelLogin: twitchChannel,
            point: aggregator.getTimelinePoint(timestamp),
          },
        },
      ];

      if (snapshot.event) {
        liveFeedBatch.push({
          type: "events",
          channel: twitchChannel,
          channelLogin: twitchChannel,
          payload: {
            channel: twitchChannel,
            channelLogin: twitchChannel,
            event: snapshot.event,
          },
        });
      }

      void sendLiveFeedUpdates(twitchChannel, liveFeedBatch);
    });
  }

  async function connectPreferred() {
    if (preferredAuth === "oauth") {
      const oauthClient = buildClient("oauth");
      wireClient(oauthClient);
      try {
        await ensureFreshToken();
        authMode = "oauth";
        await oauthClient.connect();
        return oauthClient;
      } catch (error) {
        oauthClient.removeAllListeners();
        if (isAuthFailure(error)) {
          console.warn("[twitch] OAuth login failed. Attempting token refresh…");
          const refreshed = await tryRefreshTokenSilently();
          if (refreshed) {
            const retryClient = buildClient("oauth");
            wireClient(retryClient);
            try {
              authMode = "oauth";
              await retryClient.connect();
              return retryClient;
            } catch (retryError) {
              retryClient.removeAllListeners();
              console.warn(
                "[twitch] Authentication still failing after refresh. Falling back to anonymous mode."
              );
            }
          } else {
            console.warn(
              "[twitch] Could not refresh user token. Falling back to anonymous Twitch connection."
            );
          }
        } else {
          throw error;
        }
      }
    }

    const anonymousClient = buildClient("anonymous");
    wireClient(anonymousClient);
    authMode = "anonymous";
    await anonymousClient.connect();
    console.warn(
      "[twitch] Connected in anonymous mode. Metrics streaming continues, but chat actions are read-only."
    );
    return anonymousClient;
  }

  let client: any;
  try {
    client = await connectPreferred();
  } catch (error) {
    console.error("[tmi] Failed to connect", error);
    process.exit(1);
    return;
  }

  process.on("SIGINT", async () => {
    console.log("\n[ingestion] Shutting down...");
    client.disconnect().catch(() => {});
    if (statusPollTimer) {
      clearInterval(statusPollTimer);
    }
    await endIngestionSession();
    process.exit(0);
  });
}

function countEmotes(items: string[]) {
  const counts = new Map<string, { name: string; count: number }>();
  items.forEach((item) => {
    const key = item.toLowerCase();
    const existing = counts.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      counts.set(key, { name: item, count: 1 });
    }
  });
  return Array.from(counts.values()).map(({ name, count }) => ({ code: name, count }));
}

async function resolveIntegration(convex: ConvexHttpClient) {
  const channels = await (convex as any).query("ingestion/getActiveChannels:getActiveChannels", {});
  console.log("[ingestion] Linked channels", channels);

  const channelList = Array.isArray(channels) ? channels : [];

  if (channelList.length > 0) {
    const preferredChannels = channelList.filter(
      (integration: any) => !integration.channelLogin.toLowerCase().includes("demo")
    );
    const list = preferredChannels.length > 0 ? preferredChannels : channelList;
    if (explicitChannel) {
      const matched = list.find(
        (integration) => integration.channelLogin.toLowerCase() === explicitChannel
      );
      if (!matched) {
        console.warn(
          "Configured TWITCH_CHANNEL does not match any linked integration. Using first linked channel instead.",
          { explicitChannel, linkedChannels: list.map((c) => c.channelLogin) }
        );
      }
      return matched ?? list[0];
    }
    if (list.length > 1) {
      throw new Error(
        "Multiple Twitch integrations found. Set TWITCH_CHANNEL in your environment to pick which channel to ingest."
      );
    }
    return list[0];
  }

  if (explicitChannel) {
    return {
      channelLogin: explicitChannel,
      channelDisplayName: explicitChannelDisplay ?? explicitChannel,
      channelId: explicitChannelId ?? explicitChannel,
    };
  }

  throw new Error(
    "No connected Twitch integrations found in Convex. Sign in through the dashboard to link a channel."
  );
}

main().catch((error) => {
  console.error("[ingestion] Fatal error", error);
  process.exit(1);
});
