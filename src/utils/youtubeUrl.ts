const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

export type YouTubeUrlResult =
  | { ok: true; videoId: string; canonicalUrl: string }
  | { ok: false; reason: "shorts" | "not_youtube" | "invalid_video_id" };

function trimUrlToken(value: string): string {
  return value.trim().replace(/[),.!?;:'"\]}]+$/u, "");
}

export function extractHttpUrls(content: string): string[] {
  return (content.match(/https?:\/\/[^\s<>]+/giu) ?? []).map(trimUrlToken);
}

export function parseYouTubeUrl(rawUrl: string): YouTubeUrlResult {
  let url: URL;
  try {
    url = new URL(trimUrlToken(rawUrl));
  } catch {
    return { ok: false, reason: "not_youtube" };
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false, reason: "not_youtube" };
  }

  const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  let videoId: string | null = null;

  if (hostname === "youtu.be") {
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments.length !== 1) return { ok: false, reason: "invalid_video_id" };
    videoId = segments[0] ?? null;
  } else if (hostname === "youtube.com" || hostname === "m.youtube.com") {
    if (url.pathname.toLowerCase().startsWith("/shorts/")) {
      return { ok: false, reason: "shorts" };
    }
    if (url.pathname !== "/watch") return { ok: false, reason: "not_youtube" };
    videoId = url.searchParams.get("v");
  } else {
    return { ok: false, reason: "not_youtube" };
  }

  if (!videoId || !VIDEO_ID_PATTERN.test(videoId)) {
    return { ok: false, reason: "invalid_video_id" };
  }

  return {
    ok: true,
    videoId,
    canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
  };
}
