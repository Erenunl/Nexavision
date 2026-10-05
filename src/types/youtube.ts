export interface YouTubeVideo {
  videoId: string;
  canonicalUrl: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string | null;
  viewCount: number;
  duration: string;
  publishedAt: string;
  liveBroadcastContent: "none" | "live" | "upcoming" | string;
}

export type YouTubeLookupResult =
  | { ok: true; video: YouTubeVideo }
  | { ok: false; kind: "not_found" }
  | { ok: false; kind: "temporary"; error: unknown };
