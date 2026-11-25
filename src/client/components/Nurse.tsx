import { useState } from 'react';
import {
  REASON_TEXT, RESIDENTS, STATUS_ORDER, alerts, describe, detailText, fmtTime, openFlag, statusOf,
  type Alert, type Reason, type Status,
} from '../../shared/domain';
import type { Api } from '../useCareLoop';
import { Icon, Seal, type IconName } from './icons';
import { Btn, Phone } from './Phone';

const STATUS_UI: Record<Status, { label: string; icon: IconName }> = {
  now: { label: 'Needs you now', icon: 'alert' },
  soon: { label: 'Check soon', icon: 'clock' },
  onway: { label: 'On the way', icon: 'arrow' },
  snoozed: { label: 'Reminder set', icon: 'clock' },
  settle: { label: 'Tray delivered', icon: 'tray' },
  tray: { label: 'Waiting on tray', icon: 'hour' },
  done: { label: 'Done', icon: 'check' },
};

type View = { name: 'round' } | { name: 'handoff' } | { name: 'detail'; id: string };

export function Nurse({ api }: { api: Api }) {
  const [view, setView] = useState<View>({ name: 'round' });
  const { state, snapshot } = api;
  const clock = snapshot?.clock ?? 0;

  const byId = (id: string) => RESIDENTS.find((r) => r.id === id)!;
  const sorted = state
    ? [...RESIDENTS].sort((a, b) =>
        STATUS_ORDER[statusOf(state[a.id]!, clock)] - STATUS_ORDER[statusOf(state[b.id]!, clock)] || a.room - b.room)
    : [];

  const ack = async (id: string) => {
    await api.act('nurse_ack', id);
    setView({ name: 'detail', id });
  };

  let body = null;
  if (state && snapshot) {
    if (view.name === 'detail') body = <Detail api={api} id={view.id} onBack={() => setView({ name: 'round' })} onAck={ack} />;
    else if (view.name === 'handoff') {
      const todo = sorted.filter((r) => statusOf(state[r.id]!, clock) !== 'done');
      body = (
        <div className="p-body tight">
          <div><h1 className="ph1 sm" style={{ margin: 0 }}>Shift handoff</h1>
            <p className="psub" style={{ fontSize: 18 }}>Built from what happened, so nothing depends on memory.</p></div>
          <div className="sum">
            <b>{RESIDENTS.length - todo.length} of {RESIDENTS.length} confirmed</b>
            {todo.length ? todo.map((r) => <span key={r.id}>{r.name}, Room {r.room}: {detailText(state[r.id]!, clock)}</span>)
              : <span>Everyone has taken their morning pills.</span>}
          </div>
          <div className="mini"><h3>What happened</h3>
            <div className="logl">
              {snapshot.events.length === 0 && <div><span>Nothing yet. Deliver a tray in the kitchen app.</span></div>}
              {[...snapshot.events].reverse().map((e) => (
                <div key={e.id}><time>{fmtTime(e.t)}</time><span>{describe(e, RESIDENTS).text}</span></div>
              ))}
            </div>
          </div>
        </div>
      );
    } else {
      body = (
        <div className="p-body tight">
          <div><h1 className="ph1 sm" style={{ margin: 0 }}>Morning round</h1>
            <p className="psub" style={{ fontSize: 17 }}>{RESIDENTS.length} residents. Whoever needs you first is on top.</p></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {sorted.map((r) => {
              const st = statusOf(state[r.id]!, clock);
              return (
                <button key={r.id} className={`srow s-${st}`} onClick={() => setView({ name: 'detail', id: r.id })}>
                  <span className="in">
                    <span className="st"><Icon name={STATUS_UI[st].icon} size={20} sw={2.5} />{STATUS_UI[st].label}</span>
                    <span className="who">{r.name} · Room {r.room}</span>
                    <span className="why">{detailText(state[r.id]!, clock)}</span>
                  </span>
                  <Icon name="chev" size={24} />
                </button>
              );
            })}
          </div>
        </div>
      );
    }
  }

  const active = state ? alerts(state, clock) : [];
  const banner = active.length ? <Banner alert={active[active.length - 1]!} count={active.length} api={api} onAck={ack}
    onView={(id) => setView({ name: 'detail', id })} byId={byId} /> : null;

  const nav = (
    <div className="nav">
      <button onClick={() => setView({ name: 'round' })} aria-current={view.name === 'handoff' ? 'false' : 'page'}>Round</button>
      <button onClick={() => setView({ name: 'handoff' })} aria-current={view.name === 'handoff' ? 'page' : 'false'}>Handoff</button>
    </div>
  );

  return (
    <Phone label="Nurse app" sub={snapshot ? fmtTime(clock) : ''} footer={nav} overlay={banner} connected={api.connected} ready={!!state}>
      {body}
    </Phone>
  );
}

function Banner({ alert, count, api, onAck, onView, byId }: {
  alert: Alert; count: number; api: Api; onAck: (id: string) => void; onView: (id: string) => void;
  byId: (id: string) => (typeof RESIDENTS)[number];
}) {
  const p = byId(alert.residentId);
  const s = api.state![p.id]!;
  const clock = api.snapshot!.clock;
  const soon = alert.kind === 'soon';
  const mins = soon ? clock - s.tray! : 0;
  const flag = openFlag(s);
  return (
    <div className="banner" role="alert">
      <div className="hd">
        <span className="brand" style={{ fontSize: 15 }}><Seal size={18} />CareLoop</span>
        <span>{count > 1 ? `${count - 1} more waiting` : 'now'}</span>
      </div>
      <h3>{soon ? `Check Room ${p.room}` : `Room ${p.room} needs you`}</h3>
      <p>{soon ? `${p.name} has not confirmed the morning meds. ${mins} min since breakfast.`
        : `${p.name}: ${flag ? describeReason(flag.reason) : ''}.`}</p>
      <div className="acts">
        <Btn kind="primary" onClick={() => onAck(p.id)}><span>On my way</span></Btn>
        {soon ? <Btn kind="second" onClick={() => api.act('nurse_snooze', p.id)}><span>In 10 min</span></Btn>
          : <Btn kind="second" onClick={() => onView(p.id)}><span>View</span></Btn>}
      </div>
      <div className="pager">
        {soon ? <>RM {p.room} MEDS NOT<br />CONFIRMED {mins}M</> : <>RM {p.room} ASKED<br />FOR HELP</>}
      </div>
    </div>
  );
}

function describeReason(r: Reason) {
  return REASON_TEXT[r].toLowerCase();
}

function Detail({ api, id, onBack, onAck }: { api: Api; id: string; onBack: () => void; onAck: (id: string) => void }) {
  const p = RESIDENTS.find((r) => r.id === id)!;
  const s = api.state![id]!;
  const clock = api.snapshot!.clock;
  const st = statusOf(s, clock);
  const open = openFlag(s);
  const events = api.snapshot!.events.filter((e) => e.residentId === id).slice(-5);

  let actions;
  if (st === 'tray') actions = <p className="psub" style={{ fontSize: 18 }}>The kitchen has not delivered this tray yet. You will get a nudge if the meds go unconfirmed after delivery.</p>;
  else if (st === 'done') actions = <p className="psub" style={{ fontSize: 18 }}>Confirmed at {fmtTime(s.taken!)}. Nothing more to do.</p>;
  else if (open && st === 'now') actions = (<><Btn kind="primary short" onClick={() => onAck(id)}><span>On my way</span></Btn><Btn kind="second short" onClick={() => api.act('flag_resolved', id)}><span>Mark handled</span></Btn></>);
  else if (open) actions = <Btn kind="primary short" onClick={() => api.act('flag_resolved', id)}><span>Mark handled</span></Btn>;
  else if (st === 'onway') actions = (<><Btn kind="primary short" onClick={() => api.act('pills_given', id)}><span>Pills given</span></Btn><Btn kind="second short" onClick={() => api.act('nurse_snooze', id)}><span>Remind me in 10 min</span></Btn></>);
  else actions = (<><Btn kind="primary short" onClick={() => onAck(id)}><span>On my way</span></Btn><Btn kind="second short" onClick={() => api.act('nurse_snooze', id)}><span>Remind me in 10 min</span></Btn></>);

  return (
    <div className="p-body tight">
      <button className="back" onClick={onBack}><Icon name="back" size={22} />All residents</button>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <h1 className="ph1 sm" style={{ margin: 0 }}>{p.name}</h1>
        <span className="psub" style={{ fontSize: 18 }}>Room {p.room}</span>
        <span className={`chip s-${st}`}><Icon name={STATUS_UI[st].icon} size={18} sw={2.5} />{STATUS_UI[st].label}</span>
      </div>
      <div className="tl">
        {events.length === 0 && (
          <div className="ev"><div className="dot info"><Icon name="hour" size={13} sw={3} /></div>
            <div><b>{fmtTime(clock)}</b><span>Nothing has happened yet</span></div></div>
        )}
        {events.map((e) => {
          const d = describe(e, RESIDENTS);
          return (
            <div className="ev" key={e.id}>
              <div className={`dot ${d.kind}`}><Icon name={d.kind === 'warn' ? 'clock' : 'check'} size={13} sw={3.5} /></div>
              <div><b>{fmtTime(e.t)}</b><span>{d.text}</span></div>
            </div>
          );
        })}
      </div>
      <div className="mini" style={{ gap: 4 }}>
        <h3>Due with breakfast</h3>
        <p className="txt" style={{ fontSize: 20 }}>{p.meds.map((m) => `${m.name} ${m.dose.split('.')[0]}`).join(', ')}</p>
        {p.quiet && <p className="psub" style={{ fontSize: 17 }}>{p.first} rarely rings for help, so a quiet wait is normal for her.</p>}
      </div>
      <div className="spacer" />
      {actions}
    </div>
  );
}
