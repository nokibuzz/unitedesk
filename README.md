# UniteDesk ✦

**One clear view of the work your team does across its tools.**

[🌐 Try the live demo](https://nokibuzz.github.io/unitedesk/) · [📖 Connect your tools](docs/integrations.md) · [🤝 Contribute](CONTRIBUTING.md)

[![Public demo](https://github.com/nokibuzz/unitedesk/actions/workflows/pages-demo.yml/badge.svg)](https://github.com/nokibuzz/unitedesk/actions/workflows/pages-demo.yml) ![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)

![UniteDesk public demo showing the active sprint](docs/assets/sprint-demo.png)

UniteDesk brings active sprint work, code reviews, documentation, and team shortcuts into one workspace. Keep using the tools you already have: UniteDesk reads their data, organizes it for the team, and links back to the source. It is designed to be configurable for different teams instead of assuming one company's workflow.

> **Demo notice:** The [public demo](https://nokibuzz.github.io/unitedesk/) uses synthetic, read-only data. It contains no connected accounts, access tokens, or private company links. The local server is required for real integrations.

## ✨ What you can do today

| Area | Features | Sources |
| --- | --- | --- |
| 🎯 **Active sprint** | Overview, Development, and Testing views with owners, estimates, subtasks, testing tasks, and time in status | Jira, Linear, local mock data |
| 🗣️ **Daily mode** | Present one ticket at a time, read its description and linked work, then review a sprint recap | Jira, Linear, local mock data |
| 🔎 **Review Queue** | See open changes, your work, reviews waiting for you, aging requests, approvals, pipelines, and advanced filters | GitLab or GitHub |
| 📚 **Knowledge** | Browse document trees, search across sources, read a preview, and open the original page | Confluence, GitHub Markdown, Notion |
| 🔗 **Useful links** | Shared shortcuts with icons, keywords, and fuzzy search from every page (`Ctrl/⌘+K`) | Any HTTP or HTTPS URL |
| ⚙️ **Settings** | Light and dark themes, start page, team workflow rules, status mapping, and a GitLab or GitHub Review Queue connection | Browser and local server |

UniteDesk currently **reads** provider data. Editing Jira issues, approving code reviews, and editing documents in UniteDesk are not implemented. The original tools remain the source of truth.

## 🚀 Try it

Open **[nokibuzz.github.io/unitedesk](https://nokibuzz.github.io/unitedesk/)**. Explore the sample sprint, start Daily mode, filter the Review Queue, search Knowledge, and open Useful links. The demo is hosted as a static GitHub Pages site; it does not need an API server.

To run your own workspace locally:

```bash
git clone https://github.com/nokibuzz/unitedesk.git
cd unitedesk
npm ci
npm run mock:seed
npm run dev
```

Open the web address printed by the development command. Node.js **22.12+** and npm **10+** are required. The ignored `mock/` folder contains editable Jira, GitLab, and Notion sample records. For a full local Knowledge sample, set `DOCUMENTATION_PROVIDERS=notion` and `NOTION_MODE=mock` in a private `.env` file copied from `.env.example`.

For a production-style local build, run `npm run build` and `npm start`. The server binds to `127.0.0.1` by default while authentication is unfinished. The public demo is built separately with `npm run build:demo` and published by [the Pages workflow](.github/workflows/pages-demo.yml).

## 🔌 Connect real tools

1. Follow [Connecting your tools](docs/integrations.md) to set up Jira or Linear and your documentation sources in a private `.env` file.
2. Open **Settings → Team → Code review source**. Choose **GitLab** or **GitHub**, enter its address, scope, and access token, then save. Review Queue uses the selected provider on the next visit. Existing `.env` values remain supported as defaults.
3. Review the suggested ticket status roles in **Settings → Team → Ticket status mapping**. Confirm them for your team's workflow.
4. Add your team's dashboards, logs, repositories, and deployment URLs under **Useful links**. Add keywords such as service and environment names so teammates can find them quickly.

GitHub Markdown documentation currently uses `GITHUB_TOKEN` from `.env` independently of the Review Queue connection. Credentials saved through Settings are stored in local `data/code-review-connection.json` with restricted file permissions; the API reports only whether a token exists and never returns its value. `.env`, `data/`, and `mock/` are excluded from Git.

## 🧩 How it is organized

```text
apps/
  api/           Express API, provider adapters, local configuration
  web/           React dashboard, settings, demo data source
docs/           Integration guide and demo screenshot
scripts/        Development, mock data, and integration checks
.github/         Static demo deployment workflow
```

Provider adapters normalize each tool's data into shared sprint, review, and document views. The public demo uses a separate static data source, so no private local files are part of the Pages artifact.

## 🧪 Verify changes

```bash
npm test
npm run typecheck
npm run build
npm run build:demo
```

`npm run test:live` is available after you configure your own temporary test accounts. It checks configured integrations locally and does not print tokens.

## 🛡️ Project status and privacy

UniteDesk is an early open source project. It does **not** have user authentication yet. Keep the API on the default loopback address; do not expose it directly to the internet. Use short-lived, least-privilege provider tokens and never commit them. The GitHub Pages demo is read-only and contains only public sample data.

Planned work includes provider actions, safer multi-user authentication, easier connection setup, more integrations, and richer team workflows. See the repository issues to discuss what should come next.

## 🤝 Contributing

Ideas, bug reports, documentation, and code are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. UniteDesk is released under the [MIT License](LICENSE).
