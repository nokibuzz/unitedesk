export interface DocumentSpace { key: string; name: string; url: string }
export interface DocumentPage { id: string; spaceKey: string; title: string; url: string; parentId: string | null }
export interface DocumentSnapshot { source: 'confluence'; fetchedAt: string; spaces: DocumentSpace[]; pages: DocumentPage[] }
export interface DocumentSearchHit { id: string; title: string; spaceKey: string; spaceName: string; type: 'page' | 'blogpost'; excerpt: string | null; url: string }
export interface DocumentSearch { source: 'confluence'; query: string; results: DocumentSearchHit[]; searchUrl: string }
export interface DocumentContent { source: 'confluence'; id: string; title: string; spaceKey: string; url: string; html: string; version: number; updatedAt: string | null }
export interface DocumentationAdapter {
  source: DocumentSnapshot['source'];
  load(): Promise<DocumentSnapshot>;
  search(query: string): Promise<DocumentSearch>;
  getPage(id: string): Promise<DocumentContent>;
}
