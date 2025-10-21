import { internalMutation } from "../_generated/server";
import { v } from "convex/values";

export const endSession = internalMutation({
  args: {
    streamId: v.id("streams"),
    endedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const stream = await ctx.db.get(args.streamId);
    if (!stream) {
      throw new Error("Stream not found");
    }

    await ctx.db.patch(args.streamId, {
      status: "completed",
      endedAt: args.endedAt,
      updatedAt: args.endedAt,
    });

    const integration = await ctx.db.get(stream.integrationId);
    if (integration) {
      await ctx.db.patch(integration._id, {
        status: "connected",
        updatedAt: args.endedAt,
      });
    }

    const workspace = await ctx.db.get(stream.workspaceId);
    if (workspace) {
      await ctx.db.patch(workspace._id, {
        ingestionStatus: "idle",
        updatedAt: args.endedAt,
      });
    }

    return { completed: true };
  },
});
