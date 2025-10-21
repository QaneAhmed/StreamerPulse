import { auth, currentUser } from "@clerk/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import { api } from "../../../../convex/_generated/api";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type WorkspaceSummary = {
  channel: {
    login: string;
    displayName?: string | null;
    status: string;
    connectedAt?: number | null;
  } | null;
  ingestionStatus: "idle" | "listening" | "errored";
} | null;

type SummaryChannel = NonNullable<Exclude<WorkspaceSummary, null>>["channel"];

export default async function SettingsPage() {
  const [{ userId }, user] = await Promise.all([auth(), currentUser()]);

  const summary: WorkspaceSummary = userId
    ? await fetchQuery(api.users.getWorkspaceSummary, { clerkUserId: userId })
    : null;

  const twitchAccount = user?.externalAccounts?.find((account) =>
    account.provider?.toLowerCase().includes("twitch")
  );

  const providerUserId = (twitchAccount as any)?.providerUserId ?? twitchAccount?.id ?? null;
  const fallbackLogin =
    summary?.channel?.login ?? twitchAccount?.username ?? providerUserId ?? null;

  const summaryChannel: SummaryChannel | null = summary ? summary.channel : null;
  const computedDisplayName =
    summaryChannel?.displayName ??
    ((twitchAccount?.publicMetadata as any)?.display_name as string | undefined) ??
    twitchAccount?.firstName ??
    user?.firstName ??
    twitchAccount?.username ??
    fallbackLogin ??
    null;

  const channel =
    summaryChannel ??
    (fallbackLogin
      ? {
          login: fallbackLogin.toLowerCase(),
          displayName: computedDisplayName ?? fallbackLogin,
          status: "connected",
          connectedAt: null,
        }
      : null);

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">Workspace Settings</h1>
        <p className="max-w-2xl text-sm text-slate-400">
          Manage your StreamLens workspace details, Twitch integration, and retention
          policies. These panels are scaffolding for the full configuration flow.
        </p>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
          <h2 className="text-xl font-semibold">Workspace</h2>
          <dl className="mt-4 space-y-3 text-sm text-slate-400">
            <div>
              <dt className="font-medium text-slate-300">Region</dt>
              <dd>European Union (read-only)</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-300">Retention</dt>
              <dd>Raw chat retained 90 days. Aggregates stored indefinitely.</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
          <h2 className="text-xl font-semibold">Twitch Integration</h2>
          <p className="mt-2 text-sm text-slate-400">
            Your Twitch account stays linked after sign-in. We use read-only scopes and immediately
            begin ingesting chat once you open the dashboard.
          </p>
          <div className="mt-6 space-y-3 text-sm text-slate-400">
            <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-4">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Channel</p>
              {channel ? (
                <>
                  <p className="mt-1 text-slate-200">#{channel.displayName ?? channel.login}</p>
                  <p className="mt-2 text-xs text-slate-500">
                    Status: {channel.status === "connected" ? "Connected" : channel.status}
                  </p>
                </>
              ) : (
                <>
                  <p className="mt-1 text-slate-200">No channel detected</p>
                  <p className="mt-2 text-xs text-slate-500">
                    Sign in with Twitch to link your workspace automatically.
                  </p>
                </>
              )}
              <p className="mt-2 text-xs text-slate-500">
                This connection is managed automatically. Keep your ingestion worker running to
                maintain real-time metrics.
              </p>
            </div>
            <p className="text-xs uppercase tracking-[0.3em] text-violet-300">
              {channel ? "Connected" : "Not connected"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
