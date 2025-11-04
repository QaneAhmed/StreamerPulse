type TwitchEmoteImageOptions = {
  size?: "1.0" | "2.0" | "3.0";
  theme?: "light" | "dark";
};

export function getTwitchEmoteImageUrl(
  emoteId: string | null | undefined,
  options: TwitchEmoteImageOptions = {}
): string | null {
  if (!emoteId) {
    return null;
  }

  const { size = "2.0", theme = "dark" } = options;
  const safeSize = size === "1.0" || size === "2.0" || size === "3.0" ? size : "2.0";
  const safeTheme = theme === "light" || theme === "dark" ? theme : "dark";
  const encodedId = encodeURIComponent(emoteId);
  return `https://static-cdn.jtvnw.net/emoticons/v2/${encodedId}/default/${safeTheme}/${safeSize}`;
}
