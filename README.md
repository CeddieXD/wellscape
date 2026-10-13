# Wellscape

Wellscape is a mobile-only wellness and neighborhood-game prototype built with React, TypeScript, Tailwind CSS, KAPLAY, Colyseus, Node.js, SQLite/WASM, and IndexedDB. The interface is designed for phone screens; larger displays show the same centered mobile layout.

## Run locally

Requires Node.js 22+ and npm.

```sh
npm install
npm run dev
```

Open http://localhost:5173. Create an account or log in; check-ins, points, streaks, and milestone rewards are associated with that account. The Vite server proxies `/api` to the Node server on port 2567, which also runs the multiplayer room.

The server persists SQLite/WASM data to `wellscape.sqlite`. Set `PORT` or `WELLSPACE_DB_PATH` to change the server port or database file. Set `VITE_API_URL` when the API is hosted at a different origin, `VITE_MULTIPLAYER_URL` to use a different WebSocket URL, and `WEB_ORIGIN` on the server to allow the deployed web-app origin.

## Mobile and offline support

The PWA manifest and service worker provide an installable portrait app shell and cache the local interface and Figma game artwork. Serve the production build over HTTPS for installation (localhost is allowed during development). On supported browsers, use **Install app**; on iOS, select **Add to Home Screen** from Safari's share menu.

Sign in while connected at least once to make that account available offline on the same device. Check-ins are saved to account-scoped IndexedDB and synced when the connection returns. Account authentication and reward claims require the server.

## Rewards and the world

- Daily sleep, water, meals, and mood check-ins with an explanatory wellness score and practical suggestions. This is not a diagnosis or substitute for professional care.
- Password-based registration and login, opaque HttpOnly sessions, and per-account check-in history.
- Ten sunshine points for each unique check-in date; first-check-in and 3-, 7-, 14-, and 30-day streak rewards are awarded once.
- A touch-friendly KAPLAY village with avatar choices, keyboard controls, Aling Nena's greeting, neighbor chat, and online presence.
- Local SVG artwork exported from the Wellscape Figma file for the login fields, village, avatars, and rewards.

## Checks

```sh
npm run build
npm run preview
npm run check:server
npm test
```

## Requirements
## How was the game made?
The game is made using the game engine Kaplay.js + Colyseus
## How does Colyseus work?
```
Colyseus is a fully-featured open source multi-player framework. It’s versatile and scalable for any game genre. The key features we are going to take an advantage of are automatic state synchronization and creating a game room on demand. Having this ready out-of-the-box is a great initial help so you can focus on your game itself, instead of doing (basically a lot of) boilerplate work. All these concepts and more will be explained further. - Kaplay x Colyseus website 
```

