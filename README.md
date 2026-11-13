# UniteDesk

One place for your team's work. The app has light and dark themes, ticketing and code review views, and separate personal and team settings.

## Project direction

UniteDesk is an open source workspace for teams that use several tools to manage work. Jira and Linear feed the ticketing view; GitLab and GitHub feed the Review Queue; Confluence, GitHub Markdown, and Notion can feed the Knowledge tab together. Planned integrations include Notion for work items and Teams and Slack for notifications. The application keeps links to original records and exposes only the actions supported by each connected tool.

The current version includes a read-only active sprint or cycle view with Overview, Development, and Testing views, a daily presentation mode, and a Review Queue for merge or pull requests. The ticketing and review views can use local mock data. Provider actions and user authentication are not implemented yet.

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

For provider setup, token guidance, and a local validation checklist, see [Connecting your tools](docs/integrations.md). Choose a ticketing and code review provider in your private `.env`; the current views work with the selected adapters.

### Settings

Use the button in the top-right corner to open **Settings**. **Personal** contains the theme (system, light, or dark) and the default section opened by the UniteDesk logo. These choices are stored in the current browser.

**Team** contains the daily time zone, previous daily hour, presentation timer, testing task name, review aging threshold, ticket status mapping, and useful links. Team workflow values are saved in the local `data/team-settings.json`; confirmed status roles are saved per provider in `data/ticket-status-mapping.json`; useful links are saved in `data/useful-links.json`. Existing Jira confirmations are migrated from the older local file when saved. The `data/` directory is ignored by Git. Values in `.env` supply defaults until team workflow values are saved from Settings. Connection URLs and tokens remain in the private `.env`. Settings changes are accepted only from the local machine while authentication is not implemented.

### Useful links

Add links in **Settings → Team → Useful links**. Give each link a name, HTTP or HTTPS URL, optional description, and comma-separated search keywords. Use keywords for terms that are not in the name, such as a service, team, or environment. The chain icon in the header opens the link search from every page; `Ctrl+K` or `⌘K` also opens it. Search matches words across the name, keywords, description, and URL, tolerates a one-character typo, and accepts terms in any order. Results open the configured URL in a new tab.

The icon defaults to the destination site's `/favicon.ico`; a custom image URL can be entered if needed. The browser requests the icon directly from that site. UniteDesk does not send internal link addresses to a third-party favicon service. If an icon cannot load, the link's initial is shown. Links are shared by users of the same server, but the current Settings editor requires local access. The `data/useful-links.json` file is intentionally excluded from Git because link addresses may be private. Do not put access tokens in link URLs. Authentication and remote team editing are future work.

### Mock Jira data

`npm run mock:seed` creates `mock/jira/sprint.json`, `issues.json`, `statuses.json`, and `changelogs.json`. Edit these objects to try different sprint names, statuses, assignments, estimates, test subtasks, and status histories. The `mock/` directory is ignored by Git and is never included in the repository. Run the seed command again to reset the sample data.

The same command creates `mock/gitlab/merge-requests.json` with a sample viewer and open merge requests. Edit the JSON to try reviewer assignments, approval states, pipelines, branches, and projects. Use `npm run mock:seed:jira` or `npm run mock:seed:gitlab` to reset only one integration's sample data.

### Read from Jira locally

Copy `.env.example` to `.env`, then set `TICKETING_PROVIDER=jira`, `JIRA_BOARD_URL`, `JIRA_EMAIL`, and `JIRA_API_TOKEN`. A full Jira board URL supplies both the site address and board ID; `JIRA_URL` and `JIRA_BOARD_ID` are optional overrides. The app reads board statuses, the active sprint, issues, and status changelogs. Set `TICKETING_PROVIDER=linear`, `LINEAR_TEAM`, and `LINEAR_API_KEY` to read an active Linear cycle through the same views. Leave `HOST=127.0.0.1` while authentication is absent.

The status mapping section in **Settings → Team** discovers statuses from the selected ticketing provider and proposes roles. Review and confirm them before relying on the Development and Testing views. If the provider adds a status, confirmation is requested again. The status age columns use elapsed calendar time from provider status history, including nights and weekends. A dash means the transition time could not be verified. Test task waiting time starts at task creation and stops when testing begins; testing time sums the intervals spent in testing. Missing history permissions may leave those columns empty.

### Daily mode

Select **Start daily** above the sprint. Daily mode presents tickets one at a time with their description, owner, status, testing task, subtickets, linked Jira issues, points, logged time, and estimate. Use the arrow keys, Previous/Next buttons, or ticket rail to navigate. The timer resets for each ticket. **Hide done** removes tickets mapped to the `done` role. The final recap lists tickets completed or added to the sprint, and subtickets created, since the previous daily window.

Set the daily time zone, previous daily hour, and ticket timer in **Settings → Team**. The `.env` defaults are `UTC`, `10`, and `180` seconds. Recap additions require Jira sprint changelog data. If Jira does not expose that transition, the ticket is omitted from the “added” recap rather than being guessed from its creation date.

### Review Queue from GitLab or GitHub

Open **Review Queue** in the header. It shows open GitLab merge requests or GitHub pull requests, with project, branches, author, reviewers, pipeline, approval state, and age. The quick views show all open requests, your requests, requests waiting for your review, and aging requests. Search and filters can be combined by author, reviewer, project, target branch, pipeline, and approval state.

For GitLab, set `CODE_REVIEW_PROVIDER=gitlab`, `GITLAB_URL`, `GITLAB_GROUP` (full group path), and `GITLAB_TOKEN`. For GitHub, set `CODE_REVIEW_PROVIDER=github` and `GITHUB_TOKEN`; `GITHUB_OWNER` defaults to the authenticated user, and `GITHUB_REPOS` optionally limits the scan. Tokens are used by the server and are not sent to the browser. Approval and pipeline fields show an unavailable state if a provider does not return them. Set the calendar-day aging threshold in **Settings → Team**; `GITLAB_CACHE_TTL_MS` sets the live read cache duration for either provider. Keep `HOST=127.0.0.1` while the app has no authentication.

### Knowledge from Confluence, GitHub Markdown, and Notion

Set `DOCUMENTATION_PROVIDERS=confluence,github,notion` in your private `.env` and provide credentials for the sources you use. **Knowledge** browses Confluence page hierarchies, Markdown folders in chosen GitHub repositories, and accessible Notion pages. Search uses Confluence's indexed relevance order; GitHub and Notion content is indexed locally by the API with title matches ranked first. Results and previews link to their original pages. The API exposes `GET /api/documents`, `GET /api/documents/search?q=...`, and `GET /api/documents/:id`. Editing remains in the source tools. See [Connecting your tools](docs/integrations.md) for each provider's configuration and limits.

### Live integration smoke test

After adding local test credentials and synthetic records, run `npm run test:live`. It checks Jira, Linear, GitLab, GitHub, and configured documentation sources in sequence and prints only counts, not URLs or tokens. Set `NOTION_MODE=mock` and run `npm run mock:seed:notion` to exercise the Notion view without an account; this does not validate live Notion access.

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

The light and dark themes use CSS variables defined in `apps/web/src/styles/theme.css`. The system color preference is used until a personal theme is selected.
