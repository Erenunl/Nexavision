import { describe, expect, it } from "vitest";
import { extractHttpUrls, parseYouTubeUrl } from "../src/utils/youtubeUrl.js";

describe("parseYouTubeUrl", () => {
  it("watch linkini kabul eder", () => {
    expect(parseYouTubeUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toEqual({
      ok: true,
      videoId: "dQw4w9WgXcQ",
      canonicalUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    });
  });

  it("kısa youtu.be linkini kabul eder", () => {
    expect(parseYouTubeUrl("https://youtu.be/dQw4w9WgXcQ?t=10").ok).toBe(true);
  });

  it("Shorts linkini reddeder", () => {
    expect(parseYouTubeUrl("https://youtube.com/shorts/dQw4w9WgXcQ")).toEqual({
      ok: false,
      reason: "shorts",
    });
  });

  it("yanıltıcı hostname'i reddeder", () => {
    expect(parseYouTubeUrl("https://youtube.com.example.test/watch?v=dQw4w9WgXcQ").ok).toBe(false);
  });

  it("geçersiz video ID'sini reddeder", () => {
    expect(parseYouTubeUrl("https://youtube.com/watch?v=short")).toEqual({
      ok: false,
      reason: "invalid_video_id",
    });
  });
});

describe("extractHttpUrls", () => {
  it("noktalama işaretlerini URL sonundan ayırır", () => {
    expect(extractHttpUrls("Şarkım: https://youtu.be/dQw4w9WgXcQ.")).toEqual([
      "https://youtu.be/dQw4w9WgXcQ",
    ]);
  });
});
