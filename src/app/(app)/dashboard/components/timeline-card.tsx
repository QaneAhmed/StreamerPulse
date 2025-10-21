type TimelinePoint = {
  timestamp: number;
  velocity: number;
};

type TimelineCardProps = {
  points: TimelinePoint[];
};

export default function TimelineCard({ points }: TimelineCardProps) {
  const hasPoints = points.length > 0;
  const maxVelocity =
    points.reduce((max, point) => (point.velocity > max ? point.velocity : max), 0) ||
    1;
  const coordinates = hasPoints
    ? points.map((point, idx) => {
        const progress = points.length > 1 ? idx / (points.length - 1) : 0;
        const x = 20 + progress * 360;
        const y = 150 - (point.velocity / maxVelocity) * 110;
        return { x, y };
      })
    : [];

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-100">Message velocity</h2>
          <p className="mt-1 text-xs text-slate-500">
            Synthetic preview of messages per minute with sentiment overlay.
          </p>
        </div>
        <span className="text-xs text-slate-500">Last 10 minutes</span>
      </div>

      <div className="mt-6 h-48 overflow-hidden rounded-xl border border-slate-900 bg-gradient-to-b from-slate-900 via-slate-950 to-slate-950 p-4">
        {hasPoints ? (
          <svg viewBox="0 0 400 160" className="h-full w-full">
            <defs>
              <linearGradient id="velocityGradient" x1="0%" x2="0%" y1="0%" y2="100%">
                <stop offset="0%" stopColor="rgba(139, 92, 246, 0.35)" />
                <stop offset="100%" stopColor="rgba(139, 92, 246, 0)" />
              </linearGradient>
            </defs>
            <polyline
              fill="url(#velocityGradient)"
              stroke="none"
              points={`20,150 ${coordinates.map(({ x, y }) => `${x},${y}`).join(" ")} 380,150`}
            />
            <polyline
              fill="none"
              stroke="#a855f7"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              points={coordinates.map(({ x, y }) => `${x},${y}`).join(" ")}
            />
            {coordinates.map(({ x, y }, idx) => (
              <circle key={`point-${idx}`} cx={x} cy={y} r={3} fill="#a855f7" />
            ))}
          </svg>
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-slate-500">
            Waiting for the first live samples…
          </div>
        )}
      </div>
    </div>
  );
}
