import Link from "next/link";

export default function SettingsPage() {
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
            Connect your Twitch channel to enable read-only chat ingestion. We use
            granular OAuth scopes (`chat:read` only).
          </p>
          <div className="mt-6 flex flex-col gap-3 text-sm text-slate-400">
            <Link
              href="#connect"
              className="inline-flex w-fit items-center justify-center rounded-full bg-violet-500 px-5 py-2 text-sm font-semibold text-slate-950 transition hover:bg-violet-400"
            >
              Connect channel
            </Link>
            <p className="text-xs uppercase tracking-[0.3em] text-violet-300">
              Coming soon
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
