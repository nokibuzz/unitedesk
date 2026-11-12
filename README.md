# UniteDesk

One place for your team's work. The app has light and dark themes, a small API, and a Jira active sprint view. More integrations will be added in separate steps.

## Project direction

UniteDesk is an open source workspace for teams that use several tools to manage work. Read-only Jira and GitLab views are available now. Planned integrations include Notion and Linear for work items, GitHub for code, Confluence for documentation, and Teams and Slack for notifications. The application keeps links to original records and exposes only the actions supported by each connected tool.

The current version includes a read-only active sprint view with Overview, Development, and Testing views, a daily presentation mode, and a GitLab Review Queue. Both integrations can use local mock data. Jira actions and user authentication are not implemented yet.

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

The same command creates `mock/gitlab/merge-requests.json` with a sample viewer and open merge requests. Edit the JSON to try reviewer assignments, approval states, pipelines, branches, and projects. Use `npm run mock:seed:jira` or `npm run mock:seed:gitlab` to reset only one integration's sample data.

### Read from Jira locally

Copy `.env.example` to `.env`, then set `JIRA_MODE=jira`, `JIRA_BOARD_URL`, `JIRA_EMAIL`, and `JIRA_API_TOKEN`. A full Jira board URL supplies both the site address and board ID; `JIRA_URL` and `JIRA_BOARD_ID` are optional overrides. The app reads board statuses, the active sprint, issues, and status changelogs. Leave `HOST=127.0.0.1` while authentication is absent.

The Status mapping panel discovers the board's statuses and proposes roles. Review and confirm them before relying on the Development and Testing views. Confirmation is stored in the local `data/jira-status-mapping.json`, which is ignored by Git. If Jira adds a status, confirmation is requested again. The status age columns use elapsed calendar time from Jira changelog transitions, including nights and weekends. A dash means the transition time could not be verified. Test task waiting time starts at task creation and stops when testing begins; testing time sums the intervals spent in testing. Missing changelog permissions may leave those columns empty.

### Daily mode

Select **Start daily** above the sprint. Daily mode presents tickets one at a time with their description, owner, status, testing task, subtickets, linked Jira issues, points, logged time, and estimate. Use the arrow keys, Previous/Next buttons, or ticket rail to navigate. The timer resets for each ticket. **Hide done** removes tickets mapped to the `done` role. The final recap lists tickets completed or added to the sprint, and subtickets created, since the previous daily window.

Set `DAILY_TIME_ZONE` to your team's IANA time zone and `DAILY_CUTOFF_HOUR` to the meeting hour; defaults are `UTC` and `10`. `DAILY_TICKET_SECONDS` defaults to `180`. Recap additions require Jira sprint changelog data. If Jira does not expose that transition, the ticket is omitted from the “added” recap rather than being guessed from its creation date.

### Review Queue from GitLab

Open **Review Queue** in the header. It shows open merge requests for one GitLab group and its subgroups, with project, branches, author, reviewers, pipeline, approval state, and age. The quick views show all open requests, your requests, requests waiting for your review, and aging requests. Search and filters can be combined by author, reviewer, project, target branch, pipeline, and approval state.

For live data, set `GITLAB_MODE=gitlab`, `GITLAB_URL`, `GITLAB_GROUP` (full group path), and `GITLAB_TOKEN` in your private `.env`. The token is used by the server and is not sent to the browser. Use a personal token when **My merge requests** and **For my review** should reflect your account. The latter includes a request when GitLab reports it as unapproved and the viewer is an assigned reviewer or an eligible approver for a required approval. Approval and pipeline fields show an unavailable state if GitLab does not return them. `GITLAB_STALE_DAYS` sets the calendar-day aging threshold; `GITLAB_CACHE_TTL_MS` sets the live read cache duration. Keep `HOST=127.0.0.1` while the app has no authentication.

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
