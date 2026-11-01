# Vault Breach 3D

A playable **3D action game** for one player or a private crew of **up to four players**. The game uses real-time Three.js geometry, lighting, shadows, animated operatives, drones, projectiles, and effects. It is a new action-game version of the Vault Run concept; it does not replace the earlier card game.

## Try it immediately

Extract the ZIP and open **`PLAY-SOLO.html`** in a current Chrome, Edge, Firefox, or Safari browser with WebGL 2 support. Click **Play Solo**. This standalone file bundles the game, its models, styles, and JavaScript; you do not need Node, Redis, or a local web server to play solo.

The standalone file intentionally disables co-op room creation. Use the complete source project and server below for multiplayer. Interface fonts can load from Google Fonts; local fallback fonts work when offline.

## The mission

You have **four minutes** to:

1. Find and disable **all three security relays**. Stand close and hold **E**.
2. Enter the open vault and press **E** near its glowing core to collect it.
3. Carry the core back to the **green extraction zone** in the southwest corner and stay there for **two seconds**.

Security drones pursue the crew and fire visible projectiles. Cover blocks both movement and shots. Disabling relays escalates security, and armored drones appear later in the mission. The core carrier moves slightly slower.

The crew wins together when the core is extracted. The mission fails if every operative is down or the lockdown timer reaches zero. A living teammate can hold E near a downed operative for two seconds to revive them. There is no friendly fire.

## Controls

| Action                  | Keyboard / mouse       | Phone            | Standard gamepad     |
| ----------------------- | ---------------------- | ---------------- | -------------------- |
| Move                    | WASD or arrow keys     | Left stick       | Left stick           |
| Aim                     | Mouse                  | Right stick      | Right stick          |
| Fire                    | Hold left mouse button | Drag right stick | Right trigger        |
| Dash                    | Space                  | DASH             | A                    |
| Hack, take core, revive | Hold E                 | Hold ACT         | Hold Y               |
| Reload                  | R                      | LOAD             | X                    |
| Pause / menu            | Escape                 | Pause icon       | On-screen pause icon |
| Sound                   | M or speaker icon      | Speaker icon     | Speaker icon         |
| Fullscreen              | F or fullscreen icon   | Fullscreen icon  | Fullscreen icon      |

Your pulse carbine has a **14-round magazine** and unlimited reserve ammunition. Empty magazines reload automatically; manual reload takes 1.2 seconds. Dashes briefly protect against damage and recharge in 2.4 seconds. Shields recharge after 4.5 seconds without damage; green medkits restore health.

Sound starts muted and can be enabled explicitly. The menu camera stops orbiting when reduced motion is requested. Solo pause freezes the simulation; co-op continues while the local menu is open.

## Run the complete project locally

Requires **Node.js 24** and npm.

```bash
npm ci
npm run dev
```

Open `http://localhost:5173`. To test co-op locally, create a room in one independently opened tab and join its six-character code from another tab. Up to four clients can join. The host clicks **Breach the Vault** after every player's live link is established. A host can start with one player too.

For two physical devices on the same LAN, open your development computer's LAN address at port 5173 on both devices, allowing access to that port if needed. Use a public deployment for players on different networks.

Without Redis, local development uses an in-process room store and relay. This is for one local Node process and resets when that process stops. Production refuses this fallback. To test with shared Redis locally, copy `.env.example` to `.env.local` and enter your secure **REDIS_URL** connection string.

## Deploy to Vercel

See **[DEPLOY.md](DEPLOY.md)**. Solo works immediately after deploying the frontend. Co-op uses Vercel WebSockets plus Redis pub/sub and needs **REDIS_URL**. The earlier card game's `KV_REST_API_URL` and `KV_REST_API_TOKEN` pair alone is not sufficient for this action game.

This is a host-simulated casual co-op game. The host's browser runs the mission; the server authenticates room membership, accepts world frames only from the host, validates messages, and relays them across Function instances. Keep the host's game open and active. If the host is gone for approximately 18 seconds, the run ends and a connected player becomes squad lead so the crew can regroup. This is not a competitive anti-cheat server.

The client automatically reconnects after a transport interruption or Function rotation. A host refresh can recover the latest stored world checkpoint, saved about once a second. On an unstable network, a small amount of progress can be replayed from that checkpoint.

Redis and Vercel usage depend on active co-op traffic; the chosen plans' quotas apply. Solo generates no game-server traffic. Do not deploy only the static frontend and expect co-op rooms to work.

## Validation and builds

```bash
npm test
npm run build
npm run demo
```

Tests cover the complete hack–collect–extract mission, defeat conditions, combat, continuous collision, dashes, ammo, shields, revives, pickups, pathfinding, sustained simulation, input validation, room authorization, concurrency, and actual WebSocket traffic between two separate server instances with a shared relay. Checkpoint recovery and forged-client rejection are included.

All **23 tests**, the production frontend build, and the standalone HTML build passed. Vercel's Node builder compiled both Functions, and the compiled room endpoint and WebSocket authentication passed a local smoke check without a TypeScript loader. The standalone JavaScript also passed syntax and self-containment checks.

`npm run build` makes `dist/`. `npm run demo` regenerates the self-contained `PLAY-SOLO.html`. `npm run preview` runs the built frontend and the same server API locally.

The build workspace's preview service was unavailable. Browser appearance, WebGL shader output, real-device frame rate, touch controls, gamepad behavior, and a live Vercel/Redis deployment remain unverified. Complete the two-device acceptance check in DEPLOY.md before sharing a production URL.

## Source map

```text
src/game/simulation.ts   Host/solo simulation, combat, mission, victory/defeat
src/game/map.ts          Arena, collision, visibility, pathfinding
src/game/scene.ts        Procedural 3D environment, characters, effects, camera
src/game/controls.ts     Keyboard, pointer, touch, and gamepad input
src/game/runtime.ts      Fixed-interval gameplay and rendering/network hooks
src/game/audio.ts        Optional synthesized sound effects
src/game/validate.ts     Shared network message validation
src/main.tsx             Menus, lobby, HUD, minimap, touch pads, results
src/network.ts           Room API, authenticated WebSocket, reconnects
server/rooms.ts          Private room membership and mission lifecycle
server/live.ts           WebSocket relay, authority checks, checkpoints
server/storage.ts        Redis pub/sub + CAS; local-only memory implementation
api/room.ts              Vercel room endpoint
api/live.ts              Vercel HTTP server with WebSocket upgrade
server/dev.ts            Local Vite / built-asset server with same endpoints
scripts/build-demo.mjs   Self-contained solo HTML build
tests/                   Simulation, room, and live-transport tests
PLAY-SOLO.html           Ready-to-open solo game
```

All 3D models, textures, environment markings, and effects are generated by code. There are no external model downloads or paid image/game APIs.

MIT license. Dependencies retain their respective licenses.
