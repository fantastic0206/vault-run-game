# Publish Vault Breach 3D on Vercel

This is a separate project from the earlier Vault Run card game. Deploy the **complete `vault-breach-3d` folder** from the ZIP. Do not upload only `PLAY-SOLO.html` or only `dist/` if you want co-op.

## Deploy in your browser — no terminal or GitHub

1. Download and extract this release ZIP. Select the **vault-breach-3d folder whose top level contains package.json and vercel.json**. Its `api`, `server`, and `src` folders must be included.
2. Open [Vercel Drop](https://vercel.com/drop), sign in, and drag that complete folder into the page. Choose a team and project name, then **Deploy**. Vercel builds the Vite project using the included configuration: build command `npm run build`, output `dist`, Node.js 24.
3. When the build finishes, open the new project's Production URL. Confirm the home footer reads **V1.3.1 · MOBILE HUD UPDATE**. Solo is ready immediately, including optional AI backup.
4. Open the new Vercel project's **Settings → Environment Variables**. Add **REDIS_URL** for **Production**. If you already have a working Redis database from the previous version, reuse its actual full TLS Redis URL. Environment variables do not automatically transfer to a new Drop project.

   ```text
   rediss://default:YOUR_REDIS_PASSWORD@YOUR_DATABASE_HOST:6379
   ```

   This example is a placeholder. Use the provider's actual host, password and port, with its URL escaping. Keep the variable server-side; use the exact name `REDIS_URL`. A REST URL/token pair is not the TCP/TLS Redis URL this game uses.

5. If you do not yet have Redis, connect a compatible database from **Storage / Marketplace** (for example [Upstash Redis](https://vercel.com/marketplace/upstash)) and obtain its TLS Redis connection string. Pub/sub supports the fast live path. Durable sync can recover from unavailable pub/sub, at a lower update rate.
6. Keep **Fluid compute** enabled in the project. The included WebSocket function has a 300-second maximum duration; clients reconnect when a connection closes. Place the function and database in nearby regions when choosing hosting locations.
7. In the project's **Deployments** tab, open the latest deployment's **⋯** menu and select **Redeploy** so the new environment variable is applied.
8. Share the **new Production URL** with every player. Everyone must use that same URL, refresh the page, and join a **fresh room**. If deployment protection is enabled, allow the intended players to access the game and its API endpoints.

Each Vercel Drop creates a **new project and URL**. Uploading this source as another Drop does not update the old project. A dashboard redeploy rebuilds the source already attached to that project; it does not upload a new release. These are Vercel Drop's current workflow rules, described in [Vercel's official guide](https://vercel.com/kb/guide/vercel-drop-vs-netlify-drop).

`/api/live` should report `version: "1.3.1"` and `protocol: 4`. A normal visit to that URL returns diagnostic JSON; live play uses a WebSocket upgrade to the same endpoint. Include all three functions: `api/room.ts`, `api/live.ts`, and `api/sync.ts`.

## Fast solo check

Open **PLAY-SOLO.html** after extracting the ZIP. It includes the playable 3D game, AI backup, expanded map and all weapons. Solo needs no installation or Redis. Multiplayer uses the complete deployed project. Use a current WebGL 2 browser with hardware acceleration enabled.

## Two-device acceptance check

1. Open the Production URL in a private browser session. Confirm the 3D arena renders and **Play Solo** starts immediately.
2. Move with WASD, aim and fire, reload with R, and dash with Space. Shots must stop at crates. Escape must pause solo play. Resume it.
3. Choose Casual for the first acceptance run. You start with the strongest Nova cannon. Switch guns with 1–4 and check the shotgun spread, minigun rate, and Nova splash. Hack relays by standing still and holding E for 1.5 seconds. Take the core from the open vault and stay in extraction for 2 seconds. Nearby enemies do not block Casual objectives. Confirm victory and retry. Tactical uses 2/3 seconds; Lockdown 4.2/6; Nightmare 5/8, with contested objectives on those modes.
4. Return to the home screen. Enter the codename **Rook** and create a co-op room.
5. Open its invite on a second physical device or independently opened browser session. Join as **Ghost**. Confirm that both screens show the same two-person crew and a live link.
6. Start from the host's screen. On the guest, press and release movement: its own character should respond immediately, without waiting for the host's reply. Compare walking over the same clear distance and check that both operatives travel at the same speed. Remote movement has normal network delay. Fire from both devices: tracers should travel continuously, hit cover, and disappear on impact rather than remain suspended. Enemy health and relay progress must be shared.
7. Let one operative take damage. When downed, move the other close and hold E to revive. A team wipe must produce defeat for both players.
8. Start another run. Complete all three relays together, collect the core, and extract. Both screens must show victory and the same total takedowns.
9. Regroup in the lobby from the host's results screen. Confirm the same invitation code still works.
10. Test refresh/reconnect: refresh a guest tab during a raid. The seat should restore, movement should respond as soon as the first host state arrives, and dash should work without waiting for old counters. Host refresh should resume from its latest checkpoint. If the host stays disconnected for about 18 seconds, the run should end with a regroup message and a remaining player should become squad lead.
11. Have one guest leave during play. Other clients should continue, with the departed operative downed. On regroup, the departed seat must be removed. Start again with the remaining crew.
12. Before starting a run, choose +1 AI backup. Both screens must show the same AI-labelled ally. Check that it follows, shoots and revives a downed human. Confirm humans can still join the lobby, replacing AI slots without exceeding four crew. Explore all outer districts and check that the minimap covers the 100 × 80 compound. Look for riflemen, breachers, marksmen and juggernauts as the raid progresses. Try Lockdown and Nightmare. Check hunter pursuit, armored enemies' three-shot spreads, security-strike warning circles and impacts, hack interruption/decay, and the need to clear extraction. Test **GRAPHICS: LOW** on a slower device.
13. If a guest stops receiving live updates, confirm the backup connection becomes active and movement/weapon changes still reach the host. Check that POST `/api/sync` succeeds; missing this new function means the update was only partially deployed.

On phones, test both sticks and the ACT, DASH, and LOAD controls. On gamepads, test right-stick aim after moving the mouse at least once. Check frame rate on the devices your friends will actually use.

## Mobile acceptance check

1. Confirm the footer reads **V1.3.1 · MOBILE HUD UPDATE**, then start a solo run on a phone.
2. In portrait, check the slim top objective/timer, health left, ammo right, sticks in opposite bottom corners, and separate action/gun rows. The full desktop sidebars must be hidden.
3. Rotate to landscape with the address bar visible. Check that no status card, weapon row or action button overlaps a stick or extends below the viewport. Also check fullscreen and a notched device when available.
4. Move and aim/fire with two fingers at once. Release one finger: only its own control should stop. While holding movement or ACT, rotate, switch apps or open Pause/the tactical map; return and confirm no action is stuck.
5. Tap the map icon beside Pause. The map, squad and mission information should be readable and scrollable, with a reachable close button. Solo pauses; co-op continues. Closing restores controls. Sound/fullscreen buttons live in this drawer.
6. Switch all four guns, reload and dash. Cooldown/reload feedback must remain readable and releasing the button must always end a hold. Verify touch controls disappear while downed and return after a revive.
7. Check home, lobby, room-code/copy controls, field manual and results on a narrow phone. Forms and dialogs should scroll instead of clipping. Recheck a normal desktop window.

These are deployment acceptance steps, not claims of real-phone verification in this workspace.

## Troubleshooting

| Problem                                                              | Check                                                                                                                                                                            |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Co-op says storage is not connected                                  | Add **REDIS_URL**, using the provider's full `rediss://` URL, then redeploy. Solo needs no Redis.                                                                                |
| Previous card-game environment variables are present but co-op fails | Use the full TLS Redis connection string. REST-only variables cannot provide this game’s TCP connection. Pub/sub is the fast path; HTTP/Redis sync is a slower fallback.                                                       |
| Lobby never establishes a live link                                  | Check that `/api/live` accepts WebSocket upgrades, current Vercel WebSockets/Fluid compute are enabled, and Redis supports pub/sub. Check deployment protection and server logs. |
| `/api/room`, `/api/live`, or `/api/sync` returns 404                               | Deploy the complete project, including the root `api/` directory. A static-only upload cannot run co-op.                                                                         |
| Start says to wait for an operative                                  | Allow the player's WebSocket connection and next presence sync to finish. Rejoin if a stale player has closed their tab.                                                         |
| Disconnected old player occupies a lobby seat                        | Create a new room, or wait 18 seconds before a new join. Stale lobby seats are removed on joining/starting.                                                                      |
| The host switches away and the game slows                            | Keep the host's browser tab active. Browser background throttling affects the host simulation.                                                                                   |
| The host leaves entirely                                             | The crew can regroup after the host timeout; a remaining player becomes squad lead. The project does not migrate an in-progress simulation between different players.            |
| 3D graphics fail to start                                            | Use a current WebGL 2 browser and check hardware acceleration. Older WebGL 1-only browsers are unsupported.                                                                      |
| Guest controls freeze after a refresh                                | Confirm all clients are running v1.3.1, refresh every page, and create a fresh room. New connections have independent input streams; acknowledgements belong to that stream. |
| A guest gets a refresh/version message                               | Frontend and server versions differ. Open the latest production URL, refresh, and create a new room. |
| Frame rate is low or the graphics context is lost                     | Use **GRAPHICS: LOW** on the home screen, or the low-graphics reload on the recovery screen. |
| `PLAY-SOLO.html` cannot create rooms                                 | Intentional: it is a self-contained solo preview. Use the complete deployment for co-op.                                                                                         |

Official technical references: [Vercel WebSockets](https://vercel.com/docs/functions/websockets), [Vercel Marketplace storage](https://vercel.com/docs/marketplace-storage), [Upstash integration](https://vercel.com/marketplace/upstash), [Three.js WebGL renderer](https://threejs.org/docs/pages/WebGLRenderer.html).

The source update has not been deployed to your Vercel project from this workspace. Production Redis behavior and browser/GPU rendering still require a live acceptance check.
