import type { Plugin } from "vite"
import type { IncomingMessage } from "node:http"
import { WebSocketServer } from "ws"
import { loadEnvFiles } from "./env-loader.js"

// Load .env files (manually parse since dotenv not available)
// First try .env.local in project directory (development), then ~/.puttry/.env (production)
loadEnvFiles(false)

// Now dynamically import to ensure env is loaded first
const logger = (await import("./logger.js")).default
const { initAuthState } = await import("./auth-state.js")
const { globalLimiter, sessionPasswordLimiter, totpVerifyLimiter, passkeyChallengeLimiter } = await import("./rate-limit.js")
const { createTerminalRouter } = await import("./terminal-routes.js")
const { getSession, attachWebSocket, cleanupAll, getAllSessions, onSyncClientConnect, onSyncClientDisconnect } = await import("./pty-manager.js")
const { addSyncClient } = await import("./sync-bus.js")
const { config, initializeConfig, updateSetting } = await import("./settings-api.js")

// NOTE: Initialization moved into configureServer hook to avoid running during production builds
// NOTE: Startup logs moved into configureServer hook to avoid printing during production builds

// Session and challenge storage
const {
  parseBrowserSessionToken,
  activeSessions,
} = await import("./session-store.js")
const { createApp } = await import("./app.js")

// WebSocket server for terminal I/O
const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 }) // 1MB limit for terminal I/O
const syncWss = new WebSocketServer({ noServer: true, maxPayload: 256 * 1024 }) // 256KB limit for sync messages

export function webTerminalPlugin(): Plugin {
  return {
    name: "puttry",
    async configureServer(server) {
      // Initialize settings and auth state (only runs during dev server startup, not during builds)
      initializeConfig()
      await initAuthState()

      // Create shared Express app AFTER config is initialized (dev mode with unsafe-inline CSP)
      const { app, allowedHostSet } = await createApp({
        config,
        logger,
        sessionPasswordLimiter,
        totpVerifyLimiter,
        passkeyChallengeLimiter,
        globalLimiter,
        createTerminalRouter,
        updateSetting,
        devMode: true,
      })

      // Log environment configuration
      logger.info(`[startup] ────────────────────────────────────────`)
      logger.info(`[startup] Environment Configuration`)
      logger.info(`[startup] ────────────────────────────────────────`)
      logger.info(`[startup] PORT = ${process.env.PORT ?? "5175 (default)"}`)
      logger.info(`[startup] HOST = ${process.env.HOST ?? "0.0.0.0 (default)"}`)
      logger.info(`[startup] AUTH_DISABLED = ${process.env.AUTH_DISABLED ?? "0 (default - auth enabled)"}`)
      logger.info(`[startup] SESSION_PASSWORD_TYPE = ${process.env.SESSION_PASSWORD_TYPE ?? "xkcd (default)"}`)
      logger.info(`[startup] SESSION_PASSWORD_LENGTH = ${process.env.SESSION_PASSWORD_LENGTH ?? "4 (default)"}`)
      logger.info(`[startup] TOTP_ENABLED = ${process.env.TOTP_ENABLED ?? "0 (default - disabled)"}`)
      logger.info(`[startup] RATE_LIMIT_GLOBAL_MAX = ${process.env.RATE_LIMIT_GLOBAL_MAX ?? "500 (default)"}`)
      logger.info(`[startup] RATE_LIMIT_SESSION_PASSWORD_MAX = ${process.env.RATE_LIMIT_SESSION_PASSWORD_MAX ?? "10 (default)"}`)
      logger.info(`[startup] RATE_LIMIT_TOTP_MAX = ${process.env.RATE_LIMIT_TOTP_MAX ?? "5 (default)"}`)
      logger.info(`[startup] RATE_LIMIT_PASSKEY_CHALLENGE_MAX = ${process.env.RATE_LIMIT_PASSKEY_CHALLENGE_MAX ?? "10 (default)"}`)
      logger.info(`[startup] ────────────────────────────────────────`)
      logger.info("")
      logger.info(`[startup] Use 'puttry password rotate' to generate and display a password.`)
      logger.info("")

      // Mount Express app as middleware on Vite's Connect stack
      server.middlewares.use(app)

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

      // Handle WebSocket upgrades for /sync and /terminal/:sessionId
      server.httpServer?.on("upgrade", (req: IncomingMessage, socket: any, head: Buffer) => {
        const hostname = (req.headers.host ?? "").split(":")[0]
        if (!allowedHostSet.has(hostname)) {
          socket.destroy()
          return
        }

        const url = new URL(req.url || "/", `http://${req.headers.host}`)
        const pathname = url.pathname

        // Handle /sync WebSocket
        if (pathname === "/sync") {
          if (!config.AUTH_DISABLED) {
            const browserToken = parseBrowserSessionToken(req)
            let authenticated = false
            if (browserToken) {
              const session = activeSessions.get(browserToken)
              authenticated = !!session && session.expiresAt > Date.now()
              if (!authenticated) activeSessions.delete(browserToken)
            }
            if (!browserToken || !authenticated) {
              socket.destroy()
              return
            }
          }
          syncWss.handleUpgrade(req, socket, head, (ws) => {
            const clientId = url.searchParams.get('clientId') || ''
            const snapshot = getAllSessions().map(s => ({ id: s.id, label: s.label, createdAt: s.createdAt, cols: s.cols, rows: s.rows, inputLockClientId: s.inputLockClientId ?? null }))
            ws.send(JSON.stringify({ type: "snapshot", sessions: snapshot }))
            addSyncClient(ws)
            onSyncClientConnect(clientId)
            ws.on('close', () => onSyncClientDisconnect(clientId))
            logger.info(`[ws] Sync client connected: ${clientId}`)
          })
          return
        }

        // Only handle /terminal/* upgrades; let Vite handle its own HMR WS
        if (!pathname.startsWith("/terminal/")) {
          return
        }

        // Extract sessionId from /terminal/:sessionId
        const sessionId = pathname.slice("/terminal/".length)

        // Check authentication
        if (!config.AUTH_DISABLED) {
          const browserToken = parseBrowserSessionToken(req)
          let authenticated = false
          if (browserToken) {
            const session = activeSessions.get(browserToken)
            authenticated = !!session && session.expiresAt > Date.now()
            if (!authenticated) activeSessions.delete(browserToken)
          }
          if (!browserToken || !authenticated) {
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
          attachWebSocket(sessionId, ws, clientId, browserToken)
          logger.info(`[ws] Client connected to session ${sessionId}`)
        })
      })

      // Cleanup on dev server shutdown
      server.httpServer?.on("close", () => {
        logger.info("[server] Closing...")
        cleanupAll()
      })
    },
  }
}
