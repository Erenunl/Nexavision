import {
  closeSync,
  mkdirSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";

function isProcessRunning(pid: number): boolean {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ESRCH";
  }
}

export function acquireSingleInstanceLock(filePath: string): () => void {
  const resolvedPath = resolve(filePath);
  mkdirSync(dirname(resolvedPath), { recursive: true });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const descriptor = openSync(resolvedPath, "wx");
      writeFileSync(descriptor, String(process.pid), "utf8");
      closeSync(descriptor);

      const release = () => {
        try {
          if (readFileSync(resolvedPath, "utf8").trim() === String(process.pid)) {
            unlinkSync(resolvedPath);
          }
        } catch {
          // Kilit zaten temizlenmişse yapılacak işlem yoktur.
        }
      };
      process.once("exit", release);
      return release;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;

      let ownerPid = 0;
      try {
        ownerPid = Number(readFileSync(resolvedPath, "utf8").trim());
      } catch {
        // Okunamayan kilit aşağıda eski kilit olarak temizlenir.
      }
      if (isProcessRunning(ownerPid)) {
        throw new Error(
          `Bot zaten çalışıyor (PID ${ownerPid}). Aynı tokenla ikinci bir süreç başlatılamaz.`,
        );
      }
      try {
        unlinkSync(resolvedPath);
      } catch (unlinkError) {
        if ((unlinkError as NodeJS.ErrnoException).code !== "ENOENT") throw unlinkError;
      }
    }
  }

  throw new Error("Bot süreç kilidi alınamadı.");
}
