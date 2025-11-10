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

const categoryStyles: Record<string, { card: string; badge: string }> = {
  "new-chatter": {
    card: "border-emerald-500/50 bg-emerald-500/10 text-emerald-50",
    badge: "bg-emerald-500/25 text-emerald-100",
  },
  "chat-hype": {
    card: "border-amber-400/50 bg-amber-500/10 text-amber-50",
    badge: "bg-amber-500/25 text-amber-100",
  },
  "chat-laughter": {
    card: "border-yellow-400/50 bg-yellow-500/10 text-yellow-50",
    badge: "bg-yellow-500/25 text-yellow-100",
  },
  "tone-dip": {
    card: "border-rose-500/50 bg-rose-500/10 text-rose-50",
    badge: "bg-rose-500/25 text-rose-100",
  },
  "spam-warning": {
    card: "border-rose-600/50 bg-rose-600/10 text-rose-50",
    badge: "bg-rose-600/25 text-rose-100",
  },
  "velocity-surge-positive": {
    card: "border-sky-500/50 bg-sky-500/10 text-sky-50",
    badge: "bg-sky-500/25 text-sky-100",
  },
  "velocity-surge-negative": {
    card: "border-orange-500/50 bg-orange-500/10 text-orange-50",
    badge: "bg-orange-500/25 text-orange-100",
  },
  default: {
    card: "border-slate-800 bg-slate-900/60 text-slate-100",
    badge: "bg-slate-800/80 text-slate-300",
  },
};

const priorityLabel: Record<"high" | "medium" | "low", string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

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
        {alerts.map((alert) => {
          const baseId = alert.id.split("-").slice(0, -1).join("-");
          const styles = categoryStyles[baseId] ?? categoryStyles.default;
          return (
            <li
              key={alert.id}
              className={`rounded-xl border px-3 py-3 text-sm transition-colors ${styles.card}`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                  {formatTimestamp(alert.updatedAt)}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.25em] ${styles.badge}`}
                >
                  {priorityLabel[alert.priority]}
                </span>
              </div>
              <p className="mt-2 text-sm font-medium text-slate-100">{alert.message}</p>
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
