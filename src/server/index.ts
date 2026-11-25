import express from 'express';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import { CareService, ServiceError } from './service';
import type { Snapshot } from '../shared/domain';

const PORT = Number(process.env.PORT ?? 3001);
const DB_PATH = process.env.DB_PATH ?? 'careloop.db';

export function createApp(service: CareService, onChange: (s: Snapshot) => void = () => {}) {
  const app = express();
  app.use(express.json());

  const respond = (res: express.Response, fn: () => Snapshot) => {
    try {
      const snap = fn();
      onChange(snap);
      res.json(snap);
    } catch (err) {
      if (err instanceof ServiceError) res.status(err.status).json({ error: err.message });
      else {
        console.error(err);
        res.status(500).json({ error: 'Something went wrong' });
      }
    }
  };

  app.get('/api/state', (_req, res) => {
    res.json(service.snapshot());
  });
  app.post('/api/events', (req, res) => respond(res, () => service.apply(req.body ?? {})));
  app.post('/api/clock/advance', (req, res) => respond(res, () => service.advance(Number(req.body?.minutes))));
  app.post('/api/reset', (_req, res) => respond(res, () => service.reset()));
  app.post('/api/sample', (_req, res) => respond(res, () => service.loadSample()));

  return app;
}

function start() {
  const service = new CareService(DB_PATH);
  const clients = new Set<WebSocket>();
  const broadcast = (snap: Snapshot) => {
    const msg = JSON.stringify(snap);
    for (const c of clients) if (c.readyState === WebSocket.OPEN) c.send(msg);
  };

  const app = createApp(service, broadcast);

  // In production the built client is served by this same process.
  const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist');
  if (existsSync(dist)) {
    app.use(express.static(dist));
  }

  const server = createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });
  wss.on('connection', (ws) => {
    clients.add(ws);
    ws.send(JSON.stringify(service.snapshot()));
    ws.on('close', () => clients.delete(ws));
  });

  server.listen(PORT, () => console.log(`CareLoop server on http://localhost:${PORT}`));
}

// Only start listening when run directly, so tests can import createApp.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) start();
