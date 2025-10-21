import { POST as coachSummary } from "../src/app/api/coach-summary/route";
import { POST as liveFeed } from "../src/app/api/live-feed/route";

const SIM_CHANNEL = (process.env.SIM_CHANNEL ?? "simulation-channel").toLowerCase();

process.env.VERCEL_AI_API_KEY = "";

type ChatSample = {
  author: string;
  text: string;
  timestamp: number;
  tone?: string;
};

type ScenarioKey = "small" | "mid" | "big" | "mega";

type ScenarioConfig = {
  warmupMessages: number;
  activeMessages: number;
  pressureMessages: number;
  warmupMetrics: BaselineMetrics;
  activeMetrics: BaselineMetrics & { sentiment: number; trend: number };
  pressureMetrics: BaselineMetrics & { sentiment: number; trend: number };
  activeSentiment: number;
  pressureSentiment: number;
  midAuthors: number;
};

type BaselineMetrics = {
  messageRate: number;
  uniqueChatters: number;
  newcomers: number;
  sentiment?: number;
  trend?: number;
};

const SCENARIOS: Record<ScenarioKey, ScenarioConfig> = {
  small: {
    warmupMessages: 15,
    activeMessages: 20,
    pressureMessages: 18,
    warmupMetrics: { messageRate: 6, uniqueChatters: 6, newcomers: 2, sentiment: 0.2, trend: 8 },
    activeMetrics: { messageRate: 8, uniqueChatters: 7, newcomers: 1, sentiment: 0.1, trend: 5 },
    pressureMetrics: { messageRate: 5, uniqueChatters: 6, newcomers: 0, sentiment: -0.05, trend: -4 },
    activeSentiment: 0.1,
    pressureSentiment: -0.05,
    midAuthors: 6,
  },
  mid: {
    warmupMessages: 80,
    activeMessages: 90,
    pressureMessages: 70,
    warmupMetrics: { messageRate: 25, uniqueChatters: 64, newcomers: 20, sentiment: 0.35, trend: 12 },
    activeMetrics: { messageRate: 48, uniqueChatters: 68, newcomers: 6, sentiment: 0.28, trend: 18 },
    pressureMetrics: { messageRate: 42, uniqueChatters: 62, newcomers: 2, sentiment: -0.18, trend: -14 },
    activeSentiment: 0.28,
    pressureSentiment: -0.18,
    midAuthors: 55,
  },
  big: {
    warmupMessages: 260,
    activeMessages: 320,
    pressureMessages: 240,
    warmupMetrics: { messageRate: 120, uniqueChatters: 350, newcomers: 48, sentiment: 0.32, trend: 18 },
    activeMetrics: { messageRate: 210, uniqueChatters: 420, newcomers: 32, sentiment: 0.25, trend: 25 },
    pressureMetrics: { messageRate: 160, uniqueChatters: 380, newcomers: 18, sentiment: -0.12, trend: -18 },
    activeSentiment: 0.25,
    pressureSentiment: -0.12,
    midAuthors: 200,
  },
  mega: {
    warmupMessages: 1200,
    activeMessages: 1600,
    pressureMessages: 1200,
    warmupMetrics: { messageRate: 520, uniqueChatters: 1800, newcomers: 120, sentiment: 0.3, trend: 28 },
    activeMetrics: { messageRate: 840, uniqueChatters: 2200, newcomers: 140, sentiment: 0.2, trend: 35 },
    pressureMetrics: { messageRate: 700, uniqueChatters: 2100, newcomers: 80, sentiment: -0.08, trend: -20 },
    activeSentiment: 0.2,
    pressureSentiment: -0.08,
    midAuthors: 600,
  },
};

function buildBaselineSnapshot(values: BaselineMetrics) {
  const clampStd = (value: number) => Math.max(Math.abs(value) * 0.2, 1);
  return {
    messageRate: {
      short: values.messageRate,
      long: Math.max(values.messageRate * 0.9, 1),
      std: clampStd(values.messageRate || 1),
      samples: 240,
      ready: true,
    },
    uniqueChatters: {
      short: values.uniqueChatters,
      long: Math.max(values.uniqueChatters * 0.9, 1),
      std: clampStd(values.uniqueChatters || 1),
      samples: 240,
      ready: true,
    },
    newcomers: {
      short: values.newcomers,
      long: Math.max(values.newcomers * 0.85, 1),
      std: clampStd(values.newcomers || 1),
      samples: 240,
      ready: true,
    },
  };
}

async function callCoachSummary(
  name: string,
  messages: ChatSample[],
  metrics: BaselineMetrics
) {
  const baseline = buildBaselineSnapshot(metrics);
  const body = {
    messages: messages.slice(-60).map((message, index) => ({
      id: `${name}-${index}`,
      author: message.author,
      text: message.text,
      timestamp: message.timestamp,
      tone: message.tone,
    })),
    metrics: {
      messageRate: metrics.messageRate,
      uniqueChatters: metrics.uniqueChatters,
      newcomers: metrics.newcomers,
      sentiment: metrics.sentiment ?? 0,
      trend: metrics.trend ?? 0,
    },
    session: {
      startedAt: Date.now() - 5 * 60_000,
      durationSeconds: 5 * 60,
    },
    baseline,
  };

  const request = new Request("http://localhost/api/coach-summary", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const response = await coachSummary(request);
  const json = await response.json();
  return json;
}

async function callLiveFeed(updates: unknown[]) {
  const request = new Request("http://localhost/api/live-feed", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ channel: SIM_CHANNEL, updates }),
  });
  await liveFeed(request);
}

function buildWarmupMessages(count: number, now = Date.now()) {
  const base = [
    "Hey chat!",
    "Let's gooo!",
    "Hahahaha",
    "This play is wild.",
    "What a clutch moment!",
  ];
  const authors = Array.from({ length: count }).map((_, index) => `viewer${index + 1}`);
  const messages = authors.map((author, index) => ({
    author,
    text: base[index % base.length],
    timestamp: now - 90_000 + index * 750,
    tone: index % 5 === 0 ? "hype" : "supportive",
  }));
  return { authors, messages };
}

function buildActiveMessages(authors: string[], messageCount: number, now = Date.now()) {
  const snippets = [
    "Nice rotate.",
    "Huge damage output!",
    "We need better comms.",
    "Stick with the strat!",
    "That timing tho.",
  ];
  return Array.from({ length: messageCount }).map((_, index) => {
    const author = authors[index % authors.length];
    const tone = index % 11 === 0 ? "question" : index % 7 === 0 ? "constructive" : "supportive";
    return {
      author,
      text: snippets[index % snippets.length],
      timestamp: now - (messageCount - index) * 500,
      tone,
    };
  });
}

async function main() {
  const scenarioKey = (process.argv[2] ?? "mid") as ScenarioKey;
  const scenario = SCENARIOS[scenarioKey] ?? SCENARIOS.mid;

  console.log(`=== Dashboard Simulation (${scenarioKey}) ===`);

  const now = Date.now();
  const warmup = buildWarmupMessages(scenario.warmupMessages, now - 180_000);
  const warmupResult = await callCoachSummary("warmup", warmup.messages, scenario.warmupMetrics);
  console.log("\nWarmup result raw:", warmupResult);
  const warmupAlerts = Array.isArray(warmupResult.alerts) ? warmupResult.alerts.slice(0, 3) : [];
  console.log("\nWarmup Alerts:", warmupAlerts);

  const coreAuthors = warmup.authors.slice(0, Math.min(scenario.midAuthors, warmup.authors.length));
  const activeMessages = buildActiveMessages(coreAuthors, scenario.activeMessages, now - 60_000);
  const activeResult = await callCoachSummary("midgame", activeMessages, scenario.activeMetrics);
  const midgameAlerts = Array.isArray(activeResult.alerts) ? activeResult.alerts.slice(0, 5) : [];
  console.log("\nMidgame Alerts:", midgameAlerts);

  const pressureMessages = buildActiveMessages(coreAuthors, scenario.pressureMessages, now).map(
    (message, index) => {
      if (index % 9 === 0) {
        return { ...message, text: "This is getting rough, focus up.", tone: "critical" };
      }
      return message;
    }
  );
  const pressureResult = await callCoachSummary("pressure", pressureMessages, scenario.pressureMetrics);
  const pressureAlerts = Array.isArray(pressureResult.alerts) ? pressureResult.alerts.slice(0, 5) : [];
  console.log("\nPressure Alerts:", pressureAlerts);

  await callLiveFeed([
    {
      type: "chat",
      payload: {
        id: "live-test-1",
        author: "regular5",
        text: "Insane play right there!",
        timestamp: Date.now(),
      },
    },
    {
      type: "metrics",
      payload: {
        messageRate: scenario.pressureMetrics.messageRate,
        sentiment: scenario.pressureMetrics.sentiment ?? 0,
        uniqueChatters: scenario.pressureMetrics.uniqueChatters,
        trend: scenario.pressureMetrics.trend ?? 0,
        baseline: buildBaselineSnapshot(scenario.pressureMetrics),
      },
    },
  ]);

  console.log("\nLive-feed batch dispatched (chat + metrics).");

  const summary = {
    warmupAlertCount: Array.isArray(warmupResult.alerts) ? warmupResult.alerts.length : 0,
    midgameAlertCount: Array.isArray(activeResult.alerts) ? activeResult.alerts.length : 0,
    pressureAlertCount: Array.isArray(pressureResult.alerts) ? pressureResult.alerts.length : 0,
    toneSnapshots: {
      warmup: warmupResult.toneSummary,
      midgame: activeResult.toneSummary,
      pressure: pressureResult.toneSummary,
    },
  };

  console.log("\nSummary:");
  console.dir(summary, { depth: null });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
