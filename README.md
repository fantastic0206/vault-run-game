# Vault Breach 3D · v1.3 Squad & Compound Update

A 3D heist shooter for a crew of 1–4 humans and AI squadmates. This release replaces snapshot-dependent guest controls with local prediction and authoritative input acknowledgements. It also expands the map from 50 × 40 to **100 × 80**, adds **four humanoid security classes** alongside three drone classes, and adds **up to three humanoid AI allies**.

## Update your Vercel game

Use the complete release, including all three APIs, `server/`, `src/`, both package files, and `vercel.json`. [DEPLOY.md](DEPLOY.md) has a **browser-only Vercel Drop guide: no terminal or GitHub connection required**. Each Drop creates a new project and URL. Add your existing **REDIS_URL** to that project's Production environment and redeploy from its dashboard.

Every player must open the same new Production URL and refresh. Create a fresh room after updating. The footer reads **V1.3 · SQUAD & COMPOUND UPDATE**. `/api/live` reports version `1.3.0` and protocol `4`. Redeploying old source does not install this release.

## What changed in multiplayer

- **Immediate local controls:** a guest simulates movement, dash, gun selection, firing, and reload at 60 Hz. Rendering no longer waits for a network round trip or adds a second player-position lerp.
- **Reconciliation:** the host acknowledges the last processed command. Guests replay unacknowledged commands over that confirmed state. Retransmitted commands are deduplicated; a host-time budget prevents duplicate or future input from speeding up a player.
- **Continuous projectiles:** a local shot appears immediately. Remote bullets keep travelling between snapshots and expire/collide with cover even if an update is missing. Confirmed shots are matched to their predicted counterparts, avoiding duplicate tracers.
- **Smoother remote actors:** a short interpolation buffer, bounded extrapolation, velocity fields, and a monotonic presentation clock reduce packet jitter. Remote players have normal network delay; the game does not promise simultaneous zero-latency screens.
- **One input read per simulation step:** drawing frames no longer consumes sequence numbers or reads controls twice.

WebSocket traffic carries inputs at about 30 updates/second and world snapshots at about 20. Durable HTTP/Redis backup remains available when the live relay fails. Backup mode displays a reduced-update-rate banner. Local prediction improves responsiveness; it cannot make a missing or slow connection equivalent to a healthy live relay.

## A larger compound and human-like bots

The 100 × 80 compound has Loading Docks, West Security, North Annex, Freight Yard, and a central vault. Relays are spread across the outer districts. Cover, walls, navigation, medkits, lighting and minimap scale with the larger map. Six medkits are placed throughout the facility. A cached A* navigation grid covers the whole compound.

Choose **AI BACKUP** on the home screen or in the host's lobby: Off, +1, +2, or +3, with four total crew slots. Solo starts with one AI ally by default. Vex, Bolt, and Echo are visibly labelled **AI**: they follow humans, shoot security with carbines, move out of marked strikes, and revive downed humans. Humans hack relays and carry the core. Joining friends replace AI slots in the lobby; bot IDs never authenticate as human room members.

| Enemy | Form | Behavior |
| --- | --- | --- |
| Sentry drone | Flying drone | Standard ranged patrol |
| Armored drone | Heavy drone | More armor; three-projectile spread |
| Hunter | Fast drone | Closes aggressively |
| Security rifleman | Humanoid | Rifle fire and lateral movement |
| Breacher | Humanoid | Flanks and closes with a shotgun |
| Marksman | Humanoid | Holds long range; visible aiming laser |
| Juggernaut | Large armored humanoid | Slow, durable, sustained heavy fire |

Casual remains the recommended default. Heavy classes enter as the raid progresses. All four player guns remain unlocked; everyone starts with the strongest **Nova cannon**.

## Play solo immediately

Extract the ZIP and open **PLAY-SOLO.html** in a current WebGL 2 browser. No installation, Redis, or web server is needed for solo. The standalone file intentionally disables co-op; deploy the full project for rooms. Fonts can load from Google Fonts, with local fallbacks when offline.

## The mission

You have four minutes to hack three relays, take the core from the open vault, and bring it to the green extraction circle. Move with WASD, aim and fire with the mouse, dash with Space, hold E to interact, and reload with R.

On **Casual**, hacking takes 1.5 seconds and extraction takes 2 seconds. Nearby enemies do not block either objective. There are no starting guards, a seven-second opening grace period, fewer/slower/weaker enemies, faster shield regeneration, and medkits that restore 70 health plus 25 shield and respawn after 20 seconds. You can still lose if the whole crew goes down or time runs out.

| Difficulty | Relay hack | Extraction | Experience |
| --- | --- | --- | --- |
| **Casual · default** | **1.5s** | **2s** | Recommended for a fun first run |
| Tactical | 2s | 3s | A little more action |
| Lockdown | 4.2s | 6s | Hard, with contested objectives |
| Nightmare | 5s | 8s | Extreme, best with a coordinated crew |

The host sets one shared difficulty in the lobby. Tactical and above require a clear perimeter to hack/extract; moving or recent damage interrupts hacking and abandoned progress decays. Red circles warn of an incoming strike: move or dash outside before impact. A living teammate can hold E near a downed operative for 2 seconds to revive. Friendly fire is off.

## Four guns, all unlocked

| Key | Gun | Damage per shot | Magazine | Role |
| --- | --- | --- | --- | --- |
| 1 | Pulse carbine | 28 | 24 | Accurate automatic fire |
| 2 | Thunder shotgun | 20 × 7 pellets | 8 | Close-range spread |
| 3 | Cyclone minigun | 24 | 90 | Rapid sustained fire |
| **4** | **Nova cannon · strongest, equipped at spawn** | **260 direct + 110 nearby splash** | **12** | **Destroys armored targets and groups** |

Reserve ammunition is unlimited. Each gun keeps its own magazine when switching. Reloading uses the selected gun's reload time; switching cannot refill magazines or bypass the previous shot's cooldown. Nova splash affects enemies and respects cover; it does not hurt the crew. Each gun has a distinct held model and projectile color.

| Action | Keyboard / mouse | Phone | Standard gamepad |
| --- | --- | --- | --- |
| Move | WASD / arrows | Left stick | Left stick |
| Aim / fire | Mouse / hold left click | Drag right stick | Right stick / RT |
| Dash | Space | DASH | A |
| Hack, collect, revive | Hold E | Hold ACT | Hold Y |
| Reload | R | LOAD | X |
| Switch gun | 1 / 2 / 3 / 4 | Tap a gun slot | B cycles guns |
| Menu | Escape | Pause button | Pause button on screen |
| Sound / fullscreen | M / F | HUD buttons | HUD buttons |

Sound starts muted. Solo pause stops the simulation; a co-op menu does not pause the crew. Low graphics disables bloom, shadows and antialiasing and limits resolution. It is selected automatically for touch devices and devices reporting under 6 GB RAM. Change graphics from the home screen or use the recovery screen's low-graphics reload.

## Connection recovery and hosting

WebSockets deliver fast input and frames when available. **/api/sync** uses the same Redis database to persist the latest world and each guest's controls, independently of pub/sub. The host maintains a backup sync; guests use it automatically if live frames stop or upgrades are blocked. Recovery requests are serialized and paced, and the banner shows when backup sync is active. Backup play can have more latency than the live connection.

Room joins remain committed and return valid credentials even if publishing a notification fails. Socket authentication failures caused by an unavailable relay are retryable. Checkpoints cannot be overwritten by older frames, and a late checkpoint can restore an already-started host runtime. Controls share one stream identity across both transports, so they do not fight each other. Guest refresh, departed members, rematches, old builds, malformed frames and stale inputs are handled explicitly.

The **host browser still runs the simulation**. Keep it open and active. The backup connection cannot run a closed or suspended host browser. If the host disappears for about 18 seconds, the run ends and a connected member can lead the regroup. This is a casual co-op game, not a competitive anti-cheat server.

## Run the full project locally

Requires Node.js 24 and npm:

```bash
npm ci
npm run dev
```

Open `http://localhost:5173`. Create a room in one browser session and join from an independent session or another device. Without Redis, development uses a single-process memory store. Production requires the secure Redis connection string in **REDIS_URL**; the old card game's REST URL/token pair is not sufficient.

## Checks and builds

```bash
npm test
npm run build
npm run demo
```

**69 automated tests pass**, including real client transport/runtime integration across two HTTP/WebSocket servers with four seats, guest refresh, leaving, rematch, every pub/sub message dropped, publish/subscribe rejected, and WebSocket upgrades blocked. Deterministic latency tests verify immediate guest movement and shooting at 50/120/250 ms one-way delay with jitter, loss and duplicates, full-speed travel, stop convergence, dash/collision parity, projectile continuity and command deduplication. Tests also verify map routes, all seven enemy classes, AI following/fighting/reviving, bot slot replacement, weapon patterns, damage, splash, magazines/reloads, easier Casual objectives, all difficulty levels, frame payload bounds, authorization, stale-state rejection, and late checkpoint recovery. The Three.js geometry smoke test builds the full level, all seven enemy classes, AI and guns, and clears dynamic models between missions with a mocked renderer. Graphics/control adapters are stubbed in runtime tests; these are not browser/GPU tests.

The production build, standalone HTML, compiled Vercel endpoints, and server-rendered menu/HUD checks pass. `npm run build` creates `dist`; `npm run demo` regenerates PLAY-SOLO.html; `npm run preview` serves the built frontend with the same API locally.

The workspace preview relay is unavailable. Browser/GPU appearance, real-device performance/controls, the user's live Redis provider, and the live Vercel deployment remain unverified. No live Vercel URL or deployment access was supplied. Use DEPLOY.md's acceptance check after updating the source.

## Source map

- `src/game/simulation.ts`: mission, combat, splash, weapons, victory/defeat
- `src/game/weapons.ts`: four gun definitions and the strongest starting weapon
- `src/game/balance.ts`: difficulty and objective times
- `src/game/map.ts`: collision, cover and pathfinding
- `src/game/scene.ts`, `art.ts`: real 3D geometry, models, textures and lighting
- `src/game/player.ts`, `prediction.ts`: shared movement/weapons, input replay and presentation
- `src/game/ai.ts`, `enemies.ts`: friendly squad AI and seven security classes
- `src/game/runtime.ts`, `controls.ts`: fixed-step simulation lifecycle and device input
- `src/network.ts`: live transport, frame watchdog and backup sync
- `server/sync.ts`: authenticated durable frames and controls
- `server/live.ts`, `rooms.ts`, `storage.ts`: relay, room lifecycle and shared storage
- `api/room.ts`, `api/live.ts`, `api/sync.ts`: deployable Vercel functions
- `src/main.tsx`, `style.css`: menus, lobby, HUD, arsenal and recovery
- `tests/`: game, network, recovery and weapon regressions

All models, textures and effects are generated by code. MIT license; dependencies retain their licenses. The earlier illustrated previews were art-direction concepts, not captures of the running game.
