import { argv } from "node:process";

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function computeEngagementScore({ messageRate, uniqueChatters, sentiment, baseline }) {
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
    return { score: 0, mood: "cool" };
  }

  const normalizedSentiment = clamp((sentiment + 1) / 2, 0, 1);
  const weighted = clamp(activity * 0.75 + normalizedSentiment * 0.25, 0, 1);
  const score = Math.round(weighted * 100);

  let mood;
  if (score >= 75) {
    mood = "hot";
  } else if (score >= 45) {
    mood = "warm";
  } else {
    mood = "cool";
  }

  return { score, mood };
}

function buildBaseline(chatters) {
  const longMessageRate = Math.max(1, Math.round(chatters * 0.45));
  const longChatters = Math.max(1, Math.round(chatters * 0.65));

  const makeSnapshot = (long) => ({
    long,
    short: Math.round(long * 0.85),
    std: Math.max(1, Math.round(long * 0.1)),
    samples: 288,
    ready: true,
  });

  return {
    messageRate: makeSnapshot(longMessageRate),
    uniqueChatters: makeSnapshot(longChatters),
  };
}

function createScenario(chatters) {
  const baseline = buildBaseline(chatters);
  const messageRate = Math.max(1, Math.round(baseline.messageRate.long * (0.8 + Math.random() * 0.4)));
  const newcomers = Math.max(0, Math.round(messageRate * 0.25 * Math.random()));
  const sentimentBase = 0.4 - Math.min(chatters / 10000, 1) * 0.3;
  const sentiment = clamp(sentimentBase + (Math.random() - 0.5) * 0.4, -1, 1);

  const engagement = computeEngagementScore({
    messageRate,
    uniqueChatters: chatters,
    sentiment,
    baseline,
  });

  return {
    chatters,
    messageRate,
    newcomers,
    sentiment,
    engagement,
  };
}

function parseArgs() {
  const config = {
    maxChatters: 10000,
    samples: undefined,
  };

  for (const arg of argv.slice(2)) {
    if (arg.startsWith("--max=")) {
      const value = Number.parseInt(arg.split("=")[1] ?? "", 10);
      if (Number.isFinite(value) && value > 0) {
        config.maxChatters = value;
      }
    } else if (arg.startsWith("--samples=")) {
      const parsed = (arg.split("=")[1] ?? "")
        .split(",")
        .map((item) => Number.parseInt(item.trim(), 10))
        .filter((value) => Number.isFinite(value) && value > 0);
      if (parsed.length > 0) {
        config.samples = parsed;
      }
    }
  }

  return config;
}

function formatNumber(value, maximumFractionDigits = 0) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits }).format(value);
}

function run() {
  const { maxChatters, samples } = parseArgs();
  const results = [];

  for (let chatters = 1; chatters <= maxChatters; chatters += 1) {
    results.push(createScenario(chatters));
  }

  const sampleSet =
    samples?.length && samples.length > 0
      ? new Set(samples.filter((value) => value >= 1 && value <= maxChatters))
      : new Set([1, 2, 3, 4, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, maxChatters]);

  console.log(`Ran ${results.length.toLocaleString()} simulated chat scenarios (1 → ${maxChatters}).\n`);
  console.log("Sample checkpoints:");
  for (const chatters of Array.from(sampleSet).sort((a, b) => a - b)) {
    const result = results[chatters - 1];
    if (!result) continue;
    console.log(
      `• ${chatters.toString().padStart(5, " ")} chatters → ${result.messageRate
        .toString()
        .padStart(4, " ")} msg/min | newcomers ${result.newcomers
        .toString()
        .padStart(4, " ")} | engagement ${result.engagement.score
        .toString()
        .padStart(3, " ")} (${result.engagement.mood}) | sentiment ${formatNumber(result.sentiment, 2)}`
    );
  }

  const engagementScores = results.map((item) => item.engagement.score);
  const messageRates = results.map((item) => item.messageRate);

  const averageEngagement =
    engagementScores.reduce((total, value) => total + value, 0) / engagementScores.length;
  const averageMessageRate =
    messageRates.reduce((total, value) => total + value, 0) / messageRates.length;

  const moodBuckets = results.reduce(
    (acc, item) => {
      acc[item.engagement.mood] += 1;
      return acc;
    },
    { cool: 0, warm: 0, hot: 0 }
  );

  const maxEngagement = results.reduce((prev, curr) =>
    curr.engagement.score > prev.engagement.score ? curr : prev
  );
  const minEngagement = results.reduce((prev, curr) =>
    curr.engagement.score < prev.engagement.score ? curr : prev
  );

  console.log("");
  console.log("Summary:");
  console.log(`• Average engagement score: ${formatNumber(averageEngagement, 2)}`);
  console.log(
    `• Engagement spread: min ${minEngagement.engagement.score} (chatters ${minEngagement.chatters}) → max ${maxEngagement.engagement.score} (chatters ${maxEngagement.chatters})`
  );
  console.log(
    `• Mood distribution: cool ${moodBuckets.cool}, warm ${moodBuckets.warm}, hot ${moodBuckets.hot}`
  );
  console.log(`• Average message rate: ${formatNumber(averageMessageRate, 2)} msg/min`);

  const softWarnings = [];
  if (moodBuckets.hot === 0) {
    softWarnings.push("No scenarios reached the 'hot' engagement band.");
  }
  if (minEngagement.engagement.score === maxEngagement.engagement.score) {
    softWarnings.push("All scenarios produced identical engagement scores; check baseline tuning.");
  }

  if (softWarnings.length > 0) {
    console.log("\nSoft warnings:");
    for (const warning of softWarnings) {
      console.log(`- ${warning}`);
    }
  }

  console.log("\nDone.");
}

run();
