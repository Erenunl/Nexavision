import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { listMp3Files, shuffleTracks } from "../src/services/stageMusicService.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("StageMusicService yardımcıları", () => {
  it("yalnızca dosya olan .mp3 girdilerini büyük/küçük harf duyarsız bulur", async () => {
    const directory = await mkdtemp(join(tmpdir(), "nexavision-stage-"));
    temporaryDirectories.push(directory);
    await Promise.all([
      writeFile(join(directory, "bir.mp3"), ""),
      writeFile(join(directory, "iki.MP3"), ""),
      writeFile(join(directory, "notlar.txt"), ""),
    ]);

    expect((await listMp3Files(directory)).map((file) => file.split(/[\\/]/).at(-1))).toEqual([
      "bir.mp3",
      "iki.MP3",
    ]);
  });

  it("yeni turda mümkünse son çalınan parçayı ilk sıraya koymaz", () => {
    const tracks = ["a.mp3", "b.mp3", "c.mp3"];
    const shuffled = shuffleTracks(tracks, "b.mp3", () => 0);
    expect(shuffled).toHaveLength(3);
    expect(new Set(shuffled)).toEqual(new Set(tracks));
    expect(shuffled[0]).not.toBe("b.mp3");
  });

  it("tek parçalı listede parçayı korur", () => {
    expect(shuffleTracks(["tek.mp3"], "tek.mp3", () => 0)).toEqual(["tek.mp3"]);
  });
});
