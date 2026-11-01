# v1.2.0 · Big Guns Update

- Casual is now the default. No starting guards, a seven-second grace period, lower enemy health/damage/speed, fewer enemies, fast 1.5-second hacks, 2-second extraction, faster shield recovery, and 20-second medkit respawns. Casual objectives do not require a clear perimeter. Tactical is also gentler; hard modes remain optional.
- Add four unlocked guns with separate magazines: Pulse carbine, Thunder shotgun, Cyclone minigun, and the strongest Nova cannon. Start with Nova. Switch using 1–4, touch slots, or gamepad B. Add per-gun models, projectile colors, reload timing, and Nova splash with cover and friendly-fire checks.
- Add authenticated durable `/api/sync` for mission snapshots and guest controls. Automatically recover when WebSocket upgrades or pub/sub delivery fail. Share one control stream across transports and pace recovery requests.
- A committed join now returns its credentials even when pub/sub publication fails. Relay availability errors are retryable. Persist world frames before attempting live publication. Prevent late frames from rewinding state.
- Apply late host checkpoints even when room metadata started the runtime first. Restore dash counters and serialize presence updates so old connection status cannot overwrite new status.
- Include a reconnect action and visible release identifier. Protocol and world schema are now 3; all players must refresh and use a fresh room after deployment.

54 automated tests pass, including four-client transport integration, relay loss, rejected pub/sub, blocked upgrades, guest refresh/rematch, late checkpoint recovery, all guns, splash and reloads. Production, standalone, compiled-function and server-rendered UI checks pass. Browser/GPU and live Vercel/Redis verification remain unavailable; no production deployment was performed here.

---

# v1.1.0 · Lockdown Update

## Multiplayer reliability

- Give each authenticated socket an independent input-stream ID. A guest refresh resets its browser's sequence/dash counters; the host now accepts that stream immediately and adjusts dash counters without triggering a phantom dash. Retired connections cannot reclaim control.
- Tag and validate guest frames and host inputs by mission ID. Reject malformed frames, old protocol versions, wrong rosters, stale frames and terminal-state rollbacks.
- Wait for the first host snapshot before enabling guest controls. Restore valid checkpoints on reconnect.
- Read current membership after an asynchronous subscription so a simultaneous start is not missed. Serialize Redis subscribe/unsubscribe operations and clean up sockets closed during authentication.
- Preserve the fixed mission roster when a guest leaves, mark that operative down, then prune the seat on regroup.
- Add heartbeat recovery, readable version errors, a React recovery screen, graphics-loss handling, and a low-graphics reload. A denied gamepad permission no longer crashes normal controls.

## Art direction

- Real 3D steel plate textures, reinforced crates, modular bulkheads, wall lamps, conduits, vault details, neon floor lighting, colored helmets and crew labels.
- Subtle bloom on high graphics, a closer combat camera, and framed gold/teal combat and menu panels with larger desktop labels and weapon art.
- Batch static architecture by material to reduce draw calls. Touch/low-memory devices default to low graphics; high graphics can be changed from the home screen.

## Difficulty

- Tactical, Lockdown (default), and Nightmare, with a host-controlled shared setting.
- Starting guards, fast hunters, armored enemies with three-shot spreads, crew-scaled armor/spawns, and escalating pressure.
- Telegraph floor strikes before impact so movement and dashes matter.
- Longer hacks need a clear perimeter and a stationary operative. Recent damage interrupts hacking; abandoned progress decays.
- Extraction requires a clear zone and a 4/6/8-second defense. Medkits respawn after 55 seconds.

## Verified and pending

39 automated tests pass, including actual client transport/runtime integration for four seats across two server instances, guest refresh, guest departure, finish, rematch, and the new threat systems. Production, standalone, and compiled server builds pass. Runtime tests use stub graphics/control adapters.

The workspace preview relay is unavailable, and no live Vercel URL was supplied. Browser/GPU rendering, real-device controls/performance, production Redis behavior, and a live Vercel deployment are **not verified**. The release has not been deployed to the user's Vercel project. The earlier illustrated previews are art-direction references, not screenshot evidence.
