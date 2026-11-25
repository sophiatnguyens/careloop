# CareLoop

A medication check-in and care-coordination system for skilled nursing facilities, built as a summer project at the intersection of cognitive science, UX design and frontend engineering.

![The kitchen, resident and nurse apps running side by side](docs/demo.png)

## The problem

When a nursing facility gets busy, tired and overworked nurses cannot always be in the room. Residents who are used to waiting, or who do not want to bother anyone, often say nothing. The design principle behind this project:

> The system cannot rely on patient or staff initiation. It must detect gaps passively and surface them proportionally: a quiet nudge, not an alarm.

The goal is to reduce how often a nurse needs to be physically present for a resident to be okay. The resident side supports independence. The staff side is a quiet background safety net that only surfaces urgency when a human is actually needed.

## How it works

Three apps share one record of the morning:

| App | Who uses it | What it does |
| --- | --- | --- |
| Kitchen | Dietary staff with the breakfast cart | One big **Delivered** button per room. Tapping it is the only thing the kitchen has to do. |
| Resident | The resident, on a tablet or phone | Opens a check-in when the tray arrives. Pictures of the pills, one question per screen, a calm path for "something looks wrong". |
| Nurse | The nurse on shift | A round list sorted by urgency, a per-resident timeline, a quiet nudge (with a matching pager text) and an automatic shift handoff log. |

The server watches for gaps on its own. If a resident has not confirmed within 30 simulated minutes of their tray arriving, the server records a nudge and pushes it to the nurse. A nurse can respond, snooze for 10 minutes (the nudge comes back if the gap is still there), or confirm the pills were given. A resident who asks for help becomes "Needs you now" immediately.

## Run it

Requires Node 22.5 or newer (the database is Node's built-in SQLite, so there is nothing native to compile). Check with `node -v`.

```bash
npm install
npm run dev        # server on :3001, client on :5173
```

Open http://localhost:5173. Use the controls at the top to move simulated time forward, load a sample morning, or start over. Each phone on the page is a separate client with its own WebSocket connection. You can also open `/#/kitchen`, `/#/nurse` and `/#/resident/molly` in separate windows or on other devices.

For a production-style run (the server also serves the built client on one port):

```bash
npm start          # http://localhost:3001
```

Other scripts: `npm test`, `npm run typecheck`.

## Architecture

```
src/
  shared/domain.ts     Pure logic used by both sides: types, reducer, status rules, nudge detection
  server/service.ts    Business rules over SQLite (`node:sqlite`) (testable with an in-memory database)
  server/index.ts      Express REST API + WebSocket broadcast
  client/              React + TypeScript apps, one WebSocket hook
```

Key decisions:

- **Event sourcing.** The database stores an append-only list of events (tray delivered, meds taken, flag raised, nurse on the way, nudge sent, and so on). Current state is always computed by one pure `reduce` function. That gives a free audit trail and makes the shift handoff log a direct read of what happened.
- **One source of truth for rules.** `domain.ts` is imported by the server and the clients. The server uses it to reject actions that make no sense (for example confirming meds before a tray arrives, returning HTTP 409), and the clients use it to decide what to show. The rules cannot drift apart.
- **Passive detection on the server.** Nudges are created by the server when time passes, not by any user action, so a missed check-in cannot depend on someone remembering to look.
- **Alerts are derived, not stored.** "What should be buzzing the nurse right now" is a function of state, so an alert disappears by itself once the situation changes, with no cleanup logic.
- **Simple data flow.** Actions go out as HTTP requests and every result comes back as a snapshot over the WebSocket, so there is only one path state flows in on, and every device converges.
- **Transactions.** Each action and the nudge detection that follows it run in one SQLite transaction.

## Design and cognitive science notes

- **Recognition over recall.** Residents see a picture of each pill and a short description instead of being asked to remember names and doses.
- **Prospective memory.** The check-in appears at the moment the tray arrives, tied to an event the resident already notices, rather than at an abstract clock time.
- **Low perceived social cost.** The "something is wrong" path is a few plain taps, not a call button. This is aimed at residents who do not want to bother staff.
- **Proportional urgency.** Three tiers (quiet nudge, needs you now, done) so urgent items stand out and the nurse is not trained to ignore alerts.
- **Accessibility for older adults.** Atkinson Hyperlegible type, large text, tap targets of at least 72 pixels on the resident side, one idea per screen, and status that never relies on color alone (every status has an icon and a label). Decoration appears only on non-functional surfaces.

## API

| Method and path | Purpose |
| --- | --- |
| `GET /api/state` | Current snapshot (`{ clock, events }`) |
| `POST /api/events` | Apply an action: `{ type, residentId, reason? }`. Returns 400, 404 or 409 for invalid input |
| `POST /api/clock/advance` | Move simulated time forward: `{ minutes }` |
| `POST /api/sample` | Load a pre-made morning |
| `POST /api/reset` | Clear everything |
| `WS /ws` | Sends a full snapshot on connect and after every change |

## Tests

`npm test` runs the domain rules (status transitions, nudge detection, snoozing, alert ordering, action validation), the service against an in-memory SQLite database, and the HTTP API.

## Limits and what I would do next

- Time is simulated and the roster, medications and doctor notes are sample data. A real version would read each resident's prescription record and schedule.
- No authentication, roles or audit identity. The nurse, kitchen and resident views are open to anyone who can reach the server.
- No privacy or compliance work (for example HIPAA). This is a prototype and must not hold real resident data.
- The "pager" is an on-screen preview of a short text alert, not a real integration.
- Next: multiple medication times per day, per-resident escalation rules, a charge-nurse view, push notifications, and trying it in a real workflow with staff feedback.
