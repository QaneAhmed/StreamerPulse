import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
} from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { v } from "convex/values";
import { internal } from "../_generated/api";

type RefreshResponse = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  scope?: string[];
  tokenType?: string;
};

const REFRESH_MARGIN_MS = 5 * 60 * 1000;

type TokenUpsertArgs = {
  integrationId: Id<"integrations">;
  accessToken: string;
  refreshToken: string;
  expiresAt?: number;
  scope?: string[];
  tokenType?: string;
  username?: string;
  providerUserId?: string;
  obtainedAt: number;
};

async function upsertTokensInternal(ctx: MutationCtx, args: TokenUpsertArgs) {
  const existing = await ctx.db
    .query("integrationTokens")
    .withIndex("by_integration", (q) => q.eq("integrationId", args.integrationId))
    .first();

  const payload = {
    integrationId: args.integrationId,
    accessToken: args.accessToken,
    refreshToken: args.refreshToken,
    expiresAt: args.expiresAt,
    scope: args.scope,
    tokenType: args.tokenType,
    username: args.username,
    providerUserId: args.providerUserId,
    obtainedAt: args.obtainedAt,
    updatedAt: Date.now(),
  } satisfies Omit<Doc<"integrationTokens">, "_id" | "_creationTime">;

  if (existing) {
    await ctx.db.patch(existing._id, payload);
    const doc = await ctx.db.get(existing._id);
    if (!doc) {
      throw new Error("Token document unexpectedly missing after update");
    }
    return doc;
  }

  const insertedId = await ctx.db.insert("integrationTokens", payload);
  const doc = await ctx.db.get(insertedId);
  if (!doc) {
    throw new Error("Token document unexpectedly missing after insert");
  }
  return doc;
}

export const getIntegrationByLogin = internalQuery({
  args: {
    channelLogin: v.string(),
  },
  handler: async (ctx, args) => {
    const normalized = args.channelLogin.toLowerCase();
    const match = await ctx.db
      .query("integrations")
      .withIndex("by_channel_login", (q) => q.eq("channelLogin", normalized))
      .unique();
    return match ?? null;
  },
});

export const getTokensByIntegration = internalQuery({
  args: {
    integrationId: v.id("integrations"),
  },
  handler: async (ctx, args) => {
    const doc = await ctx.db
      .query("integrationTokens")
      .withIndex("by_integration", (q) => q.eq("integrationId", args.integrationId))
      .first();
    return doc ?? null;
  },
});

export const upsertTokens = internalMutation({
  args: {
    integrationId: v.id("integrations"),
    accessToken: v.string(),
    refreshToken: v.string(),
    expiresAt: v.optional(v.number()),
    scope: v.optional(v.array(v.string())),
    tokenType: v.optional(v.string()),
    username: v.optional(v.string()),
    providerUserId: v.optional(v.string()),
    obtainedAt: v.number(),
  },
  handler: async (ctx, args) => upsertTokensInternal(ctx, args),
});

export const storeTokensFromServer = mutation({
  args: {
    integrationId: v.id("integrations"),
    accessToken: v.string(),
    refreshToken: v.string(),
    expiresAt: v.optional(v.number()),
    scope: v.optional(v.array(v.string())),
    tokenType: v.optional(v.string()),
    username: v.optional(v.string()),
    providerUserId: v.optional(v.string()),
    obtainedAt: v.number(),
    secret: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const expectedSecret = process.env.WORKSPACE_CONNECT_SECRET;
    if (expectedSecret && args.secret !== expectedSecret) {
      throw new Error("Unauthorized token store request");
    }
    const { secret: _ignored, ...rest } = args;
    return upsertTokensInternal(ctx, rest);
  },
});

export const leaseCredentials = internalAction({
  args: {
    channelLogin: v.string(),
    forceRefresh: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const integration = (await ctx.runQuery(
      internal.ingestion.tokens.getIntegrationByLogin,
      {
        channelLogin: args.channelLogin,
      }
    )) as Doc<"integrations"> | null;

    if (!integration) {
      throw new Error(`No integration found for channel ${args.channelLogin}`);
    }

    let tokens = (await ctx.runQuery(
      internal.ingestion.tokens.getTokensByIntegration,
      {
        integrationId: integration._id,
      }
    )) as Doc<"integrationTokens"> | null;

    if (!tokens) {
      throw new Error(
        `No Twitch credentials stored for ${integration.channelLogin}. User must reconnect their Twitch account.`
      );
    }

    const now = Date.now();
    const expiresAt = tokens.expiresAt ?? null;
    const needsRefresh =
      !!tokens.refreshToken &&
      (!!args.forceRefresh ||
        !tokens.accessToken ||
        expiresAt === null ||
        expiresAt - now <= REFRESH_MARGIN_MS);

    if (needsRefresh) {
      const refreshed = await refreshTwitchToken(tokens.refreshToken);
      tokens = (await ctx.runMutation(internal.ingestion.tokens.upsertTokens, {
        integrationId: integration._id,
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken,
        expiresAt: now + refreshed.expiresIn * 1000,
        scope: refreshed.scope,
        tokenType: refreshed.tokenType,
        username: tokens.username ?? integration.channelLogin,
        providerUserId: tokens.providerUserId,
        obtainedAt: now,
      })) as Doc<"integrationTokens">;
    }

    return {
      channelLogin: integration.channelLogin,
      channelDisplayName: integration.channelDisplayName,
      channelId: integration.channelId,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt ?? null,
      username: tokens.username ?? integration.channelLogin,
    };
  },
});

async function refreshTwitchToken(refreshToken: string): Promise<RefreshResponse> {
  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET must be configured");
  }

  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });

  const response = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to refresh Twitch token: ${response.status} ${text}`);
  }

  const body: {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope?: string[];
    token_type?: string;
  } = await response.json();

  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token ?? refreshToken,
    expiresIn: body.expires_in,
    scope: body.scope,
    tokenType: body.token_type,
  };
}
