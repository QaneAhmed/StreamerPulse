import { useEffect, useState } from "react";

type Alert = {
  id: string;
  message: string;
  tone: "positive" | "neutral" | "negative";
  priority: "high" | "medium" | "low";
  updatedAt: number;
};

type AlertListProps = {
  alerts: Alert[];
};

const toneStyles: Record<"positive" | "neutral" | "negative", string> = {
  positive: "border-emerald-500/50 bg-emerald-500/10",
  neutral: "border-slate-800 bg-slate-900/60",
  negative: "border-rose-500/40 bg-rose-500/10",
};

const priorityBadge: Record<"high" | "medium" | "low", { label: string; className: string }> = {
  high: { label: "High", className: "bg-rose-500/20 text-rose-200" },
  medium: { label: "Medium", className: "bg-amber-500/20 text-amber-200" },
  low: { label: "Low", className: "bg-slate-700/40 text-slate-300" },
};

const mutedToneStyle = "border-slate-800 bg-slate-900/40";
const mutedBadgeStyle = "bg-slate-800/80 text-slate-400";
const TIMESTAMP_REFRESH_INTERVAL_MS = 15000;

function formatTimestamp(updatedAt: number) {
  const deltaSeconds = Math.max(0, Math.round((Date.now() - updatedAt) / 1000));
  if (deltaSeconds < 5) return "just now";
  if (deltaSeconds < 60) return `${deltaSeconds}s ago`;
  const minutes = Math.round(deltaSeconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return `${hours}h ago`;
}

export default function AlertList({ alerts }: AlertListProps) {
  const [, forceRefresh] = useState(0);

  useEffect(() => {
    if (alerts.length === 0) {
      return;
    }
    const interval = setInterval(() => {
      forceRefresh((value) => value + 1);
    }, TIMESTAMP_REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [alerts.length]);

  if (alerts.length === 0) {
    return (
      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-slate-200">Alerts</h4>
        <div className="rounded-xl border border-dashed border-slate-800 bg-slate-900/30 px-3 py-4 text-xs text-slate-500">
          Waiting for notable chat activity…
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold text-slate-200">Alerts</h4>
      <ul className="space-y-3">
        {alerts.map((alert, index) => {
          const isLatest = index === 0;
          const toneClass = isLatest ? toneStyles[alert.tone] : mutedToneStyle;
          const badge = priorityBadge[alert.priority];
          const badgeClass = isLatest ? badge.className : mutedBadgeStyle;
          const messageClass = isLatest ? "text-slate-100" : "text-slate-300";
          const timestampClass = isLatest
            ? "text-slate-400"
            : "text-slate-600";
          return (
            <li
              key={alert.id}
              className={`rounded-xl border px-3 py-3 text-sm transition-colors ${toneClass}`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className={`text-xs font-semibold uppercase tracking-[0.3em] ${timestampClass}`}>
                  {formatTimestamp(alert.updatedAt)}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.25em] ${badgeClass}`}
                >
                  {badge.label}
                </span>
              </div>
              <p className={`mt-2 text-sm font-medium ${messageClass}`}>{alert.message}</p>
            </li>
          );
        })}
      </ul>
      <p className="text-[11px] text-slate-500">
        Low, Medium, and High badges mark the urgency of an alert—High needs action now, Medium soon, and Low is informational.
      </p>
    </div>
  );
}
