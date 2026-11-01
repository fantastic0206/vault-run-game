# Publish Vault Breach 3D on Vercel

This is a separate project from the earlier Vault Run card game. Deploy the **complete `vault-breach-3d` folder** from the ZIP. Do not upload only `PLAY-SOLO.html` or only `dist/` if you want co-op.

## Fast solo check

Open `PLAY-SOLO.html` after extracting the ZIP. No installation is required for solo play. If the browser reports that 3D graphics could not start, use a WebGL 2 capable browser with hardware acceleration enabled.

## Vercel deployment

1. Create a GitHub repository and put the **contents** of `vault-breach-3d` at its root. Include `api/`, `server/`, `src/`, `package.json`, `package-lock.json`, and `vercel.json`. Exclude `node_modules`, `.local`, `.env.local`, and `.vercel`.
2. In [Vercel](https://vercel.com/new), import that repository. The project configuration is included:
   - Framework: **Vite**
   - Build command: **npm run build**
   - Output directory: **dist**
   - Node.js: **24.x**
3. Create the project. Solo play is available as soon as the frontend deployment succeeds.
4. For co-op, open your Vercel project's **Storage / Marketplace** and connect **[Upstash Redis](https://vercel.com/marketplace/upstash)** or a compatible Redis provider supporting TLS and pub/sub.
5. Check **Settings → Environment Variables** for **REDIS_URL**. If the integration does not supply it automatically, copy the database's TLS Redis connection string into that variable for **Production** and **Preview** as appropriate:

   ```text
   rediss://default:YOUR_REDIS_PASSWORD@YOUR_DATABASE_HOST:6379
   ```

   Use the actual URL supplied by the provider, including its correct host, password, port, and URL escaping. This is the **TCP/TLS Redis connection URL**. The REST URL/token from the old card game is not a replacement for it. Keep it server-side; do not add a `VITE_` prefix.

6. Keep **Fluid compute** enabled and allow the WebSocket endpoint's configured **300-second maximum duration**. The current Vercel WebSocket runtime supports the standard Node HTTP server exported by `api/live.ts`. Clients reconnect when a Function's connection closes.
7. Redeploy after configuring the environment variable. Existing deployments do not pick up newly added variables.
8. Use the **Production URL**, usually `https://your-project.vercel.app`, and run the acceptance check below. Verify that deployment protection permits your intended visitors to open both the page and its WebSocket endpoint.

Future commits to the production branch rebuild the project.

## CLI deployment without GitHub

Open a terminal inside `vault-breach-3d`:

```bash
npm ci
npm test
npm run build
npx vercel link
```

Create/link the Vercel project, connect Redis and configure REDIS_URL as above, then publish:

```bash
npx vercel --prod
```

The standalone HTML can also be hosted as a solo-only static game. Multiplayer needs the complete project and its two server endpoints.

## Two-device acceptance check

1. Open the Production URL in a private browser session. Confirm the 3D arena renders and **Play Solo** starts immediately.
2. Move with WASD, aim and fire, reload with R, and dash with Space. Shots must stop at crates. Escape must pause solo play. Resume it.
3. Hack the three marked relays by standing close and holding E. The vault door must open after the third relay. Take the core with E and carry it to the green extraction circle for two seconds. Confirm a victory screen and a working retry button.
4. Return to the home screen. Enter the codename **Rook** and create a co-op room.
5. Open its invite on a second physical device or independently opened browser session. Join as **Ghost**. Confirm that both screens show the same two-person crew and a live link.
6. Start from the host's screen. Move the two operatives independently. Each device must see the other's movement and shots, and both must share enemy health and relay progress.
7. Let one operative take damage. When downed, move the other close and hold E to revive. A team wipe must produce defeat for both players.
8. Start another run. Complete all three relays together, collect the core, and extract. Both screens must show victory and the same total takedowns.
9. Regroup in the lobby from the host's results screen. Confirm the same invitation code still works.
10. Test refresh/reconnect: refresh one tab during a raid. The seat should restore. Host refresh should resume from its latest checkpoint. If the host stays disconnected for about 18 seconds, the run should end with a regroup message and a remaining player should become squad lead.

On phones, test both sticks and the ACT, DASH, and LOAD controls. On gamepads, test right-stick aim after moving the mouse at least once. Check frame rate on the devices your friends will actually use.

## Troubleshooting

| Problem                                                              | Check                                                                                                                                                                            |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Co-op says storage is not connected                                  | Add **REDIS_URL**, using the provider's full `rediss://` URL, then redeploy. Solo needs no Redis.                                                                                |
| Previous card-game environment variables are present but co-op fails | This action game uses live pub/sub. Add the TLS Redis connection string; REST-only variables cannot provide its transport.                                                       |
| Lobby never establishes a live link                                  | Check that `/api/live` accepts WebSocket upgrades, current Vercel WebSockets/Fluid compute are enabled, and Redis supports pub/sub. Check deployment protection and server logs. |
| `/api/room` or `/api/live` returns 404                               | Deploy the complete project, including the root `api/` directory. A static-only upload cannot run co-op.                                                                         |
| Start says to wait for an operative                                  | Allow the player's WebSocket connection and next presence sync to finish. Rejoin if a stale player has closed their tab.                                                         |
| Disconnected old player occupies a lobby seat                        | Create a new room, or wait 18 seconds before a new join. Stale lobby seats are removed on joining/starting.                                                                      |
| The host switches away and the game slows                            | Keep the host's browser tab active. Browser background throttling affects the host simulation.                                                                                   |
| The host leaves entirely                                             | The crew can regroup after the host timeout; a remaining player becomes squad lead. The project does not migrate an in-progress simulation between different players.            |
| 3D graphics fail to start                                            | Use a current WebGL 2 browser and check hardware acceleration. Older WebGL 1-only browsers are unsupported.                                                                      |
| `PLAY-SOLO.html` cannot create rooms                                 | Intentional: it is a self-contained solo preview. Use the complete deployment for co-op.                                                                                         |

Official technical references: [Vercel WebSockets](https://vercel.com/docs/functions/websockets), [Vercel Marketplace storage](https://vercel.com/docs/marketplace-storage), [Upstash integration](https://vercel.com/marketplace/upstash), [Three.js WebGL renderer](https://threejs.org/docs/pages/WebGLRenderer.html).
