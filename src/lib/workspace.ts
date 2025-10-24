'use server';

import { clerkClient } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { fetchMutation } from "convex/nextjs";
import { api, internal } from "../../convex/_generated/api";
import { readEnv } from "./env";
import type { Id } from "../../convex/_generated/dataModel";

export async function ensureWorkspace(userId: string) {
  try {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);

    if (!user) {
      console.warn("[workspace] Auth session missing user", { userId });
      return;
    }

    const externalAccounts =
      (user.externalAccounts as Array<any> | undefined) ??
      ((user as any).external_accounts as Array<any> | undefined) ??
      [];

    const twitchAccount = externalAccounts.find((account) =>
      account.provider?.toLowerCase().includes("twitch")
    );

    if (!twitchAccount) {
      console.warn("[workspace] No Twitch account linked for user", {
        userId,
        providers: externalAccounts.map((account) => account.provider),
      });
      return;
    }

    const providerUserId = (twitchAccount as any)?.providerUserId ?? twitchAccount.id;
    const username = twitchAccount.username ?? user.username ?? providerUserId;
    const displayName =
      ((twitchAccount.publicMetadata as any)?.display_name as string | undefined) ??
      twitchAccount.firstName ??
      user.firstName ??
      user.username ??
      username ??
      providerUserId;

    const channelId = providerUserId ?? username;
    const channelLogin = (username ?? providerUserId ?? user.username ?? userId).toLowerCase();

    if (!channelId || !channelLogin) {
      console.warn("[workspace] Missing channel information for linked Twitch account", {
        userId,
        providerUserId,
        username,
      });
      return;
    }

    console.log("[workspace] Ensuring linkage", {
      userId,
      channelId,
      channelLogin,
      displayName,
    });

    const env = readEnv();
    const convexAdminKey = env.CONVEX_ADMIN_KEY;
    const workspaceSecret = env.CONVEX_WORKSPACE_SECRET;
    let ensureResult:
      | { workspaceId: string; integrationId: string; userId: string }
      | null = null;

    if (!convexAdminKey) {
      const workspaceSecret = env.CONVEX_WORKSPACE_SECRET;
      try {
        ensureResult = await fetchMutation(api.users.ensureWorkspaceFromServer, {
          clerkUserId: user.id,
          fallbackClerkUserId: `twitch:${channelLogin}`,
          channelId,
          channelLogin,
          channelDisplayName: displayName ?? channelLogin,
          secret: workspaceSecret,
        });
      } catch (mutationError) {
        console.error("[workspace] Public ensureWorkspace mutation failed", mutationError);
      }
      if (!ensureResult) {
        return;
      }

      await storeChannelTokens({
        user,
        channelLogin,
        channelId,
        integrationId: ensureResult.integrationId,
        workspaceSecret,
      });
      return;
    }

    const convexUrl = env.NEXT_PUBLIC_CONVEX_URL;

    const convexAdminIdentity = process.env.CONVEX_ADMIN_IDENTITY
      ? JSON.parse(process.env.CONVEX_ADMIN_IDENTITY)
      : undefined;

    const convexClient = new ConvexHttpClient(convexUrl);
    (convexClient as any).setAdminAuth?.(convexAdminKey, convexAdminIdentity);

    ensureResult = await (convexClient as any).mutation(internal.users.ensureWorkspace, {
      clerkUserId: user.id,
      fallbackClerkUserId: `twitch:${channelLogin}`,
      channelId,
      channelLogin,
      channelDisplayName: displayName ?? channelLogin,
    });

    if (ensureResult) {
      await storeChannelTokens({
        user,
        channelLogin,
        channelId,
        integrationId: ensureResult.integrationId,
        convexClient,
      });
    }
  } catch (error) {
    console.error("Failed to ensure workspace linkage", error);
  }
}

type StoreTokenArgs = {
  user: any;
  channelLogin: string;
  channelId: string;
  integrationId: string;
  convexClient?: ConvexHttpClient;
  workspaceSecret?: string;
};

async function storeChannelTokens({
  user,
  channelLogin,
  channelId,
  integrationId,
  convexClient,
  workspaceSecret,
}: StoreTokenArgs) {
  try {
    const client = await clerkClient();
    const secretPreview = process.env.CLERK_SECRET_KEY
      ? `${process.env.CLERK_SECRET_KEY.slice(0, 8)}…`
      : undefined;
    console.info("[workspace] Clerk secret preview", { secretPreview });
    let tokens:
      | Array<{
          token?: string;
          accessToken?: string;
          refreshToken?: string;
          expiresAt?: number | string | null;
          expiresIn?: number | null;
          expires_in?: number | null;
          scopes?: string[];
          scope?: string[] | string;
          tokenType?: string;
        }>
      | null = null;

    const providerCandidates = ["oauth_twitch", "twitch"];
    for (const provider of providerCandidates) {
      try {
        const fetched = await client.users.getUserOauthAccessToken(user.id, provider as any);
        const items = Array.isArray(fetched)
          ? fetched
          : (fetched as any)?.data && Array.isArray((fetched as any).data)
            ? (fetched as any).data
            : [];
        console.info("[workspace] OAuth token fetch", {
          provider,
          isArray: Array.isArray(fetched),
          hasDataArray: Array.isArray((fetched as any)?.data),
          count: items.length,
        });
        if (items.length > 0) {
          tokens = items as any;
          break;
        }
      } catch (error) {
        continue;
      }
    }

    if (!tokens || tokens.length === 0) {
      console.warn("[workspace] No Twitch OAuth tokens available from Clerk", {
        userId: user.id,
        channelLogin,
        providerCandidates,
      });
      return;
    }

    const primary = tokens[0] as any;
    const accessToken =
      typeof primary?.token === "string"
        ? primary.token
        : typeof primary?.accessToken === "string"
          ? primary.accessToken
          : null;
    const refreshToken =
      typeof primary?.refreshToken === "string" ? primary.refreshToken : null;

    if (!accessToken) {
      console.warn("[workspace] Missing access token from Clerk payload", {
        userId: user.id,
        channelLogin,
        provider: primary?.provider,
      });
      return;
    }

    if (!refreshToken) {
      console.warn("[workspace] No refresh token provided by Clerk; ingestion will not auto-refresh", {
        userId: user.id,
        channelLogin,
        provider: primary?.provider,
      });
    }

    let expiresAt: number | undefined;
    if (typeof primary?.expiresAt === "number") {
      expiresAt = primary.expiresAt;
    } else if (typeof primary?.expires_at === "number") {
      expiresAt = primary.expires_at;
    } else if (typeof primary?.expiresAt === "string") {
      const parsed = Date.parse(primary.expiresAt);
      if (!Number.isNaN(parsed)) {
        expiresAt = parsed;
      }
    } else if (typeof primary?.expires_in === "number") {
      expiresAt = Date.now() + primary.expires_in * 1000;
    } else if (typeof primary?.expiresIn === "number") {
      expiresAt = Date.now() + primary.expiresIn * 1000;
    }

    const scopeRaw = primary?.scopes ?? primary?.scope;
    const scope = Array.isArray(scopeRaw)
      ? scopeRaw.map((entry: unknown) => String(entry))
      : typeof scopeRaw === "string"
        ? scopeRaw.split(" ").map((entry) => entry.trim()).filter(Boolean)
        : undefined;

    const integrationIdRef = integrationId as Id<"integrations">;

    const payload = {
      integrationId: integrationIdRef,
      accessToken,
        refreshToken: refreshToken ?? undefined,
      expiresAt,
      scope,
      tokenType: typeof primary?.tokenType === "string" ? primary.tokenType : undefined,
      username: channelLogin,
      providerUserId: channelId,
      obtainedAt: Date.now(),
    };

    if (convexClient) {
      await (convexClient as any).mutation("ingestion/tokens:upsertTokens", payload);
    } else {
      await fetchMutation(api.ingestion.tokens.storeTokensFromServer, {
        ...payload,
        secret: workspaceSecret,
      });
    }
    console.info("[workspace] Stored Twitch credentials for channel", {
      userId: user.id,
      channelLogin,
      integrationId,
      via: convexClient ? "convex-admin" : "public-mutation",
    });
  } catch (error) {
    console.error("[workspace] Unable to persist Twitch credentials", error);
  }
}
