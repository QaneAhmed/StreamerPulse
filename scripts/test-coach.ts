#!/usr/bin/env tsx

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv();

import { z } from "zod";
import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";
import { coachSystemPrompt } from "../src/lib/ai/prompts";

type Tone =
  | "hype"
  | "supportive"
  | "humor"
  | "informational"
  | "question"
  | "constructive"
  | "critical"
  | "sarcastic"
  | "toxic"
  | "spam"
  | "system"
  | "neutral"
  | "unknown";

const AlertSchema = z.object({
  type: z.enum([
    "tone_dip",
    "spam_warning",
    "hype_spike",
    "constructive_feedback",
    "viewer_question",
    "momentum_shift",
    "welcome_newcomer",
    "status_update",
  ]),
  priority: z.enum(["high", "medium", "low"]),
  title: z.string().min(3).max(60),
  message: z.string().min(1).max(110),
  confidence: z.number().min(0).max(1).optional(),
  reasons: z.array(z.string().min(1).max(120)).max(3).optional(),
  linkedMessages: z.array(z.string()).max(5).optional(),
});

async function runScenario(
  name: string,
  messages: Array<{ author: string; text: string; tone: Tone }>,
  options: { previousAlert?: { type: string; priority: "high" | "medium" | "low"; secondsAgo: number } } = {}
) {
  const now = Date.now();
  const payload = {
    messages: messages.map((message, index) => ({
      id: `msg-${index}`,
      author: message.author,
      text: message.text,
      timestamp: now - (messages.length - index) * 1000,
      tone: message.tone,
      toneConfidence: 0.7,
    })),
    metrics: {
      messageRate: Math.max(8, messages.length * 6),
      uniqueChatters: new Set(messages.map((m) => m.author)).size,
      newcomers: new Set(messages.map((m) => m.author)).size,
      sentiment:
        messages.some((m) => m.tone === "toxic" || m.tone === "critical")
          ? -0.2
          : messages.some((m) => m.tone === "hype" || m.tone === "supportive")
          ? 0.2
          : 0,
      trend: 15,
      spamCandidates: messages.filter((m) => m.tone === "spam").length,
      hypeCandidates: messages.filter((m) => ["hype", "supportive", "humor"].includes(m.tone)).length,
    },
    history: {
      previousAlert: options.previousAlert
        ? {
            type: options.previousAlert.type,
            priority: options.previousAlert.priority,
            timestamp: now - options.previousAlert.secondsAgo * 1000,
            message: "Previous alert message",
          }
        : null,
      previousTone: "neutral" as Tone,
      secondsSinceLastAlert: options.previousAlert ? options.previousAlert.secondsAgo : 45,
    },
    session: {
      startedAt: now - 10 * 60 * 1000,
      durationSeconds: 10 * 60,
    },
  };

  const apiKey = process.env.VERCEL_AI_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing VERCEL_AI_API_KEY or OPENAI_API_KEY environment variable.");
  }

  const openai = createOpenAI({ apiKey });
  const response = await generateText({
    model: openai("gpt-4o-mini"),
    system: coachSystemPrompt.trim(),
    prompt:
      JSON.stringify({ window: payload }, null, 2) +
      "\n\nRespond ONLY with valid JSON matching the schema described in the system prompt.",
  });

  const raw = response.text.trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    console.error(`Scenario ${name}: failed to parse JSON`, raw);
    throw error;
  }

  const alert = AlertSchema.parse(parsed);

  console.log(`\n=== Scenario: ${name} ===`);
  console.log(JSON.stringify(alert, null, 2));
}

async function main() {
  await runScenario("Spam Wave", [
    { author: "rustbot", text: "Best viewers on streamboo .com (remove the space) @5iFVBr6v", tone: "spam" },
    { author: "rustbot", text: "Best viewers on streamboo .com (remove the space) @5iFVBr6v", tone: "spam" },
    { author: "rustbot", text: "Best viewers on streamboo .com (remove the space) @5iFVBr6v", tone: "spam" },
  ]);

  await runScenario("Toxic Dip", [
    { author: "bluehill14", text: "kys trash streamer", tone: "toxic" },
    { author: "bluehill14", text: "you are awful lol", tone: "critical" },
    { author: "viewer", text: "let's change the mood", tone: "neutral" },
  ]);

  await runScenario("Hype Burst", [
    { author: "fan1", text: "LET'S GOOOOOO", tone: "hype" },
    { author: "fan2", text: "lol that was hilarious", tone: "humor" },
    { author: "fan3", text: "you're cracked at this", tone: "supportive" },
  ]);

  await runScenario("Constructive Advice", [
    { author: "coachviewer", text: "switch to the sniper for this boss?", tone: "constructive" },
    { author: "coachviewer", text: "try covering the left angle instead", tone: "constructive" },
    { author: "viewer", text: "got it?", tone: "question" },
  ]);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
