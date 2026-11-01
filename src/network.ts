import type { Input, Room, Session, World } from "./game/types";
import { PROTOCOL } from "./game/types";
import { sanitizeInput, validRoom } from "./game/validate";
export class NetworkError extends Error {
  constructor(
    message: string,
    public status = 0,
  ) {
    super(message);
  }
}
export async function roomApi(body: Record<string, unknown>, token?: string) {
  let response: Response;
  try {
    response = await fetch("/api/room", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
      cache: "no-store",
    });
  } catch {
    throw new NetworkError(
      "Could not reach the crew. Check your connection and try again.",
    );
  }
  const data = await response
    .json()
    .catch(() => ({ error: "The co-op server is unavailable." }));
  if (!response.ok) throw new NetworkError(data.error, response.status);
  if (!validRoom(data.room)) throw new NetworkError("The game server has updated. Refresh this page and rejoin the crew.", 409);
  return data as { room: Room; token?: string; id?: string };
}
interface Events {
  room: (room: Room, world?: World | null) => void;
  world: (gameId: string, world: unknown) => void;
  input: (gameId: string, id: string, input: Input, stream: string) => void;
  status: (live: boolean, error: string, terminal?: boolean) => void;
}
export class CrewLink {
  private socket: WebSocket | null = null;
  private stopped = false;
  private retry = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private heartbeat: ReturnType<typeof setInterval> | undefined;
  private room: Room | null = null;
  private lastPacket = 0;
  private terminal = false;
  live = false;
  constructor(
    private seat: Session,
    private events: Events,
    private options: { url?: string } = {},
  ) {
    this.connect();
  }
  private connect() {
    if (this.stopped) return;
    const url = this.options.url ?? `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/api/live`;
    const socket = new WebSocket(url);
    this.socket = socket;
    socket.onopen = () =>
      socket.send(
        JSON.stringify({
          type: "hello",
          protocol: PROTOCOL,
          code: this.seat.code,
          token: this.seat.token,
        }),
      );
    socket.onmessage = (event) => {
      if (this.stopped || this.socket !== socket) return;
      try {
        const message = JSON.parse(event.data);
        if (!message || typeof message !== "object") return;
        this.lastPacket = Date.now();
        if (message.type === "hello") {
          if (message.protocol !== PROTOCOL || !validRoom(message.room) || message.room.code !== this.seat.code || message.room.selfId !== this.seat.id) {
            this.terminal = true;
            this.events.status(false, "The game has updated. Refresh this page and rejoin the crew.", true);
            socket.close(4409, "Version mismatch");
            return;
          }
          this.live = true;
          this.retry = 0;
          this.room = message.room;
          this.events.status(true, "");
          this.events.room(message.room, message.world);
          clearInterval(this.heartbeat);
          this.heartbeat = setInterval(() => {
            if (Date.now() - this.lastPacket > 14000) socket.close(4000, "Heartbeat timed out");
            else this.send({ type: "ping" });
          }, 4000);
        } else if (message.type === "room" && this.live && validRoom(message.room) && message.room.code === this.seat.code && message.room.selfId === this.seat.id && (!this.room || message.room.version >= this.room.version)) {
          this.room = message.room;
          this.events.room(message.room);
        } else if (message.type === "world" && this.live && message.gameId === this.room?.gameId)
          this.events.world(message.gameId, message.world);
        else if (message.type === "input" && this.live && message.gameId === this.room?.gameId && typeof message.sender === "string") {
          const input = sanitizeInput(message.input);
          if (input && typeof message.stream === "string") this.events.input(message.gameId, message.sender, input, message.stream);
        } else if (message.type === "error") {
          this.terminal = message.terminal === true;
          this.events.status(this.terminal ? false : this.live, String(message.error), this.terminal);
        }
      } catch (error) {
        console.error("Crew packet rejected", error instanceof Error ? error.message : "Invalid packet");
        this.events.status(this.live, "A crew update could not be read. Reconnecting…");
        socket.close(4000, "Resync required");
      }
    };
    socket.onerror = () =>
      this.events.status(false, "Live connection interrupted. Retrying…");
    socket.onclose = (event) => {
      this.live = false;
      clearInterval(this.heartbeat);
      if (this.stopped || this.terminal) return;
      if ([4401, 4409].includes(event.code)) {
        this.terminal = true;
        this.events.status(false, "Your crew session ended or the game updated. Refresh and join a fresh room.", true);
        return;
      }
      this.events.status(false, "Reconnecting to the crew…");
      this.timer = setTimeout(
        () => this.connect(),
        Math.min(3500, 350 * 2 ** this.retry++),
      );
    };
  }
  input(gameId: string, input: Input) {
    this.send({ type: "input", gameId, input });
  }
  world(gameId: string, world: World) {
    this.send({ type: "world", gameId, world });
  }
  private send(packet: unknown) {
    if (
      this.live &&
      this.socket?.readyState === WebSocket.OPEN &&
      this.socket.bufferedAmount < 300000
    )
      this.socket.send(JSON.stringify(packet));
  }
  close() {
    this.stopped = true;
    clearTimeout(this.timer);
    clearInterval(this.heartbeat);
    this.socket?.close();
    this.live = false;
  }
}
