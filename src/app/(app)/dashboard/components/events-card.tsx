type EventItem = {
  id: string;
  title: string;
  detail: string;
  timestamp: number;
};

type EventsCardProps = {
  events: EventItem[];
};

function formatRelativeTime(timestamp: number) {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes <= 0) {
    return "Just now";
  }
  if (minutes === 1) {
    return "1 min ago";
  }
  if (minutes < 60) {
    return `${minutes} mins ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours === 1) {
    return "1 hour ago";
  }
  if (hours < 24) {
    return `${hours} hours ago`;
  }
  const days = Math.floor(hours / 24);
  return days === 1 ? "1 day ago" : `${days} days ago`;
}

export default function EventsCard({ events }: EventsCardProps) {
  const hasEvents = events.length > 0;

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
      <h2 className="text-xl font-semibold text-slate-100">Events feed</h2>
      <p className="mt-1 text-xs text-slate-500">
        Spike detections and notable shifts will stream here during a broadcast.
      </p>
      {hasEvents ? (
        <div className="mt-4 space-y-3">
          {events.map((event) => (
            <div
              key={event.id}
              className="rounded-xl border border-slate-800 bg-slate-900/40 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-medium text-slate-200">{event.title}</p>
                <span className="text-xs text-slate-500">
                  {formatRelativeTime(event.timestamp)}
                </span>
              </div>
              <p className="mt-2 text-xs text-slate-500">{event.detail}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-dashed border-slate-800 bg-slate-950/40 p-6 text-xs text-slate-500">
          No spike events detected yet. We&apos;ll surface emote spikes, sentiment swings,
          and volume surges here in real time.
        </div>
      )}
    </div>
  );
}
