# Connecting your tools

UniteDesk uses provider adapters so the same ticketing, daily, and review views work with different services. Today `TICKETING_PROVIDER` accepts `mock`, `jira`, or `linear`; `CODE_REVIEW_PROVIDER` accepts `mock`, `gitlab`, or `github`. A Confluence document adapter serves `GET /api/documents`. Its UI and automatic connection setup are planned. The older `JIRA_MODE` and `GITLAB_MODE` variables still work when the corresponding provider selector is absent.

Use synthetic data in a test workspace. Keep tokens in the local, ignored `.env` file and keep `HOST=127.0.0.1`. The API has no user authentication and must not be exposed to a network. The `.env`, `mock/`, and `data/` paths are ignored by Git. Never paste a token into an issue, screenshot, commit, or browser console.

## Local start and mock data

```bash
npm install
cp .env.example .env
npm run mock:seed
npm run build
npm start
```

Open <http://127.0.0.1:3001>. For hot reload, use `npm run dev` and <http://localhost:5173>. Leave both provider selectors set to `mock` to test without external accounts. Restart the API after changing `.env`.

## Jira Cloud

1. Create a Scrum board with an active sprint and issues in several statuses. Add a testing subtask if you want to exercise the Testing view. Its name comes from `JIRA_TEST_TASK_NAME` or **Settings → Team**.
2. Copy the full board URL, such as `https://your-team.atlassian.net/jira/software/projects/DEMO/boards/1`.
3. Create a short-lived token in [Atlassian account API token settings](https://support.atlassian.com/atlassian-account/docs/manage-api-tokens-for-your-atlassian-account/). The current site-URL Basic authentication needs an API token **without scopes**. Scoped tokens require the `api.atlassian.com/ex/jira/{cloudId}` URL, which this adapter does not yet support. Use a dedicated test account because an unscoped token inherits its Jira permissions.
4. Put these values in your private `.env`:

```dotenv
TICKETING_PROVIDER=jira
JIRA_BOARD_URL=https://your-team.atlassian.net/jira/software/projects/DEMO/boards/1
JIRA_EMAIL=you@example.com
JIRA_API_TOKEN=your-local-token
```

`JIRA_URL` and `JIRA_BOARD_ID` can override values inferred from the board URL. Open the Sprint view and confirm the proposed status roles in **Settings → Team → Ticket status mapping**. The app reads issues, subtasks, and status changelogs; it does not change Jira issues. A dash in a duration column means the start of that interval could not be verified. Story points and estimates are empty if Jira does not expose or populate those fields; `JIRA_STORY_POINTS_FIELD` can name a custom field ID.

## Linear

1. Create a team and enable **Cycles** in its team settings. The Sprint view uses the cycle whose start and end dates contain the current time. Put a few issues in that cycle, including different statuses and an optional `Test the solution` subissue.
2. Create a personal API key with only **Read** permission in **Settings → Account → Security & access**. Linear [documents API key permissions](https://linear.app/docs/api-and-webhooks) and [GraphQL authentication](https://linear.app/developers/graphql).
3. Put the team identifier and key in `.env`:

```dotenv
TICKETING_PROVIDER=linear
LINEAR_TEAM=DEMO
LINEAR_API_KEY=your-local-read-key
```

The same Overview, Development, Testing, and Daily views now read the active Linear cycle. The adapter uses Linear state spans for time in status and testing duration and keeps links to original issues. Status confirmations are stored separately from Jira confirmations. The recap does not yet report when an issue was added to a Linear cycle, because this adapter does not read cycle-assignment history. For a distributed integration, [Linear recommends OAuth 2.0](https://linear.app/developers/oauth-2-0-authentication) instead of personal keys.

## GitLab

1. Create or choose a GitLab group, a project inside it, and at least one open merge request. The Review Queue includes the group and its subgroups.
2. Create a short-lived [personal access token](https://docs.gitlab.com/user/profile/personal_access_tokens/) with the [`read_api` scope](https://docs.gitlab.com/security/tokens/access_token_scopes/). A personal token lets **My changes** and **For my review** reflect its owner.
3. Add these values to `.env`:

```dotenv
CODE_REVIEW_PROVIDER=gitlab
GITLAB_URL=https://gitlab.com
GITLAB_GROUP=your-group
GITLAB_TOKEN=your-local-token
```

Open **Review Queue** and check project, author, branches, draft state, pipeline, approval, and filters. A single-user test group cannot prove the **For my review** filter; use a second reviewer on a synthetic merge request for that case. UniteDesk does not approve or change merge requests.

## GitHub

1. Create a short-lived [fine-grained personal access token](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens) limited to the repositories you want to read. Grant the read permissions required by repository discovery, pull requests, reviews, commit statuses, and checks. The token owner must be able to see the chosen repositories.
2. Configure `.env`:

```dotenv
CODE_REVIEW_PROVIDER=github
GITHUB_TOKEN=your-local-token
GITHUB_OWNER=your-user-or-organization
# Optional: restrict the automatic repository scan.
GITHUB_REPOS=your-user-or-organization/first-repo,second-repo
```

If `GITHUB_OWNER` is empty, UniteDesk uses the authenticated user. If `GITHUB_REPOS` is empty, it scans accessible, non-archived repositories owned by that user or organization. The same Review Queue filters apply to open pull requests. GitHub's required approval count is not read yet: **Approved** currently means at least one current approval, and the required count is shown as unavailable. Pipeline status uses checks and commit statuses when accessible. A [GitHub App](https://docs.github.com/en/apps/creating-github-apps/about-creating-github-apps/about-creating-github-apps) is the intended authentication path for other teams.

## Confluence Cloud

Create a test space and a synthetic page, then configure the read-only document listing:

```dotenv
DOCUMENTATION_PROVIDER=confluence
CONFLUENCE_URL=https://your-team.atlassian.net
CONFLUENCE_EMAIL=you@example.com
CONFLUENCE_API_TOKEN=your-local-token
# Optional: comma-separated keys; blank scans global spaces, not personal spaces.
CONFLUENCE_SPACE_KEYS=DEMO
```

Call `GET /api/documents`. It returns spaces and pages with original Confluence links. There is no document UI yet. The adapter uses the [Confluence REST API](https://developer.atlassian.com/cloud/confluence/rest/v1/intro/). Like the current Jira adapter, site-URL Basic authentication needs an unscoped Atlassian token; OAuth or scoped-token support is planned.

## Validation checklist

| Area | Local check |
| --- | --- |
| API | `GET /api/health` returns `ok` |
| Jira or Linear | `GET /api/sprint/active` returns the selected `source`, active sprint or cycle, descriptions, original links, subtasks, and durations where history exists |
| Status mapping | `GET /api/ticketing/status-mapping` discovers roles; confirmation in Settings persists per provider in ignored `data/` |
| GitLab or GitHub | `GET /api/merge-requests` returns the selected `source` and open changes; Review Queue filters still work |
| Confluence | `GET /api/documents` returns the selected space and synthetic page |

Run `npm run typecheck`, `npm test`, and `npm run build` before publishing code changes. With all five providers configured in your private `.env`, run `npm run test:live`; it requires an active Jira sprint, an active Linear cycle, open merge and pull requests, and a Confluence page. The output contains only provider names and record counts. Check `git status --short` and `git check-ignore -v .env` before any push. Revoke temporary tokens in each provider after testing and remove them from `.env`.
