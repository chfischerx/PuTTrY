import express, { type Request, type Response } from "express"
import type { RateLimitRequestHandler } from "express-rate-limit"
import { createRequireAuth } from "./auth/middleware.js"
import { createAuthRouter } from "./auth/routes.js"
import { activeSessions, parseBrowserSessionToken } from "./sessions/store.js"
import { getPublicConfig } from "./lib/settings.js"

/**
 * Create and configure the Express app with all shared middleware and routes
 * Used by both production server and Vite dev plugin
 */
export async function createApp(options: {
  config: any
  logger: any
  sessionPasswordLimiter: RateLimitRequestHandler
  totpVerifyLimiter?: RateLimitRequestHandler
  passkeyChallengeLimiter?: RateLimitRequestHandler
  guestRedeemLimiter?: RateLimitRequestHandler
  globalLimiter: RateLimitRequestHandler
  createTerminalRouter: () => any
  updateSetting: (key: string, value: string) => any
  devMode?: boolean
}) {
  const app = express()
  const { config, logger, sessionPasswordLimiter, totpVerifyLimiter, passkeyChallengeLimiter, guestRedeemLimiter, globalLimiter, createTerminalRouter, updateSetting, devMode = false } = options

  // Trust proxy — needed when running behind ALB, reverse proxy, etc.
  // Set to 1 to trust the first proxy (common for ALB)
  app.set('trust proxy', 1)

  // Middleware
  app.use(express.json())

  // Host header check — blocks DNS rebinding
  const extraHosts = (process.env.ALLOWED_HOSTS ?? "")
    .split(",")
    .map(h => h.trim().replace(/^https?:\/\//, "").replace(/\/+$/, ""))
    .filter(Boolean)
  const allowedHostSet = new Set(["localhost", "127.0.0.1", "::1", ...extraHosts])

  app.use((req: Request, res: Response, next: () => void) => {
    const hostname = (req.headers.host ?? "").split(":")[0]
    if (allowedHostSet.has(hostname)) { next(); return }
    res.status(403).json({ error: "Forbidden: Host not allowed" })
  })

  // Security headers middleware
  app.use((_req: Request, res: Response, next: () => void) => {
    res.setHeader("X-Frame-Options", "DENY")
    res.setHeader("X-Content-Type-Options", "nosniff")
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin")

    // CSP: Dev mode allows unsafe-inline for Vite HMR, production does not
    const csp = devMode
      ? "default-src 'self'; connect-src 'self' ws: wss:; img-src 'self' data:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'"
      : "default-src 'self'; connect-src 'self' ws: wss:; img-src 'self' data:; script-src 'self'; style-src 'self' 'unsafe-inline'"

    res.setHeader("Content-Security-Policy", csp)
    next()
  })

  // Global rate limiter
  app.use(globalLimiter)

  // Create auth middleware for use with other endpoints
  const requireAuth = createRequireAuth(config)
  const { createRequireOwnerOrGuestAuth } = await import("./auth/middleware.js")
  const requireOwnerOrGuestAuth = createRequireOwnerOrGuestAuth(config)

  // Auth status endpoint (unauthenticated, called before login)
  app.get("/api/auth-status", async (req: Request, res: Response) => {
    if (config.AUTH_DISABLED) {
      res.json({ authenticated: true, authDisabled: true, showAuthDisabledWarning: config.SHOW_AUTH_DISABLED_WARNING, isGuest: false })
      return
    }
    const browserToken = parseBrowserSessionToken(req)
    let authenticated = false
    let isGuest = false
    let guestName: string | null = null

    if (browserToken) {
      const session = activeSessions.get(browserToken)
      authenticated = !!session && session.expiresAt > Date.now()
      if (!authenticated) activeSessions.delete(browserToken)
    } else {
      const { parseGuestSessionToken, activeGuestSessions } = await import("./sessions/guest-store.js")
      const guestToken = parseGuestSessionToken(req)
      if (guestToken) {
        const guestSession = activeGuestSessions.get(guestToken)
        if (guestSession && guestSession.expiresAt > Date.now()) {
          authenticated = true
          isGuest = true
          guestName = guestSession.name
        } else if (guestSession) {
          activeGuestSessions.delete(guestToken)
        }
      }
    }

    const { getPasskeys } = await import("./auth/passkey-state.js")
    const passkeyLoginAvailable = !config.PASSKEY_AS_2FA && getPasskeys().length > 0
    res.json({ authenticated, authDisabled: false, showAuthDisabledWarning: false, passkeyLoginAvailable, isGuest, guestName })
  })

  // Create and mount auth router
  const authRouter = await createAuthRouter(config, logger, sessionPasswordLimiter, totpVerifyLimiter, passkeyChallengeLimiter)
  app.use("/api/auth", authRouter)

  // Config endpoint (deprecated, kept for backwards compatibility)
  app.get("/api/config", requireOwnerOrGuestAuth, (_req: Request, res: Response) => {
    res.json({ scrollbackLines: config.SCROLLBACK_LINES })
  })

  // Settings endpoints
  app.get("/api/settings", requireOwnerOrGuestAuth, (_req: Request, res: Response) => {
    res.json(getPublicConfig())
  })

  app.post("/api/settings", requireAuth, (req: Request<unknown, unknown, { key: string; value: string }>, res: Response) => {
    const { key, value } = req.body
    const result = updateSetting(key, value)
    if (!result.success) {
      res.status(400).json(result)
      return
    }
    res.json(result)
  })

  // Terminal API routes (allow owner or guest, specific routes enforce owner-only)
  app.use("/api/sessions", requireOwnerOrGuestAuth, createTerminalRouter())

  // File manager routes (with auth)
  const { createFileRouter } = await import('./routes/files.js')
  app.use('/api/files', requireAuth, createFileRouter())

  // Guest routes
  const { createGuestRouter } = await import('./routes/guest.js')
  const guestRouter = createGuestRouter(config, { guestRedeem: guestRedeemLimiter })
  app.use('/api', guestRouter)

  return { app, allowedHostSet }
}
