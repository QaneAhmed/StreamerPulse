import Link from "next/link";

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">Live Dashboard</h1>
        <p className="max-w-2xl text-sm text-slate-400">
          Once your Twitch channel is connected, you can start a monitoring session
          and watch StreamLens compute message velocity, sentiment, spikes, and top
          emotes in near real time. Finish onboarding in Settings to enable ingestion.
        </p>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
          <h2 className="text-xl font-semibold">Connect Twitch</h2>
          <p className="mt-2 text-sm text-slate-400">
            We need read-only chat access to begin collecting real-time metrics. You
            only have to do this once per workspace.
          </p>
          <div className="mt-6 flex items-center gap-3">
            <Link
              href="/settings"
              className="inline-flex items-center justify-center rounded-full bg-violet-500 px-5 py-2 text-sm font-semibold text-slate-950 transition hover:bg-violet-400"
            >
              Finish setup
            </Link>
            <span className="text-xs uppercase tracking-[0.3em] text-violet-300">
              Step 1 of 3
            </span>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
          <h2 className="text-xl font-semibold">Live metrics</h2>
          <p className="mt-2 text-sm text-slate-400">
            After connection, this panel will stream KPIs like messages per minute,
            rolling sentiment, unique chatters, and spike alerts with &lt;1.5s latency.
          </p>
          <div className="mt-6 grid gap-3 text-sm text-slate-500">
            <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-4">
              <p className="font-medium text-slate-300">Message Rate</p>
              <p className="text-xs">Updates every 5 seconds from Twitch ingestion.</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-4">
              <p className="font-medium text-slate-300">Sentiment &amp; Spikes</p>
              <p className="text-xs">
                Powered by OpenAI window-level analysis and internal spike detection.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
