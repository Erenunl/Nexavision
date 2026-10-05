import type { YouTubeLookupResult } from "../types/youtube.js";

interface YouTubeApiResponse {
  items?: Array<{
    id: string;
    snippet?: {
      title?: string;
      channelTitle?: string;
      publishedAt?: string;
      liveBroadcastContent?: string;
      thumbnails?: Record<string, { url?: string }>;
    };
    contentDetails?: { duration?: string };
    statistics?: { viewCount?: string };
    status?: { privacyStatus?: string; uploadStatus?: string };
  }>;
  error?: { message?: string };
}

export class YouTubeService {
  constructor(private readonly apiKey: string) {}

  async getVideo(videoId: string): Promise<YouTubeLookupResult> {
    const endpoint = new URL("https://www.googleapis.com/youtube/v3/videos");
    endpoint.searchParams.set("part", "snippet,contentDetails,statistics,status");
    endpoint.searchParams.set("id", videoId);
    endpoint.searchParams.set("key", this.apiKey);

    try {
      const response = await fetch(endpoint, { signal: AbortSignal.timeout(10_000) });
      const body = (await response.json()) as YouTubeApiResponse;

      if (!response.ok) {
        throw new Error(`YouTube API ${response.status}: ${body.error?.message ?? "Bilinmeyen hata"}`);
      }

      const item = body.items?.[0];
      if (!item || item.status?.privacyStatus !== "public" || item.status.uploadStatus !== "processed") {
        return { ok: false, kind: "not_found" };
      }

      const snippet = item.snippet;
      const duration = item.contentDetails?.duration;
      const viewCountRaw = item.statistics?.viewCount;
      const viewCount = Number(viewCountRaw);
      if (
        !snippet?.title ||
        !snippet.channelTitle ||
        !snippet.publishedAt ||
        !duration ||
        !viewCountRaw ||
        !Number.isSafeInteger(viewCount)
      ) {
        return { ok: false, kind: "not_found" };
      }

      const thumbnailUrl =
        snippet.thumbnails?.maxres?.url ??
        snippet.thumbnails?.standard?.url ??
        snippet.thumbnails?.high?.url ??
        snippet.thumbnails?.medium?.url ??
        snippet.thumbnails?.default?.url ??
        null;

      return {
        ok: true,
        video: {
          videoId: item.id,
          canonicalUrl: `https://www.youtube.com/watch?v=${item.id}`,
          title: snippet.title,
          channelTitle: snippet.channelTitle,
          thumbnailUrl,
          viewCount,
          duration,
          publishedAt: snippet.publishedAt,
          liveBroadcastContent: snippet.liveBroadcastContent ?? "none",
        },
      };
    } catch (error) {
      return { ok: false, kind: "temporary", error };
    }
  }
}
