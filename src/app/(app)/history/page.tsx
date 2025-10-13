export default function HistoryPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-3xl font-semibold tracking-tight">Stream History</h1>
      <p className="max-w-2xl text-sm text-slate-400">
        You&apos;ll find a list of completed streams here with duration, total
        messages, average sentiment, and spike counts. Export tools for CSV/JSON will
        appear once data ingestion is wired up.
      </p>
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-8 text-sm text-slate-500">
        No streams yet. Run your first monitored broadcast to populate this view.
      </div>
    </div>
  );
}
