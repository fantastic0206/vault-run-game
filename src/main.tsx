import {
  useEffect,
  useRef,
  useState,
  Component,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowRight,
  Check,
  CheckCheck,
  ChevronRight,
  Clock3,
  Coins,
  Copy,
  Crosshair,
  Crown,
  DoorOpen,
  Expand,
  Gem,
  Heart,
  HelpCircle,
  Keyboard,
  LockKeyhole,
  MousePointer2,
  Pause,
  Play,
  Radio,
  RotateCcw,
  Shield,
  Target,
  Trophy,
  Users,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
  X,
  Zap,
} from "lucide-react";
import { Runtime } from "./game/runtime";
import { enableSound, sound } from "./game/audio";
import { CORE, EXTRACTION, OBSTACLES, RELAYS } from "./game/map";
import {
  interactionHint,
  MAGAZINE,
  MISSION_SECONDS,
  vaultOpen,
} from "./game/simulation";
import { COLORS, type Room, type Session, type World } from "./game/types";
import type { Difficulty } from "./game/types";
import { DIFFICULTIES, EXTRACT_SECONDS, HACK_SECONDS } from "./game/balance";
import { graphicsQuality } from "./game/art";
import { CrewLink, NetworkError, roomApi } from "./network";
import "./style.css";

const SOLO_PREVIEW =
  location.protocol === "file:" ||
  Boolean(
    (globalThis as { __VAULT_SOLO_PREVIEW__?: boolean }).__VAULT_SOLO_PREVIEW__,
  );

function savedSeat(): Session | null {
  try {
    const s = JSON.parse(
      sessionStorage.getItem("vault-breach-seat-v1") ?? "null",
    );
    return s && /^[A-Z2-9]{6}$/.test(s.code) && /^[a-f0-9]{64}$/.test(s.token)
      ? s
      : null;
  } catch {
    return null;
  }
}
function saveSeat(seat: Session | null) {
  try {
    if (seat)
      sessionStorage.setItem("vault-breach-seat-v1", JSON.stringify(seat));
    else sessionStorage.removeItem("vault-breach-seat-v1");
  } catch {}
}
const formatTime = (seconds: number) =>
  `${Math.floor(Math.max(0, seconds) / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(Math.max(0, seconds) % 60)
    .toString()
    .padStart(2, "0")}`;
function Logo({ small = false }: { small?: boolean }) {
  return (
    <div className={`logo ${small ? "small" : ""}`}>
      <span className="logo-mark">
        <Gem size={small ? 19 : 23} />
      </span>
      <span className="logo-wordmark">
        <span>VAULT</span><b>BREACH</b>
        <small>AFTER HOURS. OVER YOUR HEAD.</small>
      </span>
    </div>
  );
}

function App() {
  const canvas = useRef<HTMLCanvasElement>(null),
    runtime = useRef<Runtime | null>(null),
    link = useRef<CrewLink | null>(null);
  const [seat, setSeat] = useState<Session | null>(() =>
      SOLO_PREVIEW ? null : savedSeat(),
    ),
    seatRef = useRef(seat);
  seatRef.current = seat;
  const [room, setRoom] = useState<Room | null>(null),
    roomRef = useRef(room);
  roomRef.current = room;
  const [page, setPage] = useState<"home" | "lobby" | "game">("home");
  const [hud, setHud] = useState<World | null>(null),
    [live, setLive] = useState(false),
    liveRef = useRef(false);
  const [error, setError] = useState(""),
    [connectionError, setConnectionError] = useState(""),
    [webglError, setWebglError] = useState("");
  const [runtimeError, setRuntimeError] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty>("lockdown");
  const [busy, setBusy] = useState(false),
    busyRef = useRef(false),
    [paused, setPaused] = useState(false),
    [rules, setRules] = useState(false),
    [soundOn, setSoundOn] = useState(false),
    [toast, setToast] = useState("");
  const [name, setName] = useState(() => {
    try {
      return localStorage.getItem("vault-breach-name") ?? "";
    } catch {
      return "";
    }
  });
  const callbacks = useRef({
    acceptRoom: (r: Room, w?: World | null) => {},
    outcome: (w: World) => {},
  });
  callbacks.current.acceptRoom = (next, checkpoint) => {
    if (!seatRef.current || next.code !== seatRef.current.code) return;
    if (
      roomRef.current?.code === next.code &&
      roomRef.current.version > next.version
    )
      return;
    roomRef.current = next;
    setDifficulty(next.difficulty);
    setRoom(next);
    if (next.phase === "lobby") {
      if (runtime.current?.multiplayer) runtime.current.menu();
      setPage("lobby");
      setPaused(false);
    } else if (liveRef.current && runtime.current) {
      runtime.current.coop(next, checkpoint);
      runtime.current.roomUpdate(next);
      setPage("game");
    }
  };
  callbacks.current.outcome = (world) => {
    setPaused(false);
    if (
      seatRef.current &&
      runtime.current?.authority &&
      roomRef.current?.phase === "playing" &&
      world.status !== "aborted"
    )
      void perform("finish", {
        gameId: runtime.current.gameId,
        result: world.status,
      });
  };
  useEffect(() => {
    try {
      const game = new Runtime(canvas.current!);
      runtime.current = game;
      game.callbacks = {
        hud: setHud,
        input: (input) => link.current?.input(game.gameId, input),
        frame: (world) => link.current?.world(game.gameId, world),
        outcome: (world) => callbacks.current.outcome(world),
        fault: (message) => {
          setRuntimeError(message);
          link.current?.close();
          liveRef.current = false;
          setLive(false);
        },
      };
      const lost = (event: Event) => { event.preventDefault(); game.menu(); game.callbacks.fault("The graphics connection was lost. Reload with low graphics to rejoin safely."); };
      canvas.current!.addEventListener("webglcontextlost", lost);
      return () => {
        canvas.current?.removeEventListener("webglcontextlost", lost);
        game.dispose();
        runtime.current = null;
      };
    } catch {
      setWebglError(
        "This browser could not start WebGL 2. Try a current Chrome, Edge, Firefox, or Safari with hardware acceleration enabled.",
      );
    }
  }, []);
  useEffect(() => {
    if (!seat) return;
    let active = true;
    const crew = new CrewLink(seat, {
      room: (r, w) => {
        if (active) callbacks.current.acceptRoom(r, w);
      },
      world: (gameId, w) => { if (active) runtime.current?.remoteFrame(gameId, w); },
      input: (gameId, id, input, stream) => { if (active) runtime.current?.remoteInput(gameId, id, input, stream); },
      status: (connected, message, terminal) => {
        if (active) {
          liveRef.current = connected;
          setLive(connected);
          setConnectionError(message);
          if (terminal) setError(message);
          if (connected) void sync();
        }
      },
    });
    link.current = crew;
    const sync = async () => {
      try {
        const data = await roomApi(
          { type: "sync", code: seat.code, live: crew.live },
          seat.token,
        );
        if (active) callbacks.current.acceptRoom(data.room);
      } catch (e) {
        if (active) {
          const err = e as NetworkError;
          if ([401, 404].includes(err.status)) {
            clearCrew();
            setError(err.message);
          } else setConnectionError(err.message);
        }
      }
    };
    void sync();
    const interval = setInterval(() => void sync(), 3200);
    return () => {
      active = false;
      clearInterval(interval);
      crew.close();
      if (link.current === crew) link.current = null;
      liveRef.current = false;
    };
  }, [seat?.code, seat?.token]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input,textarea")) return;
      if (e.code === "Escape" && page === "game" && hud?.status === "playing") {
        e.preventDefault();
        togglePause();
      }
      if (e.code === "KeyM" && !e.repeat) toggleSound();
      if (e.code === "KeyF" && !e.repeat && page === "game") void fullscreen();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [page, paused, soundOn, hud?.status]);
  function togglePause() {
    const next = !paused;
    runtime.current?.pause(next);
    setPaused(next);
  }
  function toggleSound() {
    const value = enableSound(!soundOn);
    setSoundOn(value);
    if (value) sound("click");
  }
  async function fullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      setToast("Fullscreen is unavailable in this browser.");
    }
  }
  function clearCrew() {
    saveSeat(null);
    seatRef.current = null;
    setSeat(null);
    setRoom(null);
    roomRef.current = null;
    runtime.current?.menu();
    setPage("home");
    setLive(false);
    liveRef.current = false;
    link.current?.close();
    setConnectionError("");
    setRuntimeError("");
    history.replaceState(null, "", location.pathname);
  }
  function solo() {
    if (webglError) return;
    const previous = seatRef.current;
    if (previous) {
      void roomApi({ type: "leave", code: previous.code }, previous.token).catch(() => {});
      clearCrew();
    }
    setError("");
    try {
      localStorage.setItem("vault-breach-name", name);
    } catch {}
    runtime.current?.solo(name.trim() || "Rook", difficulty);
    setPage("game");
    setPaused(false);
    setToast("MISSION LIVE · Disable the three security relays.");
  }
  async function enter(type: "create" | "join", code = "") {
    if (busyRef.current || !name.trim()) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await roomApi({ type, name: name.trim(), code, difficulty });
      const s = {
        code: result.room.code,
        token: result.token!,
        id: result.id!,
      };
      saveSeat(s);
      seatRef.current = s;
      setSeat(s);
      setRoom(result.room);
      roomRef.current = result.room;
      setPage("lobby");
      history.replaceState(null, "", `?room=${s.code}`);
      try {
        localStorage.setItem("vault-breach-name", name);
      } catch {}
    } catch (e) {
      setError((e as Error).message);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  async function perform(type: string, extra: Record<string, unknown> = {}) {
    const s = seatRef.current;
    if (!s || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await roomApi(
        { type, code: s.code, live: liveRef.current, ...extra },
        s.token,
      );
      if (type === "leave") clearCrew();
      else callbacks.current.acceptRoom(result.room);
    } catch (e) {
      if (type === "leave") clearCrew();
      setError((e as Error).message);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  async function copyInvite() {
    if (!seat) return;
    try {
      await navigator.clipboard.writeText(
        `${location.origin}/?room=${seat.code}`,
      );
      setToast("INVITE COPIED · Call your accomplices.");
    } catch {
      setToast("ROOM CODE · " + seat.code);
    }
  }
  function exitMission() {
    setPaused(false);
    if (seat) void perform("leave");
    else {
      runtime.current?.menu();
      setPage("home");
    }
  }
  const currentId = seat?.id ?? "solo";
  return (
    <div className={`app page-${page}`}>
      <canvas
        ref={canvas}
        id="battlefield"
        aria-label="Three dimensional vault arena"
      />
      <div className="screen-vignette" aria-hidden="true" />
      {page === "home" && (
        <Home
          name={name}
          setName={setName}
          onSolo={solo}
          onEnter={enter}
          onHelp={() => setRules(true)}
          busy={busy}
          error={error}
          disabled={!!webglError}
          soundOn={soundOn}
          toggleSound={toggleSound}
          difficulty={difficulty}
          setDifficulty={setDifficulty}
        />
      )}
      {page === "lobby" && (
        <div className="lobby-overlay">
          <header className="menu-header">
            <Logo />
            <div>
              <button className="text-button" onClick={() => setRules(true)}>
                <HelpCircle size={16} />
                FIELD MANUAL
              </button>
              <button
                className="icon-button"
                aria-label="Leave crew"
                onClick={() => void perform("leave")}
              >
                <DoorOpen size={19} />
              </button>
            </div>
          </header>
          <main className="lobby-shell">
            <section className="lobby-brief">
              <span className="eyebrow">
                <Radio size={13} />
                CREW ASSEMBLY · PRIVATE OPERATION
              </span>
              <h1>
                BRING BACK
                <br />
                <em>THE WHOLE CREW.</em>
              </h1>
              <p>
                Four minutes. Three relays. One vault core.
                <br />
                Watch each other’s backs. Make it out together.
              </p>
              <div className="invite-block">
                <span>CREW ACCESS CODE</span>
                <strong>{seat?.code}</strong>
                <button className="button secondary" onClick={copyInvite}>
                  <Copy size={15} />
                  COPY INVITE
                </button>
              </div>
              <DifficultySelect value={room?.difficulty ?? difficulty} onChange={(difficulty) => void perform("difficulty", { difficulty })} disabled={busy || room?.hostId !== currentId} />
              <MissionBrief difficulty={room?.difficulty ?? difficulty} />
              <p className="lobby-note">
                <Shield size={13} />
                The host runs the mission. Keep the host’s game open while
                playing.
              </p>
            </section>
            <aside className="crew-card">
              <div className="card-heading">
                <span>
                  <Users size={17} />
                  THE CREW
                </span>
                <b>
                  {room?.players.length ?? 1}
                  <small> / 4</small>
                </b>
              </div>
              <div className={`connection-state ${live ? "connected" : ""}`}>
                {live ? <Wifi size={12} /> : <WifiOff size={12} />}{" "}
                {live ? "LIVE LINK ESTABLISHED" : "ESTABLISHING LIVE LINK…"}
              </div>
              <div className="crew-list">
                {room?.players.map((p) => (
                  <div className="crew-row" key={p.id}>
                    <span
                      className="crew-avatar"
                      style={
                        { "--agent": COLORS[p.color] } as React.CSSProperties
                      }
                    >
                      <Crosshair size={23} />
                    </span>
                    <div>
                      <strong>
                        {p.name}
                        {p.id === room.hostId && <Crown size={11} />}
                      </strong>
                      <span>
                        {p.id === currentId ? "YOU · " : ""}
                        {p.id === room.hostId
                          ? "SQUAD LEAD"
                          : "FIELD OPERATIVE"}
                      </span>
                    </div>
                    <span className={`presence ${p.online ? "online" : ""}`} />
                  </div>
                ))}
                {Array.from(
                  { length: Math.max(0, 4 - (room?.players.length ?? 0)) },
                  (_, i) => (
                    <div className="empty-seat" key={i}>
                      <Users size={19} />
                      <span>WAITING FOR AN ACCOMPLICE</span>
                      <b>+</b>
                    </div>
                  ),
                )}
              </div>
              {(error || connectionError) && (
                <div className="error" role="alert">
                  {error || connectionError}
                </div>
              )}
              <button
                className="button primary full"
                disabled={
                  busy || !live || room?.hostId !== currentId || !!webglError
                }
                onClick={() => void perform("start")}
              >
                {busy ? (
                  <span className="spinner" />
                ) : room?.hostId === currentId ? (
                  <>
                    <Play size={16} />
                    BREACH THE VAULT
                    <ArrowRight size={16} />
                  </>
                ) : (
                  <>WAITING FOR THE SQUAD LEAD</>
                )}
              </button>
              <p className="card-footnote">
                1–4 operatives · Shared mission · No friendly fire
              </p>
            </aside>
          </main>
        </div>
      )}
      {page === "game" && hud && (
        <>
          <GameHUD
            world={hud}
            selfId={currentId}
            room={seat?.code ?? null}
            onPause={togglePause}
            onFullscreen={fullscreen}
            soundOn={soundOn}
            onSound={toggleSound}
          />
          {hud.status === "playing" && !paused && (
            <TouchControls runtime={runtime.current} />
          )}{" "}
          {seat && (!live || connectionError || runtime.current?.awaitingFrame) && (
            <div className="network-banner">
              <WifiOff size={14} />
              {connectionError || (runtime.current?.awaitingFrame ? "Synchronizing mission with the squad lead…" : "Reconnecting to the crew…")}
            </div>
          )}
          {hud.status === "playing" && paused && (
            <div className="modal-shade">
              <section className="pause-panel">
                <span className="eyebrow">TAKE A BREATHER</span>
                <h2>{seat ? "STAY SHARP." : "MISSION PAUSED."}</h2>
                <p>
                  {seat
                    ? "The co-op mission continues while this menu is open."
                    : "Your operative and the security drones are on hold."}
                </p>
                <button className="button primary full" onClick={togglePause}>
                  <Play size={16} />
                  BACK TO THE BREACH
                </button>
                <button
                  className="button secondary full"
                  onClick={() => setRules(true)}
                >
                  <Keyboard size={16} />
                  CONTROLS & OBJECTIVES
                </button>
                <button className="text-button full" onClick={exitMission}>
                  <DoorOpen size={15} />
                  {seat ? "LEAVE THE CREW" : "RETURN TO BASE"}
                </button>
              </section>
            </div>
          )}
          {hud.status !== "playing" && (
            <div className="modal-shade results-shade">
              <section className="result-panel">
                <div
                  className={`result-emblem ${hud.status === "won" ? "win" : ""}`}
                >
                  {hud.status === "won" ? (
                    <Trophy size={39} />
                  ) : (
                    <Shield size={38} />
                  )}
                </div>
                <span className="eyebrow">
                  {hud.status === "won"
                    ? "CONTRACT COMPLETE"
                    : "OPERATION ENDED"}
                </span>
                <h2>
                  {hud.status === "won" ? (
                    <>
                      THE PERFECT
                      <br />
                      <em>GETAWAY.</em>
                    </>
                  ) : hud.status === "aborted" ? (
                    <>
                      REGROUP.
                      <br />
                      <em>RUN IT BACK.</em>
                    </>
                  ) : (
                    <>
                      THIS ONE
                      <br />
                      <em>GOT LOUD.</em>
                    </>
                  )}
                </h2>
                <p>{hud.reason}</p>
                <div className="result-stats">
                  <div>
                    <strong>{hud.kills}</strong>
                    <span>DRONES DOWN</span>
                  </div>
                  <div>
                    <strong>{formatTime(hud.time)}</strong>
                    <span>MISSION TIME</span>
                  </div>
                  <div>
                    <strong>{hud.relays.filter((r) => r.done).length}/3</strong>
                    <span>RELAYS HACKED</span>
                  </div>
                </div>
                <div className="result-crew">
                  {hud.players.map((p) => (
                    <div key={p.id}>
                      <span style={{ color: COLORS[p.color] }}>
                        <Crosshair size={15} />
                        {p.name}
                      </span>
                      <strong>
                        {p.kills} <small>TAKEDOWNS</small>
                      </strong>
                    </div>
                  ))}
                </div>
                {error && <div className="error">{error}</div>}
                <button
                  className="button primary full"
                  disabled={busy || (!!seat && room?.hostId !== currentId)}
                  onClick={() => (seat ? void perform("rematch") : solo())}
                >
                  <RotateCcw size={16} />
                  {seat
                    ? room?.hostId === currentId
                      ? "REGROUP IN THE LOBBY"
                      : "WAITING FOR THE SQUAD LEAD"
                    : "ONE MORE JOB?"}
                </button>
                <button className="text-button full" onClick={exitMission}>
                  <DoorOpen size={15} />
                  {seat ? "LEAVE CREW" : "RETURN TO BASE"}
                </button>
              </section>
            </div>
          )}
        </>
      )}
      {webglError && (
        <div className="webgl-error" role="alert">
          <Shield size={23} />
          <strong>3D GRAPHICS COULD NOT START</strong>
          <p>{webglError}</p>
        </div>
      )}
      {runtimeError && <div className="modal-shade recovery-shade"><section className="pause-panel"><span className="eyebrow">OPERATIVE RECOVERY</span><h2>LET’S GET YOU BACK.</h2><p>{runtimeError}</p><button className="button primary full" onClick={() => { try { localStorage.setItem("vault-breach-quality", "low"); } catch {} location.reload(); }}>RELOAD WITH LOW GRAPHICS <RotateCcw size={16}/></button><button className="text-button full" onClick={exitMission}>RETURN TO BASE</button></section></div>}
      {rules && <Manual difficulty={difficulty} close={() => setRules(false)} />}
      {toast && (
        <div className="toast" role="status">
          <Check size={15} />
          {toast}
        </div>
      )}
    </div>
  );
}

function DifficultySelect({ value, onChange, disabled = false }: { value: Difficulty; onChange: (value: Difficulty) => void; disabled?: boolean }) {
  return <div className="difficulty-select"><span className="eyebrow">THREAT LEVEL</span><div role="group" aria-label="Mission difficulty">{(Object.keys(DIFFICULTIES) as Difficulty[]).map((key, i) => <button key={key} aria-pressed={value === key} disabled={disabled} className={value === key ? "selected" : ""} onClick={() => onChange(key)}><span>{Array.from({length:i+1}, (_, n) => <i key={n}/>)}</span>{DIFFICULTIES[key].name}</button>)}</div><p>{DIFFICULTIES[value].subtitle}</p></div>;
}
function MissionBrief({ difficulty = "lockdown" }: { difficulty?: Difficulty }) {
  return (
    <div className="mission-brief">
      <div>
        <span>01</span>
        <Target size={17} />
        <p>
          <strong>DISABLE SECURITY</strong>
          <small>Clear each relay. Hold still + E for {HACK_SECONDS(difficulty)}s.</small>
        </p>
      </div>
      <div>
        <span>02</span>
        <Gem size={17} />
        <p>
          <strong>STEAL THE CORE</strong>
          <small>Enter the open vault. Press E to grab the core.</small>
        </p>
      </div>
      <div>
        <span>03</span>
        <DoorOpen size={17} />
        <p>
          <strong>MAKE THE GETAWAY</strong>
          <small>
            Clear extraction. Defend the core for {EXTRACT_SECONDS(difficulty)} seconds.
          </small>
        </p>
      </div>
    </div>
  );
}
function Home({
  name,
  setName,
  onSolo,
  onEnter,
  onHelp,
  busy,
  error,
  disabled,
  soundOn,
  toggleSound,
  difficulty,
  setDifficulty,
}: {
  name: string;
  setName: (n: string) => void;
  onSolo: () => void;
  onEnter: (type: "create" | "join", code?: string) => void;
  onHelp: () => void;
  busy: boolean;
  error: string;
  disabled: boolean;
  soundOn: boolean;
  toggleSound: () => void;
  difficulty: Difficulty;
  setDifficulty: (value: Difficulty) => void;
}) {
  const invite = new URLSearchParams(location.search).get("room") ?? "";
  const [mode, setMode] = useState<"create" | "join">(
      invite ? "join" : "create",
    ),
    [code, setCode] = useState(
      invite
        .toUpperCase()
        .replace(/[^A-Z2-9]/g, "")
        .slice(0, 6),
    );
  return (
    <div className="home-overlay">
      <header className="menu-header">
        <Logo />
        <div>
          <button className="text-button graphics-button" disabled={busy} onClick={() => { try { localStorage.setItem("vault-breach-quality", graphicsQuality() === "low" ? "high" : "low"); location.reload(); } catch {} }}>GRAPHICS: {graphicsQuality().toUpperCase()}</button>
          <button
            className="text-button"
            onClick={toggleSound}
            aria-label={soundOn ? "Mute game sounds" : "Enable game sounds"}
          >
            {soundOn ? <Volume2 size={16} /> : <VolumeX size={16} />}SOUND{" "}
            {soundOn ? "ON" : "OFF"}
          </button>
          <button className="text-button" onClick={onHelp}>
            <HelpCircle size={16} />
            FIELD MANUAL
          </button>
        </div>
      </header>
      <main className="home-grid">
        <section className="hero">
          <span className="eyebrow">
            <span className="live-indicator" />
            3D ACTION · 1–4 PLAYER CO-OP
          </span>
          <h1>
            BREACH.
            <br />
            BLAST.
            <br />
            <em>EXTRACT.</em>
          </h1>
          <p>Disable security. Seize the core.<br />Make your getaway.</p>
          <div className="hero-actions">
            <button
              className="button primary big"
              disabled={disabled}
              onClick={onSolo}
            >
              <Play size={18} />
              PLAY SOLO
              <ArrowRight size={18} />
            </button>
            <button className="button ghost big" onClick={onHelp}>
              <Keyboard size={18} />
              LEARN THE ROPES
            </button>
          </div>
          <DifficultySelect value={difficulty} onChange={setDifficulty} disabled={busy} />
          <div className="hero-tags">
            <span>
              <Crosshair size={13} />
              REAL 3D COMBAT
            </span>
            <span>
              <Users size={13} />
              BRING YOUR CREW
            </span>
            <span>
              <Clock3 size={13} />
              4-MINUTE RAID
            </span>
          </div>
          <div className="hero-coordinates">
            <i />
            AEGIS STORAGE FACILITY
            <br />
            <span>SECTOR 07 · 02:14 AM · UNAUTHORIZED ACCESS</span>
          </div>
        </section>
        <aside className="coop-panel">
          <div className="card-heading">
            <span>
              <Radio size={16} />
              BETTER WITH ACCOMPLICES
            </span>
            <b>CO-OP</b>
          </div>
          <div className="tabs">
            <button
              className={mode === "create" ? "active" : ""}
              onClick={() => setMode("create")}
            >
              HOST A RAID
            </button>
            <button
              className={mode === "join" ? "active" : ""}
              onClick={() => setMode("join")}
            >
              JOIN THE CREW
            </button>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onEnter(mode, code);
            }}
          >
            <label htmlFor="codename">YOUR CODENAME</label>
            <input
              id="codename"
              name="nickname"
              autoComplete="nickname"
              maxLength={18}
              value={name}
              placeholder="What should we call you?"
              onChange={(e) => setName(e.target.value)}
              disabled={busy}
              required
            />
            {mode === "join" && (
              <>
                <label htmlFor="access-code">CREW ACCESS CODE</label>
                <input
                  id="access-code"
                  className="code-input"
                  autoComplete="off"
                  autoCapitalize="characters"
                  maxLength={6}
                  minLength={6}
                  placeholder="ABC123"
                  value={code}
                  onChange={(e) =>
                    setCode(
                      e.target.value.toUpperCase().replace(/[^A-Z2-9]/g, ""),
                    )
                  }
                  required
                />
              </>
            )}
            {error && (
              <div className="error" role="alert">
                {error}
              </div>
            )}
            <button
              className="button secondary full"
              disabled={
                SOLO_PREVIEW ||
                busy ||
                !name.trim() ||
                (mode === "join" && code.length !== 6) ||
                disabled
              }
            >
              {busy ? (
                <>
                  <span className="spinner" />
                  CONTACTING THE CREW…
                </>
              ) : (
                <>
                  {SOLO_PREVIEW
                    ? "SOLO PREVIEW · CO-OP IN FULL PROJECT"
                    : mode === "create"
                      ? "CREATE CO-OP ROOM"
                      : "JOIN THE RAID"}
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>
          <div className="coop-separator">
            <span />
            THE CONTRACT
            <span />
          </div>
          <MissionBrief difficulty={difficulty} />
          <p className="card-footnote">
            {SOLO_PREVIEW ? (
              <>
                This standalone file plays solo.
                <br />
                Deploy the full project to invite your crew.
              </>
            ) : (
              <>
                Solo works instantly. Friends join by room code.
                <br />
                No player accounts. No downloads.
              </>
            )}
          </p>
        </aside>
      </main>
      <footer className="menu-footer">
        <span>
          <Shield size={12} />
          GET IN. GET OUT. GET RICH.
        </span>
        <span>WASD TO MOVE · MOUSE TO AIM · SPACE TO DASH</span>
        <span>V1.1 · LOCKDOWN UPDATE</span>
      </footer>
    </div>
  );
}

function MiniMap({ world, selfId }: { world: World; selfId: string }) {
  return (
    <div className="minimap">
      <div>
        <span>SECTOR 07</span>
        <small>N ↑</small>
      </div>
      <svg
        viewBox="-27 -22 54 44"
        role="img"
        aria-label="Arena minimap with relays, extraction, crew, and enemies"
      >
        <rect
          x="-25"
          y="-20"
          width="50"
          height="40"
          rx=".6"
          fill="#142536"
          stroke="#425b6b"
          strokeWidth=".25"
        />
        {OBSTACLES.filter((o) => o.kind !== "door" || !vaultOpen(world)).map(
          (o, i) => (
            <rect
              key={i}
              x={o.x - o.w / 2}
              y={o.z - o.d / 2}
              width={o.w}
              height={o.d}
              fill="#42566a"
            />
          ),
        )}
        <circle
          cx={EXTRACTION.x}
          cy={EXTRACTION.z}
          r="2.5"
          fill="#70e3b820"
          stroke="#78d8ab"
          strokeWidth=".3"
        />
        {world.relays.map((r) => (
          <g key={r.id}>
            <circle
              cx={r.x}
              cy={r.z}
              r="1.3"
              fill={r.done ? "#7be4bb" : "#e7b968"}
            />
            <text
              x={r.x}
              y={r.z + 0.55}
              textAnchor="middle"
              fontSize="1.8"
              fill="#122131"
            >
              {r.id + 1}
            </text>
          </g>
        ))}
        {vaultOpen(world) && (
          <path
            d="M 0 -1.1 L 1 0 L 0 1.1 L -1 0 Z"
            transform={`translate(${world.core.x} ${world.core.z})`}
            fill="#b397ee"
          />
        )}
        {world.enemies.map((e) => (
          <circle key={e.id} cx={e.x} cy={e.z} r=".55" fill="#ed8b78" />
        ))}
        {world.players.map((p) => (
          <g
            key={p.id}
            transform={`translate(${p.x} ${p.z}) rotate(${(-p.angle * 180) / Math.PI + 180})`}
          >
            <path
              d="M0 -1.2 L.85 .8 L0 .45 L-.85 .8Z"
              fill={p.health > 0 ? COLORS[p.color] : "#69798a"}
              stroke={p.id === selfId ? "#ffffff" : "none"}
              strokeWidth=".18"
            />
          </g>
        ))}
      </svg>
      <p>
        <i className="map-relay" />
        RELAY
        <i className="map-enemy" />
        DRONE
        <i className="map-exit" />
        EXFIL
      </p>
    </div>
  );
}
function GameHUD({
  world,
  selfId,
  room,
  onPause,
  onFullscreen,
  soundOn,
  onSound,
}: {
  world: World;
  selfId: string;
  room: string | null;
  onPause: () => void;
  onFullscreen: () => void;
  soundOn: boolean;
  onSound: () => void;
}) {
  const self = world.players.find((p) => p.id === selfId) ?? world.players[0],
    done = world.relays.filter((r) => r.done).length,
    remaining = MISSION_SECONDS - world.time,
    hint = interactionHint(world, selfId);
  const carrier = world.players.find((p) => p.id === world.core.carrier),
    objective =
      done < 3
        ? "DISABLE SECURITY"
        : !carrier
          ? "SEIZE THE VAULT CORE"
          : "REACH EXTRACTION";
  return (
    <div className="game-hud">
      <header className="hud-top">
        <Logo small />
        <div className="objective-banner">
          <span>PRIMARY OBJECTIVE</span>
          <strong>{objective}</strong>
          <div>
            {[0, 1, 2].map((r) => (
              <i key={r} className={done > r ? "done" : ""} />
            ))}
            <small>{done}/3 RELAYS</small>
          </div>
        </div>
        <div className="hud-timer">
          <span>LOCKDOWN IN</span>
          <strong className={remaining < 30 ? "urgent" : ""}>
            <Clock3 size={17} />
            {formatTime(remaining)}
          </strong>
        </div>
        <button
          className="icon-button"
          aria-label="Pause menu"
          onClick={onPause}
        >
          <Pause size={17} />
        </button>
      </header>
      <div className="hud-left">
        <span className="mission-mode">
          <span className="live-indicator" />
          {room ? "ROOM " + room : "SOLO OPERATION"}
        </span>
        <div className="threat-readout"><span>{DIFFICULTIES[world.difficulty].name}</span><b>SECURITY ALERT {Math.min(5, 1 + done + (carrier ? 1 : 0))}</b><div>{[0,1,2,3,4].map((n) => <i key={n} className={n < 1 + done + (carrier ? 1 : 0) ? "lit" : ""}/>)}</div></div>
        <div className="objective-list">
          <span>THE CONTRACT</span>
          <p className={done === 3 ? "complete" : "active"}>
            {done === 3 ? <Check size={13} /> : <Target size={13} />}DISABLE 3
            RELAYS<b>{done}/3</b>
          </p>
          <p className={carrier ? "complete" : done === 3 ? "active" : ""}>
            {carrier ? <Check size={13} /> : <Gem size={13} />}SEIZE THE CORE
          </p>
          <p className={carrier ? "active" : ""}>
            <DoorOpen size={13} />
            REACH EXTRACTION
          </p>
          {carrier && (
            <small>
              CORE CARRIER:{" "}
              {carrier.id === selfId ? "YOU" : carrier.name.toUpperCase()}
            </small>
          )}
        </div>
        <div className="squad-hud">
          {world.players.map((p) => (
            <div
              key={p.id}
              style={{ "--agent": COLORS[p.color] } as React.CSSProperties}
            >
              <span className="squad-icon">
                <Crosshair size={13} />
              </span>
              <strong>
                {p.name}
                {p.id === selfId && <small> YOU</small>}
              </strong>
              <span className={p.health === 0 ? "downed" : ""}>
                {p.health === 0 ? "DOWN" : Math.ceil(p.health)}
              </span>
            </div>
          ))}
        </div>
      </div>
      {world.hazards.some((h) => !h.hit && Math.hypot(h.x - self.x, h.z - self.z) < h.radius + 1) && <div className="strike-warning"><Target size={17}/><strong>SECURITY STRIKE</strong><span>MOVE OUT OF THE RED ZONE</span></div>}
      <div className="hud-right">
        <MiniMap world={world} selfId={selfId} />
        <div className="hud-tools">
          <button
            className="icon-button"
            aria-label={soundOn ? "Mute sounds" : "Enable sounds"}
            onClick={onSound}
          >
            {soundOn ? <Volume2 size={15} /> : <VolumeX size={15} />}
          </button>
          <button
            className="icon-button"
            aria-label="Toggle fullscreen"
            onClick={onFullscreen}
          >
            <Expand size={15} />
          </button>
          <span>
            {world.kills} <Crosshair size={12} />
          </span>
        </div>
      </div>
      <div className={`health-panel ${self.health < 30 ? "critical" : ""}`}>
        <span className="health-name">
          <Crosshair size={13} />
          {self.name.toUpperCase()}
          <small>{self.health <= 0 ? "DOWNED" : "FIELD OPERATIVE"}</small>
        </span>
        <div className="health-row">
          <Heart size={16} />
          <div className="health-track">
            <i style={{ width: `${self.health}%` }} />
          </div>
          <strong>{Math.ceil(self.health)}</strong>
        </div>
        <div className="shield-row">
          <Shield size={14} />
          <div className="shield-track">
            <i style={{ width: `${self.shield * 2}%` }} />
          </div>
          <strong>{Math.ceil(self.shield)}</strong>
        </div>
      </div>
      <div className="weapon-panel">
        <span>VX-14 PULSE CARBINE</span>
        <div>
          <strong>{self.ammo.toString().padStart(2, "0")}</strong>
          <i>/ ∞</i>
          <svg className="weapon-silhouette" viewBox="0 0 100 45" aria-hidden="true"><path d="M3 14h22V8h25l4 6h29v5h14v6H78l-5 6H56l-4 13H41l2-15H26l-8 9H7l10-17H3z" fill="currentColor"/><path d="M30 10h15v3H30zM57 17h18v3H57z" fill="#0c2536"/></svg>
        </div>
        <p>
          {self.reload > 0
            ? "RELOADING…"
            : self.ammo < 4
              ? "LOW MAGAZINE · PRESS R"
              : "HOLD LEFT CLICK TO FIRE"}
        </p>
        <div className="reload-track">
          <i
            style={{
              width: `${self.reload > 0 ? (1 - self.reload / 1.2) * 100 : (self.ammo / MAGAZINE) * 100}%`,
            }}
          />
        </div>
      </div>
      <div className="dash-hud">
        <span>
          <kbd>SPACE</kbd>
          <Zap size={14} />
          DASH
        </span>
        <div>
          <i style={{ width: `${(1 - self.dashCooldown / 2.4) * 100}%` }} />
        </div>
        <small>
          {self.dashCooldown > 0 ? self.dashCooldown.toFixed(1) + "s" : "READY"}
        </small>
      </div>
      {self.health <= 0 && world.status === "playing" ? (
        <div className="interaction-prompt down">
          <Heart size={17} />
          <strong>OPERATIVE DOWN</strong>
          <p>A crewmate can hold E near you to revive.</p>
        </div>
      ) : (
        hint && (
          <div className="interaction-prompt">
            {hint.key && <kbd>{hint.key}</kbd>}
            <strong>{hint.text}</strong>
            {hint.progress > 0 && (
              <div>
                <i
                  style={{ width: `${Math.min(100, hint.progress * 100)}%` }}
                />
              </div>
            )}
          </div>
        )
      )}
      <div className="desktop-controls">
        <span>
          <kbd>W A S D</kbd>MOVE
        </span>
        <span>
          <MousePointer2 size={12} />
          AIM & FIRE
        </span>
        <span>
          <kbd>E</kbd>HOLD TO HACK / REVIVE
        </span>
        <span>
          <kbd>R</kbd>RELOAD
        </span>
        <span>
          <kbd>ESC</kbd>MENU
        </span>
      </div>
    </div>
  );
}

function Stick({
  kind,
  runtime,
}: {
  kind: "move" | "aim";
  runtime: Runtime | null;
}) {
  const [knob, setKnob] = useState({ x: 0, y: 0 }),
    pointer = useRef<number | null>(null);
  const update = (e: ReactPointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect(),
      x = (e.clientX - r.left - r.width / 2) / 42,
      y = (e.clientY - r.top - r.height / 2) / 42,
      len = Math.max(1, Math.hypot(x, y));
    runtime?.controls.stick(kind, x / len, y / len);
    setKnob({ x: (x / len) * 32, y: (y / len) * 32 });
  };
  const end = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (pointer.current !== e.pointerId) return;
    pointer.current = null;
    runtime?.controls.stick(kind, 0, 0, false);
    setKnob({ x: 0, y: 0 });
  };
  return (
    <div
      className={`touch-stick ${kind}`}
      role="group"
      aria-label={kind === "move" ? "Drag to move" : "Drag to aim and fire"}
      onPointerDown={(e) => {
        if (pointer.current !== null) return;
        pointer.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        update(e);
      }}
      onPointerMove={(e) => {
        if (pointer.current === e.pointerId) update(e);
      }}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <span className="stick-ring" />
      <i style={{ transform: `translate(${knob.x}px,${knob.y}px)` }}>
        {kind === "move" ? <Crosshair size={24} /> : <Target size={24} />}
      </i>
      <small>{kind === "move" ? "MOVE" : "AIM + FIRE"}</small>
    </div>
  );
}
function TouchControls({ runtime }: { runtime: Runtime | null }) {
  const hold = (
    kind: "dash" | "interact" | "reload",
    down: boolean,
    e: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    e.preventDefault();
    if (down) e.currentTarget.setPointerCapture(e.pointerId);
    runtime?.controls.action(kind, down);
  };
  return (
    <div className="touch-controls">
      <Stick kind="move" runtime={runtime} />
      <div className="touch-actions">
        {(["interact", "dash", "reload"] as const).map((kind) => (
          <button
            key={kind}
            aria-label={
              kind === "interact" ? "Hold to hack, collect, or revive" : kind
            }
            onPointerDown={(e) => hold(kind, true, e)}
            onPointerUp={(e) => hold(kind, false, e)}
            onPointerCancel={(e) => hold(kind, false, e)}
          >
            {kind === "interact" ? (
              <LockKeyhole size={18} />
            ) : kind === "dash" ? (
              <Zap size={18} />
            ) : (
              <RotateCcw size={18} />
            )}
            <span>
              {kind === "interact" ? "ACT" : kind === "dash" ? "DASH" : "LOAD"}
            </span>
          </button>
        ))}
      </div>
      <Stick kind="aim" runtime={runtime} />
    </div>
  );
}
function Manual({ close, difficulty }: { close: () => void; difficulty: Difficulty }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="manual-panel"
      aria-labelledby="manual-title"
      onCancel={close}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <button
        className="icon-button close-dialog"
        onClick={close}
        aria-label="Close field manual"
      >
        <X size={20} />
      </button>
      <span className="eyebrow">CLASSIFIED · FIELD MANUAL</span>
      <h2 id="manual-title">
        THE PLAN IS SIMPLE.
        <br />
        <em>THE DRONES AREN’T.</em>
      </h2>
      <MissionBrief difficulty={difficulty} />
      <div className="control-table">
        {[
          ["WASD / ARROWS", "Move through the arena"],
          ["MOUSE + LEFT CLICK", "Aim and hold to shoot"],
          ["SPACE", "Dash through danger; brief damage protection"],
          [
            "HOLD E",
            "Hack relays, collect the core, or revive a downed crewmate",
          ],
          ["R", "Reload your 14-round magazine; reserve ammo is unlimited"],
          ["ESC / M / F", "Menu / mute / fullscreen"],
        ].map(([key, text]) => (
          <div key={key}>
            <kbd>{key}</kbd>
            <span>{text}</span>
          </div>
        ))}
      </div>
      <p className="manual-note">
        Phones use the left stick to move and the right stick to aim and fire.
        ACT replaces E. Gamepads use left/right sticks, RT to fire, A to dash, X
        to reload, and Y to interact.
      </p>
      <p className="manual-note">
        Shields recharge after 4.5 seconds without taking damage. Green medkits
        restore health. Walls and crates block shots. Friendly fire is off. The
        mission ends if the whole crew goes down or the four-minute lockdown
        expires. Hacking stops while moving or under fire, and decays when abandoned. Clear nearby enemies to hack and extract. Red floor marks warn of an incoming security strike: dash away before impact. The core triggers a final security surge.
      </p>
      <button className="button primary full" onClick={close}>
        I’M READY. LET’S GET LOUD.
        <ArrowRight size={16} />
      </button>
    </dialog>
  );
}

class GameBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) { console.error("Game interface stopped", error.message); }
  render() {
    return this.state.failed ? <div className="fatal-recovery"><Logo/><h1>CONNECTION LOST.<br/><em>CREW STILL OUT THERE.</em></h1><p>The interface hit an unexpected problem. Reload to reconnect to your mission.</p><button className="button primary" onClick={() => location.reload()}>RELOAD & REJOIN <RotateCcw size={17}/></button><button className="button secondary" onClick={() => { saveSeat(null); location.reload(); }}>JOIN A FRESH ROOM</button></div> : this.props.children;
  }
}
createRoot(document.getElementById("root")!).render(<GameBoundary><App /></GameBoundary>);
