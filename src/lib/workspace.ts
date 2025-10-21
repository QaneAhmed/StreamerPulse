'use server';

import { clerkClient } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { fetchMutation } from "convex/nextjs";
import { api, internal } from "../../convex/_generated/api";
import { readEnv } from "./env";

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
    if (!convexAdminKey) {
      const workspaceSecret = env.CONVEX_WORKSPACE_SECRET;
      try {
        await fetchMutation(api.users.ensureWorkspaceFromServer, {
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
      return;
    }

    const convexUrl = env.NEXT_PUBLIC_CONVEX_URL;

    const convexAdminIdentity = process.env.CONVEX_ADMIN_IDENTITY
      ? JSON.parse(process.env.CONVEX_ADMIN_IDENTITY)
      : undefined;

    const convexClient = new ConvexHttpClient(convexUrl);
    (convexClient as any).setAdminAuth?.(convexAdminKey, convexAdminIdentity);

    await (convexClient as any).mutation(internal.users.ensureWorkspace, {
      clerkUserId: user.id,
      fallbackClerkUserId: `twitch:${channelLogin}`,
      channelId,
      channelLogin,
      channelDisplayName: displayName ?? channelLogin,
    });
  } catch (error) {
    console.error("Failed to ensure workspace linkage", error);
  }
}
