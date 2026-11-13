export type DocumentSource = 'confluence' | 'github' | 'notion';
export interface DocumentSpace { key: string; name: string; url: string; source?: DocumentSource }
export interface DocumentPage { id: string; spaceKey: string; title: string; url: string; parentId: string | null; kind?: 'page' | 'folder'; source?: DocumentSource }
export interface DocumentSnapshot { source: DocumentSource | 'mixed'; sources?: DocumentSource[]; warnings?: string[]; fetchedAt: string; spaces: DocumentSpace[]; pages: DocumentPage[] }
export interface DocumentSearchHit { id: string; title: string; spaceKey: string; spaceName: string; type: 'page' | 'blogpost'; excerpt: string | null; url: string; source?: DocumentSource }
export interface DocumentSearch { source: DocumentSource | 'mixed'; query: string; results: DocumentSearchHit[]; searchUrl: string | null; warnings?: string[] }
export interface DocumentContent { source: DocumentSource; id: string; title: string; spaceKey: string; url: string; html: string; version: number; updatedAt: string | null }
export interface DocumentationAdapter {
  source: DocumentSource;
  load(): Promise<DocumentSnapshot>;
  search(query: string): Promise<DocumentSearch>;
  getPage(id: string): Promise<DocumentContent>;
}
