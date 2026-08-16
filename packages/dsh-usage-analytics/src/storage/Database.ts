import { closeSync, mkdirSync, openSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/**
 * Application id stamped into the ledger file, guarding against accidentally
 * opening another application's SQLite database (mirrors the
 * dsh-session-query-sqlite pattern, locked in doc/harness-api.md §6).
 */
export const USAGE_ANALYTICS_APPLICATION_ID = 0x55414e41; // 'UANA'

/** SQLite journal modes accepted by the ledger. */
export type JournalMode = 'delete' | 'truncate' | 'persist' | 'memory' | 'wal' | 'off';

export interface DatabaseOptions {
  /** Ledger file path or ':memory:'. Missing parent directories are created owner-only. */
  path: string;
  journalMode?: JournalMode;
}

/**
 * Open (creating if needed) the usage-analytics ledger database.
 *
 * Uses `node:sqlite` `DatabaseSync` (synchronous API, same driver as
 * dsh-session-query-sqlite). Throws when the file belongs to another
 * application — the caller is responsible for fail-open handling.
 */
export function openDatabase(options: DatabaseOptions): DatabaseSync {
  const actual = options.path === ':memory:' ? ':memory:' : resolve(options.path);
  if (actual !== ':memory:') {
    mkdirSync(dirname(actual), { recursive: true, mode: 0o700 });
    createFileOwnerOnly(actual);
  }
  const db = new DatabaseSync(actual);
  try {
    const { application_id: applicationId } = db.prepare('PRAGMA application_id').get() as {
      application_id: number;
    };
    if (applicationId !== 0 && applicationId !== USAGE_ANALYTICS_APPLICATION_ID) {
      throw new Error(`usage-analytics database at "${actual}" belongs to another application`);
    }
    if (applicationId === 0) {
      // Brand-new (or empty) file: claim it.
      db.exec(`PRAGMA application_id = ${USAGE_ANALYTICS_APPLICATION_ID}`);
    }
    db.exec(`PRAGMA journal_mode = ${(options.journalMode ?? 'wal').toUpperCase()}`);
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

/** Exclusively create a missing database file with owner-only permissions (0o600). */
function createFileOwnerOnly(path: string): void {
  try {
    const fd = openSync(path, 'wx', 0o600);
    closeSync(fd);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  }
}
