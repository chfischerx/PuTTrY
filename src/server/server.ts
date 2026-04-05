import express from "express"
import type { Request, Response } from "express"
import { createServer } from "node:http"
import type { IncomingMessage } from "node:http"
import { WebSocketServer } from "ws"
import path from "node:path"
import { mkdirSync, writeFileSync, unlinkSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"
import { loadEnvFiles } from "./lib/env.js"

// Load .env files (manually parse since dotenv not available)
// First try .env.local in project directory (development), then ~/.puttry/.env (production)
loadEnvFiles(true)

// Now dynamically import to ensure config() has run
const logger = (await import("./lib/logger.js")).default
const { initAuthState } = await import("./auth/state.js")
const { globalLimiter, sessionPasswordLimiter, totpVerifyLimiter, passkeyChallengeLimiter, guestRedeemLimiter } = await import("./lib/rate-limit.js")
const { createTerminalRouter } = await import("./routes/terminal.js")
const { getSession, attachWebSocket, cleanupAll, getAllSessions, onSyncClientConnect, onSyncClientDisconnect } = await import("./sessions/pty-manager.js")
const { addSyncClient } = await import("./sessions/sync-bus.js")
const { config, initializeConfig, updateSetting } = await import("./lib/settings.js")

// Initialize settings from environment variables
initializeConfig()

// Initialize authentication state (session password, 2FA, etc.)
await initAuthState()

// Constants for PID file (path, not writing yet — happens in listen callback)
const PID_DIR = join(homedir(), ".puttry")
const PID_PATH = join(PID_DIR, "server.pid")

const PORT = Number(process.env.PORT ?? 5174)
const HOST = process.env.HOST ?? "0.0.0.0"
const distPath = path.join(import.meta.dirname, "../dist")

// Session and challenge storage
const {
  parseBrowserSessionToken,
  activeSessions,
} = await import("./sessions/store.js")
const {
  parseGuestSessionToken,
  activeGuestSessions,
  setGuestClientId,
} = await import("./sessions/guest-store.js")
const { createApp } = await import("./app.js")

// Log environment configuration at startup
logger.info(`[startup] ────────────────────────────────────────`)
logger.info(`[startup] Environment Configuration`)
logger.info(`[startup] ────────────────────────────────────────`)
logger.info(`[startup] PORT = ${process.env.PORT ?? "5174 (default)"}`)
logger.info(`[startup] HOST = ${process.env.HOST ?? "0.0.0.0 (default)"}`)
logger.info(`[startup] ALLOWED_HOSTS = ${process.env.ALLOWED_HOSTS ?? "localhost,127.0.0.1,::1 (defaults)"}`)
logger.info(`[startup] AUTH_DISABLED = ${process.env.AUTH_DISABLED ?? "0 (default - auth enabled)"}`)
logger.info(`[startup] SHOW_AUTH_DISABLED_WARNING = ${process.env.SHOW_AUTH_DISABLED_WARNING ?? "0 (default - warning hidden)"}`)
logger.info(`[startup] SESSION_PASSWORD_TYPE = ${process.env.SESSION_PASSWORD_TYPE ?? "xkcd (default)"}`)
logger.info(`[startup] SESSION_PASSWORD_LENGTH = ${process.env.SESSION_PASSWORD_LENGTH ?? "4 (default)"}`)
logger.info(`[startup] TOTP_ENABLED = ${process.env.TOTP_ENABLED ?? "0 (default - disabled)"}`)
logger.info(`[startup] PASSKEY_RP_ORIGIN = ${process.env.PASSKEY_RP_ORIGIN ?? "http://localhost:5174 (default)"}`)
logger.info(`[startup] RATE_LIMIT_GLOBAL_MAX = ${process.env.RATE_LIMIT_GLOBAL_MAX ?? "500 (default)"}`)
logger.info(`[startup] RATE_LIMIT_SESSION_PASSWORD_MAX = ${process.env.RATE_LIMIT_SESSION_PASSWORD_MAX ?? "10 (default)"}`)
logger.info(`[startup] RATE_LIMIT_TOTP_MAX = ${process.env.RATE_LIMIT_TOTP_MAX ?? "5 (default)"}`)
logger.info(`[startup] RATE_LIMIT_PASSKEY_CHALLENGE_MAX = ${process.env.RATE_LIMIT_PASSKEY_CHALLENGE_MAX ?? "10 (default)"}`)
logger.info(`[startup] SCROLLBACK_LINES = ${process.env.SCROLLBACK_LINES ?? "10000 (default)"}`)
logger.info(`[startup] LOG_FILE = ${process.env.LOG_FILE ?? "~/.puttry/server.log (default)"}`)
logger.info(`[startup] ────────────────────────────────────────`)
logger.info("")

// Create shared Express app with all common middleware and routes
const { app, allowedHostSet } = await createApp({
  config,
  logger,
  sessionPasswordLimiter,
  totpVerifyLimiter,
  passkeyChallengeLimiter,
  guestRedeemLimiter,
  globalLimiter,
  createTerminalRouter,
  updateSetting,
  devMode: false,
})

const httpServer = createServer(app)
const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 }) // 1MB limit for terminal I/O
const syncWss = new WebSocketServer({ noServer: true, maxPayload: 256 * 1024 }) // 256KB limit for sync messages

// WebSocket ping keepalive — sends ping every 30s to prevent ALB idle timeout (60s)
const PING_INTERVAL = 30_000

setInterval(() => {
  for (const client of wss.clients) {
    if (client.readyState === 1) client.ping() // 1 = WebSocket.OPEN
  }
}, PING_INTERVAL)

setInterval(() => {
  for (const client of syncWss.clients) {
    if (client.readyState === 1) client.ping() // 1 = WebSocket.OPEN
  }
}, PING_INTERVAL)

// Serve built frontend assets
app.use(express.static(distPath))

// SPA fallback — serve index.html for all unmatched routes
app.use((_req: Request, res: Response) => {
  res.sendFile(path.join(distPath, "index.html"))
})

// WebSocket upgrade handler
httpServer.on("upgrade", (req: IncomingMessage, socket: any, head: Buffer) => {
  const hostname = (req.headers.host ?? "").split(":")[0]
  if (!allowedHostSet.has(hostname)) {
    socket.destroy()
    return
  }

  const url = new URL(req.url || "/", `http://${req.headers.host}`)
  const pathname = url.pathname

  // Handle /sync WebSocket
  if (pathname === "/sync") {
    let syncGuestSessionId = ""
    if (!config.AUTH_DISABLED) {
      const browserToken = parseBrowserSessionToken(req)
      const guestToken = parseGuestSessionToken(req)
      let authenticated = false

      if (browserToken) {
        const session = activeSessions.get(browserToken)
        authenticated = !!session && session.expiresAt > Date.now()
        if (!authenticated) activeSessions.delete(browserToken)
      } else if (guestToken) {
        const guestSession = activeGuestSessions.get(guestToken)
        authenticated = !!guestSession && guestSession.expiresAt > Date.now()
        if (authenticated && guestSession) {
          syncGuestSessionId = guestSession.id
        } else if (guestSession) {
          activeGuestSessions.delete(guestToken)
        }
      }

      if (!authenticated) {
        socket.destroy()
        return
      }
    }
    syncWss.handleUpgrade(req, socket, head, (ws) => {
      // HIGH-10: Validate clientId format to prevent log injection
      const rawClientId = url.searchParams.get('clientId') || ''
      const clientId = /^[a-zA-Z0-9\-_]*$/.test(rawClientId) ? rawClientId : ''
      if (syncGuestSessionId && clientId) {
        setGuestClientId(syncGuestSessionId, clientId)
      }
      const snapshot = getAllSessions().map(s => ({ id: s.id, label: s.label, createdAt: s.createdAt, cols: s.cols, rows: s.rows, inputLockClientId: s.inputLockClientId ?? null }))
      ws.send(JSON.stringify({ type: "snapshot", sessions: snapshot }))
      addSyncClient(ws)
      onSyncClientConnect(clientId)
      ws.on('close', () => onSyncClientDisconnect(clientId))
      logger.info(`[ws] Sync client connected: ${clientId}`)
    })
    return
  }

  // Only handle /terminal/* upgrades
  if (!pathname.startsWith("/terminal/")) {
    socket.destroy()
    return
  }

  // Extract sessionId from /terminal/:sessionId
  const sessionId = pathname.slice("/terminal/".length)

  // Check authentication
  let isGuest = false
  let guestName = ""
  let guestSessionId = ""
  if (!config.AUTH_DISABLED) {
    const browserToken = parseBrowserSessionToken(req)
    const guestToken = parseGuestSessionToken(req)
    let authenticated = false

    if (browserToken) {
      const session = activeSessions.get(browserToken)
      authenticated = !!session && session.expiresAt > Date.now()
      if (!authenticated) activeSessions.delete(browserToken)
    } else if (guestToken) {
      const guestSession = activeGuestSessions.get(guestToken)
      authenticated = !!guestSession && guestSession.expiresAt > Date.now()
      if (authenticated && guestSession) {
        isGuest = true
        guestName = guestSession.name
        guestSessionId = guestSession.id
      } else if (guestSession) {
        activeGuestSessions.delete(guestToken)
      }
    }

    if (!authenticated) {
      socket.write("HTTP/1.1 401 Unauthorized\r\nContent-Type: text/plain\r\n\r\nUnauthorized")
      socket.destroy()
      return
    }
  }

  // Check if session exists
  const session = getSession(sessionId)
  if (!session) {
    socket.write("HTTP/1.1 404 Not Found\r\nContent-Type: text/plain\r\n\r\nSession not found")
    socket.destroy()
    return
  }

  // Handle the upgrade
  wss.handleUpgrade(req, socket, head, (ws) => {
    // HIGH-10: Validate clientId format to prevent log injection
    const rawClientId = url.searchParams.get('clientId') ?? ''
    const clientId = /^[a-zA-Z0-9\-_]*$/.test(rawClientId) ? rawClientId : ''
    const browserToken = config.AUTH_DISABLED ? '' : (parseBrowserSessionToken(req) ?? '')
    attachWebSocket(sessionId, ws, clientId, browserToken, { isGuest, guestName, guestSessionId })
    logger.info(`[ws] Client connected to session ${sessionId} (guest=${isGuest})`)
  })
})

httpServer.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    logger.error(`[server] Port ${PORT} is already in use. Is another instance running?`)
  } else {
    logger.error(`[server] Failed to start: ${err.message}`)
  }
  process.exit(1)
})

httpServer.listen(PORT, HOST, () => {
  mkdirSync(PID_DIR, { recursive: true })
  writeFileSync(PID_PATH, String(process.pid), "utf-8")
  logger.info(`[startup] PID file written to ${PID_PATH}`)
  logger.info(`[server] listening on http://${HOST}:${PORT}`)
})

// Graceful shutdown
process.on("SIGTERM", () => {
  logger.info("[server] SIGTERM received, cleaning up...")
  cleanupAll()
  try { unlinkSync(PID_PATH) } catch {}
  process.exit(0)
})

process.on("SIGINT", () => {
  logger.info("[server] SIGINT received, cleaning up...")
  cleanupAll()
  try { unlinkSync(PID_PATH) } catch {}
  process.exit(0)
})

process.on("uncaughtException", (err) => {
  logger.error(`[server] Uncaught exception: ${err.message}`)
  try { unlinkSync(PID_PATH) } catch {}
  process.exit(1)
})

process.on("unhandledRejection", (reason) => {
  logger.error(`[server] Unhandled rejection: ${reason}`)
  try { unlinkSync(PID_PATH) } catch {}
  process.exit(1)
})
