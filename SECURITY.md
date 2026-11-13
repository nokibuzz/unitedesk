# Security policy

UniteDesk is a developer preview. The local API does not have user authentication and is intended for localhost or short tests on a trusted LAN/VPN. The public GitHub Pages demo contains synthetic data and has no server connection to your accounts.

## Report a vulnerability privately

Use **[Report a vulnerability](https://github.com/nokibuzz/unitedesk/security/advisories)** on this repository's Security → Advisories page. Include the affected version, impact, reproduction steps using synthetic data, and any suggested fix. Please do not open a public issue or pull request containing an unpatched exploit, a real token, or private customer data.

The maintainer will acknowledge a report as time permits, investigate it, and coordinate disclosure with the reporter. This is a volunteer project, so no response or fix deadline is promised.

## Supported versions

Security fixes target the current developer-preview line (`0.1.x`). Earlier commits and forks are not separately maintained. This policy will be updated when a stable release exists.

## Safe local use

- Keep the API bound to `127.0.0.1` unless every participant is on a trusted LAN/VPN. Do not expose it directly to the public internet.
- Keep `.env`, `data/`, and `mock/` private and outside Git. Use short-lived, least-privilege provider tokens.
- Treat screenshots, videos, logs, and PDF exports as possible sources of private URLs and team data.
- If a real credential is exposed, revoke or rotate it at the provider first, then report the incident privately.
