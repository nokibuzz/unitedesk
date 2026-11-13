import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const folder = path.join(root, 'mock', 'notion');
const home = '10000000-0000-4000-8000-000000000001';
const guide = '10000000-0000-4000-8000-000000000002';
const runbook = '10000000-0000-4000-8000-000000000003';
const edited = new Date().toISOString();
const title = (value) => ({ type: 'title', title: [{ plain_text: value }] });
const page = (id, name, parent = null) => ({ object: 'page', id, url: `https://www.notion.so/${id}`, last_edited_time: edited,
  parent: parent ? { type: 'page_id', page_id: parent } : { type: 'workspace' }, properties: { title: title(name) } });
const block = (id, type, text) => ({ id, type, has_children: false, [type]: { rich_text: [{ plain_text: text }] } });
const pages = [page(home, 'UniteDesk Demo Knowledge'), page(guide, 'Team Handbook', home), page(runbook, 'Incident Runbook', home)];
const blocks = {
  [home]: [block('b1', 'heading_1', 'UniteDesk Demo Knowledge'), block('b2', 'paragraph', 'Synthetic Notion documentation for local Knowledge tab testing.')],
  [guide]: [block('b3', 'heading_2', 'Getting started'), block('b4', 'paragraph', 'This onboarding guide shows how to browse nested pages and search their content.'),
    block('b5', 'bulleted_list_item', 'Choose a document in the tree.'), block('b6', 'bulleted_list_item', 'Search for onboarding.')],
  [runbook]: [block('b7', 'heading_2', 'Incident response'), block('b8', 'paragraph', 'This synthetic incident runbook tests full-text search and readable page previews.'),
    block('b9', 'numbered_list_item', 'Record the incident.'), block('b10', 'numbered_list_item', 'Assign an owner.')],
};
await mkdir(folder, { recursive: true });
await Promise.all([writeFile(path.join(folder, 'pages.json'), `${JSON.stringify(pages, null, 2)}\n`),
  writeFile(path.join(folder, 'blocks.json'), `${JSON.stringify(blocks, null, 2)}\n`)]);
console.log('Created local Notion sample documents in ignored mock/notion/.');
