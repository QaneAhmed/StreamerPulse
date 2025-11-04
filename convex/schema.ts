import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    clerkUserId: v.string(),
    email: v.optional(v.string()),
    displayName: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_clerk_user", ["clerkUserId"]),

  workspaces: defineTable({
    ownerId: v.id("users"),
    name: v.string(),
    region: v.literal("eu"),
    retentionDays: v.number(),
    ingestionStatus: v.optional(
      v.union(v.literal("idle"), v.literal("listening"), v.literal("errored"))
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_owner", ["ownerId"]),

  workspaceSecrets: defineTable({
    workspaceId: v.id("workspaces"),
    twitchSalt: v.string(),
    createdAt: v.number(),
  }).index("by_workspace", ["workspaceId"]),

  integrations: defineTable({
    workspaceId: v.id("workspaces"),
    provider: v.literal("twitch"),
    channelId: v.string(),
    channelLogin: v.string(),
    channelDisplayName: v.string(),
    status: v.union(
      v.literal("disconnected"),
      v.literal("connected"),
      v.literal("revoked")
    ),
    connectedAt: v.optional(v.number()),
    disconnectedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_channel_login", ["channelLogin"]),

  streams: defineTable({
    workspaceId: v.id("workspaces"),
    integrationId: v.id("integrations"),
    platform: v.literal("twitch"),
    streamId: v.string(),
    title: v.optional(v.string()),
    startedAt: v.number(),
    endedAt: v.optional(v.number()),
    status: v.union(
      v.literal("pending"),
      v.literal("live"),
      v.literal("completed")
    ),
    messageCount: v.optional(v.number()),
    uniqueChatters: v.optional(v.number()),
    spikeCount: v.optional(v.number()),
    averageSentiment: v.optional(v.number()),
    lastWindowAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_integration", ["integrationId"]),

  chatMessages: defineTable({
    streamId: v.id("streams"),
    messageId: v.string(),
    authorDisplay: v.optional(v.string()),
    authorHash: v.string(),
    text: v.string(),
    emotes: v.array(
      v.object({
        code: v.string(),
        id: v.optional(v.union(v.string(), v.null())),
        imageUrl: v.optional(v.union(v.string(), v.null())),
        count: v.number(),
      })
    ),
    postedAt: v.number(),
    tone: v.optional(
      v.union(
        v.literal("hype"),
        v.literal("supportive"),
        v.literal("humor"),
        v.literal("informational"),
        v.literal("question"),
        v.literal("constructive"),
        v.literal("critical"),
        v.literal("sarcastic"),
        v.literal("toxic"),
        v.literal("spam"),
        v.literal("system"),
        v.literal("unknown")
      )
    ),
    toneConfidence: v.optional(v.number()),
    toneRationale: v.optional(v.string()),
  })
    .index("by_stream_time", ["streamId", "postedAt"])
    .index("by_stream_message", ["streamId", "messageId"]),

  windows: defineTable({
    streamId: v.id("streams"),
    windowStart: v.number(),
    windowEnd: v.number(),
    messageCount: v.number(),
    uniqueChatters: v.number(),
    topTokens: v.array(
      v.object({
        token: v.string(),
        count: v.number(),
      })
    ),
    topEmotes: v.array(
      v.object({
        emote: v.string(),
        count: v.number(),
      })
    ),
    sentimentScore: v.optional(v.number()),
    sentimentLabel: v.optional(
      v.union(v.literal("positive"), v.literal("neutral"), v.literal("negative"))
    ),
    sentimentStatus: v.optional(
      v.union(v.literal("ok"), v.literal("degraded"), v.literal("error"))
    ),
    createdAt: v.number(),
  }).index("by_stream_window", ["streamId", "windowStart"]),

  spikeEvents: defineTable({
    streamId: v.id("streams"),
    windowStart: v.number(),
    windowEnd: v.number(),
    reason: v.string(),
    strength: v.number(),
    messageCount: v.number(),
    createdAt: v.number(),
  }).index("by_stream_time", ["streamId", "windowStart"]),

  exports: defineTable({
    streamId: v.id("streams"),
    workspaceId: v.id("workspaces"),
    type: v.union(v.literal("csv"), v.literal("json")),
    status: v.union(
      v.literal("queued"),
      v.literal("processing"),
      v.literal("ready"),
      v.literal("failed")
    ),
    downloadUrl: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_stream", ["streamId"]),

  integrationTokens: defineTable({
    integrationId: v.id("integrations"),
    accessToken: v.string(),
    refreshToken: v.optional(v.string()),
    tokenType: v.optional(v.string()),
    scope: v.optional(v.array(v.string())),
    expiresAt: v.optional(v.number()),
    obtainedAt: v.number(),
    username: v.optional(v.string()),
    providerUserId: v.optional(v.string()),
    updatedAt: v.number(),
  }).index("by_integration", ["integrationId"]),
});
