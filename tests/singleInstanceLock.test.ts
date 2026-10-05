import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { acquireSingleInstanceLock } from "../src/utils/singleInstanceLock.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("single instance lock", () => {
  it("rejects a second live process and can be reacquired after release", () => {
    const directory = mkdtempSync(join(tmpdir(), "nexavision-lock-"));
    temporaryDirectories.push(directory);
    const lockPath = join(directory, "bot.pid");

    const releaseFirst = acquireSingleInstanceLock(lockPath);
    expect(() => acquireSingleInstanceLock(lockPath)).toThrow("Bot zaten çalışıyor");

    releaseFirst();
    const releaseSecond = acquireSingleInstanceLock(lockPath);
    releaseSecond();
  });
});
