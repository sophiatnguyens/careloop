import { CART, RESIDENTS, fmtTime } from '../../shared/domain';
import type { Api } from '../useCareLoop';
import { Icon } from './icons';
import { Btn, Phone } from './Phone';

const byId = (id: string) => RESIDENTS.find((r) => r.id === id)!;

export function Kitchen({ api }: { api: Api }) {
  const { state } = api;
  const pending = state ? CART.filter((id) => state[id]!.tray === null) : [];
  const done = state ? CART.filter((id) => state[id]!.tray !== null) : [];
  const next = pending[0] ? byId(pending[0]) : null;
  const lastDone = [...done].sort((a, b) => state![b]!.tray! - state![a]!.tray!)[0];
  const canUndo = lastDone && state![lastDone]!.taken === null;

  return (
    <Phone label="Kitchen app" connected={api.connected} ready={!!state}>
      <div className="p-body">
        <div>
          <h1 className="ph1 sm" style={{ margin: 0 }}>Breakfast cart</h1>
          <p className="psub" style={{ fontSize: 18 }}>Tap Delivered when the tray reaches the room.</p>
        </div>

        {next ? (
          <>
            <div className="plain">
              <span className="lbl">Now delivering to</span>
              <span className="big">Room {next.room}</span>
              <span className="nm">{next.name}</span>
            </div>
            <Btn kind="primary xl" onClick={() => api.act('tray_delivered', next.id)}>
              <Icon name="check" size={38} /><span>Delivered</span>
            </Btn>
          </>
        ) : (
          <div className="plain">
            <span className="big sm">All trays delivered</span>
            <span className="nm">{done.length} of {CART.length} rooms</span>
          </div>
        )}

        {pending.length > 1 && (
          <div className="mini">
            <h3>Next on the cart</h3>
            {pending.slice(1, 3).map((id) => (
              <div className="row" key={id}><b>Room {byId(id).room}</b><span>{byId(id).name}</span></div>
            ))}
          </div>
        )}

        {done.length > 0 && state && (
          <div className="mini">
            <h3>Delivered</h3>
            {[...done].sort((a, b) => state[a]!.tray! - state[b]!.tray!).map((id) => (
              <div className="row" key={id}><b>Room {byId(id).room}</b><span>{fmtTime(state[id]!.tray!)}</span></div>
            ))}
          </div>
        )}
        {canUndo && (
          <button className="link" onClick={() => api.act('tray_undone', lastDone!)}>Undo Room {byId(lastDone!).room}</button>
        )}
      </div>
    </Phone>
  );
}
