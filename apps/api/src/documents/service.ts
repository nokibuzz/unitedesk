import { confluenceAdapter } from './confluence.js';
import type { DocumentationAdapter, DocumentContent, DocumentSearch, DocumentSnapshot } from './types.js';

const adapters: Record<string, DocumentationAdapter> = { confluence: confluenceAdapter };

export async function getDocuments(): Promise<DocumentSnapshot> {
  return selectedAdapter().load();
}

export async function searchDocuments(query: string): Promise<DocumentSearch> { return selectedAdapter().search(query); }
export async function getDocumentPage(id: string): Promise<DocumentContent> { return selectedAdapter().getPage(id); }

function selectedAdapter(): DocumentationAdapter {
  const provider = process.env.DOCUMENTATION_PROVIDER?.trim() || 'confluence';
  const adapter = adapters[provider];
  if (!adapter) throw new Error('DOCUMENTATION_PROVIDER must be confluence');
  return adapter;
}
