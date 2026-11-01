import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  ArrowRight,
  Check,
  CheckCheck,
  ChevronRight,
  CircleHelp,
  Clock3,
  Coins,
  Copy,
  Crosshair,
  Crown,
  Gem,
  Hand,
  LockKeyhole,
  Radio,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Target,
  Trophy,
  Users,
  Vault,
  X,
} from "lucide-react";
import {
  AVATARS,
  MOVE_INFO,
  type Move,
  type RoundResult,
  type Snapshot,
} from "./types";
import { playSound } from "./sound";

const MOVES: Move[] = ["loot", "steal", "guard"];
const AGENTS = [
  "The Fox",
  "The Frog",
  "The Panda",
  "The Tiger",
  "The Octopus",
  "The Koala",
  "The Rabbit",
  "The Owl",
];
const VAULTS = ["Corner Bank", "Midnight Express", "Crown Vault"];

export function Portrait({
  avatar,
  className = "",
  children,
}: {
  avatar: number;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <span
      className={`portrait portrait-${avatar} ${className}`}
      style={
        {
          "--portrait-x": `${((avatar % 4) * 100) / 3}%`,
          "--portrait-y": avatar < 4 ? "13.3333%" : "80%",
          "--agent-y": avatar < 4 ? "0%" : "100%",
        } as CSSProperties
      }
      role="img"
      aria-label={AGENTS[avatar]}
    >
      {children}
    </span>
  );
}
function MoveIcon({ move, size = 24 }: { move: Move | "skip"; size?: number }) {
  return move === "loot" ? (
    <Gem size={size} />
  ) : move === "steal" ? (
    <Hand size={size} />
  ) : move === "guard" ? (
    <ShieldCheck size={size} />
  ) : (
    <Clock3 size={size} />
  );
}
function MoveArtwork({ move }: { move: Move }) {
  return <span className={`move-artwork artwork-${move}`} aria-hidden="true" />;
}
function MissionRoute({ round = 0 }: { round?: number }) {
  return (
    <div
      className="mission-route"
      aria-label="Three heists: 16, 24, and 32 gold"
    >
      {VAULTS.map((name, i) => (
        <div
          className={`route-stop ${round === i + 1 ? "current" : ""} ${round > i + 1 ? "complete" : ""}`}
          key={name}
        >
          <span className="route-number">
            {round > i + 1 ? <Check size={12} /> : `0${i + 1}`}
          </span>
          <div>
            <strong>{name}</strong>
            <span>
              <Coins size={10} /> {[16, 24, 32][i]} gold
            </span>
          </div>
          {i < 2 && <ChevronRight className="route-arrow" size={14} />}
        </div>
      ))}
    </div>
  );
}
function Timer({
  remaining,
  total = 35,
}: {
  remaining: number;
  total?: number;
}) {
  return (
    <div
      className={`timer ${remaining <= 10 ? "urgent" : ""}`}
      style={
        {
          "--timer-progress": `${Math.min(100, (remaining / total) * 100)}%`,
        } as CSSProperties
      }
      role="timer"
      aria-label={`${remaining} seconds remaining`}
    >
      <div>
        <strong>{remaining.toString().padStart(2, "0")}</strong>
        <span>SECONDS</span>
      </div>
    </div>
  );
}

export function Home({
  busy,
  error,
  onEnter,
}: {
  busy: boolean;
  error: string;
  onEnter: (
    type: "create" | "join",
    name: string,
    avatar: number,
    code: string,
  ) => void;
}) {
  const initialCode = new URLSearchParams(location.search).get("room") || "";
  const [mode, setMode] = useState<"create" | "join">(
    initialCode ? "join" : "create",
  );
  const [code, setCode] = useState(
    initialCode
      .toUpperCase()
      .replace(/[^A-Z2-9]/g, "")
      .slice(0, 6),
  );
  const [name, setName] = useState(() => {
    try {
      return localStorage.getItem("vault-run-name") || "";
    } catch {
      return "";
    }
  });
  const [avatar, setAvatar] = useState(0);
  return (
    <>
      <main className="home-main">
        <section className="hero">
          <div className="scene-image" />
          <div className="scene-shade" />
          <div className="floating-dust" aria-hidden="true" />
          <div className="hero-copy">
            <span className="eyebrow">
              <span className="live-dot" /> A MULTIPLAYER GAME OF BLUFF &
              BETRAYAL
            </span>
            <h1>
              ONE CREW.
              <br />
              <em>ZERO TRUST.</em>
            </h1>
            <p>
              The vault is open. Your friends are in.
              <br />
              Only one question: who’s taking the gold?
            </p>
            <div className="hero-badges">
              <span>
                <Users size={14} /> 2–8 players
              </span>
              <span>
                <Clock3 size={14} /> 3-minute heists
              </span>
              <span>
                <LockKeyhole size={13} /> No sign-ups
              </span>
            </div>
          </div>
          <div className="hero-bottom">
            <span className="classified">CLASSIFIED</span>
            <span>MAKE FRIENDS. TAKE GOLD. REPEAT.</span>
            <span className="hero-crosshair">
              <Crosshair size={21} />
            </span>
          </div>
        </section>
        <section className="entry-panel" aria-label="Create or join a game">
          <div className="panel-corner" aria-hidden="true" />
          <div className="entry-kicker">
            <Target size={14} />
            <span>CREW REGISTRATION</span>
            <span>01 / 03</span>
          </div>
          <div className="tabs" role="tablist" aria-label="Room options">
            <button
              id="create-tab"
              role="tab"
              aria-selected={mode === "create"}
              aria-controls="entry-form"
              className={mode === "create" ? "active" : ""}
              onClick={() => setMode("create")}
            >
              HOST A HEIST
            </button>
            <button
              id="join-tab"
              role="tab"
              aria-selected={mode === "join"}
              aria-controls="entry-form"
              className={mode === "join" ? "active" : ""}
              onClick={() => setMode("join")}
            >
              JOIN THE CREW
            </button>
          </div>
          <div className="entry-heading">
            <h2>
              {mode === "create" ? "BUILD YOUR CREW." : "YOU’RE IN ON THE JOB."}
            </h2>
            <p>
              {mode === "create"
                ? "Invite your friends. Keep your intentions to yourself."
                : "Enter the code. Bring your best poker face."}
            </p>
          </div>
          <form
            id="entry-form"
            role="tabpanel"
            aria-labelledby={mode === "create" ? "create-tab" : "join-tab"}
            onSubmit={(e) => {
              e.preventDefault();
              try {
                localStorage.setItem("vault-run-name", name);
              } catch {}
              onEnter(mode, name, avatar, code);
            }}
          >
            <label className="field-label" htmlFor="nickname">
              YOUR CODENAME <span>18 characters max</span>
            </label>
            <input
              id="nickname"
              name="nickname"
              autoComplete="nickname"
              placeholder="Enter your alias…"
              value={name}
              maxLength={18}
              required
              onChange={(e) => setName(e.target.value)}
              disabled={busy}
            />
            <fieldset className="avatar-field">
              <legend className="field-label">
                CHOOSE YOUR OPERATIVE <span>{AGENTS[avatar]}</span>
              </legend>
              <div className="avatar-picker">
                {AVATARS.map((a, i) => (
                  <button
                    key={a}
                    type="button"
                    className={avatar === i ? "selected" : ""}
                    aria-label={`Avatar ${AGENTS[i]}`}
                    aria-pressed={avatar === i}
                    onClick={() => {
                      setAvatar(i);
                      playSound("select");
                    }}
                  >
                    <Portrait avatar={i} />
                    {avatar === i && (
                      <span className="agent-check">
                        <Check size={10} />
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </fieldset>
            {mode === "join" && (
              <div className="code-field">
                <label className="field-label" htmlFor="room-code">
                  ACCESS CODE
                </label>
                <input
                  id="room-code"
                  name="room-code"
                  className="code-input"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  placeholder="ABC123"
                  minLength={6}
                  maxLength={6}
                  required
                  value={code}
                  onChange={(e) =>
                    setCode(
                      e.target.value.toUpperCase().replace(/[^A-Z2-9]/g, ""),
                    )
                  }
                />
              </div>
            )}
            {error && (
              <div className="error-message" role="alert">
                {error}
              </div>
            )}
            <button
              className="button primary full"
              type="submit"
              disabled={
                busy || !name.trim() || (mode === "join" && code.length !== 6)
              }
            >
              {busy ? (
                <>
                  <span className="spinner" /> CONNECTING TO THE CREW…
                </>
              ) : (
                <>
                  {mode === "create" ? "CREATE A ROOM" : "JOIN THE HEIST"}
                  <ArrowRight size={18} />
                </>
              )}
            </button>
            <p className="form-footnote">
              <ShieldCheck size={12} /> Private rooms. Real friends. Fake gold.
            </p>
          </form>
        </section>
      </main>
      <section className="how-strip" aria-label="How to play">
        <div className="strip-intro">
          <span className="eyebrow">THE RULES OF ENGAGEMENT</span>
          <h3>
            THREE MOVES.
            <br />
            <em>ONE GETAWAY.</em>
          </h3>
        </div>
        {MOVES.map((move, i) => (
          <div className={`how-step ${move}`} key={move}>
            <span className="step-number">0{i + 1}</span>
            <MoveArtwork move={move} />
            <div>
              <h4>{MOVE_INFO[move].title}</h4>
              <p>{MOVE_INFO[move].summary}</p>
            </div>
          </div>
        ))}
      </section>
    </>
  );
}

export function Crew({
  room,
  onRemove,
}: {
  room: Snapshot;
  onRemove: (id: string) => void;
}) {
  const players = [...room.players].sort((a, b) =>
    room.phase === "lobby" ? 0 : b.score - a.score,
  );
  return (
    <aside className="crew-panel">
      <div className="crew-heading">
        <div>
          <Users size={16} />
          <h3>THE CREW</h3>
        </div>
        <span>
          {room.players
            .filter((p) => !p.left)
            .length.toString()
            .padStart(2, "0")}
          <small> / 08</small>
        </span>
      </div>
      <div className="crew-subheading">
        {room.phase === "lobby" ? "TRUST AT YOUR OWN RISK" : "FOLLOW THE GOLD"}
      </div>
      <div className="crew-list">
        {players.map((p, index) => (
          <div
            className={`crew-player ${p.id === room.selfId ? "is-you" : ""} ${p.left ? "has-left" : ""}`}
            key={p.id}
          >
            <span className="rank-number">
              {String(index + 1).padStart(2, "0")}
            </span>
            <Portrait avatar={p.avatar}>
              <span className={`presence ${p.online ? "online" : ""}`} />
            </Portrait>
            <div className="player-name">
              <strong>
                {p.name}
                {p.id === room.hostId && <Crown size={12} />}
              </strong>
              <span>
                {p.left
                  ? "LEFT THE CREW"
                  : !p.online
                    ? "RECONNECTING"
                    : room.phase === "choosing"
                      ? p.locked
                        ? "MOVE SEALED"
                        : "MAKING A MOVE"
                      : room.phase === "reveal" && p.ready
                        ? "READY TO GO"
                        : p.id === room.selfId
                          ? "YOU · OPERATIVE"
                          : p.id === room.hostId
                            ? "THE MASTERMIND"
                            : "CREW OPERATIVE"}
              </span>
            </div>
            {room.phase === "lobby" ? (
              p.online ? (
                <span className="crew-ready">
                  <Check size={13} />
                </span>
              ) : null
            ) : (
              <span className="player-score">
                {room.phase === "choosing" && p.locked ? (
                  <LockKeyhole size={15} />
                ) : (
                  <>
                    <b>{p.score}</b>
                    <Coins size={12} />
                  </>
                )}
              </span>
            )}
            {room.phase === "lobby" &&
              !p.online &&
              room.selfId === room.hostId &&
              p.id !== room.selfId && (
                <button
                  className="icon-button"
                  title={`Remove disconnected player ${p.name}`}
                  aria-label={`Remove disconnected player ${p.name}`}
                  onClick={() => onRemove(p.id)}
                >
                  <X size={13} />
                </button>
              )}
          </div>
        ))}
      </div>
      {room.phase === "lobby" && (
        <div className="open-seats">
          {Array.from(
            { length: Math.min(3, 8 - room.players.length) },
            (_, i) => (
              <div className="empty-seat" key={i}>
                <span className="empty-seat-icon">
                  <Users size={18} />
                </span>
                <div>
                  <strong>
                    OPERATIVE{" "}
                    {String(room.players.length + i + 1).padStart(2, "0")}
                  </strong>
                  <p>Waiting for an accomplice</p>
                </div>
                <span className="empty-plus">+</span>
              </div>
            ),
          )}
        </div>
      )}
      <div className="crew-bottom">
        <span className="eyebrow">MISSION PARAMETERS</span>
        <div className="parameter-row">
          <span>
            <Users size={13} /> Crew size
          </span>
          <strong>2–8 players</strong>
        </div>
        <div className="parameter-row">
          <span>
            <Clock3 size={13} /> Time to decide
          </span>
          <strong>35 seconds</strong>
        </div>
        <div className="parameter-row">
          <span>
            <Coins size={13} /> Vaults
          </span>
          <strong>16 · 24 · 32</strong>
        </div>
        <div className="crew-stamp">
          <Vault size={25} />
          <p>
            GOOD COMPANY.
            <br />
            <em>BAD INTENTIONS.</em>
          </p>
        </div>
      </div>
    </aside>
  );
}

export function Lobby({
  room,
  busy,
  onStart,
  onCopy,
}: {
  room: Snapshot;
  busy: boolean;
  onStart: () => void;
  onCopy: () => void;
}) {
  const host = room.hostId === room.selfId;
  const online = room.players.filter((p) => p.online).length;
  return (
    <section className="stage lobby-stage">
      <div className="lobby-scene">
        <div className="scene-image" />
        <div className="scene-shade" />
        <div className="floating-dust" aria-hidden="true" />
        <div className="scene-topline">
          <span className="status-pill">
            <span className="live-dot" /> PREPARING THE HEIST
          </span>
          <span className="scene-coordinate">SECTOR 07 / AFTER HOURS</span>
        </div>
        <div className="lobby-scene-copy">
          <span className="eyebrow">YOUR NEXT BAD IDEA STARTS HERE</span>
          <h1>
            ASSEMBLE
            <br />
            <em>THE CREW.</em>
          </h1>
          <p>
            The vault won’t rob itself.
            <br />
            Invite your friends. Watch your back.
          </p>
        </div>
        <span className="security-stamp">
          <LockKeyhole size={12} /> ACCESS RESTRICTED
        </span>
        <div className="scene-reticle" aria-hidden="true">
          <Crosshair size={38} />
        </div>
      </div>
      <div className="lobby-controls">
        <div className="invite-ticket">
          <div className="invite-label">
            <Radio size={17} />
            <span>
              CREW ACCESS CODE<small>Share the code or send an invite.</small>
            </span>
          </div>
          <div className="code-digits" aria-label={`Room code ${room.code}`}>
            {room.code.split("").map((letter, i) => (
              <span key={i} aria-hidden="true">
                {letter}
              </span>
            ))}
          </div>
          <button className="button secondary ticket-button" onClick={onCopy}>
            <Copy size={15} />
            <span>COPY INVITE</span>
          </button>
        </div>
        <div className="plan-heading">
          <span className="eyebrow">
            <Target size={12} /> THE NIGHT’S PLAYBOOK
          </span>
          <span>3 HEISTS · MOST GOLD WINS</span>
        </div>
        <MissionRoute />
        <div className="lobby-moves">
          {MOVES.map((move) => (
            <div className={`mini-move ${move}`} key={move}>
              <MoveArtwork move={move} />
              <div>
                <h3>{MOVE_INFO[move].title}</h3>
                <small>
                  {move === "loot"
                    ? "Split the score"
                    : move === "steal"
                      ? "Take it all"
                      : "Catch a thief"}
                </small>
              </div>
              <MoveIcon move={move} size={14} />
            </div>
          ))}
        </div>
        <div className="lobby-start">
          <div>
            <span
              className={`waiting-signal ${online >= 2 ? "ready-signal" : ""}`}
            />
            <p>
              <strong>
                {online < 2
                  ? "WAITING FOR YOUR ACCOMPLICES"
                  : `${online} OPERATIVES. READY TO ROLL.`}
              </strong>
              <span>
                {online < 2
                  ? "Invite at least one friend to begin."
                  : host
                    ? "You call the shots. Start when everyone is in."
                    : `${room.players.find((p) => p.id === room.hostId)?.name || "The host"} will start the heist.`}
              </span>
            </p>
          </div>
          <button
            className="button primary launch-button"
            onClick={onStart}
            disabled={busy || !host || online < 2}
          >
            {busy ? (
              <span className="spinner" />
            ) : host ? (
              <>
                <LockKeyhole size={16} /> START THE HEIST{" "}
                <ArrowRight size={17} />
              </>
            ) : (
              <>
                <Clock3 size={17} /> WAITING FOR THE HOST
              </>
            )}
          </button>
        </div>
      </div>
    </section>
  );
}

export function Choosing({
  room,
  remaining,
  busy,
  onMove,
}: {
  room: Snapshot;
  remaining: number;
  busy: boolean;
  onMove: (move: Move) => void;
}) {
  const [selected, setSelected] = useState<Move | null>(null);
  useEffect(
    () => setSelected(room.ownMove),
    [room.round, room.gameId, room.ownMove],
  );
  const locked = !!room.ownMove;
  const lockedCount = room.players.filter((p) => p.locked).length;
  const self = room.players.find((p) => p.id === room.selfId)!;
  return (
    <section
      className={`stage choosing-stage ${locked ? "move-is-sealed" : ""}`}
    >
      <div className="game-hud">
        <div className="hud-phase">
          <span className="eyebrow">OPERATION IN PROGRESS</span>
          <strong>
            HEIST <span>0{room.round}</span> <small>/ 03</small>
          </strong>
        </div>
        <div className="hud-stash">
          <Coins size={18} />
          <div>
            <span>YOUR STASH</span>
            <strong>
              {self.score}
              <small> GOLD</small>
            </strong>
          </div>
        </div>
        <Timer remaining={remaining} />
      </div>
      <MissionRoute round={room.round} />
      <div className="vault-title">
        <div className="scene-image" />
        <div className="scene-shade" />
        <div>
          <span className="eyebrow">
            {room.round === 1
              ? "EVERY GREAT HEIST STARTS SMALL."
              : room.round === 2
                ? "MORE GOLD. LESS TRUST."
                : "ONE LAST JOB. MAKE IT COUNT."}
          </span>
          <h1>{room.vaultName}</h1>
          <p>
            {locked
              ? "Your move is sealed. Let them wonder."
              : "Three moves. One chance to read the room."}
          </p>
        </div>
        <div className="pot-badge">
          <span>THE SCORE</span>
          <strong>
            <Coins size={24} />
            {room.pot}
          </strong>
          <small>GOLD IN THE VAULT</small>
        </div>
      </div>
      <div className="hand-heading">
        <span className="eyebrow">
          {locked ? "YOUR MOVE IS LOCKED" : "CHOOSE YOUR PLAY"}
        </span>
        <span>
          <LockKeyhole size={11} /> ONLY YOU CAN SEE YOUR CHOICE
        </span>
      </div>
      <div
        className="move-grid"
        role="group"
        aria-label="Choose your secret move"
      >
        {MOVES.map((move, i) => {
          const info = MOVE_INFO[move];
          const chosen = (locked ? room.ownMove : selected) === move;
          return (
            <button
              className={`move-card ${move} ${chosen ? "chosen" : ""} ${locked && !chosen ? "faded" : ""}`}
              key={move}
              aria-pressed={chosen}
              disabled={busy || locked || remaining === 0}
              onClick={() => {
                setSelected(move);
                playSound("select");
              }}
            >
              <div className="move-top">
                <span>
                  0{i + 1} / {info.label.toUpperCase()}
                </span>
                <span className="choice-dot">
                  {chosen ? (
                    <Check size={12} />
                  ) : (
                    <MoveIcon move={move} size={12} />
                  )}
                </span>
              </div>
              <div className="card-illustration">
                <MoveArtwork move={move} />
                <span className="card-sigil">
                  <MoveIcon move={move} size={18} />
                </span>
                {locked && chosen && (
                  <span className="sealed-stamp">
                    <LockKeyhole size={11} /> SEALED
                  </span>
                )}
              </div>
              <div className="card-copy">
                <h2>{info.title}</h2>
                <p>{info.summary}</p>
                <span className="move-payoff">
                  <Coins size={12} /> {info.payoff}
                </span>
              </div>
              <div className="card-bottom">
                <span>
                  {chosen
                    ? locked
                      ? "MOVE LOCKED"
                      : "SELECTED"
                    : "SELECT THIS MOVE"}
                </span>
                {chosen ? <Check size={13} /> : <ChevronRight size={13} />}
              </div>
            </button>
          );
        })}
      </div>
      <div className="move-confirm">
        {locked ? (
          <div className="locked-message" role="status">
            <span className="locked-icon">
              <LockKeyhole size={20} />
            </span>
            <div>
              <strong>
                {MOVE_INFO[room.ownMove!].title.toUpperCase()} IS SEALED.
              </strong>
              <span>Keep your poker face. The crew is still plotting.</span>
            </div>
            <div className="seal-counter">
              <strong>
                {lockedCount}
                <small>/{room.players.length}</small>
              </strong>
              <span>SEALED</span>
            </div>
          </div>
        ) : (
          <>
            <div className="move-detail">
              <CircleHelp size={16} />
              <p>
                {selected
                  ? MOVE_INFO[selected].detail
                  : "Select a card, then lock it in. There’s no going back."}
              </p>
            </div>
            <button
              className="button primary"
              disabled={!selected || busy || remaining === 0}
              onClick={() => {
                if (selected) {
                  playSound("lock");
                  onMove(selected);
                }
              }}
            >
              {busy ? (
                <>
                  <span className="spinner" /> SEALING YOUR MOVE…
                </>
              ) : remaining === 0 ? (
                <>REVEALING THE CREW…</>
              ) : (
                <>
                  <LockKeyhole size={16} />
                  {selected
                    ? `LOCK IN ${MOVE_INFO[selected].title.toUpperCase()}`
                    : "SELECT YOUR MOVE"}
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </>
        )}
      </div>
      <div className="stage-footer">
        <span>
          <ShieldCheck size={12} /> Your move stays secret until the reveal.
        </span>
        <span>
          {lockedCount} / {room.players.length} OPERATIVES LOCKED IN
        </span>
      </div>
    </section>
  );
}

function ResultTable({
  result,
  selfId,
}: {
  result: RoundResult;
  selfId: string;
}) {
  return (
    <div className="result-table">
      <div className="result-table-head">
        <span>OPERATIVE</span>
        <span>THE MOVE</span>
        <span>THE TAKE</span>
      </div>
      {result.players.map((p) => (
        <div
          className={`result-row ${p.id === selfId ? "is-you" : ""}`}
          key={p.id}
        >
          <div className="result-player">
            <Portrait avatar={p.avatar} />
            <strong>
              {p.name}
              {p.id === selfId && <small>YOU</small>}
            </strong>
          </div>
          <span className={`move-chip ${p.move}`}>
            <MoveIcon move={p.move} size={13} />
            {p.move === "skip" ? "Timed out" : MOVE_INFO[p.move].title}
          </span>
          <span
            className={`gold-change ${p.delta > 0 ? "positive" : p.delta < 0 ? "negative" : ""}`}
          >
            {p.delta > 0 ? "+" : p.delta < 0 ? "−" : ""}
            {Math.abs(p.delta)} <Coins size={13} />
          </span>
        </div>
      ))}
    </div>
  );
}

export function Reveal({
  room,
  remaining,
  busy,
  onReady,
}: {
  room: Snapshot;
  remaining: number;
  busy: boolean;
  onReady: () => void;
}) {
  const result = room.history.at(-1)!;
  const ready = room.players.find((p) => p.id === room.selfId)?.ready;
  const selfResult = result.players.find((p) => p.id === room.selfId)!;
  return (
    <section className="stage reveal-stage">
      <div className="reveal-top">
        <span className="status-pill">
          <Sparkles size={12} /> ALL CARDS ON THE TABLE
        </span>
        <span className="eyebrow">HEIST 0{room.round} / 03</span>
      </div>
      <div className="reveal-heading">
        <div className={`reveal-symbol ${selfResult.delta < 0 ? "loss" : ""}`}>
          <span className="burst-rays" />
          <MoveIcon move={selfResult.move} size={34} />
        </div>
        <span className="eyebrow">
          {room.vaultName.toUpperCase()} · THE REVEAL
        </span>
        <h1>{result.headline}</h1>
        <p>{result.description}</p>
      </div>
      <div className="reveal-grid">
        {result.players.map((p, i) => (
          <div
            className={`reveal-card ${p.move} ${p.id === room.selfId ? "is-you" : ""}`}
            key={p.id}
            style={{ "--reveal-delay": `${i * 0.09}s` } as CSSProperties}
          >
            <div className="reveal-card-top">
              <Portrait avatar={p.avatar} />
              <strong>
                {p.name}
                <span>
                  {p.id === room.selfId ? "YOUR MOVE" : "CREW OPERATIVE"}
                </span>
              </strong>
            </div>
            <div className="revealed-art">
              {p.move === "skip" ? (
                <Clock3 size={38} />
              ) : (
                <MoveArtwork move={p.move} />
              )}
            </div>
            <span className="reveal-role">
              {p.move === "skip"
                ? "TIMED OUT"
                : MOVE_INFO[p.move].title.toUpperCase()}
            </span>
            <div className={`reveal-take ${p.delta < 0 ? "negative" : ""}`}>
              <Coins size={17} />
              <strong>
                {p.delta > 0 ? "+" : p.delta < 0 ? "−" : ""}
                {Math.abs(p.delta)}
              </strong>
              <span>GOLD</span>
            </div>
            <div className="reveal-total">
              STASH TOTAL <strong>{p.score}</strong>
            </div>
          </div>
        ))}
      </div>
      <div className="reveal-next">
        <div className="next-countdown">
          <Clock3 size={16} />
          <p>
            {room.round === 3 ? "Final scores" : "Next heist"} in{" "}
            <strong>{remaining}s</strong>
            <span>Or when the whole crew is ready.</span>
          </p>
        </div>
        <button
          className="button primary"
          disabled={busy || ready}
          onClick={onReady}
        >
          {ready ? (
            <>
              <Check size={17} /> YOU’RE READY
            </>
          ) : room.round === 3 ? (
            <>
              SEE THE FINAL SCORES <Trophy size={17} />
            </>
          ) : (
            <>
              READY FOR THE NEXT HEIST <ArrowRight size={17} />
            </>
          )}
        </button>
      </div>
    </section>
  );
}

export function Finished({
  room,
  busy,
  onRematch,
  onCopy,
}: {
  room: Snapshot;
  busy: boolean;
  onRematch: () => void;
  onCopy: () => void;
}) {
  const ranked = [...room.players].sort((a, b) => b.score - a.score);
  const winners = ranked.filter((p) => p.score === ranked[0].score);
  return (
    <section className="stage finished-stage">
      <div className="winner-block">
        <div className="scene-image" />
        <div className="scene-shade" />
        <div className="confetti" aria-hidden="true">
          {Array.from({ length: 18 }, (_, i) => (
            <i key={i} style={{ "--particle": i } as CSSProperties} />
          ))}
        </div>
        <div className="winner-crown">
          <Trophy size={43} />
        </div>
        <span className="eyebrow">
          {winners.length > 1
            ? "HONOR AMONG THIEVES. APPARENTLY."
            : "THE MASTERMIND OF THE NIGHT"}
        </span>
        <div className="winner-portraits">
          {winners.map((p) => (
            <Portrait avatar={p.avatar} key={p.id} />
          ))}
        </div>
        <h1>
          {winners.length > 1 ? (
            "A SHARED GETAWAY."
          ) : (
            <>
              {winners[0].name}
              <br />
              <em>PULLED IT OFF.</em>
            </>
          )}
        </h1>
        <p>
          {winners.length > 1
            ? `${winners.map((p) => p.name).join(" & ")} share the win.`
            : "The vault is empty. Your friends are suspicious."}
        </p>
        <div className="winner-gold">
          <Coins size={24} />
          <strong>{ranked[0].score}</strong>
          <span>GOLD {winners.length > 1 ? "EACH" : "IN THE BAG"}</span>
        </div>
      </div>
      <div className="finish-content">
        <div className="leaderboard-label">
          <span className="eyebrow">THE FINAL HAUL</span>
          <span>THREE HEISTS. NO REGRETS.</span>
        </div>
        <div className="final-leaderboard">
          {ranked.map((p) => (
            <div
              className={`final-row ${p.score === ranked[0].score ? "winner" : ""}`}
              key={p.id}
            >
              <span className="final-rank">
                {p.score === ranked[0].score ? (
                  <Crown size={18} />
                ) : (
                  String(
                    ranked.findIndex((other) => other.score === p.score) + 1,
                  ).padStart(2, "0")
                )}
              </span>
              <Portrait avatar={p.avatar} />
              <strong>
                {p.name}
                {p.id === room.selfId && <small>YOU</small>}
              </strong>
              <span>
                {p.score}
                <Coins size={16} />
              </span>
            </div>
          ))}
        </div>
        <div className="finish-actions">
          <button
            className="button primary"
            disabled={busy || room.hostId !== room.selfId}
            onClick={onRematch}
          >
            <RotateCcw size={17} />
            {room.hostId === room.selfId
              ? "ONE MORE JOB?"
              : "WAITING FOR THE HOST TO PLAY AGAIN"}
          </button>
          <button className="button secondary" onClick={onCopy}>
            <Copy size={16} /> COPY INVITE
          </button>
        </div>
        <div className="game-recap">
          <span className="eyebrow">THE EVIDENCE FILE</span>
          {room.history.map((result) => (
            <details key={result.round}>
              <summary>
                <span>
                  <b>0{result.round}</b>
                  <strong>{result.title}</strong>
                </span>
                <ChevronRight size={17} />
              </summary>
              <p>{result.description}</p>
              <ResultTable result={result} selfId={room.selfId} />
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export function Rules({ close }: { close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = old;
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="rules-dialog"
      aria-labelledby="rules-title"
      onCancel={close}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <button
        className="icon-button close-dialog"
        onClick={close}
        aria-label="Close rules"
      >
        <X />
      </button>
      <span className="eyebrow">
        <LockKeyhole size={12} /> EYES ONLY · THE PLAYBOOK
      </span>
      <h2 id="rules-title">
        GET IN.
        <br />
        <em>GET THE GOLD.</em>
      </h2>
      <p className="rules-intro">2–8 friends. 3 heists. The most gold wins.</p>
      <div className="rules-list">
        {MOVES.map((move) => (
          <div className={`rule-item ${move}`} key={move}>
            <MoveArtwork move={move} />
            <div>
              <h3>{MOVE_INFO[move].title}</h3>
              <p>
                {MOVE_INFO[move].summary} {MOVE_INFO[move].detail}
              </p>
            </div>
          </div>
        ))}
      </div>
      <div className="rules-note">
        <Clock3 size={20} />
        <p>
          You have <strong>35 seconds</strong> to choose and lock in. Locked
          moves cannot change. Everyone reveals together. No move means 0 gold
          for that heist.
        </p>
      </div>
      <p className="small muted">
        The vaults hold 16, 24, then 32 gold. Loot shares round down; leftovers
        stay behind. Scores can go below zero. Tied leaders share the win.
        Reveals advance after 16 seconds, or sooner when everyone is ready.
      </p>
      <button className="button primary full" onClick={close}>
        I’M IN. TRUST NO ONE. <ArrowRight size={17} />
      </button>
    </dialog>
  );
}
