# Development

## Getting Started

To set up PuTTrY for local development:

```bash
# Clone the repository
git clone <repo-url>
cd puttry

# Install dependencies
npm install

# Start the dev server
npm run dev
```

The dev server will start on `http://localhost:5175` and display the session password in the terminal. Open the URL in your browser and authenticate with the password.

## Project Structure

```
puttry/
├── src/
│   ├── components/             # React UI components
│   │   ├── auth/               # Authentication UI (login, passkeys, TOTP)
│   │   ├── ui/                 # Shadcn/ui reusable components (button, dialog, switch, etc.)
│   │   ├── PasswordDialog.tsx   # Password setup/change dialog
│   │   ├── SessionsSidebar.tsx  # Session list and management sidebar
│   │   ├── TerminalPane.tsx     # Terminal output and input component
│   │   ├── SettingsDialog.tsx   # Settings UI
│   │   └── TopBar.tsx           # Header and navigation
│   │
│   ├── hooks/                  # React custom hooks
│   │   ├── useAuth.ts          # Authentication state hook
│   │   ├── useSyncWebSocket.ts # Session sync WebSocket hook
│   │   └── useSidebarResize.ts # Sidebar resize management
│   │
│   ├── lib/                    # Shared utilities
│   │   ├── clientId.ts         # Client identification
│   │   ├── password-gen.ts     # Session password generation
│   │   └── utils.ts            # Common helpers
│   │
│   ├── server/                 # Express backend
│   │   ├── auth/               # Authentication logic
│   │   │   ├── middleware.ts   # Auth validation middleware
│   │   │   ├── routes.ts       # Auth API endpoints (/login, /register, etc.)
│   │   │   └── passkey-config.ts # WebAuthn/passkey configuration
│   │   ├── app.ts              # Express app factory
│   │   ├── server.ts           # Server startup and configuration
│   │   ├── cli.ts              # CLI entry point (puttry command)
│   │   ├── cli-configure.ts    # CLI configuration helpers
│   │   ├── vite-plugin.ts      # Vite dev server integration
│   │   ├── pty-manager.ts      # PTY session lifecycle management
│   │   ├── session-store.ts    # In-memory session storage
│   │   ├── terminal-routes.ts  # Terminal API endpoints (/api/sessions, /api/exec)
│   │   ├── auth-state.ts       # Password & passkey persistence
│   │   ├── passkey-state.ts    # Passkey credentials storage
│   │   ├── sync-bus.ts         # WebSocket broadcast for session sync
│   │   ├── settings-api.ts     # Configuration management API
│   │   ├── rate-limit.ts       # Rate limiting middleware
│   │   ├── password-hash.ts    # bcrypt password hashing
│   │   ├── totp-helper.ts      # TOTP 2FA generation and validation
│   │   ├── env-loader.ts       # Environment variable loading
│   │   └── logger.ts           # Structured logging
│   │
│   ├── __tests__/              # Test suites
│   │   ├── server/             # Server/backend tests (Node.js environment)
│   │   │   ├── unit/           # Unit tests for server modules
│   │   │   └── integration/    # Integration tests with real database/PTY
│   │   ├── browser/            # Browser/frontend tests (jsdom environment)
│   │   │   ├── components/     # React component tests
│   │   │   └── unit/           # Unit tests for hooks/utilities
│   │   ├── server/setup.ts     # Server test setup and fixtures
│   │   └── browser/setup.ts    # Browser test setup and fixtures
│   │
│   ├── App.tsx                 # Main React app component
│   ├── main.tsx                # Frontend entry point
│   └── vite-env.d.ts           # Vite type definitions
│
├── vitest.config.ts            # Vitest configuration (server + browser projects)
├── vite.config.ts              # Vite configuration
├── tsconfig.json               # TypeScript configuration
├── package.json                # Dependencies and scripts
├── .github/workflows/          # GitHub Actions workflows
│   ├── ci.yml                  # Automated tests on push/PR
│   ├── publish.yml             # npm publishing (with test gate)
│   └── docs.yml                # Deploy docs to GitHub Pages
└── README.md                   # User documentation
```

## Development Scripts

**`npm run dev`** – Start Vite dev server with HMR (Hot Module Replacement)
- Frontend is served with live reloading
- Backend API and WebSockets are live via the custom Vite plugin
- Changes to React components reload instantly in the browser
- Changes to server code require a manual page refresh

**`npm run build`** – Build for production
- Compiles TypeScript with `tsc -b`
- Bundles frontend with Vite into `dist/`
- Outputs to `dist/` (frontend) and `dist-server/` (backend)

**`npm run build:server`** – Bundle backend with esbuild
- Produces `dist-server/server.js` (Express app)

**`npm run build:cli`** – Bundle CLI with esbuild
- Produces `dist-server/cli.js` (puttry command)

**`npm run lint`** – Run ESLint
- Checks TypeScript and React code for style and correctness

**`npm run preview`** – Preview production build locally
- Serves the built frontend from `dist/`
- Requires the Express backend to be running separately

## How Vite Dev Server Works

PuTTrY uses a custom Vite plugin (`vite-plugin.ts`) to integrate the Express backend with Vite's dev server:

### Frontend (Vite with HMR)

When you run `npm run dev`, Vite starts a dev server on port 5175. The frontend is served with **Hot Module Replacement (HMR)**:

- **React Fast Refresh**: Changes to `.tsx` files are reflected in the browser instantly without a full page reload. Component state is preserved.
- **CSS HMR**: Tailwind CSS changes apply instantly via the `@tailwindcss/vite` plugin.
- **Asset HMR**: Images and static files are reloaded on change.

### Backend (Express Integration)

The custom `webTerminalPlugin()` Vite plugin does two things:

**1. Mounts Express as Vite Middleware**
```typescript
configureServer(server) {
  server.middlewares.use(app)  // Mount Express on Vite's middleware stack
}
```

This means:
- All API routes (`/api/*`) are handled by Express
- The Express app runs **inside** Vite's dev server—no separate backend process needed
- Requests to Vite first check Express, then fall back to Vite's frontend serving

**2. Handles WebSocket Upgrades**
```typescript
server.httpServer?.on("upgrade", (req, socket, head) => {
  // /sync WebSocket (session synchronization)
  // /terminal/:sessionId WebSocket (PTY I/O)
})
```

The plugin intercepts HTTP upgrade requests for:
- `/sync` – Broadcasts session creation/deletion/lock changes across browser tabs
- `/terminal/:sessionId` – Streams terminal output and receives user input

This allows real-time terminal I/O and multi-tab synchronization during development.

### Development Flow

```
1. Browser connects to http://localhost:5175
   ↓
2. Vite serves index.html with React app
   ↓
3. React app loads and makes API calls:
   - POST /api/auth/login
   - GET /api/sessions
   - WebSocket /sync
   ↓
4. Vite's middleware stack catches these requests
   ↓
5. Express handles them (auth, session management, etc.)
   ↓
6. PTY shell runs on the backend; output streams via /terminal/:sessionId WS
   ↓
7. React receives updates and renders the terminal in real-time
```

### No Separate Backend Server Needed

Unlike some full-stack setups, you don't need to run a separate backend server in dev. The Vite plugin ensures:
- API routes are available immediately
- WebSockets work across the dev server
- Changes to backend code are reflected without restarting (Node's module system handles this for most changes)

If you modify backend code and it doesn't reflect, refresh your browser. For full isolation, you can restart the Vite dev server.

### Environment Variables

Dev mode loads `.env.local` from the project root (for development settings) and `~/.puttry/.env` (for production-like configs):

```bash
# .env.local (development overrides)
PORT=5175
AUTH_DISABLED=0
TOTP_ENABLED=0
```

See the startup logs for which env file was loaded and current settings.

## Debugging

**Browser DevTools**
- Open DevTools (F12) to inspect React components, network requests, and WebSocket messages
- Use React DevTools extension to inspect component state and props

**Server Logging**
- All API requests, authentication, and PTY events are logged to stdout
- Log format: `[component] message` (e.g., `[auth] Session password rotated`)

**WebSocket Debugging**
- Network tab → WS connections → Messages
- Watch `/sync` for session state changes
- Watch `/terminal/:sessionId` for terminal data

## Common Development Tasks

**Run with Auth Disabled (for testing)**
```bash
AUTH_DISABLED=1 npm run dev
```

**Run with Custom Port**
```bash
PORT=3000 npm run dev
```

**Enable TOTP in Dev**
```bash
TOTP_ENABLED=1 npm run dev
```

**Build and Test Production Bundle**
```bash
npm run build:all
npm start  # Starts dist-server/server.js
```

**Lint Code**
```bash
npm run lint
```

## Running Tests

PuTTrY uses **Vitest** for testing with separate test projects for server and browser code.

### Test Structure

Tests are organized into two projects:

- **Server tests** – Node.js environment (`src/__tests__/server/**/*.test.ts`)
  - Backend logic, API routes, auth, PTY management
  - Runs in Node.js with filesystem access

- **Browser tests** – jsdom environment (`src/__tests__/browser/**/*.test.tsx`)
  - React components, hooks, UI logic
  - Simulates a browser DOM

### Running Tests

**Run all tests once:**
```bash
npm run test
```

**Run tests in watch mode** (re-run on file change):
```bash
npm run test:watch
```

**Run tests with coverage report:**
```bash
npm run test:coverage
```

Coverage reports are generated in three formats:
- `text` – Terminal output
- `lcov` – For IDE integration (e.g., coverage.py)
- `html` – `coverage/index.html` – open in browser for detailed report

Coverage thresholds are enforced:
- Lines: 80%
- Functions: 80%
- Branches: 70%

### Writing Tests

**Server test example** (`src/__tests__/server/example.test.ts`):
```typescript
import { describe, it, expect } from 'vitest'
import { someFunction } from '@/server/module'

describe('someFunction', () => {
  it('should do something', () => {
    const result = someFunction()
    expect(result).toBe('expected')
  })
})
```

**Browser test example** (`src/__tests__/browser/Component.test.tsx`):
```typescript
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MyComponent from '@/client/components/MyComponent'

describe('MyComponent', () => {
  it('should render and respond to click', async () => {
    const user = userEvent.setup()
    render(<MyComponent />)

    const button = screen.getByRole('button', { name: /click me/i })
    await user.click(button)

    expect(screen.getByText('Clicked!')).toBeInTheDocument()
  })
})
```

### Test Configuration

Tests are configured in `vitest.config.ts`:

- **Server project**: Uses Node.js environment with filesystem support
- **Browser project**: Uses jsdom to simulate browser DOM
- **Global test globals**: `describe`, `it`, `expect` are available without imports
- **Setup files**: Run before each test project
  - `src/__tests__/server/setup.ts` – Server test setup
  - `src/__tests__/browser/setup.ts` – Browser test setup

### Debugging Tests

**Run a single test file:**
```bash
npx vitest src/__tests__/server/auth.test.ts
```

**Run tests matching a pattern:**
```bash
npx vitest -t "should authenticate"
```

**Debug with Node DevTools** (server tests):
```bash
node --inspect-brk node_modules/vitest/vitest.mjs run src/__tests__/server/example.test.ts
```

Then open `chrome://inspect` in Chrome to debug.

**Enable verbose logging:**
```bash
npx vitest --reporter=verbose
```

### CI/CD Integration

PuTTrY has automated CI/CD workflows in GitHub Actions:

**CI Workflow** (`.github/workflows/ci.yml`)
- Triggers on every `push` to `main` and `pull_request` targeting `main`
- Installs dependencies with `npm ci`
- Runs all tests with `npm test` (119 Tier 1-3 unit tests)
- Must pass before merging to `main`

**Publish Workflow** (`.github/workflows/publish.yml`)
- Triggers when a version tag (`v*.*.*`) is pushed
- Verifies tests pass with `npm test` before publishing
- Confirms tag matches `package.json` version
- Publishes to npm with `npm publish --provenance`

**Before pushing:**

```bash
npm run lint
npm run test
npm run build:all
```

Ensure all checks pass locally before pushing. GitHub Actions will re-run tests automatically on push/PR.

## Testing the Terminal

Once the dev server is running:

1. Open `http://localhost:5175` in your browser
2. Enter the session password (shown in the terminal output)
3. Create a new session via the Web UI
4. Type commands in the terminal (e.g., `ls`, `echo "hello"`)
5. Try switching browsers/tabs to test write lock and synchronization
6. Check browser DevTools Network tab to see WebSocket activity

## Building for Production

To create a production build:

```bash
npm run build:all
```

This produces:
- `dist/` – Frontend bundle (HTML, JS, CSS)
- `dist-server/server.js` – Express server
- `dist-server/cli.js` – puttry CLI command

To test the production build locally:

```bash
npm run build:all
npm start
```

The server will start on port 3000 (or your configured `PORT`). Open `http://localhost:3000` to verify.

## Publishing to npm

PuTTrY supports two methods for publishing to the npm registry: **manual publishing** and **automated publishing via GitHub Actions**.

### Option 1: Manual Publishing

Follow these steps to manually publish a new version:

#### 1. Bump the Version

Use `npm version` to increment the version and create a git tag:

```bash
npm version patch    # 0.1.5 → 0.1.6 (bug fixes)
npm version minor    # 0.1.5 → 0.2.0 (new features)
npm version major    # 0.1.5 → 1.0.0 (breaking changes)
```

This automatically:
- Updates `package.json` and `package-lock.json`
- Creates a git commit with message `vX.Y.Z`
- Creates a git tag `vX.Y.Z`

See [semver](https://semver.org/) for versioning guidelines.

#### 2. Build and Test Locally

Ensure the build works before publishing:

```bash
npm run build:all
```

Test the CLI locally:

```bash
node dist-server/cli.js --help
```

#### 3. Authenticate with npm

Log in to your npm account (if not already logged in):

```bash
npm login
```

You'll be prompted for your username, password, and (if enabled) 2FA code.

#### 4. Publish

Publish the new version:

```bash
npm publish
```

The `prepublishOnly` script in `package.json` will automatically run before publishing to ensure the server and CLI bundles are built:

```bash
npm run build:server && npm run build:cli
```

#### 5. Push to Remote

Push the commit and tag **as separate commands**:

```bash
git push origin main
git push origin v0.1.6  # Replace with your actual version tag
```

**Important:** Do not use `git push origin main --tags` in a single command, as this may prevent the publish workflow from triggering.

#### 6. Verify

Check that the new version is published:

```bash
npm view @chfischerx/puttry versions
```

Or visit https://www.npmjs.com/package/@chfischerx/puttry

#### Troubleshooting

**Authentication failed**: Ensure you're logged in with `npm login` and your 2FA is enabled/disabled as configured.

**Package already published**: npm doesn't allow re-publishing the same version. Bump the version number and try again.

**Missing files**: Ensure `files` in `package.json` includes the built directories (`dist-server/`, `dist/`). Run `npm pack` to preview what will be published.

### Option 2: Automated Publishing via GitHub Actions

The publish workflow (`.github/workflows/publish.yml`) automatically publishes new versions to npm when you push a version tag to the repository.

#### 1. Bump the Version

Use `npm version` locally (same as manual method):

```bash
npm version patch    # 0.1.5 → 0.1.6 (bug fixes)
npm version minor    # 0.1.5 → 0.2.0 (new features)
npm version major    # 0.1.5 → 1.0.0 (breaking changes)
```

This creates a git tag and commit locally.

#### 2. Push to Remote

Push the commit and tag **as separate commands** to ensure GitHub Actions triggers correctly:

```bash
git push origin main
git push origin v0.1.6  # Replace with your actual version tag
```

**Important:** Do not use `git push origin main --tags` in a single command, as this may prevent the publish workflow from triggering.

#### 3. Workflow Execution

GitHub Actions will automatically:
- Detect the version tag (`v*.*.*`)
- Run the full test suite with `npm test` to verify everything passes
- Confirm the tag matches the version in `package.json`
- Build the bundles
- Publish to npm with `npm publish --provenance`

#### Benefits of Automated Publishing

- **Consistency**: Same build and test process every time
- **Safety**: Tests must pass before publishing (prevents accidental broken releases)
- **Transparency**: Publish history is visible in GitHub Actions
- **Provenance**: npm now supports build provenance, which is enabled automatically

#### Verification

After the workflow completes successfully:

```bash
npm view @chfischerx/puttry versions
```

Or visit https://www.npmjs.com/package/@chfischerx/puttry

### Choosing a Method

- **Use manual publishing** if you need to publish immediately or want direct control over the process
- **Use automated publishing** for most releases—it's more reliable and includes automatic testing

## Performance Considerations

- **Frontend**: React Fast Refresh only reloads changed components. Global styles are replaced without page reload.
- **Backend**: Changes to server code may require a page refresh to take effect, depending on Node's module caching.
- **WebSockets**: Persistent connections mean HMR doesn't reconnect—terminal sessions stay alive across frontend reloads.
- **PTY Output**: Each session buffers up to 10,000 lines of history by default. For long-running shells, memory usage grows over time.
