import { mutation, internalMutation, query } from "./_generated/server";
import { v } from "convex/values";
import { ensureWorkspace as ensureWorkspaceHelper } from "./helpers/workspace";

export const ensureWorkspace = internalMutation({
  args: {
    clerkUserId: v.string(),
    fallbackClerkUserId: v.string(),
    channelId: v.string(),
    channelLogin: v.string(),
    channelDisplayName: v.string(),
  },
  handler: async (ctx, args) => {
    const identityKeys = [args.clerkUserId, args.fallbackClerkUserId].filter(Boolean);

    const result = await ensureWorkspaceHelper(ctx, {
      identityKeys,
      channelId: args.channelId,
      channelLogin: args.channelLogin,
      channelDisplayName: args.channelDisplayName,
    });

    return {
      workspaceId: result.workspaceId,
      integrationId: result.integrationId,
      userId: result.userId,
    };
  },
});

export const ensureWorkspaceFromServer = mutation({
  args: {
    clerkUserId: v.string(),
    fallbackClerkUserId: v.string(),
    channelId: v.string(),
    channelLogin: v.string(),
    channelDisplayName: v.string(),
    secret: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const expectedSecret = process.env.WORKSPACE_CONNECT_SECRET;
    if (expectedSecret && args.secret !== expectedSecret) {
      throw new Error("Unauthorized workspace ensure request");
    }

    const identityKeys = [args.clerkUserId, args.fallbackClerkUserId].filter(Boolean);

    const result = await ensureWorkspaceHelper(ctx, {
      identityKeys,
      channelId: args.channelId,
      channelLogin: args.channelLogin,
      channelDisplayName: args.channelDisplayName,
    });

    return {
      workspaceId: result.workspaceId,
      integrationId: result.integrationId,
      userId: result.userId,
    };
  },
});

export const getWorkspaceSummary = query({
  args: {
    clerkUserId: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_user", (q) => q.eq("clerkUserId", args.clerkUserId))
      .unique();

    if (!user) {
      return null;
    }

    const workspace = await ctx.db
      .query("workspaces")
      .withIndex("by_owner", (q) => q.eq("ownerId", user._id))
      .first();

    if (!workspace) {
      return null;
    }

    const integration = await ctx.db
      .query("integrations")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspace._id))
      .first();

    if (!integration) {
      return {
        workspaceId: workspace._id,
        channel: null,
        ingestionStatus: workspace.ingestionStatus ?? "idle",
      };
    }

    return {
      workspaceId: workspace._id,
      channel: {
        login: integration.channelLogin,
        displayName: integration.channelDisplayName,
        status: integration.status,
        connectedAt: integration.connectedAt ?? null,
      },
      ingestionStatus: workspace.ingestionStatus ?? "idle",
    };
  },
});
