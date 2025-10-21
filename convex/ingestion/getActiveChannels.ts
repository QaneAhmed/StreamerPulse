import { query } from "../_generated/server";

export const getActiveChannels = query({
  handler: async (ctx) => {
    const integrations = await ctx.db.query("integrations").collect();
    return integrations
      .filter((integration) => integration.status === "connected")
      .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
      .map((integration) => ({
        channelLogin: integration.channelLogin,
        channelDisplayName: integration.channelDisplayName,
        channelId: integration.channelId,
      }));
  },
});
