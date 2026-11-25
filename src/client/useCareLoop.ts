import { useCallback, useEffect, useMemo, useState } from 'react';
import { RESIDENTS, reduce, type CareState, type Reason, type Snapshot } from '../shared/domain';

export interface Api {
  snapshot: Snapshot | null;
  state: CareState | null;
  connected: boolean;
  error: string | null;
  act: (type: string, residentId: string, reason?: Reason) => Promise<void>;
  advance: (minutes: number) => Promise<void>;
  reset: () => Promise<void>;
  loadSample: () => Promise<void>;
}

async function post(path: string, body?: unknown) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? 'Request failed');
  }
}

/**
 * Keeps one WebSocket open to the server. Every change anyone makes comes back as a fresh snapshot, so the
 * kitchen, resident and nurse views on different devices always agree. Actions go out over plain HTTP and the
 * result arrives through the socket, so there is only one place state flows in.
 */
export function useCareLoop(): Api {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let retry: number | undefined;
    let closed = false;

    const open = () => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      ws = new WebSocket(`${proto}://${location.host}/ws`);
      ws.onopen = () => setConnected(true);
      ws.onmessage = (m) => setSnapshot(JSON.parse(m.data));
      ws.onclose = () => {
        setConnected(false);
        if (!closed) retry = window.setTimeout(open, 1500);
      };
    };
    open();
    return () => {
      closed = true;
      window.clearTimeout(retry);
      ws?.close();
    };
  }, []);

  const run = useCallback(async (fn: () => Promise<void>) => {
    try {
      setError(null);
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    }
  }, []);

  const state = useMemo(() => (snapshot ? reduce(snapshot.events, RESIDENTS) : null), [snapshot]);

  return {
    snapshot, state, connected, error,
    act: (type, residentId, reason) => run(() => post('/api/events', { type, residentId, reason })),
    advance: (minutes) => run(() => post('/api/clock/advance', { minutes })),
    reset: () => run(() => post('/api/reset')),
    loadSample: () => run(() => post('/api/sample')),
  };
}
