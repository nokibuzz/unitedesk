export const POKER_CARDS = ['0.5', '1', '2', '3', '5', '8', '13', '21', '?'] as const;
export type PokerCard = (typeof POKER_CARDS)[number];
export interface PokerTicket {
  key: string;
  summary: string;
  description: string;
  status: string;
  assignee: string | null;
  storyPoints: number | null;
  url: string;
  source: 'mock' | 'jira' | 'linear';
}
export interface PokerVote { value: PokerCard; devHours: number | null; qaHours: number | null }
export interface PokerMemberView { id: string; name: string; admin: boolean; online: boolean; voted: boolean; vote: PokerVote | null }
export interface PokerStats { count: number; unknown: number; average: number | null; median: string | null; unanimous: boolean; distribution: Array<{ value: PokerCard; count: number }>; devAverage: number | null; qaAverage: number | null }
export interface PokerRoomView {
  code: string; name: string; you: string; admin: boolean; advanced: boolean; revealed: boolean;
  ticket: PokerTicket | null; members: PokerMemberView[]; stats: PokerStats | null;
  estimate: string | null; published: boolean; revisit: boolean;
}
