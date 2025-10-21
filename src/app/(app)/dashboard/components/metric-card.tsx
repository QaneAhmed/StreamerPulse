type MetricCardProps = {
  label: string;
  value: string;
  helper?: string;
  trend?: number;
};

export default function MetricCard({
  label,
  value,
  helper,
  trend,
}: MetricCardProps) {
  const hasTrend = typeof trend === "number";
  const trendLabel = hasTrend && (trend > 0 ? `+${trend}%` : `${trend}%`);
  const trendColor =
    hasTrend && trend !== 0
      ? trend > 0
        ? "text-emerald-400"
        : "text-rose-400"
      : "text-slate-500";

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
      <p className="text-xs uppercase tracking-[0.3em] text-slate-500">{label}</p>
      <div className="mt-3 flex items-baseline gap-2">
        <p className="text-3xl font-semibold text-slate-100">{value}</p>
        {hasTrend && (
          <span className={`text-xs font-semibold ${trendColor}`}>{trendLabel}</span>
        )}
      </div>
      {helper && <p className="mt-2 text-xs text-slate-500">{helper}</p>}
    </div>
  );
}
