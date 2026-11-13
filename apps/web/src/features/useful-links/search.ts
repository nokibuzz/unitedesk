import type { UsefulLink } from './types';

const normalize = (value: string) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const words = (value: string) => normalize(value).split(/[^a-z0-9]+/).filter(Boolean);

function typoDistance(a: string, b: string): number {
  const limit = a.length >= 7 ? 2 : 1;
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  const table = Array.from({ length: a.length + 1 }, () => Array<number>(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) table[i][0] = i;
  for (let j = 0; j <= b.length; j++) table[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      table[i][j] = Math.min(table[i - 1][j] + 1, table[i][j - 1] + 1, table[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) table[i][j] = Math.min(table[i][j], table[i - 2][j - 2] + 1);
    }
  }
  return table[a.length][b.length];
}

function termScore(term: string, tokens: string[]): number {
  if (tokens.includes(term)) return 5;
  if (tokens.some((token) => token.startsWith(term))) return 4;
  if (tokens.some((token) => token.includes(term))) return 3;
  if (term.length >= 4 && tokens.some((token) => typoDistance(term, token) === 1)) return 2;
  if (term.length >= 7 && tokens.some((token) => typoDistance(term, token) === 2)) return 1;
  return 0;
}

export function searchUsefulLinks(links: UsefulLink[], query: string): UsefulLink[] {
  const terms = words(query);
  if (!terms.length) return links;
  return links.map((link, order) => {
    const title = words(link.label);
    const aliases = words(link.aliases.join(' '));
    const detail = words(`${link.description} ${decodeURIComponentSafely(link.url)}`);
    let score = 0;
    for (const term of terms) {
      const match = Math.max(termScore(term, title) * 4, termScore(term, aliases) * 3, termScore(term, detail));
      if (!match) return null;
      score += match;
    }
    if (normalize(link.label).includes(normalize(query.trim()))) score += 8;
    return { link, score, order };
  }).filter((result): result is { link: UsefulLink; score: number; order: number } => result !== null)
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .map(({ link }) => link);
}

function decodeURIComponentSafely(value: string): string {
  try { return decodeURIComponent(value); } catch { return value; }
}
