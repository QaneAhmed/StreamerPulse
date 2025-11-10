'use client';

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AlertList from "./components/alert-list";
import { ChatMessageText } from "./components/chat-message-text";
import type { ChatTone } from "@/lib/ai/chat-tone";
import { getTwitchEmoteImageUrl } from "@/lib/twitch/emotes";

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

type EmoteRow = {
  code: string;
  id?: string | null;
  imageUrl?: string | null;
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
  emotes?: {
    code: string;
    id?: string | null;
    imageUrl?: string | null;
    start?: number | null;
    end?: number | null;
  }[];
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
    emotes: EmoteRow[];
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
        ingestionConnected?: boolean;
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
        emotes?: EmoteRow[];
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

const DASHBOARD_STORAGE_KEY = "streamerpulse:dashboard-state";
const DASHBOARD_ALERTS_KEY = `${DASHBOARD_STORAGE_KEY}:alerts`;

const MAX_TIMELINE_POINTS = 120;
const MAX_CHAT_MESSAGES = 50;
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
  viewerId?: string | null;
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
      emotes: normalizeEmoteRows(overrides.tokens?.emotes ?? initialState.tokens.emotes),
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

function normalizeEmoteRows(input: unknown): EmoteRow[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const normalized: EmoteRow[] = [];

  input.forEach((item) => {
    if (typeof item === "string") {
      normalized.push({ code: item, id: null, imageUrl: null, count: 0 });
      return;
    }
    if (!item || typeof item !== "object") {
      return;
    }

    const candidate = item as Partial<EmoteRow> & { name?: string };
    const code =
      typeof candidate.code === "string" && candidate.code.trim().length > 0
        ? candidate.code
        : typeof candidate.name === "string" && candidate.name.trim().length > 0
          ? candidate.name
          : null;

    if (!code) {
      return;
    }

    const id =
      typeof candidate.id === "string" && candidate.id.trim().length > 0
        ? candidate.id
        : null;

    const imageUrl =
      typeof candidate.imageUrl === "string" && candidate.imageUrl.trim().length > 0
        ? candidate.imageUrl
        : null;

    const count =
      typeof candidate.count === "number" && Number.isFinite(candidate.count)
        ? candidate.count
        : 0;

    normalized.push({ code, id, imageUrl, count });
  });

  return normalized;
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

function describeStatus(status: SessionStatus) {
  if (status === "listening") {
    return {
      label: "Live",
      helper: "We are ingesting chat in real time.",
      badgeTone: "bg-emerald-500/10 text-emerald-300 border border-emerald-500/40",
    };
  }

  return {
    label: "Offline",
    helper: "Start the ingestion worker to begin streaming insights.",
    badgeTone: "bg-slate-800 text-slate-300 border border-slate-700",
  };
}

function computeEffectiveStatus(
  session: LiveState["session"],
  ingestionConnected: boolean,
  chat: ChatMessage[]
): SessionStatus {
  if (session.status === "errored") {
    return "errored";
  }
  if (session.status === "listening") {
    return "listening";
  }
  if (session.startedAt) {
    return "listening";
  }
  if (ingestionConnected && chat.length > 0) {
    return "listening";
  }
  return session.status;
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
  viewerId,
}: DashboardShellProps) {
  const [state, setState] = useState<LiveState>(() => {
    const baseOverrides = initialOverrides ?? {};
    if (typeof window === "undefined") {
      return createInitialState(baseOverrides);
    }

    try {
      const raw = window.sessionStorage.getItem(DASHBOARD_STORAGE_KEY);
      if (raw) {
        const persisted = JSON.parse(raw) as Partial<LiveState>;
        return createInitialState({ ...baseOverrides, ...persisted });
      }
    } catch (error) {
      console.warn("Failed to restore dashboard state from sessionStorage", error);
    }

    return createInitialState(baseOverrides);
  });
  const [ingestionConnected, setIngestionConnected] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      const stored = window.sessionStorage.getItem(`${DASHBOARD_STORAGE_KEY}:ingestion`);
      if (stored === "true" || stored === "false") {
        return stored === "true";
      }
    }
    if (typeof initialIngestionConnected === "boolean") {
      return initialIngestionConnected;
    }
    const status = initialOverrides?.session?.status;
    return status === "listening";
  });
  const [alerts, setAlerts] = useState<DashboardAlert[]>(() => {
    if (typeof window === "undefined") {
      return [];
    }
    try {
      const raw = window.sessionStorage.getItem(DASHBOARD_ALERTS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as DashboardAlert[];
        if (Array.isArray(parsed)) {
          return parsed.filter(
            (alert) =>
              alert &&
              typeof alert === "object" &&
              typeof alert.id === "string" &&
              typeof alert.message === "string"
          );
        }
      }
    } catch (error) {
      console.warn("Failed to restore dashboard alerts from sessionStorage", error);
    }
    return [];
  });
  const effectiveStatus = computeEffectiveStatus(state.session, ingestionConnected, state.chat);
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
    if (typeof window === "undefined") {
      return;
    }
    try {
      window.sessionStorage.setItem(DASHBOARD_STORAGE_KEY, JSON.stringify(state));
      window.sessionStorage.setItem(
        `${DASHBOARD_STORAGE_KEY}:ingestion`,
        ingestionConnected ? "true" : "false"
      );
      const alertSnapshot = alerts.slice(0, 50);
      window.sessionStorage.setItem(DASHBOARD_ALERTS_KEY, JSON.stringify(alertSnapshot));
    } catch (error) {
      console.warn("Failed to persist dashboard state", error);
    }
  }, [state, ingestionConnected, alerts]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (effectiveStatus === "listening") {
      setAlerts((previous) =>
        previous.filter(
          (alert) => alert.id !== "monitoring-idle" && alert.id !== "ingestion-error"
        )
      );
      return;
    }

    const sessionStatus = effectiveStatus;
    const fallbackId = sessionStatus === "errored" ? "ingestion-error" : "monitoring-idle";
    const fallbackAlert: DashboardAlert = {
      id: fallbackId,
      message: "Waiting for you to go live.",
      tone: "neutral",
      priority: "medium",
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
  }, [effectiveStatus]);

  const handleUpdate = useCallback((update: LiveUpdate) => {
    setState((prev) => {
      switch (update.type) {
        case "reset": {
          const next = createInitialState(update.payload);
          const sessionOverride = update.payload?.session;
          return {
            ...next,
            session: {
              status: sessionOverride?.status ?? prev.session.status,
              channel: sessionOverride?.channel ?? prev.session.channel,
              startedAt:
                typeof sessionOverride?.startedAt === "undefined"
                  ? prev.session.startedAt
                  : sessionOverride?.startedAt ?? null,
            },
          };
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
          const nextEmotes =
            typeof update.payload.emotes === "undefined"
              ? prev.tokens.emotes
              : normalizeEmoteRows(update.payload.emotes);
          return {
            ...prev,
            tokens: {
              tokens: update.payload.tokens ?? prev.tokens.tokens,
              emotes: nextEmotes,
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
            const connected =
              typeof update.payload.ingestionConnected === "boolean"
                ? update.payload.ingestionConnected
                : update.payload.status === "listening";
            setIngestionConnected(connected);
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
    const statusMeta = describeStatus(effectiveStatus);

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
  }, [state, effectiveStatus]);

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
          channel: channelLogin ?? state.session.channel ?? null,
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
            if (
              alert.message === CALM_ALERT_MESSAGE &&
              effectiveStatus !== "listening"
            ) {
              return null;
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
      state.session.channel,
      effectiveStatus,
      state.metrics.baseline.messageRate,
      state.metrics.baseline.uniqueChatters,
      state.metrics.baseline.newcomers,
      derived.messageRate,
      derived.uniqueChatters,
      derived.newcomers,
      derived.sentiment,
      derived.sentimentMeta.label,
      derived.trendPercent,
      derived.toneSummary,
      channelLogin,
    ]
  );

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts, state.chat.length, effectiveStatus]);

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
                    <span className="font-semibold text-slate-300">@{message.author}</span>
                    <ChatMessageText
                      text={message.text}
                      emotes={message.emotes}
                      className="flex-1 break-words text-slate-200"
                    />
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

        <div className="flex h-[36rem] flex-col rounded-3xl border border-slate-800 bg-slate-950/80 p-5 shadow-lg shadow-slate-950/40">
          <header className="flex items-center justify-between gap-3">
            <p className="text-xs uppercase tracking-[0.35em] text-slate-500">Community voice</p>
            <span className="text-xs text-slate-500">
              {alerts.length ? `${alerts.length} highlight${alerts.length === 1 ? "" : "s"}` : "Collecting"}
            </span>
          </header>
          <div className="mt-4 flex flex-1 flex-col gap-4 min-h-0">
            <div className="flex-1 overflow-hidden min-h-0">
              <div className="h-full overflow-y-auto pr-3">
                <AlertList alerts={alerts} />
              </div>
            </div>
            <div className="grid flex-1 gap-4 overflow-hidden min-h-0 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.5fr)]">
              <div className="flex flex-1 flex-col overflow-hidden min-h-0">
                <div className="flex-1 overflow-y-auto pr-2">
                  <ul className="space-y-2">
                    {state.tokens.emotes.length === 0 ? (
                      <li className="flex items-center justify-between rounded-lg border border-dashed border-slate-800 bg-slate-900/30 px-3 py-2 text-xs text-slate-500">
                        Emotes will appear once chat uses them.
                      </li>
                    ) : (
                      state.tokens.emotes.slice(0, 6).map((emote) => {
                        const src = emote.imageUrl ?? getTwitchEmoteImageUrl(emote.id, { size: "2.0", theme: "dark" });
                        const key = emote.id ?? emote.code;
                        return (
                          <li
                            key={key}
                            className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/30 px-3 py-2 text-sm"
                          >
                            <div className="flex items-center gap-3">
                              {src ? (
                                <Image
                                  src={src}
                                  alt={emote.code}
                                  width={24}
                                  height={24}
                                  className="h-6 w-6 rounded-sm border border-slate-800 bg-slate-950 object-contain"
                                />
                              ) : (
                                <span className="flex h-6 w-6 items-center justify-center rounded-sm border border-dashed border-slate-700 text-[10px] uppercase tracking-[0.2em] text-slate-400">
                                  {emote.code.slice(0, 2).toUpperCase()}
                                </span>
                              )}
                              <span className="text-slate-200">{emote.code}</span>
                            </div>
                            <span className="text-slate-500">×{emote.count.toLocaleString()}</span>
                          </li>
                        );
                      })
                    )}
                  </ul>
                </div>
              </div>
              <div className="flex flex-1 flex-col overflow-hidden min-h-0">
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
      <div className="flex flex-1 flex-col overflow-hidden min-h-0">
        <ul className="flex flex-1 flex-col divide-y divide-slate-800 overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900/40 pr-1 text-slate-200">
          {questions.slice(0, 10).map((question) => (
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
