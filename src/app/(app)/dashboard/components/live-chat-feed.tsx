import type { ChatTone } from "@/lib/ai/chat-tone";

type ChatMessage = {
  id: string;
  author: string;
  text: string;
  timestamp: number;
  tone?: ChatTone | null;
  toneConfidence?: number | null;
  toneRationale?: string | null;
};

type LiveChatFeedProps = {
  messages: ChatMessage[];
};

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
});

const toneLabels: Record<ChatTone, string> = {
  hype: "Hype",
  supportive: "Supportive",
  humor: "Humor",
  informational: "Info",
  question: "Question",
  constructive: "Constructive",
  critical: "Critical",
  sarcastic: "Sarcastic",
  toxic: "Toxic",
  spam: "Spam",
  system: "System",
  unknown: "Neutral",
};

function toneCategory(tone: ChatTone) {
  if (tone === "hype" || tone === "supportive" || tone === "humor" || tone === "constructive") {
    return "positive" as const;
  }
  if (tone === "critical" || tone === "sarcastic" || tone === "toxic" || tone === "spam") {
    return "negative" as const;
  }
  if (tone === "question" || tone === "system" || tone === "informational") {
    return "info" as const;
  }
  return "neutral" as const;
}

const toneBadgeClasses: Record<ReturnType<typeof toneCategory>, string> = {
  positive: "bg-emerald-500/10 text-emerald-300 border border-emerald-600/40",
  negative: "bg-rose-500/10 text-rose-300 border border-rose-500/40",
  info: "bg-amber-500/10 text-amber-200 border border-amber-500/30",
  neutral: "bg-slate-800/70 text-slate-300 border border-slate-700",
};

export default function LiveChatFeed({ messages }: LiveChatFeedProps) {
  const hasMessages = messages.length > 0;

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
      <h2 className="text-xl font-semibold text-slate-100">Live chat feed</h2>
      <p className="mt-1 text-xs text-slate-500">
        We ingest raw chat with read-only access, anonymize authors, and surface the most
        recent lines here. Oldest entries expire after 90 days.
      </p>
      <div className="mt-4 h-72 overflow-y-auto rounded-xl border border-slate-900 bg-slate-950/30 p-4 text-sm">
        {hasMessages ? (
          <ul className="space-y-3">
            {messages.map((message) => {
              const tone: ChatTone = message.tone ?? "unknown";
              const confidence =
                typeof message.toneConfidence === "number" && Number.isFinite(message.toneConfidence)
                  ? Math.max(0, Math.min(1, message.toneConfidence))
                  : null;
              return (
                <li key={message.id} className="space-y-1">
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span className="truncate text-slate-400">@{message.author}</span>
                    <span>{timeFormatter.format(new Date(message.timestamp))}</span>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-slate-200">{message.text}</p>
                    <span
                      className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.25em] ${toneBadgeClasses[toneCategory(tone)]}`}
                    >
                      {toneLabels[tone] ?? "Neutral"}
                    </span>
                  </div>
                  {confidence !== null && (
                    <p className="text-[10px] uppercase tracking-[0.3em] text-slate-600">
                      Confidence {(confidence * 100).toFixed(0)}%
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-slate-500">
            Chat messages will appear here the moment a live session starts.
          </div>
        )}
      </div>
    </div>
  );
}
