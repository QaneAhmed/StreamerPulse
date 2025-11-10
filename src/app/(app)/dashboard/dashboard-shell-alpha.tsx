'use client';

import { useCallback, useEffect, useMemo, useState } from "react";
import AudienceCard from "./components/audience-card";
import EventsCard from "./components/events-card";
import LiveChatFeed from "./components/live-chat-feed";
import MetricCard from "./components/metric-card";
import SessionStatusCard from "./components/session-status-card";
import TopTokensCard from "./components/top-tokens-card";

type SessionStatus = "idle" | "listening" | "errored";

type TimelinePoint = {
  timestamp: number;
  velocity: number;
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
  emotes?: {
    code: string;
    id?: string | null;
    imageUrl?: string | null;
    start?: number | null;
    end?: number | null;
  }[];
};

type BaselineSnapshot = {
  short: number | null;
  long: number | null;
  std: number | null;
  samples: number;
  ready: boolean;
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
};

const DASHBOARD_STORAGE_KEY = "streamerpulse:dashboard-state";

const MAX_TIMELINE_POINTS = 60;
const MAX_CHAT_MESSAGES = 50;
const MAX_EVENTS = 20;

type DashboardShellAlphaProps = {
  initialState?: Partial<LiveState>;
  initialIngestionConnected?: boolean;
  channelLogin?: string | null;
  viewerId?: string | null;
};

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

export default function DashboardShellAlpha({
  initialState: initialOverrides,
  initialIngestionConnected,
  channelLogin,
  viewerId,
}: DashboardShellAlphaProps) {
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
  const effectiveStatus = computeEffectiveStatus(state.session, ingestionConnected, state.chat);

  useEffect(() => {
    if (typeof initialIngestionConnected === "boolean") {
      // Keep the local connection flag in sync with server-provided status.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIngestionConnected(initialIngestionConnected);
    }
  }, [initialIngestionConnected]);

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
    } catch (error) {
      console.warn("Failed to persist dashboard state", error);
    }
  }, [state, ingestionConnected]);

  const handleUpdate = useCallback((update: LiveUpdate) => {
    setState((prev) => {
      switch (update.type) {
        case "session": {
          return {
            ...prev,
            session: {
              status: update.payload.status,
              channel:
                typeof update.payload.channel === "undefined"
                  ? prev.session.channel
                  : update.payload.channel,
              startedAt:
                typeof update.payload.startedAt === "undefined"
                  ? prev.session.startedAt
                  : update.payload.startedAt,
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

  const metricCards = useMemo(() => {
    const messageRateValue =
      typeof state.metrics.messageRate === "number"
        ? state.metrics.messageRate.toLocaleString()
        : "--";
    const sentimentValue =
      typeof state.metrics.sentiment === "number"
        ? state.metrics.sentiment.toFixed(2)
        : "0.00";
    const uniqueValue =
      typeof state.metrics.uniqueChatters === "number"
        ? state.metrics.uniqueChatters.toLocaleString()
        : "0";

    const sessionHelper =
      effectiveStatus === "listening"
        ? "Session is streaming live data."
        : "Session controls become available after connecting Twitch.";

    return [
      {
        label: "Messages / min",
        value: messageRateValue,
        helper:
          effectiveStatus === "listening"
            ? "Updating every ~5 seconds."
            : "Start a monitoring session to populate this metric.",
        trend: state.metrics.trend ?? undefined,
      },
      {
        label: "Sentiment window",
        value: sentimentValue,
        helper: "Scores range from −1 (negative) to 1 (positive).",
      },
      {
        label: "Unique chatters",
        value: uniqueValue,
        helper: "Rolling 10 minute window covering first-time and returning chatters.",
      },
      {
        label: "Active session",
        value: effectiveStatus === "listening" ? "Live" : effectiveStatus === "errored" ? "Error" : "Idle",
        helper: sessionHelper,
      },
    ];
  }, [state.metrics, effectiveStatus]);

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">Live Dashboard</h1>
        <p className="max-w-2xl text-sm text-slate-400">
          Once your Twitch channel is connected you can start a monitoring session and
          watch StreamerPulse compute message velocity, sentiment, spikes, and top emotes in
          near real time. Finish onboarding in Settings to enable ingestion.
        </p>
      </section>

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <SessionStatusCard
          status={effectiveStatus}
          channel={state.session.channel}
          startedAt={state.session.startedAt}
          ingestionConnected={ingestionConnected}
        />
        <AudienceCard
          uniqueChatters={state.audience.uniqueChatters}
          newcomers={state.audience.newcomers}
          sentimentScore={state.audience.sentimentScore}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metricCards.map((metric) => (
          <MetricCard key={metric.label} {...metric} />
        ))}
      </div>

      <EventsCard events={state.events} />

      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <TopTokensCard tokens={state.tokens.tokens} emotes={state.tokens.emotes} />
        <LiveChatFeed messages={state.chat} />
      </div>
    </div>
  );
}
