/**
 * Pure domain logic shared by the server and every client.
 *
 * The whole system is event sourced: the database stores an append-only list of
 * events, and `reduce` turns that list into the current state of each resident.
 * Nothing in this file touches the network, the clock or the database, so all of it is
 * easy to test.
 */

export type Reason = 'food' | 'q' | 'pills' | 'nurse';

export const REASON_TEXT: Record<Reason, string> = {
  food: 'Problem with the food',
  q: 'Has a question',
  pills: 'Says the pills look different',
  nurse: 'Asked for a nurse to stop by',
};

/** Events a person can cause by tapping something. */
export type ActionType =
  | 'tray_delivered'
  | 'tray_undone'
  | 'meds_taken'
  | 'flag_raised'
  | 'nurse_ack'
  | 'nurse_snooze'
  | 'flag_resolved'
  | 'pills_given';

/** Events only the server creates, when it detects a gap on its own. */
export type SystemType = 'nudge_sent';

export type EventType = ActionType | SystemType;

export const ACTION_TYPES: ActionType[] = [
  'tray_delivered', 'tray_undone', 'meds_taken', 'flag_raised',
  'nurse_ack', 'nurse_snooze', 'flag_resolved', 'pills_given',
];

export interface CareEvent {
  id: number;
  /** Simulated time, in minutes after midnight. */
  t: number;
  type: EventType;
  residentId: string;
  reason?: Reason;
  /** Only for nurse_snooze: the time the reminder is due. */
  until?: number;
}

export interface Medication {
  name: string;
  dose: string;
  look: string;
  why: string;
}

export interface Resident {
  id: string;
  first: string;
  name: string;
  room: number;
  /** Rarely asks for help, so silence is not a good sign. */
  quiet?: boolean;
  meds: Medication[];
}

/** Minutes after the tray arrives before an unanswered check-in becomes a nudge. */
export const NUDGE_AFTER = 30;
/** Minutes a nurse can postpone a nudge. */
export const SNOOZE_MINUTES = 10;

export interface ResidentState {
  tray: number | null;
  taken: number | null;
  flag: { reason: Reason; at: number; resolved: boolean } | null;
  ack: number | null;
  snoozeUntil: number | null;
  nudged: boolean;
  nudgedAt: number | null;
}

export type CareState = Record<string, ResidentState>;

export function emptyResident(): ResidentState {
  return { tray: null, taken: null, flag: null, ack: null, snoozeUntil: null, nudged: false, nudgedAt: null };
}

export function reduce(events: CareEvent[], residents: Resident[]): CareState {
  const state: CareState = {};
  for (const r of residents) state[r.id] = emptyResident();
  for (const e of events) {
    const s = state[e.residentId];
    if (!s) continue;
    switch (e.type) {
      case 'tray_delivered':
        s.tray = e.t;
        break;
      case 'tray_undone':
        s.tray = null; s.nudged = false; s.nudgedAt = null; s.ack = null; s.snoozeUntil = null;
        break;
      case 'meds_taken':
      case 'pills_given':
        s.taken = e.t; s.ack = null;
        break;
      case 'flag_raised':
        if (!s.flag || s.flag.resolved) s.flag = { reason: e.reason ?? 'q', at: e.t, resolved: false };
        break;
      case 'flag_resolved':
        if (s.flag) s.flag.resolved = true;
        s.ack = null;
        break;
      case 'nurse_ack':
        s.ack = e.t;
        break;
      case 'nurse_snooze':
        s.snoozeUntil = e.until ?? e.t + SNOOZE_MINUTES; s.nudged = false; s.nudgedAt = null;
        break;
      case 'nudge_sent':
        s.nudged = true; s.nudgedAt = e.t;
        break;
    }
  }
  return state;
}

export type Status = 'now' | 'soon' | 'onway' | 'snoozed' | 'settle' | 'tray' | 'done';

export function openFlag(s: ResidentState) {
  return s.flag && !s.flag.resolved ? s.flag : null;
}

export function statusOf(s: ResidentState, clock: number): Status {
  const flag = openFlag(s);
  if (flag) return s.ack !== null && s.ack >= flag.at ? 'onway' : 'now';
  if (s.taken !== null) return 'done';
  if (s.tray === null) return 'tray';
  if (s.ack !== null && s.ack >= s.tray) return 'onway';
  if (s.snoozeUntil !== null && clock < s.snoozeUntil) return 'snoozed';
  if (clock - s.tray >= NUDGE_AFTER) return 'soon';
  return 'settle';
}

/** Sort order for the nurse's round list: most urgent first. */
export const STATUS_ORDER: Record<Status, number> = { now: 0, soon: 1, onway: 2, snoozed: 3, settle: 4, tray: 5, done: 6 };

/** Residents who just crossed the line and have not had a nudge yet. */
export function nudgesDue(state: CareState, clock: number): string[] {
  return Object.entries(state)
    .filter(([, s]) => statusOf(s, clock) === 'soon' && !s.nudged)
    .map(([id]) => id);
}

export interface Alert {
  residentId: string;
  kind: 'soon' | 'now';
  since: number;
}

/** What should currently be buzzing the nurse. Alerts disappear on their own once the situation changes. */
export function alerts(state: CareState, clock: number): Alert[] {
  const out: Alert[] = [];
  for (const [id, s] of Object.entries(state)) {
    const st = statusOf(s, clock);
    if (st === 'now' && s.flag) out.push({ residentId: id, kind: 'now', since: s.flag.at });
    if (st === 'soon' && s.nudged) out.push({ residentId: id, kind: 'soon', since: s.nudgedAt ?? clock });
  }
  return out.sort((a, b) => a.since - b.since);
}

/** Whether an action makes sense in the current state. The server rejects anything else. */
export function canApply(type: ActionType, s: ResidentState, clock: number): { ok: true } | { ok: false; error: string } {
  const st = statusOf(s, clock);
  const no = (error: string) => ({ ok: false as const, error });
  switch (type) {
    case 'tray_delivered':
      return s.tray === null ? { ok: true } : no('Tray was already delivered');
    case 'tray_undone':
      return s.tray !== null && s.taken === null ? { ok: true } : no('Nothing to undo');
    case 'meds_taken':
      return s.tray !== null && s.taken === null ? { ok: true } : no('Meds are not waiting to be confirmed');
    case 'pills_given':
      return s.tray !== null && s.taken === null ? { ok: true } : no('Meds are not waiting to be confirmed');
    case 'flag_raised':
      return openFlag(s) ? no('Already flagged') : { ok: true };
    case 'flag_resolved':
      return openFlag(s) ? { ok: true } : no('No open flag');
    case 'nurse_ack':
      return st === 'tray' || st === 'done' || st === 'onway' ? no('Nothing to respond to') : { ok: true };
    case 'nurse_snooze':
      return s.tray !== null && s.taken === null && !openFlag(s) ? { ok: true } : no('Cannot snooze this');
  }
}

/* ---------- Formatting and the readable log ---------- */

export function fmtTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${((h + 11) % 12) + 1}:${m < 10 ? '0' : ''}${m} ${h >= 12 ? 'PM' : 'AM'}`;
}

export type LogKind = 'ok' | 'warn' | 'info';

export function describe(e: CareEvent, residents: Resident[]): { text: string; kind: LogKind } {
  const r = residents.find((x) => x.id === e.residentId);
  if (!r) return { text: 'Unknown resident', kind: 'info' };
  switch (e.type) {
    case 'tray_delivered': return { text: `Kitchen delivered the tray to Room ${r.room}`, kind: 'ok' };
    case 'tray_undone': return { text: `Kitchen undid the delivery to Room ${r.room}`, kind: 'info' };
    case 'meds_taken': return { text: `${r.first} confirmed the morning pills`, kind: 'ok' };
    case 'flag_raised': return { text: `${r.first}: ${REASON_TEXT[e.reason ?? 'q'].toLowerCase()}`, kind: 'warn' };
    case 'nurse_ack': return { text: `Nurse is on the way to Room ${r.room}`, kind: 'info' };
    case 'nurse_snooze': return { text: `Nurse set a reminder for Room ${r.room} at ${fmtTime(e.until ?? e.t)}`, kind: 'info' };
    case 'flag_resolved': return { text: `Nurse marked Room ${r.room} as handled`, kind: 'ok' };
    case 'pills_given': return { text: `Nurse confirmed the pills were given in Room ${r.room}`, kind: 'ok' };
    case 'nudge_sent': return { text: `Quiet nudge sent to the nurse for Room ${r.room}`, kind: 'warn' };
  }
}

/** Human readable line under a resident's name on the nurse's round list. */
export function detailText(s: ResidentState, clock: number): string {
  const st = statusOf(s, clock);
  switch (st) {
    case 'now': return `${REASON_TEXT[s.flag!.reason]}, ${clock - s.flag!.at} min ago`;
    case 'onway': return `On the way since ${fmtTime(s.ack!)}`;
    case 'snoozed': return `Reminder at ${fmtTime(s.snoozeUntil!)}`;
    case 'soon': return `Meds not confirmed, ${clock - s.tray!} min after tray`;
    case 'settle': return `Tray delivered ${clock - s.tray!} min ago`;
    case 'tray': return 'Tray not delivered yet';
    case 'done': return `Took morning pills at ${fmtTime(s.taken!)}`;
  }
}

/* ---------- Demo data ---------- */

export const START_CLOCK = 7 * 60 + 55;

const med = (name: string, dose: string, look: string, why: string): Medication => ({ name, dose, look, why });
const WHITE = 'White, round, one line across';
const YELLOW = 'Pale yellow, round';

export const RESIDENTS: Resident[] = [
  { id: 'molly', first: 'Molly', name: 'Molly R.', room: 12, quiet: true, meds: [
    med('Metformin', '500 mg. Take 1 pill.', WHITE, 'Helps control your blood sugar.'),
    med('Lisinopril', '10 mg. Take 1 pill.', YELLOW, 'Helps lower your blood pressure.')] },
  { id: 'dorothy', first: 'Dorothy', name: 'Dorothy P.', room: 14, meds: [
    med('Atorvastatin', '20 mg. Take 1 pill.', WHITE, 'Helps keep your cholesterol down.'),
    med('Amlodipine', '5 mg. Take 1 pill.', YELLOW, 'Helps lower your blood pressure.')] },
  { id: 'walter', first: 'Walter', name: 'Walter K.', room: 15, meds: [
    med('Metoprolol', '25 mg. Take 1 pill.', WHITE, 'Helps your heart beat steadily.'),
    med('Aspirin', '81 mg. Take 1 pill.', YELLOW, 'Helps protect your heart.')] },
  { id: 'harold', first: 'Harold', name: 'Harold T.', room: 8, meds: [
    med('Furosemide', '20 mg. Take 1 pill.', WHITE, 'Helps your body clear extra fluid.'),
    med('Levothyroxine', '50 mcg. Take 1 pill.', YELLOW, 'Helps your thyroid.')] },
  { id: 'rosa', first: 'Rosa', name: 'Rosa M.', room: 3, meds: [
    med('Levothyroxine', '75 mcg. Take 1 pill.', WHITE, 'Helps your thyroid.'),
    med('Vitamin D', '1000 IU. Take 1 pill.', YELLOW, 'Helps keep your bones strong.')] },
];

/** Order the kitchen cart visits rooms. */
export const CART: string[] = ['molly', 'dorothy', 'walter', 'harold', 'rosa'];

/** A pre-made morning for demos: a mix of done, waiting, flagged and about to be nudged. */
export const SAMPLE_CLOCK = 8 * 60 + 34;
export const SAMPLE_EVENTS: Omit<CareEvent, 'id'>[] = [
  { t: 482, type: 'tray_delivered', residentId: 'molly' },
  { t: 483, type: 'tray_delivered', residentId: 'dorothy' },
  { t: 484, type: 'tray_delivered', residentId: 'walter' },
  { t: 485, type: 'tray_delivered', residentId: 'harold' },
  { t: 494, type: 'meds_taken', residentId: 'dorothy' },
  { t: 500, type: 'meds_taken', residentId: 'walter' },
  { t: 510, type: 'flag_raised', residentId: 'harold', reason: 'pills' },
];

/** Shape the server sends to every client. */
export interface Snapshot {
  clock: number;
  events: CareEvent[];
}
