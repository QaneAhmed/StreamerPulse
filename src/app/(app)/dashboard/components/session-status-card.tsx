import Link from "next/link";

type SessionStatus = "idle" | "listening" | "errored";

type SessionStatusCardProps = {
  status: SessionStatus;
  channel?: string | null;
  startedAt?: number | null;
  ingestionConnected?: boolean;
};

export default function SessionStatusCard({
  status,
  channel,
  startedAt,
  ingestionConnected = false,
}: SessionStatusCardProps) {
  const statusLabel =
    status === "listening" ? "Live" : status === "errored" ? "Error" : "Idle";

  const heading =
    status === "listening"
      ? channel
        ? `${channel} is streaming`
        : "Monitoring active"
      : status === "errored"
        ? "Connection issue"
        : channel
          ? `${channel} is ready`
          : "Channel disconnected";

  const description =
    status === "listening"
      ? "Metrics are updating in real time. Stop the session when your broadcast ends."
      : status === "errored"
        ? "We lost connection to Twitch. We will retry automatically, or you can reconnect in Settings."
        : "Connect Twitch to start monitoring. We watch your channel in real time and update these metrics every few seconds.";

  const startedLabel =
    status === "listening" && startedAt
      ? `Started ${new Date(startedAt).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })}`
      : null;

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Status</p>
          <div>
            <h2 className="text-2xl font-semibold text-slate-100">{heading}</h2>
            <p className="mt-2 text-sm text-slate-400">{description}</p>
            {startedLabel && (
              <p className="mt-2 text-xs font-medium uppercase tracking-[0.2em] text-emerald-300">
                {startedLabel}
              </p>
            )}
          </div>
        </div>
        <span
          className={`inline-flex h-10 items-center rounded-full border border-slate-800 px-4 text-xs font-semibold ${
            status === "listening"
              ? "text-emerald-300"
              : status === "errored"
                ? "text-rose-300"
                : "text-slate-400"
          }`}
        >
          {statusLabel}
        </span>
      </div>

      <div className="mt-6 grid gap-3 text-sm">
        <p className="text-xs text-slate-500">
          Looking for your channel? Finish onboarding in{" "}
          <Link href="/settings" className="text-violet-300 underline underline-offset-4">
            Settings
          </Link>{" "}
          to connect it.
        </p>
        <p className="text-xs text-slate-500">
          {ingestionConnected
            ? "Ingestion worker is connected and relaying live chat events."
            : "Waiting for the ingestion worker to connect to your Twitch channel."}
        </p>
      </div>
    </div>
  );
}
