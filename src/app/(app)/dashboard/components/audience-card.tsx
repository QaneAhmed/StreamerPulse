type AudienceCardProps = {
  uniqueChatters: number;
  newcomers: number;
  sentimentScore: number | null;
};

function sentimentLabel(score: number) {
  if (score >= 0.15) {
    return "Positive";
  }
  if (score <= -0.15) {
    return "Negative";
  }
  return "Neutral";
}

export default function AudienceCard({
  uniqueChatters,
  newcomers,
  sentimentScore,
}: AudienceCardProps) {
  const sentimentValue =
    typeof sentimentScore === "number"
      ? `${sentimentScore.toFixed(2)} • ${sentimentLabel(sentimentScore)}`
      : "--";

  const rows = [
    { label: "Unique chatters (15m)", value: uniqueChatters.toLocaleString() },
    { label: "New participants", value: newcomers.toLocaleString() },
    { label: "Average sentiment", value: sentimentValue },
  ];

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
      <h2 className="text-xl font-semibold text-slate-100">Audience pulse</h2>
      <p className="mt-1 text-xs text-slate-500">
        Rolling engagement stats update every window. Sentiment scaled between −1 and 1.
      </p>
      <ul className="mt-5 space-y-3">
        {rows.map((item) => (
          <li
            key={item.label}
            className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-3 text-sm"
          >
            <span className="text-slate-400">{item.label}</span>
            <span className="font-medium text-slate-200">{item.value}</span>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs text-slate-500">
        Once live data streams in, we surface alerts if churn or sentiment dips sharply.
      </p>
    </div>
  );
}
