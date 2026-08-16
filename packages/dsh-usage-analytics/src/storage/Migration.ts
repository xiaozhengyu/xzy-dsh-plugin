import type { DatabaseSync } from 'node:sqlite';

/**
 * One forward-only schema migration. The ledger never drops data: migrations
 * only add/alter, and a database whose `user_version` exceeds the newest known
 * migration refuses to open (downgrade protection).
 *
 * Deviation note: migrations live as typed constants instead of
 * `migrations/*.sql` files (architecture doc §25) — identical SQL, no runtime
 * file IO and no package-path resolution inside installed plugins.
 */
export interface Migration {
  version: number;
  name: string;
  up(db: DatabaseSync): void;
}

function usageRecordMigration(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS usage_record (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id         TEXT    NOT NULL,
      turn               INTEGER NOT NULL,
      step               INTEGER NOT NULL,
      seq                INTEGER,
      started_at         INTEGER NOT NULL,
      completed_at       INTEGER NOT NULL,
      duration_ms        INTEGER NOT NULL,
      provider           TEXT,
      model              TEXT,
      context_window     INTEGER,
      input_tokens       INTEGER,
      cache_read_tokens  INTEGER,
      cache_write_tokens INTEGER,
      output_tokens      INTEGER,
      total_tokens       INTEGER,
      reasoning_tokens   INTEGER,
      usage_source       TEXT    NOT NULL,
      finish_reason      TEXT,
      status             TEXT    NOT NULL,
      error_code         TEXT,
      error_message      TEXT,
      error_request_id   TEXT,
      has_tool_calls     INTEGER NOT NULL DEFAULT 0,
      first_token_at     INTEGER,
      ttft_ms            INTEGER,
      created_at         INTEGER NOT NULL,
      updated_at         INTEGER NOT NULL
    ) STRICT
  `);
  // Idempotency: (session_id, seq) is the durable identity; SQLite treats NULL
  // seq (disposal-time closes) as distinct, so those never collide.
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_usage_record_session_seq
    ON usage_record (session_id, seq)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_usage_record_session_turn_step
    ON usage_record (session_id, turn, step)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_usage_record_started_at
    ON usage_record (started_at)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_usage_record_status
    ON usage_record (status)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_usage_record_provider_model
    ON usage_record (provider, model)`);
}

function usageRawEventMigration(db: DatabaseSync): void {
  // Dormant in Phase 2 (no producer yet): schema + retention ready for the raw
  // event capture phase. Kept short by default — payloads can be large.
  db.exec(`
    CREATE TABLE IF NOT EXISTS usage_raw_event (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id   TEXT    NOT NULL,
      turn         INTEGER NOT NULL,
      step         INTEGER NOT NULL,
      event_type   TEXT    NOT NULL,
      event_seq    INTEGER NOT NULL,
      event_time   INTEGER NOT NULL,
      payload_json TEXT    NOT NULL,
      created_at   INTEGER NOT NULL
    ) STRICT
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_usage_raw_event_session_seq
    ON usage_raw_event (session_id, event_seq)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_usage_raw_event_time
    ON usage_raw_event (event_time)`);
}

/** Ordered migration list; `user_version` advances to the highest applied version. */
export const MIGRATIONS: readonly Migration[] = [
  { version: 1, name: 'usage_record', up: usageRecordMigration },
  { version: 2, name: 'usage_raw_event', up: usageRawEventMigration },
];

/**
 * Apply all pending migrations, each inside its own transaction, advancing
 * `PRAGMA user_version`. No-op when already current; throws (without applying
 * anything) when the database schema is NEWER than this plugin supports.
 */
export function runMigrations(db: DatabaseSync, migrations: readonly Migration[] = MIGRATIONS): void {
  const { user_version: current } = db.prepare('PRAGMA user_version').get() as { user_version: number };
  const max = migrations.reduce((m, x) => Math.max(m, x.version), 0);
  if (current > max) {
    throw new Error(
      `usage-analytics database schema is newer (user_version=${current}) than this plugin supports (${max}); refusing to downgrade`,
    );
  }
  for (const migration of migrations) {
    if (migration.version <= current) continue;
    db.exec('BEGIN');
    try {
      migration.up(db);
      db.exec(`PRAGMA user_version = ${migration.version}`);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
}
