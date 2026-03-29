import type { Request, Response } from "express"
import { parseBrowserSessionToken, parseTempSessionToken, activeSessions, pendingTotpSessions } from "../session-store.js"

/**
 * Requires valid browser session (authenticated user)
 */
export function createRequireAuth(config: any) {
  return (req: Request, res: Response, next: () => void): void => {
    if (config.AUTH_DISABLED) {
      next()
      return
    }
    const browserToken = parseBrowserSessionToken(req)
    if (browserToken) {
      const session = activeSessions.get(browserToken)
      if (session && session.expiresAt > Date.now()) {
        next()
        return
      }
      activeSessions.delete(browserToken)
    }
    res.status(401).json({ error: "Not authenticated" })
  }
}

/**
 * Accepts browser OR temp session (for 2FA in progress)
 */
export function createRequireAuthOrTempSession(config: any) {
  return (req: Request, res: Response, next: () => void): void => {
    if (config.AUTH_DISABLED) {
      next()
      return
    }
    const browserToken = parseBrowserSessionToken(req)
    const tempToken = parseTempSessionToken(req)

    if (browserToken) {
      const session = activeSessions.get(browserToken)
      if (session && session.expiresAt > Date.now()) {
        next()
        return
      }
      activeSessions.delete(browserToken)
    }

    if (tempToken) {
      const tempSession = pendingTotpSessions.get(tempToken)
      if (tempSession && tempSession.expiresAt > Date.now()) {
        next()
        return
      }
      pendingTotpSessions.delete(tempToken)
    }

    res.status(401).json({ error: "Not authenticated" })
  }
}
