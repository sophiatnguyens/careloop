import { DatabaseSync } from 'node:sqlite';
import {
  ACTION_TYPES, CareEvent, EventType, Reason, RESIDENTS, SAMPLE_CLOCK, SAMPLE_EVENTS, SNOOZE_MINUTES,
  START_CLOCK, Snapshot, canApply, nudgesDue, reduce, type ActionType,
} from '../shared/domain';

export class ServiceError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

interface Row {
  id: number;
  t: number;
  type: EventType;
  resident_id: string;
  reason: Reason | null;
  until: number | null;
}

/**
 * All business rules live here, behind plain methods, so they can be tested with an in-memory database
 * and no HTTP server. The HTTP layer in index.ts only translates requests into calls on this class.
 */
export class CareService {
  private db: DatabaseSync;

  constructor(path = ':memory:') {
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        t INTEGER NOT NULL,
        type TEXT NOT NULL,
        resident_id TEXT NOT NULL,
        reason TEXT,
        until INTEGER
      );
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value INTEGER NOT NULL);
    `);
    this.db.prepare('INSERT OR IGNORE INTO meta (key, value) VALUES (?, ?)').run('clock', START_CLOCK);
  }

  snapshot(): Snapshot {
    const rows = this.db.prepare('SELECT * FROM events ORDER BY id').all() as unknown as Row[];
    const events: CareEvent[] = rows.map((r) => ({
      id: r.id, t: r.t, type: r.type, residentId: r.resident_id,
      ...(r.reason ? { reason: r.reason } : {}),
      ...(r.until !== null ? { until: r.until } : {}),
    }));
    return { clock: this.clock(), events };
  }

  /** Runs fn inside one transaction, so an action and the nudges it triggers are saved together or not at all. */
  private tx<T>(fn: () => T): T {
    this.db.exec('BEGIN');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  private clock(): number {
    return (this.db.prepare('SELECT value FROM meta WHERE key = ?').get('clock') as unknown as { value: number }).value;
  }

  private setClock(value: number) {
    this.db.prepare('UPDATE meta SET value = ? WHERE key = ?').run(value, 'clock');
  }

  private insert(e: Omit<CareEvent, 'id'>) {
    this.db
      .prepare('INSERT INTO events (t, type, resident_id, reason, until) VALUES (?, ?, ?, ?, ?)')
      .run(e.t, e.type, e.residentId, e.reason ?? null, e.until ?? null);
  }

  /** Looks for residents who just crossed the nudge threshold and records a nudge for each. */
  private detectNudges() {
    const { clock, events } = this.snapshot();
    for (const id of nudgesDue(reduce(events, RESIDENTS), clock)) {
      this.insert({ t: clock, type: 'nudge_sent', residentId: id });
    }
  }

  apply(input: { type: string; residentId: string; reason?: string }): Snapshot {
    if (!ACTION_TYPES.includes(input.type as ActionType)) throw new ServiceError(400, 'Unknown action');
    if (!RESIDENTS.some((r) => r.id === input.residentId)) throw new ServiceError(404, 'Unknown resident');
    const type = input.type as ActionType;
    if (type === 'flag_raised' && !['food', 'q', 'pills', 'nurse'].includes(input.reason ?? '')) {
      throw new ServiceError(400, 'A reason is required');
    }

    this.tx(() => {
      const { clock, events } = this.snapshot();
      const state = reduce(events, RESIDENTS)[input.residentId]!;
      const check = canApply(type, state, clock);
      if (!check.ok) throw new ServiceError(409, check.error);
      this.insert({
        t: clock, type, residentId: input.residentId,
        ...(type === 'flag_raised' ? { reason: input.reason as Reason } : {}),
        ...(type === 'nurse_snooze' ? { until: clock + SNOOZE_MINUTES } : {}),
      });
      this.detectNudges();
    });
    return this.snapshot();
  }

  advance(minutes: number): Snapshot {
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 240) throw new ServiceError(400, 'Minutes must be between 1 and 240');
    this.tx(() => {
      this.setClock(this.clock() + minutes);
      this.detectNudges();
    });
    return this.snapshot();
  }

  private clear() {
    this.db.exec('DELETE FROM events');
    this.db.exec("DELETE FROM sqlite_sequence WHERE name = 'events'");
    this.setClock(START_CLOCK);
  }

  reset(): Snapshot {
    this.tx(() => this.clear());
    return this.snapshot();
  }

  loadSample(): Snapshot {
    this.tx(() => {
      this.clear();
      for (const e of SAMPLE_EVENTS) this.insert(e);
      this.setClock(SAMPLE_CLOCK);
      this.detectNudges();
    });
    return this.snapshot();
  }

  close() {
    this.db.close();
  }
}
