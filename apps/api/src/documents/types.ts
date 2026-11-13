export interface DocumentSpace { key: string; name: string; url: string }
export interface DocumentPage { id: string; spaceKey: string; title: string; url: string }
export interface DocumentSnapshot { source: 'confluence'; fetchedAt: string; spaces: DocumentSpace[]; pages: DocumentPage[] }
export interface DocumentationAdapter { source: DocumentSnapshot['source']; load(): Promise<DocumentSnapshot> }
