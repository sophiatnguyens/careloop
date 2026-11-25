import { useEffect, useState } from 'react';
import { RESIDENTS, openFlag, type Reason } from '../../shared/domain';
import type { Api } from '../useCareLoop';
import { Icon, OnePill, Pills } from './icons';
import { Btn, Phone } from './Phone';

type Screen = 'home' | 'med' | 'checkin' | 'confirmed' | 'wrong' | 'correct' | 'doctor' | 'notified';

/**
 * The resident's app. Large type, one idea per screen, pictures of the pills instead of names to recall.
 * Which screen is showing is local to this device; everything about the medication itself comes from the server.
 */
export function Resident({ api, residentId }: { api: Api; residentId: string }) {
  const resident = RESIDENTS.find((r) => r.id === residentId) ?? RESIDENTS[0]!;
  const s = api.state?.[resident.id];
  const [screen, setScreen] = useState<Screen>('home');
  const [medIndex, setMedIndex] = useState(0);

  const tray = s?.tray ?? null;
  // The check-in opens by itself when the tray arrives, and goes away if the delivery is undone or the demo is reset.
  useEffect(() => {
    if (tray !== null) setScreen('checkin');
    else setScreen('home');
  }, [tray]);

  const flagged = s ? openFlag(s) : null;
  const nurseComing = !!(flagged && s!.ack !== null && s!.ack >= flagged.at);

  const flag = async (reason: Reason) => {
    await api.act('flag_raised', resident.id, reason);
    setScreen('notified');
  };
  const took = async () => {
    await api.act('meds_taken', resident.id);
    setScreen('confirmed');
  };

  const med = resident.meds[medIndex]!;
  let current: Screen = screen;
  if (current === 'checkin' && tray === null) current = 'home';
  // If a nurse confirmed the pills while the resident was still answering, move on instead of asking again.
  if (s?.taken != null && ['checkin', 'wrong', 'correct', 'doctor'].includes(current)) current = 'confirmed';

  const opt = (text: string, onClick: () => void) => (
    <button className="opt" onClick={onClick}><span>{text}</span><Icon name="chev" size={28} /></button>
  );

  let body;
  if (!s) body = null;
  else if (current === 'home') {
    let card;
    if (flagged) {
      card = (<><p className="txt b">We have let your nurse know.</p><p className="psub">{nurseComing ? 'Your nurse is on the way.' : 'Someone will be with you soon.'}</p></>);
    } else if (s.taken !== null) {
      card = (<><p className="txt b">You have taken your morning medications.</p><p className="psub">Your next medications come with lunch, at 12:00 PM.</p></>);
    } else if (tray !== null) {
      card = (<><p className="txt b">Your breakfast and medications have arrived.</p><Btn kind="primary" onClick={() => setScreen('checkin')}><span>Answer a quick question</span></Btn></>);
    } else {
      card = (<><p className="txt b">Your medications are on their way with your breakfast.</p><p className="psub">There is nothing you need to do yet.</p></>);
    }
    body = (
      <div className="p-body">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, color: '#B35F00' }}>
          <Icon name="sun" size={50} sw={2} />
          <h1 className="ph1" style={{ color: 'var(--p-ink)' }}>Good morning, {resident.first}</h1>
          <p className="psub">Wednesday, July 1, 2026</p>
        </div>
        <div className="clip">{card}</div>
        <button className="pillcard" onClick={() => setScreen('med')}>
          <Pills width={84} height={34} />
          <span className="t"><b>Your morning pills</b><span>2 pills. Tap to see them.</span></span>
          <Icon name="chev" size={28} />
        </button>
      </div>
    );
  } else if (current === 'med') {
    body = (
      <div className="p-body">
        <div><h1 className="ph1">{med.name}</h1><p className="psub">{med.dose}</p></div>
        <div className="stitch"><OnePill index={medIndex} /><p className="txt b" style={{ fontSize: 21, textAlign: 'center' }}>{med.look}</p></div>
        <div className="mini" style={{ gap: 14 }}>
          <div><div className="lbl">What it is for</div><p className="txt">{med.why}</p></div>
          <div><div className="lbl">When to take it</div><p className="txt">Every morning, with breakfast.</p></div>
        </div>
        <div className="spacer" />
        <Btn kind="second short" onClick={() => setMedIndex((medIndex + 1) % resident.meds.length)}><span>See the other pill</span></Btn>
        <Btn kind="second" onClick={() => setScreen('home')}><Icon name="back" size={26} /><span>Go back</span></Btn>
      </div>
    );
  } else if (current === 'checkin') {
    body = (
      <div className="p-body">
        <div><p className="hello">Hello, {resident.first}</p><h1 className="ph1">Your breakfast and medications have arrived.</h1></div>
        <div className="clip">
          <p className="txt b">Have you taken your medication?</p>
          <Btn kind="primary" onClick={took}><Icon name="check" size={30} /><span>Yes, I took them</span></Btn>
          <Btn kind="second" onClick={() => setScreen('wrong')}><span>Not yet</span></Btn>
        </div>
        <div className="spacer" />
        <button className="link" onClick={() => flag('q')}>I have a question</button>
      </div>
    );
  } else if (current === 'confirmed') {
    body = (
      <div className="p-body">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="round ok"><Icon name="check" size={36} /></div>
          <h1 className="ph1">Wonderful, {resident.first}.</h1>
          <p className="psub" style={{ fontSize: 24 }}>You have taken your morning medications. Enjoy your breakfast.</p>
        </div>
        <div className="clip">
          <span className="lbl">Next medications</span>
          <span className="big sm" style={{ fontSize: 42 }}>12:00 PM</span>
          <p className="txt" style={{ fontSize: 23 }}>They will arrive with your lunch.</p>
        </div>
        <div className="spacer" />
        <Btn kind="second" onClick={() => setScreen('home')}><span>Back to home</span></Btn>
      </div>
    );
  } else if (current === 'wrong') {
    body = (
      <div className="p-body">
        <div><h1 className="ph1">What can we help with?</h1><p className="psub">Tap the one that fits best.</p></div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {opt('Are these the right pills?', () => setScreen('correct'))}
          {opt('Should I take them before I eat?', () => setScreen('doctor'))}
          {opt('Something is wrong with my food', () => flag('food'))}
          {opt('Something else', () => flag('q'))}
        </div>
        <div className="spacer" />
        <button className="link" style={{ minHeight: 44, fontSize: 20 }} onClick={() => flag('nurse')}>Ask my nurse to stop by</button>
        <Btn kind="second short" onClick={() => setScreen('checkin')}><Icon name="back" size={24} /><span>Go back</span></Btn>
      </div>
    );
  } else if (current === 'correct') {
    body = (
      <div className="p-body">
        <h1 className="ph1">Do your pills look like this?</h1>
        <div className="stitch">
          <Pills width={230} height={94} />
          <div style={{ alignSelf: 'stretch', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {resident.meds.map((m) => (
              <p className="txt" style={{ fontSize: 21 }} key={m.name}><b>{m.name}:</b> {m.look.toLowerCase()}</p>
            ))}
          </div>
        </div>
        <div className="spacer" />
        <Btn kind="primary" onClick={() => setScreen('checkin')}><Icon name="check" size={28} /><span>Yes, they look right</span></Btn>
        <Btn kind="second" onClick={() => flag('pills')}><span>No, they look different</span></Btn>
        <button className="link" style={{ minHeight: 44, fontSize: 20 }} onClick={() => setScreen('wrong')}>Go back</button>
      </div>
    );
  } else if (current === 'doctor') {
    body = (
      <div className="p-body">
        <h1 className="ph1">Your doctor said</h1>
        <div className="clip">
          <p className="txt b">Your morning pills are meant to be taken with food.</p>
          <p className="txt">It is fine to start eating first, then take your pills with your meal.</p>
          <p className="psub" style={{ fontSize: 18 }}>From your care plan</p>
        </div>
        <div className="spacer" />
        <Btn kind="primary" onClick={() => setScreen('checkin')}><span>Got it</span></Btn>
        <Btn kind="second" onClick={() => flag('q')}><span>I still have a question</span></Btn>
      </div>
    );
  } else {
    body = (
      <div className="p-body">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="round bell"><Icon name="bell" size={34} sw={2.5} /></div>
          <h1 className="ph1">Thank you, {resident.first}.</h1>
        </div>
        <div className="clip">
          <p className="txt b">We have let your nurse know.</p>
          <p className="txt" style={{ fontSize: 23 }}>{nurseComing ? 'Your nurse is on the way.' : 'Someone will be with you soon. You do not need to do anything else.'}</p>
        </div>
        <div className="spacer" />
        <Btn kind="second" onClick={() => setScreen('home')}><span>Back to home</span></Btn>
      </div>
    );
  }

  return <Phone label="Resident app" connected={api.connected} ready={!!s}>{body}</Phone>;
}
