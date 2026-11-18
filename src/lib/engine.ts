import type { Clue, Player, Room, Visit } from './api';
import type { Ticket } from './rules';
import type { Fact } from '../practice/solver';

/** A chat line. In practice mode bots post clue claims, some of which are lies. */
export interface ChatMessage {
  id: number;
  from: string;
  to?: string; // set for private replies
  text: string;
  claim?: Fact & { lie: boolean };
  at: string;
}

export type Difficulty = 'easy' | 'medium' | 'hard';

/** Everything a game screen needs to render, whichever engine runs the game. */
export interface GameView {
  kind: 'online' | 'practice';
  room: Room;
  players: Player[];
  visits: Visit[];
  clues: Clue[]; // only the clues this player is entitled to
  me: Player;
  isHost: boolean;
  messages?: ChatMessage[];
  difficulty?: Difficulty;
}

export interface GameActions {
  useTicket(target: string, ticket: Ticket): Promise<{ result: string }>;
  submitGuesses(g: Record<string, number>): Promise<void>;
  ready(): Promise<void>;
  forceAdvance(): Promise<void>;
  rematch(): Promise<void>;
  leave(): void;
  revealGuesses(): Promise<{ player_id: string; target_player: string; value: number }[]>;
  /** called repeatedly once a phase deadline passes (online: server clock) */
  tick?(): void;
  /** practice only */
  ask?(botId: string): Promise<void>;
  changeSettings?(): void;
}
