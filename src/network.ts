import type { Input, Room, Session, World } from "./game/types";
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
  return data as { room: Room; token?: string; id?: string };
}
interface Events {
  room: (room: Room, world?: World | null) => void;
  world: (world: World) => void;
  input: (id: string, input: Input) => void;
  status: (live: boolean, error: string) => void;
}
export class CrewLink {
  private socket: WebSocket | null = null;
  private stopped = false;
  private retry = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  live = false;
  constructor(
    private seat: Session,
    private events: Events,
  ) {
    this.connect();
  }
  private connect() {
    if (this.stopped) return;
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${protocol}//${location.host}/api/live`);
    this.socket = socket;
    socket.onopen = () =>
      socket.send(
        JSON.stringify({
          type: "hello",
          code: this.seat.code,
          token: this.seat.token,
        }),
      );
    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === "hello") {
          this.live = true;
          this.retry = 0;
          this.events.status(true, "");
          this.events.room(message.room, message.world);
        } else if (message.type === "room") this.events.room(message.room);
        else if (message.type === "world") this.events.world(message.world);
        else if (message.type === "input")
          this.events.input(message.sender, message.input);
        else if (message.type === "error")
          this.events.status(this.live, String(message.error));
      } catch {
        /* Malformed packets do not alter gameplay. */
      }
    };
    socket.onerror = () =>
      this.events.status(false, "Live connection interrupted. Retrying…");
    socket.onclose = () => {
      this.live = false;
      if (this.stopped) return;
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
    this.socket?.close();
    this.live = false;
  }
}
