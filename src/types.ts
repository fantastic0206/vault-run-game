export type Move = "loot" | "steal" | "guard";
export type Phase = "lobby" | "choosing" | "reveal" | "finished";
export interface PublicPlayer {
  id: string;
  name: string;
  avatar: number;
  score: number;
  online: boolean;
  left: boolean;
  locked: boolean;
  ready: boolean;
}
export interface RoundResult {
  round: number;
  pot: number;
  title: string;
  headline: string;
  description: string;
  players: {
    id: string;
    name: string;
    avatar: number;
    move: Move | "skip";
    delta: number;
    score: number;
  }[];
}
export interface Snapshot {
  code: string;
  version: number;
  gameId: string;
  phase: Phase;
  hostId: string;
  selfId: string;
  players: PublicPlayer[];
  round: number;
  totalRounds: number;
  pot: number;
  vaultName: string;
  deadline: number | null;
  serverTime: number;
  ownMove: Move | null;
  history: RoundResult[];
}
export interface Session {
  code: string;
  token: string;
  playerId: string;
}

export const AVATARS = ["🦊", "🐸", "🐼", "🐯", "🐙", "🐨", "🐰", "🦉"];
export const MOVE_INFO = {
  loot: {
    title: "Loot",
    label: "Play it smart",
    summary: "Split the vault with the other looters.",
    detail: "A lone thief takes your share unless someone guards.",
    payoff: "A share of the vault",
    color: "lime",
  },
  steal: {
    title: "Steal",
    label: "Risk it all",
    summary: "Be the only thief. Take the whole vault.",
    detail: "A guard or another thief? You lose 3 gold instead.",
    payoff: "The whole vault, or −3",
    color: "peach",
  },
  guard: {
    title: "Guard",
    label: "Read the room",
    summary: "Catch a thief and earn 6 gold.",
    detail: "Block every thief. If nobody steals, earn 2 gold.",
    payoff: "6 gold, or a quiet 2",
    color: "lavender",
  },
} as const;
