import type { DatabaseSync } from 'node:sqlite';
import type { UsageRecord } from '../model/UsageRecord.js';
import { RetentionService, type RetentionConfig, type RetentionResult } from '../service/RetentionService.js';
import { UsageService } from '../service/UsageService.js';
import { AsyncBatchWriter, defaultTimer, type Timer } from './AsyncBatchWriter.js';
import { openDatabase, type JournalMode } from './Database.js';
import { runMigrations } from './Migration.js';
import { UsageRepository, type UsageRecordRow } from './UsageRepository.js';

export interface UsageLedgerConfig {
  /** Ledger file path or ':memory:'. */
  dbPath: string;
  journalMode?: JournalMode;
  /** Batch writer flush interval in ms; 0 = manual flush only. Default 1000. */
  flushIntervalMs?: number;
  /** Batch size triggering an immediate flush. Default 100. */
  flushBatchSize?: number;
  retention?: RetentionConfig;
  /** Retention sweep interval in ms; 0 disables the periodic sweep. Default 0. */
  retentionIntervalMs?: number;
  /** Called (best effort) when a write/retention failure is contained. */
  onError?(error: unknown): void;
  timer?: Timer;
}

const DEFAULT_RETENTION_INTERVAL_MS = 6 * 60 * 60 * 1000;

/**
 * Phase 2 facade: one owned SQLite database + migrations + repository +
 * async batch writer + retention, presenting a small fail-open surface to the
 * plugin (`push` / `flush` / `dispose`). Opening runs an initial retention
 * sweep and, when configured, schedules periodic sweeps.
 */
export class UsageLedger {
  private readonly db: DatabaseSync;
  private readonly repository: UsageRepository;
  private readonly writer: AsyncBatchWriter<UsageRecord>;
  private readonly retention: RetentionService;
  private readonly retentionIntervalMs: number;
  private readonly reportError: (error: unknown) => void;
  private readonly timer: Timer;
  private retentionTimer?: { dispose(): void };
  private disposed = false;
  private queryService?: UsageService;

  private constructor(db: DatabaseSync, config: UsageLedgerConfig) {
    this.db = db;
    this.repository = new UsageRepository(db);
    this.retention = new RetentionService(db, config.retention);
    this.retentionIntervalMs = config.retentionIntervalMs ?? DEFAULT_RETENTION_INTERVAL_MS;
    this.reportError = config.onError ?? (() => undefined);
    this.timer = config.timer ?? defaultTimer;
    this.writer = new AsyncBatchWriter<UsageRecord>({
      batchSize: config.flushBatchSize,
      flushIntervalMs: config.flushIntervalMs,
      timer: this.timer,
      onError: (error) => this.reportError(error),
      flush: (records) => this.writeBatch(records),
    });
    this.runInitialRetention();
  }

  /**
   * Open (creating if needed) the ledger: guard the file, run migrations.
   * Throws on any storage failure — the caller decides how to degrade.
   */
  static open(config: UsageLedgerConfig): UsageLedger {
    const db = openDatabase({ path: config.dbPath, journalMode: config.journalMode });
    try {
      runMigrations(db);
    } catch (error) {
      db.close();
      throw error;
    }
    return new UsageLedger(db, config);
  }

  /** Buffer one finalized UsageRecord for batched persistence. Never throws. */
  push(record: UsageRecord): void {
    if (this.disposed) return;
    this.writer.push(record);
  }

  /** Force-sync buffered records. Never throws. */
  flush(): void {
    this.writer.flush();
  }

  /** Run a retention sweep now. */
  runRetention(now?: number): RetentionResult {
    return this.retention.run(now);
  }

  count(): number {
    return this.repository.count();
  }

  recent(limit: number): UsageRecordRow[] {
    return this.repository.recent(limit);
  }

  /** Phase 3 query facade over this ledger. */
  query(): UsageService {
    if (!this.queryService) {
      this.queryService = new UsageService(this.repository);
    }
    return this.queryService;
  }

  /** Flush + close. Idempotent; safe to call from a fiber disposer. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.retentionTimer?.dispose();
    this.retentionTimer = undefined;
    this.writer.dispose();
    try {
      this.db.close();
    } catch (error) {
      this.reportError(error);
    }
  }

  /** One transaction over a batch; on failure the whole batch rolls back and the error propagates to the writer's fail-open. */
  private writeBatch(records: readonly UsageRecord[]): void {
    const db = this.db;
    db.exec('BEGIN');
    try {
      for (const record of records) this.repository.insertRecord(record);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  private runInitialRetention(): void {
    if (this.retentionIntervalMs <= 0) return;
    try {
      this.retention.run();
    } catch (error) {
      this.reportError(error);
    }
    this.retentionTimer = this.timer.set(() => {
      try {
        this.retention.run();
      } catch (error) {
        this.reportError(error);
      }
    }, this.retentionIntervalMs);
  }
}
