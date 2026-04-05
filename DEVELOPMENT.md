# Development Guide

## Project Structure

```
src/
├── __tests__/
│   ├── browser/
│   │   └── setup.ts
│   └── server/
│       ├── setup.ts
│       └── unit/
│           ├── app.test.ts
│           ├── auth-middleware.test.ts
│           ├── auth-state.test.ts
│           ├── env-loader.test.ts
│           ├── file-routes.test.ts
│           ├── guest-routes.test.ts
│           ├── guest-session-store.test.ts
│           ├── passkey-config.test.ts
│           ├── passkey-state.test.ts
│           ├── password-gen.test.ts
│           ├── password-hash.test.ts
│           ├── session-store.test.ts
│           ├── settings-api.test.ts
│           ├── sync-bus.test.ts
│           ├── terminal-routes.test.ts
│           └── totp-helper.test.ts
├── client/
│   ├── components/
│   │   ├── auth/
│   │   │   ├── AuthScreens.tsx
│   │   │   ├── LoginScreen.tsx
│   │   │   ├── PasskeyVerifyScreen.tsx
│   │   │   ├── TotpSetupScreen.tsx
│   │   │   └── TotpVerifyScreen.tsx
│   │   ├── layout/
│   │   │   ├── MobileMenuDrawer.tsx
│   │   │   └── ProcessInfoPopup.tsx
│   │   ├── ui/
│   │   │   ├── button.tsx
│   │   │   ├── dialog.tsx
│   │   │   ├── settings.tsx
│   │   │   └── switch.tsx
│   │   ├── ConfirmDialog.tsx
│   │   ├── FileManagerDialog.tsx
│   │   ├── GuestLandingScreen.tsx
│   │   ├── GuestPanel.tsx
│   │   ├── MobileKeyToolbar.tsx
│   │   ├── SessionsSidebar.tsx
│   │   ├── SettingsDialog.tsx
│   │   ├── TerminalPage.tsx
│   │   ├── TerminalPane.tsx
│   │   ├── TerminalSearchBar.tsx
│   │   └── WebTerminalLogo.tsx
│   ├── hooks/
│   │   ├── useAuth.ts
│   │   ├── useGuestMode.ts
│   │   ├── useInputLocks.ts
│   │   ├── useMobileLayout.ts
│   │   ├── useSync.ts
│   │   └── useTerminal.ts
│   ├── lib/
│   │   ├── clientId.ts
│   │   └── utils.ts
│   ├── App.tsx
│   ├── main.tsx
│   └── vite-env.d.ts
├── server/
│   ├── auth/
│   │   ├── middleware.ts
│   │   ├── passkey-config.ts
│   │   ├── passkey-state.ts
│   │   ├── password-hash.ts
│   │   ├── routes.ts
│   │   ├── state.ts
│   │   └── totp-helper.ts
│   ├── sessions/
│   │   ├── guest-store.ts
│   │   ├── pty-manager.ts
│   │   ├── store.ts
│   │   └── sync-bus.ts
│   ├── routes/
│   │   ├── files.ts
│   │   ├── guest.ts
│   │   └── terminal.ts
│   ├── lib/
│   │   ├── env.ts
│   │   ├── logger.ts
│   │   ├── rate-limit.ts
│   │   └── settings.ts
│   ├── app.ts
│   ├── cli.ts
│   ├── cli-configure.ts
│   ├── server.ts
│   └── vite-plugin.ts
└── shared/
    ├── types/
    │   ├── auth.ts
    │   ├── guest.ts
    │   ├── session.ts
    │   └── sync.ts
    └── utils/
        └── password-gen.ts
```

### `/src/client` — React frontend

**Components** (`components/`)
- `auth/` — Authentication screens
  - `AuthScreens.tsx` — Router for all auth states
  - `LoginScreen.tsx` — Password entry
  - `TotpSetupScreen.tsx` — TOTP QR code setup
  - `TotpVerifyScreen.tsx` — TOTP code verification
  - `PasskeyVerifyScreen.tsx` — Passkey authentication
- `layout/` — Layout & overlay components
  - `MobileMenuDrawer.tsx` — Mobile menu drawer
  - `ProcessInfoPopup.tsx` — Session info popup
- `ui/` — Reusable shadcn/ui components
  - `button.tsx`, `dialog.tsx`, `switch.tsx`, `settings.tsx`
- `ConfirmDialog.tsx` — Generic confirmation dialog
- `FileManagerDialog.tsx` — Upload/download UI
- `GuestLandingScreen.tsx` — Guest link landing page
- `GuestPanel.tsx` — Manage guest links (create, list, delete)
- `MobileKeyToolbar.tsx` — Mobile keyboard toolbar
- `SessionsSidebar.tsx` — Session list and controls
- `SettingsDialog.tsx` — Unified settings dialog (6 sections: terminal, password, TOTP, passkeys, access, rate-limits)
- `TerminalPage.tsx` — Main app page (layout + all dialogs)
- `TerminalPane.tsx` — Single terminal pane with xterm.js
- `TerminalSearchBar.tsx` — Find-in-terminal UI
- `WebTerminalLogo.tsx` — PuTTrY logo

**Hooks** (`hooks/`)
- `useAuth.ts` — Login/logout, password visibility, TOTP/passkey flows
- `useSync.ts` — WebSocket connection, session list, active session
- `useTerminal.ts` — xterm.js instances, terminal operations
- `useMobileLayout.ts` — Responsive breakpoints, sidebar visibility
- `useInputLocks.ts` — Input lock notifications
- `useGuestMode.ts` — Guest links state

**Lib** (`lib/`)
- `clientId.ts` — Generate and store persistent client ID
- `utils.ts` — Formatting, DOM helpers

**Entry**
- `App.tsx` — Root component (route auth/guest/main)
- `main.tsx` — ReactDOM.render

### `/src/server` — Node.js backend (Express)

**Entry Points**
- `server.ts` — Server startup (HTTP + WebSocket)
- `app.ts` — Express app setup, middleware, route registration
- `cli.ts` — CLI entry point
- `cli-configure.ts` — CLI commands for settings
- `vite-plugin.ts` — Vite dev server integration

**Authentication** (`auth/`)
- `routes.ts` — `/api/auth/*` endpoints
  - `/login` — Password-based login
  - `/2fa/qr` — Generate TOTP QR code
  - `/2fa/status` — Check if TOTP registered
  - `/2fa/setup` — Verify TOTP code and save registration
  - `/2fa/verify` — Verify TOTP during login
  - `/2fa/disable` — Clear TOTP registration
  - `/passkey/register/options`, `/passkey/register/verify` — Passkey registration
  - `/passkey/auth/options`, `/passkey/auth/verify` — Passkey login
  - `/passkey/standalone/*` — Standalone passkey login (when no password)
  - `/passkeys` — List registered passkeys
  - `/passkey/:id` — Delete passkey
  - `/session-password/rotate` — Generate new password
  - `/session-password/set` — Set custom password
- `state.ts` — Manage password/TOTP state from `~/.puttry/`
- `middleware.ts` — `requireAuth`, `requireAuthOrTempSession` helpers
- `totp-helper.ts` — TOTP secret generation, QR code, verification
- `passkey-config.ts` — WebAuthn RP ID, origin, challenge storage
- `passkey-state.ts` — Load/save passkey credentials from disk
- `password-hash.ts` — bcrypt hashing

**Sessions & Sync** (`sessions/`)
- `store.ts` — In-memory maps: active sessions, PTY processes, auth tokens
- `pty-manager.ts` — Spawn and manage pseudo-terminals
- `sync-bus.ts` — WebSocket protocol handler for terminal I/O and state sync
- `guest-store.ts` — Guest link CRUD and guest session mapping

**Routes** (`routes/`)
- `terminal.ts` — `/api/sessions/*`
  - POST `/` — Create session
  - GET `/` — List sessions
  - GET `/:id` — Get session info
  - DELETE `/:id` — Close session
  - DELETE / — Close all sessions
- `guest.ts` — `/api/guest/*`
  - POST `/` — Create guest link
  - GET `/` — List guest links
  - DELETE `/:token` — Delete guest link
- `files.ts` — `/api/files/*`
  - POST `/upload` — Upload file
  - GET `/list` — Browse directory
  - GET `/download` — Download file

**Utilities** (`lib/`)
- `logger.ts` — Winston logging
- `settings.ts` — Settings registry, validation, persistence to `~/.puttry/.env`
- `rate-limit.ts` — Express rate limiting middleware
- `env.ts` — Load and parse environment variables

### `/src/shared` — Shared types & utilities

**Types** (`types/`)
- `auth.ts` — Auth response types, 2FA modes
- `guest.ts` — GuestLink interface
- `session.ts` — Session interface
- `sync.ts` — WebSocket message types

**Utils** (`utils/`)
- `password-gen.ts` — XKCD dictionary, random password generation

### `/src/__tests__` — Test suite

**Server unit tests** (`server/unit/`)
- Test files for each major module (auth, sessions, settings, routes)

**Browser tests** (`browser/`)
- Browser test setup

### Root files
- `index.html` — HTML entry point
- `package.json` — Dependencies and scripts
- `tsconfig.json` — TypeScript configuration
- `vite.config.ts` — Vite build configuration
- `DEVELOPMENT.md` — This file

## Key Architecture Decisions

### Authentication
- **Session Password**: Stored as bcrypt hash in `~/.puttry/session-password.txt`
- **TOTP (2FA)**: Stored in `~/.puttry/2fa-state.json` with `secret` and `verified` flag
- **Passkeys**: Stored in `~/.puttry/passkeys.json` (WebAuthn credentials)
- **Temp Sessions**: In-memory tokens for 2FA setup/verification before full login

### Sessions & Sync
- **Session Store**: In-memory map of active sessions with PTYs (`src/server/sessions/store.ts`)
- **WebSocket**: Real-time sync via `sync-bus.ts` for terminal I/O, input locks, session list
- **PTY Manager**: Spawns and manages pseudo-terminal processes with TTY.js (`src/server/sessions/pty-manager.ts`)
- **Input Locks**: When a guest/user uses a session, other clients get read-only mode (lock held in memory)
- **Scrollback**: Configurable lines stored in `SCROLLBACK_LINES` setting, enforced per session

### Guest Links
- Token-based access without password (managed in `src/server/sessions/guest-store.ts`)
- Each link has a token, name, and list of session IDs
- Stored in `~/.puttry/guest-links.json`
- Guest clients connect via `/guest/{token}` and sync via WebSocket with limited access

### Settings
- Stored in `~/.puttry/.env` or `.env.local` in project root
- Registry in `src/server/lib/settings.ts` defines which settings are API-accessible
- `AUTH_DISABLED` and `PASSKEY_RP_ORIGIN` are marked as CLI/file-only

## Development Commands

```bash
# Install dependencies
npm install

# Start dev server (Vite + Express)
npm run dev

# Build for production
npm run build

# Run type checking
npx tsc

# Format code
npm run format

# Lint
npm run lint
```

## Adding a New Feature

### New API Endpoint
1. Create handler in appropriate file:
   - Auth endpoints → `src/server/auth/routes.ts`
   - Session/terminal endpoints → `src/server/routes/terminal.ts`
   - Guest endpoints → `src/server/routes/guest.ts`
   - File endpoints → `src/server/routes/files.ts`
2. Use middleware from `src/server/auth/middleware.ts` if auth required (`requireAuth` or `requireAuthOrTempSession`)
3. Register route in `src/server/app.ts`
4. Call from client via `fetch('/api/...', { credentials: 'include' })`

### New Setting
1. Add to `config` object in `src/server/lib/settings.ts`
2. Add metadata to `SETTINGS_REGISTRY` (type, live, requiresRestart, etc.)
3. Implement GET endpoint in `/api/settings` to return public config
4. Client can fetch and save via POST `/api/settings`

### New Component
1. Create in `src/client/components/` (or subdirectory)
2. Use `@/components/` import alias for relative imports
3. Use Tailwind + shadcn/ui components for consistency

## Security Considerations

- **Auth Disabled**: Only for development; shows warning banner in UI
- **TOTP Setup**: Server generates secret, never sent to client — client only verifies codes
- **Passkey Challenges**: Rate-limited and time-expiring
- **Session Passwords**: Hashed with bcrypt, never logged
- **WebSocket**: Requires valid session token in cookie

## Testing

- Unit tests in `src/__tests__/` (organized by module)
- Test utilities in `src/__tests__/utils/`
- Run tests with `npm test`

## Common Tasks

### Disable Authentication (Dev Only)
```bash
AUTH_DISABLED=1 npm run dev
```

### Enable TOTP
Set in `.env`:
```
TOTP_ENABLED=1
```

### Change Session Password Type
```
SESSION_PASSWORD_TYPE=random
SESSION_PASSWORD_LENGTH=8
```

### View Logs
Logs go to stdout/stderr. Use `npm run dev` to see real-time output.

## Troubleshooting

### WebSocket disconnects
- Check browser console for errors
- Verify session token is valid in cookies
- Look at server logs for `[sync]` messages

### TOTP setup fails
- Ensure `~/.puttry/` directory exists and is writable
- Check system time is accurate (TOTP is time-sensitive)
- Clear `~/.puttry/2fa-state.json` to reset

### Session stuck in read-only mode
- Another client holds the input lock
- Click the Ban icon to request control
- Or close the other client's connection

### Guest link not working
- Verify token matches in `~/.puttry/guest-links.json`
- Check token hasn't expired
- Guest must have at least one session ID assigned
