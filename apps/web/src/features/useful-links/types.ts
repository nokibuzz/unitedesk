export interface UsefulLink {
  id: string;
  label: string;
  url: string;
  description: string;
  aliases: string[];
  iconUrl: string | null;
}

export const usefulLinksUpdated = 'unitedesk:useful-links-updated';

export async function loadUsefulLinks(): Promise<UsefulLink[]> {
  const response = await fetch('/api/useful-links');
  const body = await response.json() as { links?: UsefulLink[]; error?: string };
  if (!response.ok) throw new Error(body.error || 'Could not load useful links');
  return body.links || [];
}
