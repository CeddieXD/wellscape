# Wellscape — Vanilla HTML / CSS / JS edition

A plain-JavaScript recreation of the Wellscape prototype: a cozy wellness-themed
top-down game set in a Filipino *barangay* plaza, with a login/register flow.
No React, no Vite — just a static frontend served by a small Node/Express backend.

## What's inside

```
wellscape-vanilla/
├── package.json          # backend deps + run scripts
├── server/
│   └── server.js         # Express: auth API + static file server
└── public/               # the frontend (served as static files)
    ├── index.html
    ├── css/
    │   ├── index.css     # base/root styles
    │   ├── auth.css      # login / register screen
    │   └── game.css      # game screen (header, HUD, cards)
    ├── js/
    │   ├── app.js        # entry: auth ⇄ game view switching
    │   ├── api.js        # fetch client for the auth API
    │   ├── authScreen.js # login / register UI
    │   ├── gameScreen.js # game UI shell + HUD
    │   └── phase1Game.js # KAPLAY top-down game (map, player, collisions)
    ├── sprites/player.png
    └── assets/figma/     # input-field background SVGs
```

KAPLAY (the game engine) is loaded from a CDN in `index.html`, so there's no
build step.

## Backend API

Same contract the original React client expected:

| Method | Path                 | Body                        | Success response                |
| ------ | -------------------- | --------------------------- | ------------------------------- |
| POST   | `/api/auth/register` | `{ name, email, password }` | `201 { user: {id,name,email} }` |
| POST   | `/api/auth/login`    | `{ email, password }`       | `200 { user: {id,name,email} }` |
| GET    | `/api/auth/session`  | — (cookie)                  | `200 { user }` or `401`         |
| POST   | `/api/auth/logout`   | — (cookie)                  | `200 { ok: true }`              |

Failures return a non-2xx status with `{ error: "..." }`. Passwords are hashed
with `scrypt`; sessions are tracked with an HttpOnly cookie. User data lives in
memory and resets when the server restarts (fine for a prototype).

## Run it

```bash
cd wellscape-vanilla
npm install
npm start
```

Then open http://localhost:3000

Register an account, and you'll land in the game.

## Playing

- **Move:** `W A S D` or the arrow keys (diagonals supported, smooth sliding).
- **Visual toggle:** switch between the placeholder avatar and the pixel sprite.
- **Reset Spawn:** teleport back to the plaza center.
- **Exit Game:** sign out and return to the auth screen.
