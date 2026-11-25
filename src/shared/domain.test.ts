import { describe, expect, it } from 'vitest';
import {
  CareEvent, NUDGE_AFTER, RESIDENTS, alerts, canApply, detailText, emptyResident, fmtTime, nudgesDue, reduce, statusOf,
} from './domain';

let nextId = 1;
const ev = (e: Omit<CareEvent, 'id'>): CareEvent => ({ id: nextId++, ...e });
const state = (events: CareEvent[]) => reduce(events, RESIDENTS);

describe('statusOf', () => {
  it('waits for the tray before anything else', () => {
    expect(statusOf(emptyResident(), 500)).toBe('tray');
  });

  it('stays quiet until the nudge threshold, then asks the nurse to check', () => {
    const s = state([ev({ t: 480, type: 'tray_delivered', residentId: 'molly' })]).molly!;
    expect(statusOf(s, 480 + NUDGE_AFTER - 1)).toBe('settle');
    expect(statusOf(s, 480 + NUDGE_AFTER)).toBe('soon');
  });

  it('is done once the resident confirms', () => {
    const s = state([
      ev({ t: 480, type: 'tray_delivered', residentId: 'molly' }),
      ev({ t: 490, type: 'meds_taken', residentId: 'molly' }),
    ]).molly!;
    expect(statusOf(s, 600)).toBe('done');
  });

  it('puts an open flag above everything else, even after the meds were taken', () => {
    const s = state([
      ev({ t: 480, type: 'tray_delivered', residentId: 'molly' }),
      ev({ t: 490, type: 'meds_taken', residentId: 'molly' }),
      ev({ t: 495, type: 'flag_raised', residentId: 'molly', reason: 'pills' }),
    ]).molly!;
    expect(statusOf(s, 496)).toBe('now');
  });

  it('shows on the way after the nurse responds, and done again once the flag is handled', () => {
    const base = [
      ev({ t: 480, type: 'tray_delivered', residentId: 'molly' }),
      ev({ t: 490, type: 'meds_taken', residentId: 'molly' }),
      ev({ t: 495, type: 'flag_raised', residentId: 'molly', reason: 'q' }),
      ev({ t: 497, type: 'nurse_ack', residentId: 'molly' }),
    ];
    expect(statusOf(state(base).molly!, 498)).toBe('onway');
    const handled = [...base, ev({ t: 505, type: 'flag_resolved', residentId: 'molly' })];
    expect(statusOf(state(handled).molly!, 506)).toBe('done');
  });

  it('snoozing hides the nudge until the reminder time, then it comes back', () => {
    const events = [
      ev({ t: 480, type: 'tray_delivered', residentId: 'molly' }),
      ev({ t: 510, type: 'nudge_sent', residentId: 'molly' }),
      ev({ t: 511, type: 'nurse_snooze', residentId: 'molly', until: 521 }),
    ];
    const s = state(events).molly!;
    expect(s.nudged).toBe(false);
    expect(statusOf(s, 520)).toBe('snoozed');
    expect(statusOf(s, 521)).toBe('soon');
    expect(nudgesDue(state(events), 521)).toEqual(['molly']);
  });

  it('undoing a delivery clears the nudge and acknowledgement', () => {
    const s = state([
      ev({ t: 480, type: 'tray_delivered', residentId: 'molly' }),
      ev({ t: 510, type: 'nudge_sent', residentId: 'molly' }),
      ev({ t: 511, type: 'nurse_ack', residentId: 'molly' }),
      ev({ t: 512, type: 'tray_undone', residentId: 'molly' }),
    ]).molly!;
    expect(statusOf(s, 513)).toBe('tray');
    expect(s.nudged).toBe(false);
    expect(s.ack).toBeNull();
  });
});

describe('nudgesDue and alerts', () => {
  const events = [
    ev({ t: 480, type: 'tray_delivered', residentId: 'molly' }),
    ev({ t: 481, type: 'tray_delivered', residentId: 'dorothy' }),
    ev({ t: 485, type: 'meds_taken', residentId: 'dorothy' }),
    ev({ t: 482, type: 'tray_delivered', residentId: 'harold' }),
    ev({ t: 505, type: 'flag_raised', residentId: 'harold', reason: 'pills' }),
  ];

  it('only nudges residents who have not answered', () => {
    expect(nudgesDue(state(events), 520)).toEqual(['molly']);
  });

  it('does not nudge twice for the same gap', () => {
    const withNudge = [...events, ev({ t: 520, type: 'nudge_sent', residentId: 'molly' })];
    expect(nudgesDue(state(withNudge), 525)).toEqual([]);
  });

  it('lists urgent alerts oldest first, and drops them when handled', () => {
    const withNudge = [...events, ev({ t: 520, type: 'nudge_sent', residentId: 'molly' })];
    expect(alerts(state(withNudge), 521)).toEqual([
      { residentId: 'harold', kind: 'now', since: 505 },
      { residentId: 'molly', kind: 'soon', since: 520 },
    ]);
    const handled = [...withNudge, ev({ t: 522, type: 'nurse_ack', residentId: 'molly' })];
    expect(alerts(state(handled), 523).map((a) => a.residentId)).toEqual(['harold']);
  });
});

describe('canApply', () => {
  const delivered = state([ev({ t: 480, type: 'tray_delivered', residentId: 'molly' })]).molly!;

  it('rejects actions that do not make sense', () => {
    expect(canApply('tray_delivered', delivered, 481).ok).toBe(false);
    expect(canApply('meds_taken', emptyResident(), 481).ok).toBe(false);
    expect(canApply('flag_resolved', delivered, 481).ok).toBe(false);
    expect(canApply('nurse_ack', emptyResident(), 481).ok).toBe(false);
  });

  it('allows the normal path', () => {
    expect(canApply('tray_delivered', emptyResident(), 481).ok).toBe(true);
    expect(canApply('meds_taken', delivered, 481).ok).toBe(true);
    expect(canApply('flag_raised', delivered, 481).ok).toBe(true);
    expect(canApply('nurse_snooze', delivered, 481).ok).toBe(true);
  });
});

describe('formatting', () => {
  it('formats times', () => {
    expect(fmtTime(475)).toBe('7:55 AM');
    expect(fmtTime(12 * 60)).toBe('12:00 PM');
    expect(fmtTime(0)).toBe('12:00 AM');
  });

  it('describes a stale check-in for the nurse', () => {
    const s = state([ev({ t: 480, type: 'tray_delivered', residentId: 'molly' })]).molly!;
    expect(detailText(s, 512)).toBe('Meds not confirmed, 32 min after tray');
  });
});
