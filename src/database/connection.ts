import Database from "better-sqlite3";
import { dirname, resolve } from "node:path";
import { mkdirSync } from "node:fs";

let database: Database.Database | null = null;

export function openDatabase(databasePath: string): Database.Database {
  if (database) return database;

  const absolutePath = resolve(databasePath);
  mkdirSync(dirname(absolutePath), { recursive: true });
  database = new Database(absolutePath);
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");
  database.pragma("busy_timeout = 5000");
  return database;
}

export function getDatabase(): Database.Database {
  if (!database) throw new Error("Database henüz başlatılmadı.");
  return database;
}

export function closeDatabase(): void {
  database?.close();
  database = null;
}
