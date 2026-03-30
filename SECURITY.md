# Security Policy

## Supported Versions

PuTTrY is currently in active development. Only the latest published version receives security fixes.

| Version | Supported |
| ------- | --------- |
| Latest  | ✅ Yes    |
| Older   | ❌ No     |

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Report vulnerabilities privately using [GitHub's private security advisory feature](https://github.com/chfischerx/puttry/security/advisories/new).

Alternatively, you can reach the maintainer directly — contact details are on the [puttry.io](https://puttry.io) website.

### What to include

A useful report typically contains:

- A clear description of the vulnerability and its potential impact
- Steps to reproduce (version, configuration, exact request/payload if applicable)
- The affected component (e.g. authentication, file manager, WebSocket, session management)
- Any suggested fix or mitigation, if you have one

### What to expect

- **Acknowledgement** within 48 hours
- **Status update** within 7 days (confirmed, not reproducible, or working on a fix)
- A fix released as soon as practical, typically within 30 days for critical issues
- Credit in the release notes if you'd like it

## Scope

PuTTrY is a **self-hosted, single-user** application. The intended threat model assumes the server is under your control and the instance is not exposed to untrusted users. Reports are most valuable for:

- Authentication bypass or session hijacking
- Path traversal / arbitrary file read-write outside `$HOME`
- Remote code execution via the PTY or file manager
- CSRF, XSS, or DNS rebinding attacks
- Credential or secret leakage in logs, responses, or stored files

Out of scope:

- Vulnerabilities that require physical or OS-level access to the server
- Issues in dependencies that are not exploitable via PuTTrY's attack surface
- Attacks that require the instance to already be misconfigured (e.g. `AUTH_DISABLED=1` in a public deployment)

## Security Architecture

For an overview of the security controls built into PuTTrY (hashing, rate limiting, CSP, WebAuthn, etc.), see [`docs/SECURITY_ARCHITECTURE.md`](docs/SECURITY_ARCHITECTURE.md).
