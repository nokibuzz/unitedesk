import { confluenceAdapter } from './confluence.js';
import type { DocumentationAdapter, DocumentSnapshot } from './types.js';

const adapters: Record<string, DocumentationAdapter> = { confluence: confluenceAdapter };

export async function getDocuments(): Promise<DocumentSnapshot> {
  const provider = process.env.DOCUMENTATION_PROVIDER?.trim() || 'confluence';
  const adapter = adapters[provider];
  if (!adapter) throw new Error('DOCUMENTATION_PROVIDER must be confluence');
  return adapter.load();
}
