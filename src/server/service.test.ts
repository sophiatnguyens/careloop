import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { CareService } from './service';
import { createApp } from './index';
import { RESIDENTS, alerts, reduce, statusOf } from '../shared/domain';

let service: CareService;
beforeEach(() => { service = new CareService(); });
afterEach(() => service.close());

const view = () => {
  const snap = service.snapshot();
  return { snap, state: reduce(snap.events, RESIDENTS) };
};

describe('CareService', () => {
  it('starts with an empty morning at 7:55 AM', () => {
    expect(service.snapshot()).toEqual({ clock: 475, events: [] });
  });

  it('records a delivery and ignores nothing silently', () => {
    service.apply({ type: 'tray_delivered', residentId: 'molly' });
    expect(view().snap.events).toHaveLength(1);
    expect(() => service.apply({ type: 'tray_delivered', residentId: 'molly' })).toThrow(/already/);
  });

  it('detects the gap on its own when time passes', () => {
    service.apply({ type: 'tray_delivered', residentId: 'molly' });
    service.advance(29);
    expect(view().snap.events.map((e) => e.type)).toEqual(['tray_delivered']);
    service.advance(1);
    const { snap, state } = view();
    expect(snap.events.map((e) => e.type)).toEqual(['tray_delivered', 'nudge_sent']);
    expect(alerts(state, snap.clock).map((a) => a.kind)).toEqual(['soon']);
  });

  it('does not nudge a resident who already answered', () => {
    service.apply({ type: 'tray_delivered', residentId: 'molly' });
    service.apply({ type: 'meds_taken', residentId: 'molly' });
    service.advance(60);
    expect(view().snap.events.some((e) => e.type === 'nudge_sent')).toBe(false);
  });

  it('brings the nudge back after a snooze runs out', () => {
    service.apply({ type: 'tray_delivered', residentId: 'molly' });
    service.advance(30);
    service.apply({ type: 'nurse_snooze', residentId: 'molly' });
    service.advance(9);
    expect(statusOf(view().state.molly!, view().snap.clock)).toBe('snoozed');
    service.advance(1);
    expect(view().snap.events.filter((e) => e.type === 'nudge_sent')).toHaveLength(2);
  });

  it('requires a reason when flagging', () => {
    service.apply({ type: 'tray_delivered', residentId: 'molly' });
    expect(() => service.apply({ type: 'flag_raised', residentId: 'molly' })).toThrow(/reason/);
    service.apply({ type: 'flag_raised', residentId: 'molly', reason: 'q' });
    expect(statusOf(view().state.molly!, view().snap.clock)).toBe('now');
  });

  it('rejects unknown actions and residents', () => {
    expect(() => service.apply({ type: 'nudge_sent', residentId: 'molly' })).toThrow(/Unknown action/);
    expect(() => service.apply({ type: 'tray_delivered', residentId: 'nobody' })).toThrow(/Unknown resident/);
  });

  it('loads a sample morning where Molly is about to be nudged', () => {
    service.loadSample();
    const { snap, state } = view();
    expect(snap.clock).toBe(514);
    expect(statusOf(state.harold!, snap.clock)).toBe('now');
    expect(statusOf(state.molly!, snap.clock)).toBe('soon');
    expect(state.molly!.nudged).toBe(true);
  });

  it('resets', () => {
    service.loadSample();
    expect(service.reset()).toEqual({ clock: 475, events: [] });
  });
});

describe('HTTP API', () => {
  it('returns state, applies events, and reports invalid ones as 409', async () => {
    const seen: number[] = [];
    const app = createApp(service, (s) => seen.push(s.events.length));
    expect((await request(app).get('/api/state')).body.clock).toBe(475);

    const ok = await request(app).post('/api/events').send({ type: 'tray_delivered', residentId: 'molly' });
    expect(ok.status).toBe(200);
    expect(ok.body.events).toHaveLength(1);

    const dup = await request(app).post('/api/events').send({ type: 'tray_delivered', residentId: 'molly' });
    expect(dup.status).toBe(409);

    const bad = await request(app).post('/api/clock/advance').send({ minutes: -5 });
    expect(bad.status).toBe(400);

    expect(seen).toEqual([1]); // only the successful change was broadcast
  });
});
