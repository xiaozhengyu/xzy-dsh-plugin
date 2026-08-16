import type { DatabaseSync } from 'node:sqlite';
import type { UsageRecord } from '../model/UsageRecord.js';
import type { RequestQuery, RequestSortField, SortOrder } from '../query/types.js';

/** A usage_record row as read back from SQLite (snake_case → camelCase). */
export interface UsageRecordRow {
  id: number;
  sessionId: string;
  turn: number;
  step: number;
  seq: number | null;
  startedAt: number;
  completedAt: number;
  durationMs: number;
  provider: string | null;
  model: string | null;
  contextWindow: number | null;
  inputTokens: number | null;
  cacheReadTokens: number | null;
  cacheWriteTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  reasoningTokens: number | null;
  usageSource: string;
  finishReason: string | null;
  status: string;
  errorCode: string | null;
  errorMessage: string | null;
  errorRequestId: string | null;
  hasToolCalls: number;
  firstTokenAt: number | null;
  ttftMs: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface RawEventInput {
  sessionId: string;
  turn: number;
  step: number;
  eventType: string;
  eventSeq: number;
  eventTime: number;
  payloadJson: string;
}

/**
 * Typed CRUD for the usage ledger. Parameterized SQL only. The ledger is the
 * sole writer; Phase 3 (Query Service) will extend the read surface.
 */
export class UsageRepository {
  constructor(private readonly db: DatabaseSync) {}

  /**
   * Idempotent insert: a record with the same `(session_id, seq)` is ignored
   * (first write wins — replay/duplicate events must not double-count).
   */
  insertRecord(record: UsageRecord, now: number = Date.now()): void {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO usage_record (
          session_id, turn, step, seq,
          started_at, completed_at, duration_ms,
          provider, model, context_window,
          input_tokens, cache_read_tokens, cache_write_tokens, output_tokens, total_tokens, reasoning_tokens,
          usage_source, finish_reason, status,
          error_code, error_message, error_request_id,
          has_tool_calls, first_token_at, ttft_ms,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        record.sessionId,
        record.turn,
        record.step,
        record.seq ?? null,
        record.startedAt,
        record.completedAt,
        record.durationMs,
        record.provider ?? null,
        record.model ?? null,
        record.contextWindow ?? null,
        record.usage?.inputTokens ?? null,
        record.usage?.cacheReadTokens ?? null,
        record.usage?.cacheWriteTokens ?? null,
        record.usage?.outputTokens ?? null,
        record.usage?.totalTokens ?? null,
        record.usage?.reasoningTokens ?? null,
        record.usageSource,
        record.finishReason ?? null,
        record.status,
        record.error?.code ?? null,
        record.error?.message ?? null,
        record.error?.requestId ?? null,
        record.hasToolCalls ? 1 : 0,
        record.firstTokenAt ?? null,
        record.ttftMs ?? null,
        now,
        now,
      );
  }

  /** Insert one raw event reference/payload (dormant producer until the raw-event phase). */
  insertRawEvent(input: RawEventInput, now: number = Date.now()): void {
    this.db
      .prepare(
        `INSERT INTO usage_raw_event (session_id, turn, step, event_type, event_seq, event_time, payload_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(input.sessionId, input.turn, input.step, input.eventType, input.eventSeq, input.eventTime, input.payloadJson, now);
  }

  count(): number {
    return (this.db.prepare('SELECT COUNT(*) AS c FROM usage_record').get() as { c: number }).c;
  }

  /** Most recent records by completion time (newest first). */
  recent(limit: number): UsageRecordRow[] {
    const rows = this.db
      .prepare('SELECT * FROM usage_record ORDER BY completed_at DESC, id DESC LIMIT ?')
      .all(limit) as Array<Record<string, unknown>>;
    return rows.map(rowToUsageRecordRow);
  }

  /** All rows with `started_at` in [startMs, endMs); unbounded when a bound is omitted. */
  scan(startMs?: number, endMs?: number): UsageRecordRow[] {
    const conditions: string[] = [];
    const params: Array<number> = [];
    if (startMs !== undefined) {
      conditions.push('started_at >= ?');
      params.push(startMs);
    }
    if (endMs !== undefined) {
      conditions.push('started_at < ?');
      params.push(endMs);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = this.db.prepare(`SELECT * FROM usage_record ${where} ORDER BY id`).all(...params) as Array<
      Record<string, unknown>
    >;
    return rows.map(rowToUsageRecordRow);
  }

  /** One record by primary key. */
  getById(id: number): UsageRecordRow | undefined {
    const row = this.db.prepare('SELECT * FROM usage_record WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? rowToUsageRecordRow(row) : undefined;
  }

  /**
   * Filtered, sorted, paginated request listing. All filter values are bound
   * parameters; only whitelisted column names can be sorted on.
   */
  queryRequests(query: RequestQuery): { rows: UsageRecordRow[]; total: number } {
    const conditions: string[] = [];
    const params: Array<string | number> = [];
    if (query.from !== undefined) {
      conditions.push('started_at >= ?');
      params.push(query.from);
    }
    if (query.to !== undefined) {
      conditions.push('started_at < ?');
      params.push(query.to);
    }
    if (query.provider !== undefined) {
      conditions.push('provider = ?');
      params.push(query.provider);
    }
    if (query.model !== undefined) {
      conditions.push('model = ?');
      params.push(query.model);
    }
    if (query.status !== undefined) {
      conditions.push('status = ?');
      params.push(query.status);
    }
    if (query.sessionId !== undefined) {
      conditions.push('session_id = ?');
      params.push(query.sessionId);
    }
    if (query.search !== undefined && query.search.length > 0) {
      conditions.push('(session_id LIKE ? OR provider LIKE ? OR model LIKE ? OR error_message LIKE ?)');
      const pattern = `%${query.search}%`;
      params.push(pattern, pattern, pattern, pattern);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const total = (
      this.db.prepare(`SELECT COUNT(*) AS c FROM usage_record ${where}`).get(...params) as { c: number }
    ).c;

    const sortColumn = SORT_COLUMNS[query.sortBy ?? 'time'];
    const order: SortOrder = query.order === 'asc' ? 'asc' : 'desc';
    const offset = Math.max(0, query.offset ?? 0);
    const limit = Math.min(500, Math.max(1, query.limit ?? 50));
    const rows = this.db
      .prepare(`SELECT * FROM usage_record ${where} ORDER BY ${sortColumn} ${order === 'asc' ? 'ASC' : 'DESC'}, id ${order === 'asc' ? 'ASC' : 'DESC'} LIMIT ? OFFSET ?`)
      .all(...params, limit, offset) as Array<Record<string, unknown>>;
    return { rows: rows.map(rowToUsageRecordRow), total };
  }

  /** Delete usage records whose completion time precedes the cutoff; returns deleted count. */
  deleteRecordsBefore(cutoffMs: number): number {
    return Number(this.db.prepare('DELETE FROM usage_record WHERE completed_at < ?').run(cutoffMs).changes);
  }

  /** Delete raw events whose event time precedes the cutoff; returns deleted count. */
  deleteRawEventsBefore(cutoffMs: number): number {
    return Number(this.db.prepare('DELETE FROM usage_raw_event WHERE event_time < ?').run(cutoffMs).changes);
  }
}

const SORT_COLUMNS: Record<RequestSortField, string> = {
  time: 'started_at',
  duration: 'duration_ms',
  totalTokens: 'total_tokens',
};

function rowToUsageRecordRow(row: Record<string, unknown>): UsageRecordRow {
  return {
    id: row.id as number,
    sessionId: row.session_id as string,
    turn: row.turn as number,
    step: row.step as number,
    seq: row.seq as number | null,
    startedAt: row.started_at as number,
    completedAt: row.completed_at as number,
    durationMs: row.duration_ms as number,
    provider: row.provider as string | null,
    model: row.model as string | null,
    contextWindow: row.context_window as number | null,
    inputTokens: row.input_tokens as number | null,
    cacheReadTokens: row.cache_read_tokens as number | null,
    cacheWriteTokens: row.cache_write_tokens as number | null,
    outputTokens: row.output_tokens as number | null,
    totalTokens: row.total_tokens as number | null,
    reasoningTokens: row.reasoning_tokens as number | null,
    usageSource: row.usage_source as string,
    finishReason: row.finish_reason as string | null,
    status: row.status as string,
    errorCode: row.error_code as string | null,
    errorMessage: row.error_message as string | null,
    errorRequestId: row.error_request_id as string | null,
    hasToolCalls: row.has_tool_calls as number,
    firstTokenAt: row.first_token_at as number | null,
    ttftMs: row.ttft_ms as number | null,
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
  };
}
