# Connecting your tools

UniteDesk currently reads Jira Cloud active sprints and GitLab group merge requests. Confluence, GitHub, and Linear connectors are planned. Their accounts can be checked now, but adding a token for them will not make their data appear in the app. No provider connection can be completed from Settings yet; automatic discovery and a guided confirmation flow are planned.

Use synthetic data in a test workspace. Keep all tokens in the local, ignored `.env` file and keep `HOST=127.0.0.1`. The API has no user authentication, so it must not be exposed to a network. The `.env`, `mock/`, and `data/` paths are ignored by Git. Never paste a token into an issue, screenshot, commit, or browser console.

## Local start

```bash
npm install
cp .env.example .env
npm run build
npm start
```

Open <http://127.0.0.1:3001>. For development with hot reload, use `npm run dev` and open <http://localhost:5173>. If you want to work without provider accounts, run `npm run mock:seed` and leave `JIRA_MODE=mock` and `GITLAB_MODE=mock` in `.env`.

## Jira Cloud: available now

1. Create a Jira Scrum board with an active sprint and a few test issues. Include issues in different workflow statuses and, if useful, a subtask with the name configured by `JIRA_TEST_TASK_NAME`.
2. Copy the full board URL from Jira. An example shape is `https://your-team.atlassian.net/jira/software/projects/DEMO/boards/1`.
3. In your [Atlassian account API token settings](https://support.atlassian.com/atlassian-account/docs/manage-api-tokens-for-your-atlassian-account/), create a short-lived token. **Current limitation:** the Jira connector uses Basic authentication at the site URL, so it needs an API token **without scopes**. Scoped tokens use a different `api.atlassian.com/ex/jira/{cloudId}` URL, which this version does not support. This token inherits the account's Jira permissions; use a dedicated test account and revoke the token after testing. Future OAuth or scoped-token support should replace this setup.
4. Put the following values in your private `.env`:

```dotenv
JIRA_MODE=jira
JIRA_BOARD_URL=https://your-team.atlassian.net/jira/software/projects/DEMO/boards/1
JIRA_EMAIL=you@example.com
JIRA_API_TOKEN=your-local-token
```

`JIRA_URL` and `JIRA_BOARD_ID` can override the values inferred from the board URL. Restart the API after changing `.env`. Open **Active Sprint**. In **Settings → Team → Jira status mapping**, inspect the discovered statuses and confirm their roles. Confirmation is required again when the board gains a new status. The **Development** and **Testing** views, status durations, and **Daily** mode then use the live sprint. Jira is read only in this version; changing a status from UniteDesk is planned.

If the sprint is empty, check that it is active and the board contains the issues. If status or testing durations show a dash, check access to issue changelogs. Story points and estimates may be empty when Jira does not expose or populate the relevant fields. The optional `JIRA_STORY_POINTS_FIELD` setting is available for a custom field ID.

## GitLab: available now

1. Create or choose a GitLab group, a project inside it, and one or more merge requests. The Review Queue includes the group and its subgroups.
2. In [GitLab personal access tokens](https://docs.gitlab.com/user/profile/personal_access_tokens/), create a short-lived token with the [`read_api` scope](https://docs.gitlab.com/security/tokens/access_token_scopes/). A personal token lets **My merge requests** and **For my review** reflect the token owner. A group or project token may give different viewer results.
3. Put the values in `.env` and restart the API:

```dotenv
GITLAB_MODE=gitlab
GITLAB_URL=https://gitlab.com
GITLAB_GROUP=your-group
GITLAB_TOKEN=your-local-token
```

Open **Review Queue**. Check the project, author, branches, draft state, pipeline, and approval fields. Pipeline and approval states may be unavailable if GitLab does not return them. A single-user test group cannot prove the **For my review** filter: add a second reviewer to a synthetic merge request when you need to validate that workflow. No merge request is approved or changed by UniteDesk.

## Confluence Cloud: connector planned

Confluence pages are not shown in UniteDesk yet. To prepare a test space, create a space and a synthetic page on the same Atlassian site. Confirm that the account can read the page through the Confluence UI or REST API. Atlassian [documents API token authentication](https://support.atlassian.com/atlassian-account/docs/manage-api-tokens-for-your-atlassian-account/) and the [Confluence REST API](https://developer.atlassian.com/cloud/confluence/rest/v1/intro/). Do not add a Confluence token to `.env` yet: there is no `CONFLUENCE_*` configuration in the current app. The future connector should discover spaces and let the team select which ones to show.

## GitHub: connector planned

GitHub access to a repository can be checked through its website or `gh repo view OWNER/REPO` after `gh auth login`. This checks the account, not a UniteDesk integration. There are no `GITHUB_*` settings today. For a future local proof of concept, use a [fine-grained personal access token](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens) limited to selected repositories and required read permissions. For distribution to other teams, a [GitHub App](https://docs.github.com/en/apps/creating-github-apps/about-creating-github-apps/about-creating-github-apps) is the intended direction because installations can be limited to chosen repositories and permissions.

## Linear: connector planned

Linear is not connected to UniteDesk yet. A test workspace and a few synthetic issues can be prepared, but there is no `LINEAR_*` setting or automatic workflow mapping today. Linear's [GraphQL API](https://linear.app/developers/graphql) supports personal API keys for local experiments; [OAuth 2.0](https://linear.app/developers/oauth-2-0-authentication) is recommended for an integration used by other teams. Wait for the connector before creating a key solely for UniteDesk.

## Validation checklist

| Area | What to verify | Current result expected |
| --- | --- | --- |
| Local API | `/api/health` returns `ok` | Available |
| Jira | `/api/sprint/active` returns `source: jira`, an active sprint, ticket descriptions, original links, subtasks, and durations where changelogs exist | Available |
| Jira mapping | `/api/jira/status-mapping` discovers statuses; confirmation persists in ignored `data/` | Available |
| GitLab | `/api/merge-requests` returns `source: gitlab` and open MRs from the chosen group | Available |
| Confluence | Account can read a synthetic page through Confluence | Account readiness only |
| GitHub | Account can read a chosen repository | Account readiness only |
| Linear | Test workspace and issues can be opened in Linear | Account readiness only |

Run `npm run typecheck`, `npm test`, and `npm run build` before publishing code changes. Check `git status --short` and `git check-ignore -v .env` before any push. After a temporary test, revoke the Jira and GitLab tokens in their provider settings and remove them from `.env`.
