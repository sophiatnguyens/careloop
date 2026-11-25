import type { ReactNode } from 'react';
import { Seal } from './icons';

interface Props {
  label: string;
  sub?: string;
  /** Replaces the gingham footer, e.g. with a nav bar. */
  footer?: ReactNode;
  overlay?: ReactNode;
  connected: boolean;
  ready: boolean;
  children: ReactNode;
}

/** The shared phone shell: scalloped header, content, footer. */
export function Phone({ label, sub, footer, overlay, connected, ready, children }: Props) {
  return (
    <div className="phone" aria-label={label}>
      <div className="p-head">
        <div className="brand"><Seal />CareLoop</div>
        <div className="p-sub">{sub}</div>
      </div>
      <div className="p-scallop" />
      {ready ? children : (
        <div className="p-body">
          <p className="txt b">{connected ? 'Loading…' : 'Connecting to the server…'}</p>
          <p className="psub">If this does not go away, make sure the server is running.</p>
        </div>
      )}
      {footer ?? <div className="p-gingham" />}
      {overlay}
    </div>
  );
}

export function Btn({ kind, onClick, children }: { kind: string; onClick: () => void; children: ReactNode }) {
  return <button className={`btn ${kind}`} onClick={onClick}>{children}</button>;
}
