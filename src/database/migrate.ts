import type Database from "better-sqlite3";

export function migrate(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS song_submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      discord_user_id TEXT NOT NULL,
      country_code TEXT NOT NULL,
      country_name TEXT NOT NULL,
      country_flag TEXT NOT NULL,
      youtube_video_id TEXT NOT NULL,
      youtube_url TEXT NOT NULL,
      song_title TEXT NOT NULL,
      youtube_channel_name TEXT NOT NULL,
      thumbnail_url TEXT,
      view_count_at_submission INTEGER NOT NULL,
      view_count_at_approval INTEGER,
      duration TEXT NOT NULL,
      published_at TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
      submitted_at TEXT NOT NULL,
      reviewed_at TEXT,
      reviewed_by TEXT,
      rejection_reason TEXT,
      admin_channel_id TEXT,
      admin_message_id TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_submission_status
      ON song_submissions (guild_id, status);

    CREATE UNIQUE INDEX IF NOT EXISTS uq_pending_user
      ON song_submissions (guild_id, discord_user_id)
      WHERE status = 'PENDING';

    CREATE UNIQUE INDEX IF NOT EXISTS uq_approved_video
      ON song_submissions (guild_id, youtube_video_id)
      WHERE status = 'APPROVED';

    CREATE UNIQUE INDEX IF NOT EXISTS uq_approved_country
      ON song_submissions (guild_id, country_code)
      WHERE status = 'APPROVED';

    CREATE TABLE IF NOT EXISTS country_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      country_code TEXT NOT NULL,
      discord_user_id TEXT NOT NULL,
      assigned_at TEXT NOT NULL,
      approved_by TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
    );

    CREATE UNIQUE INDEX IF NOT EXISTS uq_active_country_assignment
      ON country_assignments (guild_id, country_code)
      WHERE active = 1;

    CREATE UNIQUE INDEX IF NOT EXISTS uq_active_user_assignment
      ON country_assignments (guild_id, discord_user_id)
      WHERE active = 1;

    CREATE TABLE IF NOT EXISTS country_applications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      discord_user_id TEXT NOT NULL,
      country_code TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
      submitted_at TEXT NOT NULL,
      reviewed_at TEXT,
      reviewed_by TEXT,
      rejection_reason TEXT,
      admin_channel_id TEXT,
      admin_message_id TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_country_application_status
      ON country_applications (guild_id, status);

    CREATE UNIQUE INDEX IF NOT EXISTS uq_pending_country_user
      ON country_applications (guild_id, discord_user_id)
      WHERE status = 'PENDING';

    CREATE UNIQUE INDEX IF NOT EXISTS uq_pending_country
      ON country_applications (guild_id, country_code)
      WHERE status = 'PENDING';

    CREATE TABLE IF NOT EXISTS vote_ballots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      voter_user_id TEXT NOT NULL,
      voter_country_code TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'SUBMITTED')),
      draft_json TEXT,
      created_at TEXT NOT NULL,
      submitted_at TEXT,
      updated_at TEXT NOT NULL,
      UNIQUE (guild_id, voter_user_id)
    );

    CREATE TABLE IF NOT EXISTS vote_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ballot_id INTEGER NOT NULL REFERENCES vote_ballots(id) ON DELETE CASCADE,
      target_country_code TEXT NOT NULL,
      points INTEGER NOT NULL CHECK (points IN (12, 10, 8, 7, 6, 5, 4, 3, 2, 1)),
      UNIQUE (ballot_id, target_country_code),
      UNIQUE (ballot_id, points)
    );

    CREATE INDEX IF NOT EXISTS idx_ballot_status
      ON vote_ballots (guild_id, status);

    CREATE TABLE IF NOT EXISTS deadline_reminders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      deadline_type TEXT NOT NULL CHECK (deadline_type IN ('songSubmission', 'voting')),
      deadline_at INTEGER NOT NULL,
      threshold_hours INTEGER NOT NULL CHECK (threshold_hours IN (24, 6, 1)),
      processed_at TEXT NOT NULL,
      sent_count INTEGER NOT NULL DEFAULT 0,
      failed_count INTEGER NOT NULL DEFAULT 0,
      UNIQUE (guild_id, deadline_type, deadline_at, threshold_hours)
    );

    CREATE TABLE IF NOT EXISTS result_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('PREPARED','RUNNING','PAUSED','FINISHED')),
      reveal_order_json TEXT NOT NULL,
      current_voting_country_index INTEGER NOT NULL DEFAULT 0,
      reveal_mode TEXT NOT NULL DEFAULT 'FULL_BALLOT',
      created_at TEXT NOT NULL,
      started_at TEXT,
      finished_at TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_active_result_session ON result_sessions(guild_id)
      WHERE status IN ('PREPARED','RUNNING','PAUSED');

    CREATE TABLE IF NOT EXISTS result_snapshot_ballots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL REFERENCES result_sessions(id) ON DELETE CASCADE,
      voter_country_code TEXT NOT NULL,
      entries_json TEXT NOT NULL,
      UNIQUE(session_id, voter_country_code)
    );
    CREATE TABLE IF NOT EXISTS result_snapshot_targets (
      session_id INTEGER NOT NULL REFERENCES result_sessions(id) ON DELETE CASCADE,
      country_code TEXT NOT NULL,
      PRIMARY KEY(session_id,country_code)
    );

    CREATE TABLE IF NOT EXISTS official_entry_messages (
      guild_id TEXT NOT NULL,
      country_code TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      PRIMARY KEY(guild_id, country_code)
    );

    CREATE TABLE IF NOT EXISTS song_change_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      country_code TEXT NOT NULL,
      requested_by TEXT NOT NULL,
      current_submission_id INTEGER NOT NULL,
      proposed_youtube_video_id TEXT NOT NULL,
      proposed_youtube_url TEXT NOT NULL,
      proposed_song_title TEXT NOT NULL,
      proposed_channel_name TEXT NOT NULL,
      proposed_thumbnail_url TEXT,
      proposed_view_count INTEGER NOT NULL,
      proposed_duration TEXT NOT NULL,
      proposed_published_at TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('PENDING','APPROVED','REJECTED')),
      submitted_at TEXT NOT NULL,
      reviewed_at TEXT,
      reviewed_by TEXT,
      rejection_reason TEXT,
      admin_channel_id TEXT,
      admin_message_id TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_pending_song_change_country
      ON song_change_requests(guild_id, country_code) WHERE status='PENDING';
  `);

  const columns = database.pragma("table_info(song_submissions)") as Array<{ name: string }>;
  if (!columns.some((column) => column.name === "view_count_at_approval")) {
    database.exec("ALTER TABLE song_submissions ADD COLUMN view_count_at_approval INTEGER");
  }
  if (!columns.some((column) => column.name === "locked")) {
    database.exec(
      "ALTER TABLE song_submissions ADD COLUMN locked INTEGER NOT NULL DEFAULT 0 CHECK (locked IN (0, 1))",
    );
    database.exec("UPDATE song_submissions SET locked = 1 WHERE status = 'APPROVED'");
  }
  if (!columns.some((column) => column.name === "replaces_submission_id")) {
    database.exec("ALTER TABLE song_submissions ADD COLUMN replaces_submission_id INTEGER");
  }
}
