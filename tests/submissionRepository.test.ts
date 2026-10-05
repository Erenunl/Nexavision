import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { closeDatabase, openDatabase } from "../src/database/connection.js";
import { migrate } from "../src/database/migrate.js";
import { SubmissionRepository } from "../src/database/submissionRepository.js";
import type { AssignedParticipant } from "../src/types/submission.js";
import type { YouTubeVideo } from "../src/types/youtube.js";

const tempDirectory = mkdtempSync(join(tmpdir(), "nexavision-test-"));
const repository = new SubmissionRepository();

const participant = (userId: string, countryCode: string): AssignedParticipant => ({
  guildId: "123456789012345678",
  discordUserId: userId,
  countryCode,
  countryName: countryCode,
  countryFlag: "🏳️",
});

const video = (videoId: string): YouTubeVideo => ({
  videoId,
  canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
  title: `Song ${videoId}`,
  channelTitle: "Artist",
  thumbnailUrl: null,
  viewCount: 42,
  duration: "PT3M",
  publishedAt: "2025-01-01T00:00:00Z",
  liveBroadcastContent: "none",
});

beforeAll(() => migrate(openDatabase(join(tempDirectory, "test.sqlite"))));
afterAll(() => {
  closeDatabase();
  rmSync(tempDirectory, { recursive: true, force: true });
});

describe("SubmissionRepository atomik durum değişimleri", () => {
  it("aynı pending başvuruyu yalnızca bir kez sonuçlandırır", () => {
    const pending = repository.createPending(
      "123456789012345678",
      participant("111111111111111111", "TR"),
      video("aaaaaaaaaaa"),
    );
    expect(repository.approveIfPending(pending.id, "999999999999999999", 50)).toBe(true);
    expect(repository.findById(pending.id)?.viewCountAtApproval).toBe(50);
    expect(repository.approveIfPending(pending.id, "888888888888888888", 51)).toBe(false);
  });

  it("aynı ülke için ikinci resmi şarkıyı database seviyesinde engeller", () => {
    const pending = repository.createPending(
      "123456789012345678",
      participant("222222222222222222", "TR"),
      video("bbbbbbbbbbb"),
    );
    expect(() => repository.approveIfPending(pending.id, "999999999999999999", 50)).toThrow();
    expect(repository.findById(pending.id)?.status).toBe("PENDING");
  });

  it("admin unlock sonrası yeni onayı atomik replacement yapar ve rollback eski entry'yi geri getirir", () => {
    const first = repository.createPending(
      "123456789012345678",
      participant("333333333333333333", "DK"),
      video("ccccccccccc"),
    );
    expect(repository.approveIfPending(first.id, "999999999999999999", 50)).toBe(true);
    expect(repository.findById(first.id)?.locked).toBe(true);
    expect(repository.setLock("123456789012345678", "DK", false)?.locked).toBe(false);

    const replacement = repository.createPending(
      "123456789012345678",
      participant("333333333333333333", "DK"),
      video("ddddddddddd"),
    );
    expect(repository.approveIfPending(replacement.id, "999999999999999999", 60)).toBe(true);
    expect(repository.findById(first.id)?.status).toBe("REJECTED");
    expect(repository.findById(replacement.id)).toMatchObject({ status: "APPROVED", locked: true });

    expect(repository.revertApproval(replacement.id, "999999999999999999")).toBe(true);
    expect(repository.findById(first.id)).toMatchObject({ status: "APPROVED", locked: false });
    expect(repository.findById(replacement.id)?.status).toBe("PENDING");
  });
});
