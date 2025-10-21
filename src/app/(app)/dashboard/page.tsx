import { auth, clerkClient } from "@clerk/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import { api } from "../../../../convex/_generated/api";
import DashboardShellBeta from "./dashboard-shell";
import DashboardShellAlpha from "./dashboard-shell-alpha";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type WorkspaceSummary = {
  channel: { login: string; displayName?: string | null; status: string } | null;
  ingestionStatus: "idle" | "listening" | "errored";
} | null;

export default async function DashboardPage() {
  const { userId } = await auth();

  const clerk = userId ? await clerkClient() : null;
  const user = userId && clerk ? await clerk.users.getUser(userId) : null;

  let summary: WorkspaceSummary = null;

  if (userId) {
    try {
      summary = await fetchQuery(api.users.getWorkspaceSummary, { clerkUserId: userId });
    } catch (error) {
      console.error("Failed to load workspace summary for dashboard", error);
    }
  }

  const externalAccounts =
    (user?.externalAccounts as Array<any> | undefined) ??
    ((user as any)?.external_accounts as Array<any> | undefined) ??
    [];
  const twitchAccount = externalAccounts.find((account) =>
    account.provider?.toLowerCase().includes("twitch")
  );

  const fallbackLogin =
    summary?.channel?.login ??
    twitchAccount?.username ??
    (twitchAccount as any)?.providerUserId ??
    user?.username ??
    user?.id ??
    null;

  const channelLogin = fallbackLogin ? fallbackLogin.toLowerCase() : null;
  const channelDisplayName =
    summary?.channel?.displayName ??
    ((twitchAccount?.publicMetadata as any)?.display_name as string | undefined) ??
    twitchAccount?.firstName ??
    user?.firstName ??
    twitchAccount?.username ??
    channelLogin;

  const ingestionStatus = summary?.ingestionStatus ?? (channelLogin ? "idle" : "idle");
  const initialIngestionConnected = summary?.ingestionStatus === "listening";

  const initialState =
    channelLogin || summary
      ? {
          session: {
            status: ingestionStatus,
            channel: channelDisplayName ?? channelLogin,
            startedAt: null,
          },
        }
      : undefined;

  const variant = (process.env.NEXT_PUBLIC_DASHBOARD_VARIANT ?? "beta").toLowerCase();
  const ShellComponent = variant === "alpha" ? DashboardShellAlpha : DashboardShellBeta;

  return (
    <ShellComponent
      initialState={initialState}
      initialIngestionConnected={initialIngestionConnected}
      channelLogin={channelLogin}
    />
  );
}
