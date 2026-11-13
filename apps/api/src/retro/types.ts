export type RetroPhase = 'collect' | 'present' | 'vote' | 'discuss' | 'closed';
export interface RetroColumn { id: string; name: string; color: string }
export interface RetroSettings { columns: RetroColumn[]; votesPerPerson: number }
export interface RetroMember { id: string; name: string; finished: boolean; online: boolean; host: boolean }
export interface RetroCard { id: string; columnId: string; text: string; authorId: string; createdAt: string }
export interface RetroGroup { id: string; title: string; cardIds: string[]; votes: number; notes: string }
export interface RetroAction { id: string; sessionCode: string; groupId: string; text: string; assigneeId: string | null; assigneeName: string | null; dueDate: string | null; createdAt: string; completedAt: string | null }
export interface RetroSessionView {
  code: string; title: string; scheduledAt: string; createdAt: string; phase: RetroPhase; you: string; host: boolean;
  columns: RetroColumn[]; votesPerPerson: number; members: RetroMember[]; cards: RetroCard[]; groups: RetroGroup[];
  votesUsed: number; myVotes: Record<string, number>; focusId: string | null; readyToPresent: boolean; actions: RetroAction[];
}
export interface RetroSummary { code: string; title: string; scheduledAt: string; phase: RetroPhase; memberCount: number; host: boolean }
