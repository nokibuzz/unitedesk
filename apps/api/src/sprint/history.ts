import type { JiraHistory } from './types.js';

export function statusTimeline(created: string | undefined, histories: JiraHistory[]): Array<{ at: number; to: string; from: string }> {
  const changes = histories.flatMap((history) => history.items.filter((item) => item.field === 'status' && item.toString).map((item) => ({
    at: Date.parse(history.created), to: String(item.toString), from: String(item.fromString ?? ''),
  }))).filter((item) => Number.isFinite(item.at)).sort((a, b) => a.at - b.at);
  const start = created ? Date.parse(created) : NaN;
  if (Number.isFinite(start) && changes.length && changes[0].from) changes.unshift({ at: start, to: changes[0].from, from: '' });
  return changes;
}

export function enteredAt(currentStatus: string, created: string | undefined, histories: JiraHistory[]): string | null {
  const timeline = statusTimeline(created, histories);
  const last = timeline.at(-1);
  if (last?.to === currentStatus) return new Date(last.at).toISOString();
  if (!timeline.length && created && Number.isFinite(Date.parse(created))) return new Date(created).toISOString();
  return null;
}

export function elapsedSince(at: string | null, now: number): number | null {
  if (!at) return null;
  const timestamp = Date.parse(at);
  return Number.isFinite(timestamp) && timestamp <= now ? now - timestamp : null;
}

export function testingElapsed(created: string | undefined, histories: JiraHistory[], roleFor: (status: string) => string, now: number): number | null {
  const timeline = statusTimeline(created, histories);
  if (!timeline.some((item) => roleFor(item.to) === 'in_testing')) return null;
  let total = 0;
  for (let index = 0; index < timeline.length; index++) {
    if (roleFor(timeline[index].to) !== 'in_testing') continue;
    total += Math.max(0, (timeline[index + 1]?.at ?? now) - timeline[index].at);
  }
  return total;
}

export function waitingForTestElapsed(created: string | undefined, histories: JiraHistory[], roleFor: (status: string) => string, now: number): number | null {
  const start = created ? Date.parse(created) : NaN;
  if (!Number.isFinite(start)) return null;
  const firstTest = statusTimeline(created, histories).find((item) => roleFor(item.to) === 'in_testing');
  return Math.max(0, (firstTest?.at ?? now) - start);
}
