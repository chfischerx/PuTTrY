# Security Architecture

PuTTrY is designed as a **single-user terminal server** with centralized credential management on the backend. This document details both **application-level security** (authentication and session management) and **web application security** (server-side attack mitigations).

## 1. Introduction

PuTTrY's security model eliminates the key management burden of SSH by centralizing credentials on the server instead of distributing them across client machines. The architecture is built on **layered defenses**:

- **Authentication layer**: Session password, time-based one-time passwords (TOTP), and WebAuthn/passkeys
- **Session layer**: Cryptographically secure tokens with limited lifetimes
- **Transport layer**: HTTP security headers and cookie attributes
- **Input layer**: Rate limiting, payload size limits, and sanitization
- **Storage layer**: Encrypted credentials on disk with strict file permissions and schema validation

All state (sessions, temporary challenges, credentials) is **in-memory and on-disk**—there is no external database dependency.

---

## 2. Authentication

### 2.1 Session Password

The **session password** is PuTTrY's primary credential. It protects access to the web UI and all API endpoints.

**Hashing Algorithm: scrypt**
- Algorithm: scrypt (OWASP-recommended key derivation function)
- Parameters (production):
  - `N=32768` — CPU/memory cost (higher = slower, more secure)
  - `r=8` — Block size
  - `p=1` — Parallelization
  - (Development uses `N=16384` for faster iteration)
- Salt: 32 random bytes, cryptographically generated via `crypto.randomBytes(32)`
- Hash length: 64 bytes (512 bits)

**Storage Format**
```
scrypt:<salt_hex>:<hash_hex>
```
Example: `scrypt:a1b2c3d4e5f6...:<64-byte hex hash>`

Stored in: `~/.puttry/session-password.txt` with file permissions `0o600` (readable only by the owning user).

**Verification**
- Uses `timingSafeEqual()` for constant-time comparison, preventing timing-based attacks
- Server-side only—the password is never sent to the client

**Password Length Guard**
- Rejected at the API layer if `>1024` bytes, preventing denial-of-service attacks via extremely long password attempts

**Generation**
PuTTrY can generate passwords in two modes:

1. **XKCD-style** (default, `SESSION_PASSWORD_TYPE=xkcd`):
   - Format: `word1-word2-word3-word4-digit` (e.g., `castle-piano-river-seven-3`)
   - Selects 4 random words from a ~700-word list + 1 random digit (0-9)
   - Cryptographically secure: uses `crypto.getRandomValues()`
   - Entropy: ~54 bits of entropy per word (~224 bits total)
   - Memorable and easy to type

2. **Random alphanumeric** (`SESSION_PASSWORD_TYPE=random`):
   - Format: 16 random alphanumeric characters by default (configurable via `SESSION_PASSWORD_LENGTH`)
   - Cryptographically secure: uses `crypto.getRandomValues()`
   - Higher entropy per character; suitable for password managers

### 2.2 TOTP (Time-Based One-Time Password)

TOTP provides a second authentication factor via a time-based token generator (Google Authenticator, Authy, etc.).

**Standards & Configuration**
- RFC 6238 compliant
- 30-second time windows
- 6-digit codes
- Library: `otplib` (battle-tested, audited)

**Secret Management**
- The TOTP secret is **never sent to the client** after setup
- Generated once during 2FA setup and stored server-side in memory (in `pendingTotpSecrets` map)
- QR code URI (containing the secret) is displayed **only at setup time**
- After verification, the secret is saved to disk (`~/.puttry/2fa-state.json`) and kept in memory

**Replay Prevention**
A `lastUsedCodes` map tracks the most recent valid code per secret:
- If the same 6-digit code is used twice within a 30-second window, the second attempt is rejected
- Old entries (>2 minutes) are cleaned up to bound memory usage
- Prevents an attacker from reusing a captured TOTP code

**State File: `~/.puttry/2fa-state.json`**
```json
{
  "secret": "base32-encoded-secret",
  "verified": true,
  "setupAt": "2026-03-20T14:30:00.000Z"
}
```
- File permissions: `0o600`
- Schema is strictly validated on load: unexpected fields are rejected
- If verification fails, the server rejects the file and disables 2FA

**Setup Flow & Expiration**
- When 2FA setup is initiated, a temporary secret is stored in memory with a **5-minute expiration**
- If not verified within 5 minutes, the pending secret is discarded
- Prevents stale setup sessions from cluttering memory

### 2.3 Passkeys (WebAuthn)

Passkeys provide **phishing-resistant** cryptographic authentication using your device's built-in security (Touch ID, Face ID, Windows Hello, or security keys).

**Libraries & Standards**
- `@simplewebauthn/server` v13 (battle-tested, actively maintained)
- WebAuthn Level 2 (FIDO2)
- Attestation type: `"direct"` — trusts device attestation statements

**Relying Party (RP) Configuration**
- RP ID (domain): derived from `PASSKEY_RP_ORIGIN` environment variable
  - Example: if `PASSKEY_RP_ORIGIN=https://puttry.example.com`, RP ID is `puttry.example.com`
  - Prevents cross-origin credential use—passkeys registered for one domain cannot be used on another (phishing-resistant)
- RP Name: `"PuTTrY"`

**Challenge Management**
- A new **cryptographic challenge** is generated for each authentication attempt
- Stored server-side in the `pendingChallenges` map with a **5-minute TTL**
- After retrieval for verification, the challenge is immediately **deleted** (single-use)
- Prevents challenge reuse attacks

**Signature Counter Verification**
- Each passkey stores a monotonically increasing counter value
- On every authentication, the counter is incremented on the server
- If a client's counter is less than the stored value, the authentication is rejected
- Detects cloned or replayed credentials

**Storage: `~/.puttry/passkeys.json`**
```json
[
  {
    "id": "base64url-credential-id",
    "name": "iPhone Touch ID",
    "publicKey": "base64-encoded-public-key",
    "counter": 42,
    "registeredAt": "2026-03-20T14:30:00.000Z",
    "transports": ["internal", "hybrid"]
  }
]
```
- File permissions: `0o600`
- Stored public keys, not private keys (private keys remain on the device)
- Schema is strictly validated on load: malformed entries are skipped
- Counter values are persisted and compared on each auth attempt

**Dual Modes**
1. **Passkey as 2FA** (`PASSKEY_AS_2FA=true`, default):
   - After password entry, user must authenticate with a passkey
   - Cannot be used alone—password is always required first
   - Second factor can also be TOTP if both are enabled

2. **Passkey as standalone auth** (`PASSKEY_AS_2FA=false`):
   - Passkey replaces password entirely—no password required
   - User selects "Sign in with passkey" and completes WebAuthn authentication
   - Suitable for environments where biometric auth is preferred

### 2.4 Multi-Factor Login Flow

When the session password is correct, the server checks the 2FA configuration:

**Case 1: No 2FA Configured**
```
POST /api/auth/login (password)
  → ✓ Password valid
  → Create browser session (_wt_session)
  → Return { authenticated: true }
```

**Case 2: TOTP or Passkey Required (2FA Active)**
```
POST /api/auth/login (password)
  → ✓ Password valid
  → Create temporary session (_wt_temp)
  → Return { authenticated: false, requiresTOTP: true } OR { requiresPasskey: true }
POST /api/auth/totp/verify (code) OR /api/auth/passkey/verify
  → Verify code/signature
  → Promote _wt_temp to _wt_session (browser session)
  → Return { authenticated: true }
```

**Case 3: Both TOTP and Passkey Enabled**
```
POST /api/auth/login (password)
  → ✓ Password valid
  → Create temporary session (_wt_temp)
  → Return { canChoose: true, requiresTOTP: true, requiresPasskey: true }
User chooses verification method
  → POST /api/auth/totp/verify OR POST /api/auth/passkey/verify
  → Promote _wt_temp to _wt_session
```

**Case 4: TOTP Setup Required (TOTP enabled but not yet configured)**
```
POST /api/auth/login (password)
  → ✓ Password valid
  → No passkeys active, TOTP not yet set up
  → Create temporary session (_wt_temp)
  → Return { requiresTOTP: true, totpMode: "setup" }
User completes TOTP setup
  → QR code displayed (contains secret)
  → POST /api/auth/totp/setup/verify (code)
  → Save TOTP state, promote to browser session
```

---

## 3. Session Management

PuTTrY uses **two types of cookies** to manage authentication state:

| Cookie | Purpose | TTL | Attributes |
|--------|---------|-----|-----------|
| `_wt_session` | Full authentication session | 24 hours | HttpOnly, SameSite=Strict, Path=/ |
| `_wt_temp` | 2FA in-progress (temporary) | 5 minutes | HttpOnly, SameSite=Strict, Path=/ |

**Cookie Attributes**
- `HttpOnly`: Prevents JavaScript from accessing the cookie (mitigates XSS)
- `SameSite=Strict`: Cookie is only sent in same-site requests (mitigates CSRF)
- `Secure` flag: Added automatically when running under HTTPS or in production
- `Path=/`: Cookie is available to all endpoints

**Session Tokens**
- Generated via `crypto.randomUUID()` (cryptographically secure, 128 bits)
- Stored in-memory in maps: `activeSessions` and `pendingTotpSessions`
- **Lost on server restart** (intentional design—no persistent database)

**Session Cleanup**
- Expired sessions are automatically deleted from memory after TTL expires
- Temporary sessions (2FA in-progress) expire after 5 minutes
- Browser sessions (authenticated) expire after 24 hours
- Sessions are also cleaned up on explicit logout

**Logout**
- `DELETE /api/auth` endpoint invalidates the browser session
- Requires full authentication (prevents CSRF-based logout)
- Sets `Max-Age=0` on both session cookies

---

## 4. Web Application Security

### 4.1 HTTP Security Headers

PuTTrY sets the following headers on all responses:

| Header | Value | Protection |
|--------|-------|-----------|
| `X-Frame-Options` | `DENY` | Clickjacking (prevents embedding in `<iframe>`) |
| `X-Content-Type-Options` | `nosniff` | MIME sniffing attacks (enforces declared content type) |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Referrer leakage (sends full referrer to same origin, none to cross-origin) |
| `Content-Security-Policy` | (see below) | XSS, resource injection |

**Content Security Policy (CSP)**

Production CSP:
```
default-src 'self';
connect-src 'self' ws: wss:;
img-src 'self' data:;
script-src 'self';
style-src 'self' 'unsafe-inline'
```

- `default-src 'self'`: All resources must be same-origin by default
- `connect-src 'self' ws: wss:`: HTTP/WebSocket requests only to same origin
- `img-src 'self' data:`: Images from same origin or embedded data URIs (for QR codes)
- `script-src 'self'`: Only same-origin scripts; no inline scripts, no eval
- `style-src 'self' 'unsafe-inline'`: Styles from same origin; unsafe-inline needed for some UI frameworks

Development CSP adds `'unsafe-inline'` to `script-src` to support Vite HMR during development.

### 4.2 DNS Rebinding Protection

DNS rebinding attacks occur when an attacker controls a domain that resolves to the victim's localhost/private IP, allowing cross-origin requests to the victim's server.

**Mitigation**
- Every HTTP request (including WebSocket upgrades) validates the `Host` header against an allowlist
- Default allowlist: `localhost`, `127.0.0.1`, `::1`
- Extended via `ALLOWED_HOSTS` environment variable (comma-separated)
- Mismatched host → `403 Forbidden` response
- WebSocket upgrade → socket is destroyed

Example:
```bash
# Allow requests from localhost and puttry.example.com
ALLOWED_HOSTS=localhost,puttry.example.com
```

### 4.3 CSRF Mitigation

Cross-Site Request Forgery (CSRF) attacks trick browsers into sending authenticated requests to a victim's server from an attacker's site.

**Primary Defense: SameSite=Strict Cookies**
- Session cookies use `SameSite=Strict`
- The browser never sends these cookies in cross-site requests
- No additional CSRF token needed—the cookie itself cannot leak

**Logout Protection**
- The logout endpoint (`DELETE /api/auth`) requires full authentication
- Cannot be triggered by a CSRF attack (attacker cannot read the response)

### 4.4 Rate Limiting

Four independent rate limiters protect against brute-force and denial-of-service attacks:

| Limiter | Endpoint(s) | Window | Max Requests | Purpose |
|---------|------------|--------|-------------|---------|
| **Global** | All unauthenticated | 15 min | 500 | DoS protection (skipped for authenticated users) |
| **Password Login** | `POST /api/auth/login` | 1 hour | 10 | Brute-force protection |
| **2FA Verify** | `POST /api/auth/totp/verify`, `/api/auth/passkey/verify` | 10 min | 5 | 2FA brute-force protection |
| **Passkey Challenge** | `POST /api/auth/passkey/standalone/options` | 15 min | 10 | Passkey setup DoS prevention |

**Configuration**
- All limits are configurable via environment variables:
  - `RATE_LIMIT_GLOBAL_MAX=500`
  - `RATE_LIMIT_SESSION_PASSWORD_MAX=10`
  - `RATE_LIMIT_TOTP_MAX=5`
  - `RATE_LIMIT_PASSKEY_CHALLENGE_MAX=10`
- Limits are **stored in-memory**—they apply per server instance
- Rate-limit response headers (`RateLimit-*`) are **not exposed** to clients (security through obscurity not reliable, but no benefit to exposing)

**Rate Limit Security**
- Limits cannot be changed via API—they're CLI/environment-only
- Authenticated requests skip the global limiter (lower limit applies to each auth attempt instead)

### 4.5 WebSocket Authentication and Revalidation

WebSocket connections (used for terminal I/O and sync messages) require authentication and ongoing validation.

**Initial Authentication (Upgrade Time)**
- WebSocket upgrade requests are validated at the HTTP upgrade phase
- The `_wt_session` browser session cookie is extracted and validated
- If the session is invalid or expired, the upgrade is rejected (`socket.destroy()`)
- Returns `HTTP 401` for invalid sessions

**Periodic Revalidation**
- While a WebSocket connection is open, the server re-validates the session **every 30 seconds**
- If the session has been invalidated (user logged out, token expired, etc.), the connection is closed mid-stream
- Ensures that logging out from one browser immediately closes terminal WebSockets in other windows

**Two WebSocket Channels**

1. **`/sync` WebSocket** (sync bus):
   - Single persistent connection per browser for coordination
   - Carries control messages (session CRUD, input lock changes)
   - Broadcasts state to all open tabs
   - Max payload: 256 KB

2. **`/terminal/:sessionId` WebSocket** (per-terminal):
   - Individual connections for each viewing terminal
   - Carries raw PTY input/output and resize messages
   - Closed when user switches to a different terminal
   - Max payload: 1 MB

### 4.6 WebSocket Payload Limits

Oversized payloads are rejected at the WebSocket server level, preventing memory exhaustion attacks:

| Channel | Max Payload |
|---------|------------|
| `/sync` | 256 KB |
| `/terminal/:sessionId` | 1 MB |

### 4.7 PTY Input Security

Pseudo-terminal input is heavily constrained to prevent abuse:

**Input Size Limit**
- Hard cap: **64 KB per message**
- Excess input is **truncated** (not queued), preventing buffer bloat

**Terminal Resize Security**
- `cols` and `rows` are clamped to `[1, 500]`
- Prevents malformed resize messages that could exhaust memory

**Shell Invocation (Command Injection Prevention)**
- Shell is spawned with `spawn(shell, [])` — array-based argument list
- No shell interpolation; the shell receives the exact arguments
- Input to the PTY is raw data stream—cannot escape into shell commands
- Process inspection uses `execFileSync("ps", ["-p", pid, ...])` — not `exec()`, preventing PID injection

**Write Lock (Single Writer)**
- Only one browser client at a time can send input to a PTY
- Other connected clients are **read-only**
- `clientId` parameter (used for logging) is sanitized to `[a-zA-Z0-9\-_]*`, preventing log injection

### 4.8 Configuration and Environment Variable Security

**Environment Variable Allowlist (CRIT-6)**
Only 17 approved environment variables are loaded from `.env` files:

1. `AUTH_DISABLED`
2. `SHOW_AUTH_DISABLED_WARNING`
3. `TOTP_ENABLED`
4. `SESSION_PASSWORD_TYPE`
5. `SESSION_PASSWORD_LENGTH`
6. `PASSKEY_RP_ORIGIN`
7. `PASSKEY_AS_2FA`
8. `RATE_LIMIT_GLOBAL_MAX`
9. `RATE_LIMIT_SESSION_PASSWORD_MAX`
10. `RATE_LIMIT_TOTP_MAX`
11. `RATE_LIMIT_PASSKEY_CHALLENGE_MAX`
12. `SCROLLBACK_LINES`
13. `PORT`
14. `HOST`
15. `NODE_ENV`
16. `ALLOWED_HOSTS`

Any other keys (including dangerous ones like `NODE_OPTIONS`, `LD_PRELOAD`, `PATH`) are **silently ignored**.

**Settings API Restrictions (CRIT-1, HIGH-1)**
- `AUTH_DISABLED` cannot be changed via the settings API—only via CLI or `.env` file
- Rate-limit keys (`RATE_LIMIT_*`) cannot be changed via the settings API—only via CLI or `.env` file
- These settings affect core security and must require a server restart to change

**Settings Value Sanitization (CRIT-2)**
- When writing `.env` files, newlines (`\n`), carriage returns (`\r`), and null bytes (`\0`) are **stripped** from values
- Prevents newline injection attacks (e.g., injecting new `.env` entries)
- Numeric settings have enforced `min`/`max` bounds

**Process Environment Isolation**
- Existing `process.env` values are never overwritten by `.env` content
- CLI arguments take precedence over `.env` files

---

## 5. On-Disk Security

State files are stored in `~/.puttry/` with strict permissions and validation:

| File | Permissions | Contents | Validation |
|------|-------------|----------|-----------|
| `session-password.txt` | `0o600` | scrypt hash (`scrypt:<salt>:<hash>`) | Verified format on load |
| `2fa-state.json` | `0o600` | TOTP secret + status | Strict schema validation |
| `passkeys.json` | `0o600` | Array of passkey objects | Strict schema validation per entry |

**Schema Validation**
- All JSON files are validated against a strict schema on every load
- Extra fields are rejected (prevents tampering or corruption)
- Invalid entries are logged and skipped; file is not silently corrupted
- Files can be manually edited (with care) and will be validated on next load

**File Permissions**
- `0o600` — read/write by owning user only, no access for group/others
- Enforced via `writeFileSync(..., { mode: 0o600 })`
- Protects against local privilege escalation attacks

---

## 6. What PuTTrY Does Not Handle (Intentionally)

PuTTrY assumes responsibility for application-level security but delegates infrastructure concerns to the deployment layer:

### Transport Security: TLS/HTTPS
- PuTTrY does not perform TLS termination
- Handled at the **reverse proxy layer** (nginx, Caddy, cloud load balancer, etc.)
- See [Network and Infrastructure Security](./NETWORK_SECURITY.md) for deployment guidance

### HTTP Strict Transport Security (HSTS)
- `Strict-Transport-Security` header is set at the **reverse proxy layer**, not in the application
- Ensures browsers always use HTTPS for future connections

### Cross-Origin Resource Sharing (CORS)
- Not applicable to PuTTrY's single-user model
- Access control is enforced via:
  - `SameSite=Strict` cookies (prevent cross-site requests)
  - Host header validation (DNS rebinding protection)

### Multi-User Isolation
- PuTTrY is **single-user per instance**
- Each user runs their own server instance
- No user isolation, permission checks, or inter-user attacks are relevant
- See [Deployment](./PRODUCTION.md) for multi-user scenarios

---

## 7. Threat Model & Mitigations

| Threat | Attack Method | Mitigation |
|--------|--------|-----------|
| **Brute-force Password** | Repeated login attempts | Rate limiting (10 attempts/hour) |
| **Brute-force 2FA** | Repeated TOTP/passkey attempts | Rate limiting (5 attempts/10 min) |
| **Phishing** | User tricks into revealing password | Passkeys are phishing-resistant (RP ID validation) |
| **Credential Stuffing** | Compromised credentials from other services | Password not from dictionary; TOTP/passkey required |
| **Session Hijacking** | Attacker steals session cookie | `HttpOnly` prevents JavaScript access; `SameSite=Strict` prevents cross-site leakage |
| **CSRF** | Cross-site request forgery | `SameSite=Strict` cookies; critical ops require authentication |
| **XSS** | Injected malicious script | `Content-Security-Policy` (no inline scripts, same-origin only); `X-Content-Type-Options: nosniff` |
| **Clickjacking** | Embedding PuTTrY in malicious iframe | `X-Frame-Options: DENY` |
| **DNS Rebinding** | Attacker's domain resolves to victim's IP | Host header validation; default allowlist (`localhost`, `127.0.0.1`, `::1`) |
| **Man-in-the-Middle (MITM)** | Attacker intercepts unencrypted traffic | HTTPS enforcement at proxy layer; `Secure` cookie flag |
| **Local Credential Theft** | Attacker with local file access | File permissions `0o600`; scrypt hashing (slow, high memory) |
| **Replay Attack (TOTP)** | Attacker reuses valid TOTP code | Replay prevention: same code rejected within 30-second window |
| **Cloned Passkey** | Attacker clones a registered passkey | Signature counter verification detects replayed credentials |
| **DoS via Large Input** | Sending gigabyte-sized payloads | Payload limits: 64 KB PTY input, 256 KB sync, 1 MB terminal |
| **DoS via Malformed Resize** | Invalid terminal dimensions crash PTY | Dimensions clamped to [1, 500] |
| **Command Injection** | Shell escapes via malformed input | No shell interpolation; array-based spawn |
| **Privilege Escalation (Local)** | Attacker exploits SUID/file perms | Files use `0o600`; server runs as unprivileged user |
| **Process Injection** | Attacker modifies process env at runtime | Env var allowlist; `.env` does not override existing `process.env` |
| **Log Injection** | Attacker injects log control codes | `clientId` sanitized to `[a-zA-Z0-9\-_]*` |
| **Settings Tampering** | Attacker changes security settings via API | `AUTH_DISABLED` and rate limits are CLI-only (not API-accessible) |
| **Newline Injection** | Attacker injects new `.env` entries | Settings sanitization: `\n`, `\r`, `\0` stripped before writing |

---

## 8. Verification Checklist

When reviewing PuTTrY's security:

- [ ] Session password uses scrypt (N=32768 production, 32-byte salt)
- [ ] Passwords compared with `timingSafeEqual()` (constant-time)
- [ ] TOTP codes validated per RFC 6238; replay prevention active
- [ ] Passkey challenges are single-use with 5-minute TTL
- [ ] Passkey signature counter verified on each auth
- [ ] Browser sessions have 24-hour TTL; temp sessions 5 minutes
- [ ] All cookies use `HttpOnly`, `SameSite=Strict`
- [ ] Security headers present: `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `CSP`
- [ ] DNS rebinding protection: Host header validated
- [ ] Rate limiting: global (15m/500), password (1h/10), 2FA (10m/5)
- [ ] WebSocket auth: validated at upgrade; periodic revalidation every 30s
- [ ] Payload limits enforced: 256 KB sync, 1 MB terminal, 64 KB PTY input
- [ ] PTY spawned with array args (no shell interpolation)
- [ ] State files have `0o600` permissions
- [ ] Env var allowlist: only 17 approved keys loaded
- [ ] Settings API cannot modify `AUTH_DISABLED` or rate limits
- [ ] Settings values sanitized: `\n`, `\r`, `\0` stripped

---

## 9. References

- **scrypt**: [BIP-38 Specification](https://github.com/bitcoin/bips/blob/master/bip-0038.mediawiki)
- **TOTP**: [RFC 6238 - Time-Based One-Time Password](https://tools.ietf.org/html/rfc6238)
- **WebAuthn**: [W3C WebAuthn Level 2](https://www.w3.org/TR/webauthn-2/)
- **OWASP**: [Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html), [Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- **HTTP Security Headers**: [OWASP Secure Headers Project](https://owasp.org/www-project-secure-headers/)
