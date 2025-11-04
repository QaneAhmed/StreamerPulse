import { internalMutation } from "../_generated/server";
import { v } from "convex/values";

export const appendChatMessage = internalMutation({
  args: {
    streamId: v.union(v.id("streams"), v.string()),
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
  },
  handler: async (ctx, args) => {
    const streamId =
      typeof args.streamId === "string"
        ? ctx.db.normalizeId("streams", args.streamId)
        : args.streamId;

    if (!streamId) {
      throw new Error("Invalid streamId provided");
    }

    const stream = await ctx.db.get(streamId);
    if (!stream) {
      throw new Error("Stream not found");
    }

    const existing = await ctx.db
      .query("chatMessages")
      .withIndex("by_stream_message", (q) =>
        q.eq("streamId", streamId).eq("messageId", args.messageId)
      )
      .unique();

    if (existing) {
      return { inserted: false };
    }

    await ctx.db.insert("chatMessages", {
      streamId,
      messageId: args.messageId,
      authorDisplay: args.authorDisplay,
      authorHash: args.authorHash,
      text: args.text,
      emotes: args.emotes,
      postedAt: args.postedAt,
      tone: args.tone,
      toneConfidence: args.toneConfidence,
      toneRationale: args.toneRationale,
    });

    await ctx.db.patch(streamId, {
      messageCount: (stream.messageCount ?? 0) + 1,
      updatedAt: Date.now(),
    });

    return { inserted: true };
  },
});
