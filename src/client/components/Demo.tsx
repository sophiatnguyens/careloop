import { useState } from 'react';
import { RESIDENTS, fmtTime } from '../../shared/domain';
import type { Api } from '../useCareLoop';

/**
 * The demo bench. Each phone is its own page in an iframe with its own WebSocket, so what you see is real
 * synchronisation between separate clients, the same as three devices on a ward.
 */
export function Demo({ api }: { api: Api }) {
  const [resident, setResident] = useState('molly');
  return (
    <main className="page">
      <header className="top">
        <h1>CareLoop</h1>
        <p>A medication check-in system for a skilled nursing facility. Kitchen, resident and nurse each have their own app, all running on one shared record of the morning.</p>
      </header>

      <section className="bench" aria-label="Demo controls">
        <div className="panel clock">
          <span>Simulated time</span>
          <strong>{api.snapshot ? fmtTime(api.snapshot.clock) : '–'}</strong>
          <span className={`conn ${api.connected ? 'on' : 'off'}`}>{api.connected ? 'Server connected' : 'Server not reachable'}</span>
        </div>
        <div className="panel ctrls">
          <button className="cbtn main" onClick={() => api.advance(10)}>+10 min</button>
          <button className="cbtn main" onClick={() => api.advance(30)}>+30 min</button>
          <button className="cbtn" onClick={() => api.loadSample()}>Load sample morning</button>
          <button className="cbtn" onClick={() => api.reset()}>Start over</button>
        </div>
        <div className="panel try">
          <h2>Try it</h2>
          <ol>
            <li>In the kitchen app, tap Delivered for Room 12.</li>
            <li>In the resident app, Molly gets her check-in. Answer it, or leave it.</li>
            <li>Move time forward 30 minutes. The server notices the gap and the nurse gets a quiet nudge.</li>
          </ol>
        </div>
      </section>

      <div className="phones">
        <section className="col">
          <h2 className="colh">Kitchen <span>Shared cart tablet</span></h2>
          <iframe className="frame" title="Kitchen app" src="#/kitchen" />
        </section>
        <section className="col">
          <h2 className="colh">Resident
            <label><span>Viewing as </span>
              <select className="sel" value={resident} onChange={(e) => setResident(e.target.value)} aria-label="Resident to view as">
                {RESIDENTS.map((r) => <option key={r.id} value={r.id}>{r.name}, Room {r.room}</option>)}
              </select>
            </label>
          </h2>
          <iframe className="frame" title="Resident app" key={resident} src={`#/resident/${resident}`} />
        </section>
        <section className="col">
          <h2 className="colh">Nurse <span>Maria, morning shift</span></h2>
          <iframe className="frame" title="Nurse app" src="#/nurse" />
        </section>
      </div>

      <p className="foot">
        Time is simulated so you can see what the system does without waiting. Medication names, doses and doctor notes are sample content.
        Open <code>/#/kitchen</code>, <code>/#/nurse</code> or <code>/#/resident/molly</code> on any device on the same network to use each app on its own.
      </p>
      {api.error && <p className="foot" role="alert">Last action failed: {api.error}</p>}
    </main>
  );
}
