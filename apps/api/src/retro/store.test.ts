import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { Response } from 'express';
import { retrospectivePdf } from './report.js';
import { RetroStore } from './store.js';

test('retrospective flow persists settings, private cards, grouping, votes, actions, and Unicode PDF', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'unitedesk-retro-'));
  try {
    const store = new RetroStore(root);
    const settings = store.saveSettings({ columns: [{ id: 'good', name: 'Worked well', color: '#55aa77' }, { id: 'improve', name: 'Improve', color: '#ee9966' }], votesPerPerson: 5 });
    const session = store.create('host', 'Sprint 12 retro', new Date(Date.now() - 3_600_000).toISOString(), 'Facilitator');
    assert.deepEqual(session.columns, settings.columns);
    store.join(session.code, 'guest', 'Contributor');
    store.addCard(session.code, 'guest', 'improve', 'Šta je moglo bolje?');
    store.addCard(session.code, 'host', 'good', 'Clearer handoffs');
    assert.equal(store.view(session.code, 'host').cards.length, 1);
    assert.equal(store.view(session.code, 'guest').cards.length, 1);
    const online = { write() {}, end() {} } as unknown as Response;
    const leave = store.subscribe(session.code, 'guest', online);
    store.finish(session.code, 'host', true);
    assert.equal(store.view(session.code, 'host').readyToPresent, false);
    assert.throws(() => store.advance(session.code, 'host', 'present'), /everyone present/);
    leave();
    assert.equal(store.view(session.code, 'host').readyToPresent, true, 'Absent contributor does not block presentation');
    const presented = store.advance(session.code, 'host', 'present');
    assert.equal(presented.cards.length, 2);
    assert.throws(() => store.merge(session.code, 'guest', presented.groups.map((group) => group.id), 'Theme'), /facilitator/);
    const grouped = store.merge(session.code, 'host', presented.groups.map((group) => group.id), 'Team communication');
    assert.equal(grouped.groups.length, 1);
    assert.equal(grouped.groups[0].cardIds.length, 2);
    store.advance(session.code, 'host', 'vote');
    store.vote(session.code, 'host', grouped.groups[0].id, 3);
    store.vote(session.code, 'guest', grouped.groups[0].id, 5);
    assert.throws(() => store.vote(session.code, 'host', grouped.groups[0].id, 6), /valid vote count/);
    assert.equal(store.view(session.code, 'host').groups[0].votes, 0, 'Totals stay hidden during voting');
    const discussed = store.advance(session.code, 'host', 'discuss');
    assert.equal(discussed.groups[0].votes, 8);
    const noted = store.notes(session.code, 'host', grouped.groups[0].id, 'Dogovorili smo kraće dnevne provere.');
    assert.match(noted.groups[0].notes, /Dogovorili/);
    const withAction = store.addAction(session.code, 'guest', grouped.groups[0].id, 'Add review rotation', 'host', '2026-12-01');
    assert.equal(withAction.actions[0].assigneeName, 'Facilitator');
    assert.equal(store.openActions('host').length, 1);
    assert.throws(() => store.report(session.code, 'host'), /closed/);
    const closed = store.advance(session.code, 'host', 'closed');
    const pdf = await retrospectivePdf(closed, store.report(session.code, 'host').actions);
    assert.equal(Buffer.from(pdf).subarray(0, 4).toString(), '%PDF');
    assert.ok(pdf.length > 4000);
    const reopened = new RetroStore(root);
    assert.equal(reopened.view(session.code, 'guest').actions.length, 1);
    assert.match(reopened.view(session.code, 'guest').groups[0].notes, /provere/);
    assert.equal(reopened.settings().votesPerPerson, 5);
    reopened.completeAction('guest', withAction.actions[0].id);
    assert.equal(reopened.openActions('host').length, 0);
    assert.ok(reopened.report(session.code, 'host').actions[0].completedAt);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('settings reject duplicate columns and invalid vote budget', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'unitedesk-retro-'));
  try {
    const store = new RetroStore(root);
    assert.throws(() => store.saveSettings({ columns: [{ id: 'one', name: 'Same', color: '#555555' }, { id: 'two', name: 'Same', color: '#666666' }], votesPerPerson: 5 }), /unique/);
    assert.throws(() => store.saveSettings({ columns: [{ id: 'one', name: 'One', color: '#555555' }, { id: 'two', name: 'Two', color: '#666666' }], votesPerPerson: 0 }), /between 1 and 20/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('scheduled start and vote budget are enforced across topics', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'unitedesk-retro-'));
  try {
    const store = new RetroStore(root);
    const future = store.create('future-host', 'Future retro', new Date(Date.now() + 3_600_000).toISOString(), 'Host');
    store.finish(future.code, 'future-host', true);
    assert.equal(store.view(future.code, 'future-host').readyToPresent, false);
    assert.throws(() => store.advance(future.code, 'future-host', 'present'), /scheduled date/);

    const session = store.create('host', 'Current retro', new Date(Date.now() - 60_000).toISOString(), 'Host');
    store.addCard(session.code, 'host', session.columns[0].id, 'First topic');
    store.addCard(session.code, 'host', session.columns[1].id, 'Second topic');
    store.finish(session.code, 'host', true);
    const presented = store.advance(session.code, 'host', 'present');
    store.advance(session.code, 'host', 'vote');
    store.vote(session.code, 'host', presented.groups[0].id, 3);
    assert.throws(() => store.vote(session.code, 'host', presented.groups[1].id, 3), /5 votes in total/);
    const voted = store.vote(session.code, 'host', presented.groups[1].id, 2);
    assert.equal(voted.votesUsed, 5);
    const discussed = store.advance(session.code, 'host', 'discuss');
    assert.deepEqual(discussed.groups.map((group) => group.votes), [3, 2]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
