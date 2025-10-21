'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import AlertList from "./components/alert-list";
import TrendList from "./components/trend-list";
import type { ChatTone } from "@/lib/ai/chat-tone";

type SessionStatus = "idle" | "listening" | "errored";

type TimelinePoint = {
  timestamp: number;
  velocity: number;
};

type BaselineSnapshot = {
  short: number | null;
  long: number | null;
  std: number | null;
  samples: number;
  ready: boolean;
};

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

type ChatMessage = {
  id: string;
  author: string;
  text: string;
  timestamp: number;
  tone: ChatTone;
  toneConfidence: number | null;
  toneRationale: string | null;
};

type LiveState = {
  session: {
    status: SessionStatus;
    channel: string | null;
    startedAt: number | null;
  };
  metrics: {
    messageRate: number | null;
    sentiment: number | null;
    uniqueChatters: number | null;
    trend: number | null;
    baseline: {
      messageRate: BaselineSnapshot | null;
      uniqueChatters: BaselineSnapshot | null;
      newcomers: BaselineSnapshot | null;
    };
  };
  timeline: TimelinePoint[];
  events: EventItem[];
  tokens: {
    tokens: TokenRow[];
    emotes: TokenRow[];
  };
  audience: {
    uniqueChatters: number;
    newcomers: number;
    sentimentScore: number | null;
    baseline: {
      uniqueChatters: BaselineSnapshot | null;
      newcomers: BaselineSnapshot | null;
    };
  };
  chat: ChatMessage[];
  moodAnalysis: {
    moodScore: number;
    moodBalance: {
      positive: number;
      neutral: number;
      negative: number;
    };
    sampleSize: number;
    generatedAt: number;
    summary: {
      message: string;
      tone: "positive" | "neutral" | "negative";
    };
    themes: {
      label: string;
      confidence: number;
    }[];
  } | null;
};

type LiveUpdate =
  | {
      type: "session";
      payload: {
        status: SessionStatus;
        channel?: string | null;
        startedAt?: number | null;
      };
    }
  | {
      type: "metrics";
      payload: {
        messageRate?: number | null;
        sentiment?: number | null;
        uniqueChatters?: number | null;
        trend?: number | null;
        baseline?: {
          messageRate?: BaselineSnapshot | null;
          uniqueChatters?: BaselineSnapshot | null;
          newcomers?: BaselineSnapshot | null;
        } | null;
      };
    }
  | {
      type: "timeline";
      payload:
        | { point: TimelinePoint }
        | {
            points: TimelinePoint[];
          };
    }
  | {
      type: "events";
      payload:
        | { event: EventItem }
        | {
            events: EventItem[];
          };
    }
  | {
      type: "tokens";
      payload: {
        tokens?: TokenRow[];
        emotes?: TokenRow[];
      };
    }
  | {
      type: "audience";
      payload: {
        uniqueChatters?: number;
        newcomers?: number;
        sentimentScore?: number | null;
        baseline?: {
          uniqueChatters?: BaselineSnapshot | null;
          newcomers?: BaselineSnapshot | null;
        } | null;
      };
    }
  | {
      type: "chat";
      payload: ChatMessage;
    }
  | {
      type: "ai-mood";
      payload: {
        moodScore: number;
        moodBalance: {
          positive: number;
          neutral: number;
          negative: number;
        };
        sampleSize: number;
        generatedAt: number;
        summary: {
          message: string;
          tone: "positive" | "neutral" | "negative";
        };
        themes: {
          label: string;
          confidence: number;
        }[];
      };
    }
  | {
      type: "reset";
      payload?: Partial<LiveState>;
    };

const initialState: LiveState = {
  session: {
    status: "idle",
    channel: null,
    startedAt: null,
  },
  metrics: {
    messageRate: null,
    sentiment: null,
    uniqueChatters: null,
    trend: null,
    baseline: {
      messageRate: null,
      uniqueChatters: null,
      newcomers: null,
    },
  },
  timeline: [],
  events: [],
  tokens: {
    tokens: [],
    emotes: [],
  },
  audience: {
    uniqueChatters: 0,
    newcomers: 0,
    sentimentScore: null,
    baseline: {
      uniqueChatters: null,
      newcomers: null,
    },
  },
  chat: [],
  moodAnalysis: null,
};

const MAX_TIMELINE_POINTS = 120;
const MAX_CHAT_MESSAGES = 100;
const MAX_EVENTS = 30;

type DashboardAlert = {
  id: string;
  message: string;
  tone: "positive" | "neutral" | "negative";
  priority: "high" | "medium" | "low";
  updatedAt: number;
};

const ALERT_FETCH_INTERVAL_MS = 1500;
const ALERT_HISTORY_WINDOW_MS = 2 * 60 * 1000;
const TONE_RECENT_WINDOW = 12;
const POSITIVE_TONE_SET: ChatTone[] = ["hype", "supportive", "humor", "constructive"];
const NEGATIVE_TONE_SET: ChatTone[] = ["critical", "sarcastic", "toxic"];
const TOXIC_TONE_SET: ChatTone[] = ["toxic"];
const QUESTION_TONE_SET: ChatTone[] = ["question"];
const SPAM_TONE_SET: ChatTone[] = ["spam"];
const CALM_ALERT_MESSAGE = "All Calm: Chat is steady—no notable shifts yet.";

type DashboardShellProps = {
  initialState?: Partial<LiveState>;
  initialIngestionConnected?: boolean;
  channelLogin?: string | null;
};

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
});

function createInitialState(overrides?: Partial<LiveState>): LiveState {
  if (!overrides) {
    return initialState;
  }
  return {
    session: { ...initialState.session, ...overrides.session },
    metrics: {
      ...initialState.metrics,
      ...overrides.metrics,
      baseline: {
        ...initialState.metrics.baseline,
        ...overrides.metrics?.baseline,
      },
    },
    timeline: overrides.timeline ?? initialState.timeline,
    events: overrides.events ?? initialState.events,
    tokens: {
      tokens: overrides.tokens?.tokens ?? initialState.tokens.tokens,
      emotes: overrides.tokens?.emotes ?? initialState.tokens.emotes,
    },
    audience: {
      ...initialState.audience,
      ...overrides.audience,
      baseline: {
        ...initialState.audience.baseline,
        ...overrides.audience?.baseline,
      },
    },
    chat: overrides.chat ?? initialState.chat,
    moodAnalysis: overrides.moodAnalysis ?? initialState.moodAnalysis,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function formatDuration(startedAt: number | null) {
  if (!startedAt) return null;
  const delta = Date.now() - startedAt;
  if (delta <= 0) {
    return null;
  }
  const minutes = Math.floor(delta / 60000);
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours > 0) {
    return `${hours}h ${remainingMinutes}m`;
  }
  return `${Math.max(1, minutes)}m`;
}

function formatNumber(value: number, options: Intl.NumberFormatOptions = {}) {
  return Number.isFinite(value)
    ? new Intl.NumberFormat(undefined, {
        maximumFractionDigits: 0,
        ...options,
      }).format(value)
    : "--";
}

function formatPercent(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "--";
  }
  const formatter = new Intl.NumberFormat(undefined, {
    signDisplay: "always",
    maximumFractionDigits: 0,
  });
  return formatter.format(value);
}

function sentimentLabel(score: number | null) {
  if (typeof score !== "number") {
    return { label: "Neutral", tone: "text-slate-300" };
  }
  if (score > 0.01) {
    return { label: "Positive", tone: "text-emerald-300" };
  }
  if (score < -0.01) {
    return { label: "Negative", tone: "text-rose-300" };
  }
  return { label: "Mixed", tone: "text-amber-300" };
}

function computeEngagementScore({
  messageRate,
  uniqueChatters,
  sentiment,
  baseline,
}: {
  messageRate: number;
  uniqueChatters: number;
  sentiment: number;
  baseline?: {
    messageRate?: BaselineSnapshot | null;
    uniqueChatters?: BaselineSnapshot | null;
  };
}) {
  const rateScore = (() => {
    const base = baseline?.messageRate;
    if (base && base.ready && typeof base.long === "number" && base.long !== 0) {
      const delta = (messageRate - base.long) / Math.abs(base.long);
      return clamp(1 + delta, 0, 2) / 2;
    }
    return clamp(messageRate / 30, 0, 1);
  })();

  const chatterScore = (() => {
    const base = baseline?.uniqueChatters;
    if (base && base.ready && typeof base.long === "number" && base.long !== 0) {
      const delta = (uniqueChatters - base.long) / Math.abs(base.long);
      return clamp(1 + delta, 0, 2) / 2;
    }
    return clamp(uniqueChatters / 40, 0, 1);
  })();

  const activity = clamp((rateScore + chatterScore) / 2, 0, 1);

  if (activity === 0) {
    return { score: 0, mood: "cool" as const };
  }

  const normalizedSentiment = clamp((sentiment + 1) / 2, 0, 1);
  const weighted = clamp(activity * 0.75 + normalizedSentiment * 0.25, 0, 1);
  const score = Math.round(weighted * 100);

  let mood: "cool" | "warm" | "hot";
  if (score >= 75) {
    mood = "hot";
  } else if (score >= 45) {
    mood = "warm";
  } else {
    mood = "cool";
  }

  return { score, mood };
}

function describeStatus(status: SessionStatus, ingestionConnected: boolean) {
  if (status === "listening") {
    return {
      label: "Live",
      helper: "We are ingesting chat in real time.",
      badgeTone: "bg-emerald-500/10 text-emerald-300 border border-emerald-500/40",
    };
  }

  if (ingestionConnected) {
    return {
      label: "Monitoring",
      helper: "Waiting for chat activity to begin.",
      badgeTone: "bg-amber-500/10 text-amber-300 border border-amber-500/40",
    };
  }

  return {
    label: status === "errored" ? "Attention" : "Offline",
    helper:
      status === "errored"
        ? "We lost the chat connection. Restart the ingestion worker to resume analytics."
        : "Start the ingestion worker to begin streaming insights.",
    badgeTone:
      status === "errored"
        ? "bg-rose-500/10 text-rose-300 border border-rose-500/40"
        : "bg-slate-800 text-slate-300 border border-slate-700",
  };
}

function formatEventTimestamp(timestamp: number) {
  const delta = Date.now() - timestamp;
  if (!Number.isFinite(delta) || delta < 0) {
    return timeFormatter.format(new Date(timestamp));
  }
  const minutes = Math.floor(delta / 60000);
  if (minutes < 1) {
    return "moments ago";
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

export default function DashboardShell({
  initialState: initialOverrides,
  initialIngestionConnected,
  channelLogin,
}: DashboardShellProps) {
  const [state, setState] = useState<LiveState>(() => createInitialState(initialOverrides));
  const [ingestionConnected, setIngestionConnected] = useState<boolean>(() => {
    if (typeof initialIngestionConnected === "boolean") {
      return initialIngestionConnected;
    }
    const status = initialOverrides?.session?.status;
    return status === "listening";
  });
  const [alerts, setAlerts] = useState<DashboardAlert[]>([]);
  const alertsFingerprintRef = useRef<string | null>(null);
  const alertsRef = useRef<DashboardAlert[]>(alerts);
  const alertsFetchInFlightRef = useRef(false);
  const lastAlertsFetchAtRef = useRef(0);
  const isMountedRef = useRef(true);

  useEffect(() => {
    if (typeof initialIngestionConnected === "boolean") {
      setIngestionConnected(initialIngestionConnected);
    }
  }, [initialIngestionConnected]);

  useEffect(() => {
    alertsRef.current = alerts;
  }, [alerts]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (state.session.status === "listening") {
      setAlerts((previous) =>
        previous.filter(
          (alert) => alert.id !== "monitoring-idle" && alert.id !== "ingestion-error"
        )
      );
      return;
    }

    const sessionStatus = state.session.status;
    const fallbackId = sessionStatus === "errored" ? "ingestion-error" : "monitoring-idle";
    const fallbackAlert: DashboardAlert = {
      id: fallbackId,
      message:
        sessionStatus === "errored"
          ? "We lost connection to chat. Check your ingestion worker."
          : "Monitoring chat for when you go live.",
      tone: sessionStatus === "errored" ? "negative" : "neutral",
      priority: sessionStatus === "errored" ? "high" : "medium",
      updatedAt: Date.now(),
    };

    let replaced = false;
    setAlerts((previous) => {
      const hasMeaningfulAlert = previous.some(
        (alert) => alert.id !== "monitoring-idle" && alert.id !== "ingestion-error"
      );

      if (hasMeaningfulAlert) {
        return previous;
      }

      if (previous.length === 1 && previous[0].id === fallbackId) {
        return [
          {
            ...fallbackAlert,
            updatedAt: previous[0].updatedAt ?? fallbackAlert.updatedAt,
          },
        ];
      }

      replaced = true;
      return [fallbackAlert];
    });

    if (replaced) {
      alertsFingerprintRef.current = null;
    }
  }, [state.session.status]);

  const handleUpdate = useCallback((update: LiveUpdate) => {
    setState((prev) => {
      switch (update.type) {
        case "reset": {
          return createInitialState(update.payload);
        }
        case "ai-mood": {
          return {
            ...prev,
            moodAnalysis: {
              moodScore: update.payload.moodScore,
              moodBalance: update.payload.moodBalance,
              sampleSize: update.payload.sampleSize,
              generatedAt: update.payload.generatedAt,
              summary: update.payload.summary,
              themes: update.payload.themes ?? [],
            },
          };
        }
        case "session": {
          const nextStartedAt =
            typeof update.payload.startedAt === "undefined"
              ? prev.session.startedAt
              : update.payload.startedAt ?? null;
          return {
            ...prev,
            session: {
              status: update.payload.status,
              channel:
                typeof update.payload.channel === "undefined"
                  ? prev.session.channel
                  : update.payload.channel,
              startedAt:
                nextStartedAt,
            },
          };
        }
        case "metrics": {
          return {
            ...prev,
            metrics: {
              messageRate:
                typeof update.payload.messageRate === "undefined"
                  ? prev.metrics.messageRate
                  : update.payload.messageRate,
              sentiment:
                typeof update.payload.sentiment === "undefined"
                  ? prev.metrics.sentiment
                  : update.payload.sentiment,
              uniqueChatters:
                typeof update.payload.uniqueChatters === "undefined"
                  ? prev.metrics.uniqueChatters
                  : update.payload.uniqueChatters,
              trend:
                typeof update.payload.trend === "undefined"
                  ? prev.metrics.trend
                  : update.payload.trend,
              baseline: {
                messageRate:
                  typeof update.payload.baseline?.messageRate === "undefined"
                    ? prev.metrics.baseline.messageRate
                    : update.payload.baseline?.messageRate ?? null,
                uniqueChatters:
                  typeof update.payload.baseline?.uniqueChatters === "undefined"
                    ? prev.metrics.baseline.uniqueChatters
                    : update.payload.baseline?.uniqueChatters ?? null,
                newcomers:
                  typeof update.payload.baseline?.newcomers === "undefined"
                    ? prev.metrics.baseline.newcomers
                    : update.payload.baseline?.newcomers ?? null,
              },
            },
          };
        }
        case "timeline": {
          if ("points" in update.payload) {
            const payload = update.payload as { points: TimelinePoint[] };
            const slice = payload.points.slice(-MAX_TIMELINE_POINTS);
            return { ...prev, timeline: slice };
          }
          if ("point" in update.payload) {
            const payload = update.payload as { point: TimelinePoint };
            const deduped = prev.timeline.filter(
              (point) => point.timestamp !== payload.point.timestamp
            );
            const next = [...deduped, payload.point]
              .sort((a, b) => a.timestamp - b.timestamp)
              .slice(-MAX_TIMELINE_POINTS);
            return { ...prev, timeline: next };
          }
          return prev;
        }
        case "events": {
          if ("events" in update.payload) {
            const payload = update.payload as { events: EventItem[] };
            const next = payload.events
              .slice()
              .sort((a, b) => b.timestamp - a.timestamp)
              .slice(0, MAX_EVENTS);
            return { ...prev, events: next };
          }
          if ("event" in update.payload) {
            const payload = update.payload as { event: EventItem };
            const filtered = prev.events.filter((event) => event.id !== payload.event.id);
            const next = [payload.event, ...filtered].slice(0, MAX_EVENTS);
            return { ...prev, events: next };
          }
          return prev;
        }
        case "tokens": {
          return {
            ...prev,
            tokens: {
              tokens: update.payload.tokens ?? prev.tokens.tokens,
              emotes: update.payload.emotes ?? prev.tokens.emotes,
            },
          };
        }
        case "audience": {
          return {
            ...prev,
            audience: {
              uniqueChatters:
                typeof update.payload.uniqueChatters === "undefined"
                  ? prev.audience.uniqueChatters
                  : update.payload.uniqueChatters,
              newcomers:
                typeof update.payload.newcomers === "undefined"
                  ? prev.audience.newcomers
                  : update.payload.newcomers,
              sentimentScore:
                typeof update.payload.sentimentScore === "undefined"
                  ? prev.audience.sentimentScore
                  : update.payload.sentimentScore,
              baseline: {
                uniqueChatters:
                  typeof update.payload.baseline?.uniqueChatters === "undefined"
                    ? prev.audience.baseline.uniqueChatters
                    : update.payload.baseline?.uniqueChatters ?? null,
                newcomers:
                  typeof update.payload.baseline?.newcomers === "undefined"
                    ? prev.audience.baseline.newcomers
                    : update.payload.baseline?.newcomers ?? null,
              },
            },
          };
        }
        case "chat": {
          const filtered = prev.chat.filter((message) => message.id !== update.payload.id);
          const next = [update.payload, ...filtered].slice(0, MAX_CHAT_MESSAGES);
          return { ...prev, chat: next };
        }
        default:
          return prev;
      }
    });
  }, []);

  const channelKey = channelLogin?.toLowerCase() ?? null;

  useEffect(() => {
    if (!channelKey) {
      return;
    }
    let eventSource: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const connect = () => {
      if (cancelled) {
        return;
      }
      const url = `/api/live-feed?channel=${encodeURIComponent(channelKey)}`;
      eventSource = new EventSource(url);

      eventSource.onmessage = (event) => {
        if (!event.data) {
          return;
        }
        try {
          const update = JSON.parse(event.data) as LiveUpdate;
          handleUpdate(update);
          if (update.type === "session") {
            setIngestionConnected(update.payload.status === "listening");
          }
        } catch (error) {
          console.warn("Failed to parse live update", error);
        }
      };

      eventSource.onerror = () => {
        setIngestionConnected(false);
        eventSource?.close();
        if (!cancelled) {
          retryTimer = setTimeout(connect, 2000);
        }
      };
    };

    connect();

    return () => {
      cancelled = true;
      eventSource?.close();
      if (retryTimer) {
        clearTimeout(retryTimer);
      }
    };
  }, [handleUpdate, channelKey]);

  const derived = useMemo(() => {
    const messageRate = state.metrics.messageRate ?? 0;
    const uniqueChatters = state.metrics.uniqueChatters ?? state.audience.uniqueChatters ?? 0;
    const newcomers = state.audience.newcomers;
    const baselineMetrics = state.metrics.baseline;
    const messageBaseline = baselineMetrics.messageRate;
    const uniqueBaseline = baselineMetrics.uniqueChatters;
    const newcomersBaseline = baselineMetrics.newcomers;

    const messageBaselineReady = Boolean(
      messageBaseline?.ready && typeof messageBaseline?.long === "number"
    );
    const messageBaselineLong =
      messageBaselineReady && typeof messageBaseline?.long === "number"
        ? messageBaseline.long
        : null;
    const messageBaselineStd =
      messageBaselineReady && typeof messageBaseline?.std === "number"
        ? Math.max(messageBaseline.std ?? 0, 1)
        : null;
    const rateDeltaPercent =
      messageBaselineLong !== null
        ? ((messageRate - messageBaselineLong) / Math.max(Math.abs(messageBaselineLong), 1)) * 100
        : null;
    const messageRateZ =
      messageBaselineStd !== null && messageBaselineLong !== null
        ? (messageRate - messageBaselineLong) / messageBaselineStd
        : null;

    const newcomersBaselineReady = Boolean(
      newcomersBaseline?.ready && typeof newcomersBaseline?.long === "number"
    );
    const newcomersBaselineLong =
      newcomersBaselineReady && typeof newcomersBaseline?.long === "number"
        ? newcomersBaseline.long
        : null;
    const newcomersDeltaPercent =
      newcomersBaselineLong !== null
        ? ((newcomers - newcomersBaselineLong) /
            Math.max(Math.abs(newcomersBaselineLong), 1)) * 100
        : null;
    const llmSentiment =
      typeof state.moodAnalysis?.moodScore === "number" ? state.moodAnalysis.moodScore : null;
    const sentiment =
      llmSentiment ??
      (typeof state.metrics.sentiment === "number"
        ? state.metrics.sentiment
        : state.audience.sentimentScore ?? 0);

    const engagement = computeEngagementScore({
      messageRate,
      uniqueChatters,
      sentiment,
      baseline: {
        messageRate: state.metrics.baseline.messageRate,
        uniqueChatters: state.metrics.baseline.uniqueChatters,
      },
    });

    const engagementHue = 210 - (engagement.score / 100) * 90;

    const sentimentMeta = sentimentLabel(sentiment);
    const trendPercent = state.metrics.trend ?? null;
    const sessionDuration = formatDuration(state.session.startedAt);
    const statusMeta = describeStatus(state.session.status, ingestionConnected);

    const timelineVelocity = state.timeline.map((point) => point.velocity);
    const velocityPeak = timelineVelocity.length > 0 ? Math.max(...timelineVelocity) : 0;

    const chatSample = state.chat.slice(0, 50);

    const toneCounts = state.chat.reduce((acc, message) => {
      const tone = message.tone ?? "unknown";
      acc[tone] = (acc[tone] ?? 0) + 1;
      return acc;
    }, {} as Partial<Record<ChatTone, number>>);

    const totalToneMessages = state.chat.length;
    const safeToneDenominator = totalToneMessages === 0 ? 1 : totalToneMessages;
    const getToneTotal = (tones: ChatTone[]) =>
      tones.reduce((sum, tone) => sum + (toneCounts[tone] ?? 0), 0);

    const positiveToneCount = getToneTotal(POSITIVE_TONE_SET);
    const negativeToneCount = getToneTotal(NEGATIVE_TONE_SET);
    const toxicToneCount = getToneTotal(TOXIC_TONE_SET);
    const questionToneCount = getToneTotal(QUESTION_TONE_SET);
    const spamToneCount = getToneTotal(SPAM_TONE_SET);
    const latestTone = state.chat[0]?.tone ?? "unknown";

    const recentToneWindow = state.chat.slice(0, TONE_RECENT_WINDOW);
    const recentPositiveToneCount = recentToneWindow.filter((message) =>
      POSITIVE_TONE_SET.includes(message.tone)
    ).length;
    const recentNegativeToneCount = recentToneWindow.filter((message) =>
      NEGATIVE_TONE_SET.includes(message.tone)
    ).length;
    const recentToxicToneCount = recentToneWindow.filter((message) =>
      TOXIC_TONE_SET.includes(message.tone)
    ).length;

    const questions = state.chat
      .filter((message) => message.tone === "question" || message.text.includes("?"))
      .slice(0, 12)
      .map((message) => ({
        id: message.id,
        author: message.author,
        text: message.text,
        timestamp: message.timestamp,
      }));

    const insights = state.events.map((event) => ({
      id: event.id,
      title: event.title,
      detail: event.detail,
      timestamp: event.timestamp,
      relative: formatEventTimestamp(event.timestamp),
    }));

    return {
      messageRate,
      uniqueChatters,
      newcomers,
      sentiment,
      engagement,
      engagementHue,
      sentimentMeta,
      trendPercent,
      sessionDuration,
      statusMeta,
      velocityPeak,
      chatSample,
      questions,
      insights,
      baseline: baselineMetrics,
      messageBaselineReady,
      rateDeltaPercent,
      messageRateZ,
      newcomersBaselineReady,
      newcomersDeltaPercent,
      moodBalance: state.moodAnalysis?.moodBalance ?? null,
      moodSampleSize: state.moodAnalysis?.sampleSize ?? null,
      moodGeneratedAt: state.moodAnalysis?.generatedAt ?? null,
      toneSummary: {
        counts: toneCounts,
        latestTone,
        total: totalToneMessages,
        ratios: {
          positive: positiveToneCount / safeToneDenominator,
          negative: negativeToneCount / safeToneDenominator,
          toxic: toxicToneCount / safeToneDenominator,
          question: questionToneCount / safeToneDenominator,
          spam: spamToneCount / safeToneDenominator,
        },
        recent: {
          positive: recentPositiveToneCount,
          negative: recentNegativeToneCount,
          toxic: recentToxicToneCount,
        },
      },
    };
  }, [state, ingestionConnected]);

  const fetchAlerts = useCallback(
    async (force = false) => {
      if (alertsFetchInFlightRef.current) {
        return;
      }

      const now = Date.now();
      if (!force && now - lastAlertsFetchAtRef.current < ALERT_FETCH_INTERVAL_MS) {
        return;
      }

      alertsFetchInFlightRef.current = true;

      try {
        const recentMessages = [...state.chat]
          .sort((a, b) => a.timestamp - b.timestamp)
          .slice(-60);

        const requestTimestamp = Date.now();
        const lastAlert = alertsRef.current[0] ?? null;
        const historyPayload = {
          previousAlert: lastAlert
            ? {
                type: lastAlert.id,
                priority: lastAlert.priority,
                timestamp: lastAlert.updatedAt,
                message: lastAlert.message,
              }
            : null,
          previousTone: derived.toneSummary?.latestTone ?? null,
          secondsSinceLastAlert: lastAlert
            ? Math.max(0, Math.round((requestTimestamp - lastAlert.updatedAt) / 1000))
            : null,
        };

        const sessionPayload = {
          startedAt: state.session.startedAt ?? null,
          durationSeconds:
            typeof state.session.startedAt === "number"
              ? Math.max(0, Math.floor((requestTimestamp - state.session.startedAt) / 1000))
              : null,
        };

        const toneCounts = derived.toneSummary?.counts ?? {};
        const hypeCandidateCount =
          (toneCounts.hype ?? 0) + (toneCounts.supportive ?? 0) + (toneCounts.humor ?? 0);

        const safeBaseline = {
          messageRate: state.metrics.baseline.messageRate ?? undefined,
          uniqueChatters: state.metrics.baseline.uniqueChatters ?? undefined,
          newcomers: state.metrics.baseline.newcomers ?? undefined,
        };

        const body = {
          messages: recentMessages.map((message) => ({
            id: message.id,
            author: message.author,
            text: message.text,
            timestamp: message.timestamp,
            tone: message.tone,
            toneConfidence:
              typeof message.toneConfidence === "number"
                ? Math.max(0, Math.min(1, message.toneConfidence))
                : undefined,
          })),
          metrics: {
            messageRate: derived.messageRate ?? 0,
            uniqueChatters: derived.uniqueChatters ?? 0,
            newcomers: derived.newcomers ?? 0,
            sentiment: derived.sentiment ?? 0,
            trend: derived.trendPercent ?? 0,
            spamCandidates: toneCounts.spam ?? 0,
            hypeCandidates: hypeCandidateCount,
          },
          baseline: safeBaseline,
          history: historyPayload,
          session: sessionPayload,
        };

        const response = await fetch("/api/coach-summary", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          return;
        }

        const json = await response.json();
        if (!json || !Array.isArray(json.alerts)) {
          return;
        }

        const fingerprint = JSON.stringify(json.alerts);
        if (fingerprint === alertsFingerprintRef.current) {
          return;
        }

        alertsFingerprintRef.current = fingerprint;

        if (!isMountedRef.current) {
          return;
        }

        const updateTime = Date.now();

        setAlerts((previous) => {
          const normalized = json.alerts
            .map((alert: any, index: number) => {
              const tone =
                alert?.tone === "positive" || alert?.tone === "neutral" || alert?.tone === "negative"
                  ? alert.tone
                  : "neutral";
              const priority =
                alert?.priority === "high" || alert?.priority === "medium" || alert?.priority === "low"
                  ? alert.priority
                  : "medium";
              const updatedAt =
                typeof alert?.updatedAt === "number" && Number.isFinite(alert.updatedAt)
                  ? alert.updatedAt
                  : updateTime;

              const id =
                typeof alert?.id === "string" && alert.id.trim().length > 0
                  ? alert.id
                  : `${updatedAt}-${index}`;

              const message = typeof alert?.message === "string" ? alert.message.trim() : "";
              if (!message) {
                return null;
              }

              return {
                id,
                message,
                tone,
                priority,
                updatedAt,
              };
            })
            .filter((alert: DashboardAlert | null): alert is DashboardAlert => alert !== null);

          const windowFiltered = (alert: DashboardAlert) =>
            updateTime - alert.updatedAt <= ALERT_HISTORY_WINDOW_MS;

          const combined = [...normalized, ...previous].filter(windowFiltered);
          const dedupedMap = new Map<string, DashboardAlert>();
          for (const alert of combined) {
            if (!dedupedMap.has(alert.id) || dedupedMap.get(alert.id)!.updatedAt < alert.updatedAt) {
              dedupedMap.set(alert.id, alert);
            }
          }

          const sorted = Array.from(dedupedMap.values()).sort((a, b) => b.updatedAt - a.updatedAt);
          const moodTone: "positive" | "neutral" | "negative" =
            derived.sentimentMeta.label === "Positive"
              ? "positive"
              : derived.sentimentMeta.label === "Negative"
                ? "negative"
                : "neutral";
          const recentToxic = derived.toneSummary?.recent.toxic ?? 0;

          const adjusted = sorted.map((alert) => {
            const messageLower = alert.message.toLowerCase();
            const isToxicAlert =
              messageLower.includes("toxic") || messageLower.includes("toxicity");

            if (
              alert.message === CALM_ALERT_MESSAGE &&
              state.session.status !== "listening"
            ) {
              return null;
            }

            if (
              isToxicAlert &&
              moodTone !== "negative" &&
              (recentToxic === 0 || updateTime - alert.updatedAt > 60000)
            ) {
              return {
                ...alert,
                tone: moodTone,
              };
            }

            if (
              alert.tone === "negative" &&
              moodTone !== "negative" &&
              updateTime - alert.updatedAt > 90000
            ) {
              return {
                ...alert,
                tone: moodTone,
              };
            }

            return alert;
          });

          const dedupedByMessage: DashboardAlert[] = [];
          let calmAdded = false;
          for (const alert of adjusted) {
            if (!alert) {
              continue;
            }
            if (alert.message === CALM_ALERT_MESSAGE) {
              if (calmAdded) {
                continue;
              }
              calmAdded = true;
            }
            if (!dedupedByMessage.some((existing) => existing.message === alert.message)) {
              dedupedByMessage.push(alert);
            }
          }
          return dedupedByMessage;
        });
      } catch (error) {
        console.warn("[alerts] Failed to fetch AI alerts", error);
      } finally {
        alertsFetchInFlightRef.current = false;
        lastAlertsFetchAtRef.current = Date.now();
      }
    },
    [
      state.chat,
      state.session.startedAt,
      derived.messageRate,
      derived.uniqueChatters,
      derived.newcomers,
      derived.sentiment,
      derived.trendPercent,
      derived.toneSummary,
    ]
  );

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts, state.chat.length, state.session.status]);

  useEffect(() => {
    const interval = setInterval(() => {
      fetchAlerts(true);
    }, Math.max(ALERT_FETCH_INTERVAL_MS * 3, 5000));

    return () => {
      clearInterval(interval);
    };
  }, [fetchAlerts]);

  const moodBalanceLabel = derived.moodBalance
    ? derived.moodBalance.positive > derived.moodBalance.negative
      ? derived.moodBalance.positive >= derived.moodBalance.neutral
        ? "Positive"
        : "Neutral"
      : derived.moodBalance.negative > derived.moodBalance.neutral
        ? "Negative"
        : "Neutral"
    : derived.sentimentMeta.label;

  const moodBalanceDetails = derived.moodBalance
    ? `${Math.round(derived.moodBalance.positive)}% pos / ${Math.round(derived.moodBalance.neutral)}% neutral / ${Math.round(derived.moodBalance.negative)}% neg`
    : typeof derived.sentiment === "number"
      ? `${(derived.sentiment * 50 + 50).toFixed(0)}% positive`
      : "Collecting";
  const moodMetricTone =
    derived.sentiment > 0.02 ? "positive" : derived.sentiment < -0.02 ? "negative" : "neutral";

  return (
    <div className="flex flex-col gap-4 lg:gap-5">
      <section className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)]">
        <div className="flex h-[36rem] flex-col rounded-3xl border border-slate-800 bg-slate-950/80 p-5 shadow-lg shadow-slate-950/40">
          <header className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.35em] text-slate-500">Live chat</p>
              <p className="text-sm text-slate-500">Latest 50 messages</p>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${derived.statusMeta.badgeTone}`}
              >
                {derived.statusMeta.label}
              </span>
              <span className="rounded-full border border-slate-800 px-3 py-1 text-xs font-semibold text-slate-300">
                {typeof derived.messageRate === "number"
                  ? `${formatNumber(derived.messageRate, { maximumFractionDigits: 0 })} / min`
                  : "Collecting"}
              </span>
            </div>
          </header>
          <div className="mt-4 flex-1 overflow-y-auto rounded-2xl border border-slate-900 bg-slate-950/40">
            {derived.chatSample.length > 0 ? (
              <ul className="divide-y divide-slate-900 text-sm">
                {derived.chatSample.map((message) => (
                  <li
                    key={message.id}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm leading-snug"
                  >
                    <span className="font-semibold text-slate-300">
                      @{message.author}
                    </span>
                    <span className="flex-1 break-words text-slate-200">
                      {message.text}
                    </span>
                    <span className="shrink-0 text-xs uppercase tracking-[0.2em] text-slate-500">
                      {timeFormatter.format(new Date(message.timestamp))}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">
                Messages will appear here as soon as chat speaks.
              </div>
            )}
          </div>
        </div>

        <div className="flex h-[36rem] flex-col overflow-hidden rounded-3xl border border-slate-800 bg-slate-950/80 p-5 shadow-lg shadow-slate-950/40">
          <header className="flex items-center justify-between gap-3">
            <p className="text-xs uppercase tracking-[0.35em] text-slate-500">Community voice</p>
            <span className="text-xs text-slate-500">
              {alerts.length ? `${alerts.length} highlight${alerts.length === 1 ? "" : "s"}` : "Collecting"}
            </span>
          </header>
          <div className="mt-4 flex flex-1 flex-col gap-4">
            <div className="flex-1 overflow-y-auto pr-3">
              <AlertList alerts={alerts} />
            </div>
            <div className="grid flex-1 gap-4 overflow-hidden lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.5fr)]">
              <div className="flex flex-1 flex-col overflow-hidden">
                <div className="flex-1 overflow-y-auto pr-2">
                  <TrendList
                    title="Top Emotes"
                    rows={state.tokens.emotes.slice(0, 6).map((emote) => ({
                      name: emote.name,
                      meta: `×${emote.count}`,
                    }))}
                    emptyLabel="Emotes will appear once chat uses them."
                    symbolPrefix="😄"
                  />
                </div>
              </div>
              <div className="flex flex-1 flex-col overflow-hidden">
                <QuestionList questions={derived.questions} />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6">
        <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-4 shadow-lg shadow-slate-950/40">
          <header>
            <p className="text-xs uppercase tracking-[0.35em] text-slate-500">Engagement pulse</p>
          </header>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <MetricStat
              title="Messages / min"
              value={formatNumber(derived.messageRate, { maximumFractionDigits: 0 })}
              helper={
                derived.messageBaselineReady && typeof derived.rateDeltaPercent === "number"
                  ? `${formatPercent(derived.rateDeltaPercent)} vs typical pace`
                  : derived.trendPercent !== null
                    ? `${formatPercent(derived.trendPercent)} vs last 10 minutes`
                    : "Collecting baseline"
              }
              tone={(() => {
                const delta = derived.messageBaselineReady
                  ? derived.rateDeltaPercent ?? 0
                  : derived.trendPercent ?? 0;
                if (delta > 5) return "positive";
                if (delta < -5) return "negative";
                return "neutral";
              })()}
            />
            <MetricStat
              title="Active chatters"
              value={formatNumber(derived.uniqueChatters)}
              helper="Rolling 15 minute window"
            />
            <MetricStat
              title="New chatters"
              value={formatNumber(derived.newcomers)}
              helper="Real-time"
            />
            <MetricStat
              title="Mood balance"
              value={moodBalanceLabel}
              helper={moodBalanceDetails}
              tone={moodMetricTone}
            />
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-6 shadow-lg shadow-slate-950/40">
        <header className="flex flex-col gap-1">
          <p className="text-xs uppercase tracking-[0.35em] text-slate-500">Mood & velocity</p>
          <h3 className="text-lg font-semibold text-slate-100">Chat energy over time</h3>
          <p className="text-sm text-slate-400">
            Correlate spikes in messages with audience mood to spot the moments worth leaning into.
          </p>
        </header>
        <MoodVelocityTrack points={state.timeline} peak={derived.velocityPeak} sentiment={derived.sentiment} />
      </section>
    </div>
  );
}

type MetricStatProps = {
  title: string;
  value: string;
  helper?: string;
  tone?: "positive" | "negative" | "neutral";
};

function MetricStat({ title, value, helper, tone = "neutral" }: MetricStatProps) {
  const toneClass =
    tone === "positive"
      ? "text-emerald-300"
      : tone === "negative"
        ? "text-rose-300"
        : "text-slate-200";
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/40 px-3 py-2">
      <p className="text-xs uppercase tracking-[0.3em] text-slate-500">{title}</p>
      <p className={`mt-1.5 text-lg font-semibold ${toneClass}`}>{value}</p>
      {helper ? <p className="mt-1 text-[10px] text-slate-500">{helper}</p> : null}
    </div>
  );
}

type MoodVelocityTrackProps = {
  points: TimelinePoint[];
  peak: number;
  sentiment: number;
};

function MoodVelocityTrack({ points, peak, sentiment }: MoodVelocityTrackProps) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const normalized = useMemo(() => {
    if (points.length === 0 || peak === 0) {
      return [] as Array<{ x: number; y: number }>;
    }
    const minTime = points[0].timestamp;
    const maxTime = points[points.length - 1].timestamp;
    const span = Math.max(maxTime - minTime, 1);
    return points.map((point) => ({
      x: (point.timestamp - minTime) / span,
      y: point.velocity / Math.max(peak, 1),
    }));
  }, [points, peak]);

  const moodHue = sentiment > 0.3 ? "from-emerald-500/20" : sentiment < -0.3 ? "from-rose-500/20" : "from-slate-500/20";

  const handlePointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (normalized.length === 0) {
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    let nearestIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;
    normalized.forEach((point, index) => {
      const distance = Math.abs(point.x - ratio);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });
    setHoverIndex(nearestIndex);
  };

  const hoveredPoint = hoverIndex !== null ? points[hoverIndex] : null;
  const hoveredNormalized = hoverIndex !== null ? normalized[hoverIndex] : null;
  const tooltipLeft = hoveredNormalized ? clamp(hoveredNormalized.x * 100, 8, 92) : 0;
  const tooltipTop = hoveredNormalized ? clamp((1 - hoveredNormalized.y) * 100, 35, 82) : 0;

  return (
    <div className="mt-6">
      <div
        className={`relative h-48 w-full overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/40 ${normalized.length === 0 ? "flex items-center justify-center text-sm text-slate-500" : ""}`}
      >
        {normalized.length === 0 ? (
          <span>Waiting for live chat activity…</span>
        ) : (
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full">
            <defs>
              <linearGradient id="velocityGradient" x1="0" x2="1" y1="0" y2="1">
                <stop offset="0%" stopColor="rgba(124, 58, 237, 0.4)" />
                <stop offset="100%" stopColor="rgba(59, 130, 246, 0.2)" />
              </linearGradient>
            </defs>
            <polygon
              points={`0,100 ${normalized
                .map((point) => `${point.x * 100},${(1 - point.y) * 100}`)
                .join(" ")} 100,100`}
              fill="url(#velocityGradient)"
              stroke="none"
            />
            <polyline
              points={normalized.map((point) => `${point.x * 100},${(1 - point.y) * 100}`).join(" ")}
              fill="none"
              stroke="rgba(124, 58, 237, 0.8)"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
        {normalized.length > 0 ? (
          <div className={`pointer-events-none absolute inset-0 bg-gradient-to-b ${moodHue} to-slate-950/40`} />
        ) : null}
        {hoveredPoint && hoveredNormalized ? (
          <>
            <div
              className="pointer-events-none absolute inset-y-0 w-px bg-violet-400/60"
              style={{ left: `${hoveredNormalized.x * 100}%` }}
            />
            <div
              className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-lg border border-slate-700 bg-slate-900/95 px-3 py-2 text-xs text-slate-200 shadow-lg shadow-slate-950/40"
              style={{
                left: `${tooltipLeft}%`,
                top: `${tooltipTop}%`,
              }}
            >
              <p className="font-semibold text-slate-100">
                {formatNumber(hoveredPoint.velocity)} messages/min
              </p>
              <p className="text-[11px] text-slate-400">
                {timeFormatter.format(new Date(hoveredPoint.timestamp))}
              </p>
            </div>
          </>
        ) : null}
        {normalized.length > 0 ? (
          <div
            className="absolute inset-0 cursor-crosshair"
            onPointerMove={handlePointer}
            onPointerDown={handlePointer}
            onPointerLeave={() => setHoverIndex(null)}
          />
        ) : null}
      </div>
      <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
        <span>Earlier</span>
        <span>Latest</span>
      </div>
    </div>
  );
}

type QuestionListProps = {
  questions: Array<{ id: string; author: string; text: string; timestamp: number }>;
};

function QuestionList({ questions }: QuestionListProps) {
  if (questions.length === 0) {
    return (
      <div className="flex h-full flex-col space-y-2">
        <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Questions</p>
        <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-slate-800 bg-slate-900/30 px-3 py-4 text-xs text-slate-500">
          Questions from chat will appear once they start asking.
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col space-y-2">
      <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Questions</p>
      <div className="flex flex-1 flex-col overflow-hidden">
        <ul className="flex flex-1 flex-col divide-y divide-slate-800 overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900/40 pr-1 text-slate-200">
          {questions.map((question) => (
            <li key={question.id} className="space-y-1 px-4 py-3 text-base leading-snug">
              <p className="font-medium text-slate-100">
                {truncateText(question.text, 160)}
              </p>
              <div className="flex items-center gap-3 text-[11px] uppercase tracking-[0.25em] text-slate-500">
                <span className="truncate">@{question.author}</span>
                <span className="h-2 w-px bg-slate-700" />
                <span>{timeFormatter.format(new Date(question.timestamp))}</span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function truncateText(text: string, maxLength = 80) {
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength - 1)}…`;
}
