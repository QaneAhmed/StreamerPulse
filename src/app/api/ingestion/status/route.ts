import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import { api } from "../../../../../convex/_generated/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const [{ userId }, user] = await Promise.all([auth(), currentUser()]);

    if (!userId) {
      return NextResponse.json({ status: "unauthenticated" }, { status: 401 });
    }

    const summary = await fetchQuery(api.users.getWorkspaceSummary, {
      clerkUserId: userId,
    });

    if (!summary) {
      const twitchAccount = user?.externalAccounts?.find((account) =>
        account.provider?.toLowerCase().includes("twitch")
      );
      const fallbackLogin =
        twitchAccount?.username ?? (twitchAccount as any)?.providerUserId ?? null;

      return NextResponse.json({
        status: "idle",
        channel: fallbackLogin
          ? {
              login: fallbackLogin.toLowerCase(),
              displayName:
                (twitchAccount?.publicMetadata?.display_name as string | undefined) ??
                twitchAccount?.firstName ??
                user?.firstName ??
                twitchAccount?.username ??
                fallbackLogin,
            }
          : null,
      });
    }

    return NextResponse.json({
      status: summary.ingestionStatus ?? "idle",
      channel: summary.channel
        ? {
            login: summary.channel.login,
            displayName: summary.channel.displayName ?? summary.channel.login,
          }
        : null,
    });
  } catch (error) {
    console.error("[ingestion/status] Failed to fetch status", error);
    return NextResponse.json({
      status: "errored",
      channel: null,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
