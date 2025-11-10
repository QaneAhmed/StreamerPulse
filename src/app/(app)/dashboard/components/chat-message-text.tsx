import Image from "next/image";
import { getTwitchEmoteImageUrl } from "@/lib/twitch/emotes";

export type ChatMessageEmote = {
  code: string;
  id?: string | null;
  imageUrl?: string | null;
  start?: number | null;
  end?: number | null;
};

type ChatMessageTextProps = {
  text: string;
  emotes?: ChatMessageEmote[];
  className?: string;
};

type Fragment =
  | { type: "text"; key: string; value: string }
  | { type: "emote"; key: string; code: string; src: string | null };

function buildFragments(text: string, emotes?: ChatMessageEmote[]): Fragment[] {
  if (!emotes || emotes.length === 0) {
    return text ? [{ type: "text", key: "text-0", value: text }] : [];
  }

  const withPositions = emotes
    .filter(
      (emote) =>
        typeof emote.start === "number" &&
        typeof emote.end === "number" &&
        (emote.start ?? 0) >= 0 &&
        (emote.end ?? 0) >= (emote.start ?? 0)
    )
    .sort((a, b) => (a.start ?? 0) - (b.start ?? 0));

  if (withPositions.length === 0) {
    return [{ type: "text", key: "text-0", value: text }];
  }

  const fragments: Fragment[] = [];
  let cursor = 0;

  withPositions.forEach((emote, index) => {
    const start = Math.max(0, emote.start ?? 0);
    const end = Math.min(text.length - 1, emote.end ?? start);
    if (start < cursor || start >= text.length) {
      return;
    }
    if (start > cursor) {
      fragments.push({
        type: "text",
        key: `text-${cursor}-${start}`,
        value: text.slice(cursor, start),
      });
    }
    const src = emote.imageUrl ?? getTwitchEmoteImageUrl(emote.id ?? null);
    fragments.push({
      type: "emote",
      key: `emote-${index}-${start}`,
      code: emote.code,
      src,
    });
    cursor = Math.min(text.length, end + 1);
  });

  if (cursor < text.length) {
    fragments.push({
      type: "text",
      key: `text-${cursor}-${text.length}`,
      value: text.slice(cursor),
    });
  }

  return fragments.length > 0 ? fragments : [{ type: "text", key: "text-0", value: text }];
}

export function ChatMessageText({ text, emotes, className }: ChatMessageTextProps) {
  const fragments = buildFragments(text, emotes);
  if (fragments.length === 0) {
    return null;
  }

  return (
    <span className={className}>
      {fragments.map((fragment) =>
        fragment.type === "text" ? (
          <span key={fragment.key}>{fragment.value}</span>
        ) : fragment.src ? (
          <Image
            key={fragment.key}
            src={fragment.src}
            alt={fragment.code}
            width={24}
            height={24}
            className="mx-0.5 inline-block h-6 w-6 align-middle"
          />
        ) : (
          <span key={fragment.key} className="mx-0.5 inline-block font-semibold text-slate-200">
            {fragment.code}
          </span>
        )
      )}
    </span>
  );
}
