# UniteDesk

One place for your team's work. The app has light and dark themes, a small API, and a Jira active sprint view. More integrations will be added in separate steps.

## Project direction

UniteDesk is an open source workspace for teams that use several tools to manage work. The planned integrations include Jira, Notion and Linear for work items; GitLab and GitHub for code; Confluence for documentation; and Teams and Slack for notifications. The application will keep links to original records and expose only the actions supported by each connected tool.

The current version includes a read-only active sprint view with Overview, Development, and Testing views. It can use local mock data or a Jira Cloud board. Jira actions and user authentication are not implemented yet.

## Requirements

- Node.js 22.12 or newer
- npm 10 or newer

## Local development

```bash
npm install
npm run mock:seed
npm run dev
```

Open <http://localhost:5173>. The API health endpoint is available through the web development server at <http://localhost:5173/api/health>.
To change the API port, copy `.env.example` to `.env` and edit `PORT`; the development proxy follows the same setting.

### Mock Jira data

`npm run mock:seed` creates `mock/jira/sprint.json`, `issues.json`, `statuses.json`, and `changelogs.json`. Edit these objects to try different sprint names, statuses, assignments, estimates, test subtasks, and status histories. The `mock/` directory is ignored by Git and is never included in the repository. Run the seed command again to reset the sample data.

### Read from Jira locally

Copy `.env.example` to `.env`, then set `JIRA_MODE=jira`, `JIRA_BOARD_URL`, `JIRA_EMAIL`, and `JIRA_API_TOKEN`. A full Jira board URL supplies both the site address and board ID; `JIRA_URL` and `JIRA_BOARD_ID` are optional overrides. The app reads board statuses, the active sprint, issues, and status changelogs. Leave `HOST=127.0.0.1` while authentication is absent.

The Status mapping panel discovers the board's statuses and proposes roles. Review and confirm them before relying on the Development and Testing views. Confirmation is stored in the local `data/jira-status-mapping.json`, which is ignored by Git. If Jira adds a status, confirmation is requested again. The status age columns use elapsed calendar time from Jira changelog transitions, including nights and weekends. A dash means the transition time could not be verified. Test task waiting time starts at task creation and stops when testing begins; testing time sums the intervals spent in testing. Missing changelog permissions may leave those columns empty.

## Build and run

```bash
npm run typecheck
npm run build
npm start
```

Open <http://localhost:3001>. The API serves the built web app after `npm run build`.

## Structure

```text
apps/
  api/           Express API and production web serving
  web/           React app, theme, and styles
scripts/         Local development runner
```

The light and dark themes use CSS variables defined in `apps/web/src/styles/theme.css`. The selected theme is stored in the browser; on first visit, the system color preference is used.
