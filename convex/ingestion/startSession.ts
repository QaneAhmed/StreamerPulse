import { internalMutation } from "../_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { ensureWorkspace } from "../helpers/workspace";

export const startSession = internalMutation({
  args: {
    channelId: v.string(),
    channelLogin: v.string(),
    channelDisplayName: v.string(),
    streamKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    try {
      const now = Date.now();
      let integrationMatches = await ctx.db
        .query("integrations")
        .withIndex("by_channel_login", (q) => q.eq("channelLogin", args.channelLogin))
        .collect();

      if (integrationMatches.length > 1) {
        console.warn(
          "[convex] startSession detected duplicate integrations for",
          args.channelLogin,
          "count=",
          integrationMatches.length
        );
        const sorted = integrationMatches.sort((a, b) => {
          const aCreated = (a.createdAt as number | undefined) ?? 0;
          const bCreated = (b.createdAt as number | undefined) ?? 0;
          return aCreated - bCreated;
        });
        const [, ...duplicates] = sorted;
        await Promise.all(duplicates.map((doc) => ctx.db.delete(doc._id)));
        integrationMatches = [sorted[0]];
      }

      let integration: Doc<"integrations"> | null =
        integrationMatches[0] ?? null;

      let workspace: Doc<"workspaces"> | null = integration
        ? await ctx.db.get(integration.workspaceId)
        : null;

      if (!integration || !workspace) {
        try {
          const workspaceData = await ensureWorkspace(ctx, {
            identityKeys: [`twitch:${args.channelLogin}`],
            channelId: args.channelId,
            channelLogin: args.channelLogin,
            channelDisplayName: args.channelDisplayName,
            now,
          });

          workspace = await ctx.db.get(workspaceData.workspaceId);
          integration = await ctx.db.get(workspaceData.integrationId);
        } catch (error) {
          console.error(
            "[convex] ensureWorkspace failed during startSession",
            { channelLogin: args.channelLogin },
            error
          );
          throw error;
        }
      }

      if (!workspace || !integration) {
        throw new Error("Failed to resolve workspace or integration for session");
      }

      const integrationUpdates: Record<string, unknown> = {};

      if (integration.channelDisplayName !== args.channelDisplayName) {
        integrationUpdates.channelDisplayName = args.channelDisplayName;
      }

      if (integration.status !== "connected") {
        integrationUpdates.status = "connected";
        integrationUpdates.connectedAt = now;
        integrationUpdates.disconnectedAt = undefined;
      }

      if (Object.keys(integrationUpdates).length > 0) {
        integrationUpdates.updatedAt = now;
        await ctx.db.patch(integration._id, integrationUpdates);
        integration = await ctx.db.get(integration._id);
        if (!integration) {
          throw new Error("Integration disappeared after patch");
        }
      }

      const streamLookup = await ctx.db
        .query("streams")
        .withIndex("by_integration", (q) => q.eq("integrationId", integration._id))
        .filter((q) => q.eq(q.field("status"), "live"))
        .first();

      let streamId: Id<"streams">;

      if (streamLookup) {
        streamId = streamLookup._id;
      } else {
        const streamIdentifier = args.streamKey ?? `${args.channelLogin}-${now}`;
        streamId = await ctx.db.insert("streams", {
          workspaceId: workspace._id,
          integrationId: integration._id,
          platform: "twitch",
          streamId: streamIdentifier,
          title: `${args.channelDisplayName} — Live`,
          startedAt: now,
          endedAt: undefined,
          status: "live",
          messageCount: 0,
          uniqueChatters: 0,
          spikeCount: 0,
          averageSentiment: 0,
          lastWindowAt: now,
          createdAt: now,
          updatedAt: now,
        });
      }

      await ctx.db.patch(workspace._id, {
        ingestionStatus: "listening",
        updatedAt: now,
      });

      return {
        streamId,
        integrationId: integration._id,
        workspaceId: workspace._id,
      };
    } catch (error) {
      console.error("[convex] startSession mutation failed", { channelLogin: args.channelLogin }, error);
      throw error;
    }
  },
});
