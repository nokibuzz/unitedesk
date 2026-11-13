# Contributing to UniteDesk

Thanks for helping teams make sense of work across tools. Please open an issue before a large change so we can agree on scope and the adapter boundary.

Please follow the [Code of Conduct](CODE_OF_CONDUCT.md). Use the [private security reporting path](SECURITY.md) for vulnerabilities, not a public issue. New contributors can start with an issue labeled [`good first issue`](https://github.com/nokibuzz/unitedesk/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22).

## Local setup

1. Install Node.js 22.12+ and npm 10+.
2. Run `npm ci` and `npm run mock:seed`.
3. Run `npm run dev` and open the address printed by the command.
4. Run `npm test`, `npm run typecheck`, and `npm run build` before a pull request.

Keep provider-specific logic in an adapter and preserve the shared view models. Use synthetic records in tests. Do not commit `.env`, `data/`, `mock/`, tokens, personal information, or private organization URLs. For documentation or UI changes, include a clear description and a screenshot when it helps reviewers.

The public demo is built with `npm run build:demo`. Its sample data lives in `apps/web/src/demo/` and must remain fully synthetic.
