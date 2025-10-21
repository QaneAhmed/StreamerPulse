#!/usr/bin/env tsx

import { classifyChatTone } from "../src/lib/ai/chat-tone";

const samples = [
  "Let's goooo this fight is insane!!!",
  "ggs thanks for the raid, appreciate you",
  "lol okay sure buddy",
  "kys trash streamer",
  "can you explain the build again?",
  "maybe try swapping to the sniper for this boss?",
  "free followers at bestsite dot com",
  "LUL",
  "this is so boring dude",
];

async function main() {
  for (const text of samples) {
    const result = await classifyChatTone(text, { author: "viewer" });
    console.log(`${text.padEnd(55)} -> ${result.tone} (${Math.round(result.confidence * 100)}%)`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
