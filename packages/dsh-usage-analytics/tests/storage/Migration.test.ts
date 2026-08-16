import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { MIGRATIONS, runMigrations } from '../../src/storage/Migration.js';

function freshDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  return db;
}

function userVersion(db: DatabaseSync): number {
  return (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
}

describe('runMigrations', () => {
  it('applies all migrations on a fresh database', () => {
    const db = freshDb();
    runMigrations(db);
    try {
      expect(userVersion(db)).toBe(MIGRATIONS[MIGRATIONS.length - 1]!.version);
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
        .all()
        .map((r) => (r as { name: string }).name);
      expect(tables).toContain('usage_record');
      expect(tables).toContain('usage_raw_event');
      expect(tables).toContain('usage_daily_stats');
    } finally {
      db.close();
    }
  });

  it('is a no-op when already current', () => {
    const db = freshDb();
    runMigrations(db);
    runMigrations(db); // second run must not throw or change version
    try {
      expect(userVersion(db)).toBe(MIGRATIONS[MIGRATIONS.length - 1]!.version);
    } finally {
      db.close();
    }
  });

  it('creates the idempotency index on (session_id, seq)', () => {
    const db = freshDb();
    runMigrations(db);
    try {
      const index = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_usage_record_session_seq'")
        .get();
      expect(index).toBeTruthy();
    } finally {
      db.close();
    }
  });

  it('refuses to open a newer schema (downgrade protection)', () => {
    const db = freshDb();
    db.exec('PRAGMA user_version = 99');
    try {
      expect(() => runMigrations(db)).toThrow(/newer|downgrade/i);
    } finally {
      db.close();
    }
  });

  it('runs each migration in its own transaction', () => {
    const db = freshDb();
    db.exec('PRAGMA user_version = 1'); // pretend 001 already applied
    runMigrations(db);
    try {
      expect(userVersion(db)).toBe(MIGRATIONS[MIGRATIONS.length - 1]!.version);
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
        .all()
        .map((r) => (r as { name: string }).name);
      expect(tables).toContain('usage_raw_event');
      expect(tables).toContain('usage_daily_stats');
    } finally {
      db.close();
    }
  });
});
