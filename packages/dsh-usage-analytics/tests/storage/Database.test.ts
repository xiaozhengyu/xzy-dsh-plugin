import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase, USAGE_ANALYTICS_APPLICATION_ID } from '../../src/storage/Database.js';

const tempDirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-ua-db-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('openDatabase', () => {
  it('opens :memory: and claims it with the application id', () => {
    const db = openDatabase({ path: ':memory:' });
    try {
      const { application_id } = db.prepare('PRAGMA application_id').get() as { application_id: number };
      expect(application_id).toBe(USAGE_ANALYTICS_APPLICATION_ID);
    } finally {
      db.close();
    }
  });

  it('creates a file database with parent dirs and reopens it', () => {
    const dir = tempDir();
    const path = join(dir, 'nested', 'usage.sqlite');
    const db1 = openDatabase({ path });
    db1.exec('CREATE TABLE t (id INTEGER PRIMARY KEY) STRICT');
    db1.close();

    const db2 = openDatabase({ path });
    try {
      const { application_id } = db2.prepare('PRAGMA application_id').get() as { application_id: number };
      expect(application_id).toBe(USAGE_ANALYTICS_APPLICATION_ID);
      expect(db2.prepare("SELECT name FROM sqlite_master WHERE name = 't'").get()).toBeTruthy();
    } finally {
      db2.close();
    }
  });

  it('rejects a database belonging to another application', () => {
    const path = join(tempDir(), 'foreign.sqlite');
    const foreign = new DatabaseSync(path);
    foreign.exec('PRAGMA application_id = 12345');
    foreign.exec('CREATE TABLE x (id INTEGER PRIMARY KEY) STRICT');
    foreign.close();

    expect(() => openDatabase({ path })).toThrow(/belongs to another application/);
  });

  it('accepts an existing ledger database with our application id', () => {
    const path = join(tempDir(), 'ledger.sqlite');
    const db1 = openDatabase({ path });
    db1.exec(`PRAGMA application_id = ${USAGE_ANALYTICS_APPLICATION_ID}`);
    db1.close();

    const db2 = openDatabase({ path });
    db2.close(); // must not throw, and the handle must be released
  });

  it('sets journal mode to WAL on a file database', () => {
    const path = join(tempDir(), 'wal.sqlite');
    const db = openDatabase({ path, journalMode: 'wal' });
    try {
      const { journal_mode } = db.prepare('PRAGMA journal_mode').get() as { journal_mode: string };
      expect(journal_mode).toBe('wal');
    } finally {
      db.close();
    }
  });
});
