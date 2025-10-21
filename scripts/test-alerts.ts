import { POST } from "../src/app/api/coach-summary/route";

process.env.VERCEL_AI_API_KEY = "";

async function runTest(name: string, payload: unknown) {
  const request = new Request("http://localhost/api/coach-summary", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const response = await POST(request);
  const json = await response.json();

  console.log(`\n=== ${name} ===`);
  console.log(JSON.stringify(json, null, 2));
}

async function main() {
  const basePayload = {
    messages: [],
    metrics: {
      messageRate: 2,
      uniqueChatters: 1,
      newcomers: 1,
      sentiment: 0.2,
      trend: 5,
    },
    session: {
      startedAt: Date.now() - 60_000,
      durationSeconds: 60,
    },
  };

  await runTest("Calm State", basePayload);

  await runTest("First-time Chatter", {
    ...basePayload,
    messages: [
      {
        id: "m-1",
        author: "NewViewer",
        text: "Hey! First time here!",
        timestamp: Date.now(),
        tone: "supportive",
      },
    ],
  });

  await runTest("Hype Surge", {
    ...basePayload,
    metrics: {
      messageRate: 45,
      uniqueChatters: 80,
      newcomers: 10,
      sentiment: 0.6,
      trend: 48,
    },
    messages: Array.from({ length: 12 }).map((_, index) => ({
      id: `h-${index}`,
      author: `viewer${index}`,
      text: index % 2 === 0 ? "LET'S GO!!! PogChamp" : "Huge play! HYPE!",
      timestamp: Date.now() - (12 - index) * 1_000,
      tone: "hype",
    })),
  });

  await runTest("Toxic Spike", {
    ...basePayload,
    metrics: {
      messageRate: 18,
      uniqueChatters: 30,
      newcomers: 0,
      sentiment: -0.35,
      trend: -12,
    },
    messages: Array.from({ length: 10 }).map((_, index) => ({
      id: `t-${index}`,
      author: `critic${index}`,
      text: index % 2 === 0 ? "This strat is trash, you keep throwing." : "Worst gameplay ever, uninstall.",
      timestamp: Date.now() - (10 - index) * 1_000,
      tone: "toxic",
    })),
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
