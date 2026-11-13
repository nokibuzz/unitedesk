# Local integration test report

Tested on 2026-11-13 with synthetic records and local credentials. Account identifiers, service URLs, tokens, and private repository names are intentionally omitted. Re-run the checks with `npm test`, `npm run build`, and `npm run test:live` after configuring a private `.env` as described in [Connecting your tools](integrations.md).

| Integration | Live check | Result |
| --- | --- | --- |
| Jira | Active sprint, three parent tickets, three workflow statuses, subtasks, descriptions, status history, and confirmed mapping | Pass |
| Linear | Active cycle, three parent issues, six workflow statuses, testing subissue, descriptions, original links, state spans, and confirmed mapping | Pass |
| GitLab | Group discovery and two open merge requests, including a draft; Review Queue model and filters | Pass |
| GitHub | Automatic repository discovery and three open pull requests, including a private synthetic test; Review Queue and **For my review** filter | Pass |
| Confluence | Selected test space and seven pages, including two nested synthetic pages; indexed search returns three relevant results, and page preview loads | Pass |

The browser checks confirmed that the Linear cycle appears in Overview, Development, Testing, and Daily mode, that GitHub pull requests use the existing Review Queue, and that the Knowledge tab browses nested Confluence pages, searches, and previews content. The Jira/GitLab combination and the Linear/GitHub combination both returned successful application API responses. All unit tests, type checks, and the production build passed.

## Limits of this test

- GitLab's **For my review** flow could not be proved with the single-user test group. Mock tests cover the filter; a second reviewer is needed for a live check.
- No GitLab or GitHub CI pipeline was started to avoid consuming provider resources. Pipeline parsing is covered by adapter tests, and live responses without pipelines display that state.
- GitHub does not yet read required approval thresholds; an approval means at least one current approving review.
- GitHub's **For my review** filter uses directly requested reviewers. Requests assigned to a reviewer team are not resolved to individual team members yet.
- Linear cycle-assignment history is not yet read, so Daily recap does not report when issues were added to a cycle. Status age uses Linear state history.
- Confluence previews omit active macros, images, and embedded apps. Inline editing is deferred so a simplified editor cannot overwrite Confluence storage content or bypass version handling; the original-page link supports editing in Confluence.
- Jira, Linear, GitLab, GitHub, and Confluence connections remain local and read only in UniteDesk. Provider actions and hosted authentication require separate work.
