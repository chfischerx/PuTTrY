import express, { type Request, type Response, type Router } from "express"
import {
  guestLinks,
  activeGuestSessions,
  createGuestLink,
  redeemGuestLink,
  revokeGuestLink,
  parseGuestSessionToken,
  resolveLockRequest,
} from "../sessions/guest-store.js"
import { parseBrowserSessionToken, activeSessions } from "../sessions/store.js"
import {
  approveGuestLockRequest,
  denyGuestLockRequest,
} from "../sessions/pty-manager.js"
import { broadcastSync } from "../sessions/sync-bus.js"

export function createGuestRouter(config: any, rateLimiters: { guestRedeem?: any } = {}): Router {
  const router = express.Router()
  const guestRedeemLimiter = rateLimiters.guestRedeem || ((_req: Request, _res: Response, next: () => void) => next())

  // GET /api/guest-links - List all guest links (owner only)
  router.get("/guest-links", (req: Request, res: Response) => {
    if (config.AUTH_DISABLED) {
      return res.json([])
    }

    const token = parseBrowserSessionToken(req)
    if (!token || !activeSessions.has(token)) {
      return res.status(401).json({ error: "Unauthorized" })
    }

    const links = Array.from(guestLinks.values()).map((link) => {
      const sessions = Array.from(activeGuestSessions.values()).filter(
        (s) => s.linkId === link.id
      )
      return {
        id: link.id,
        name: link.name,
        createdAt: link.createdAt,
        status: link.usedAt ? "used" : "unused",
        activeSessions: sessions.length,
        sessionIds: sessions.map(s => s.clientId || '').filter(Boolean),
      }
    })

    res.json(links)
  })

  // POST /api/guest-links - Create a new guest link (owner only)
  router.post("/guest-links", (req: Request, res: Response) => {
    if (config.AUTH_DISABLED) {
      return res.status(403).json({ error: "Guest links not available" })
    }

    const token = parseBrowserSessionToken(req)
    if (!token || !activeSessions.has(token)) {
      return res.status(401).json({ error: "Unauthorized" })
    }

    let { name } = req.body
    if (Array.isArray(name)) name = name[0]
    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "Name is required" })
    }

    const link = createGuestLink(name.trim())
    const url = new URL("/guest/" + link.id, process.env.PASSKEY_RP_ORIGIN || "http://localhost:3000")

    res.json({
      id: link.id,
      name: link.name,
      createdAt: link.createdAt,
      status: "unused",
      activeSessions: 0,
      sessionIds: [],
      url: url.toString(),
    } as any)
  })

  // DELETE /api/guest-links/:id - Revoke a guest link (owner only)
  router.delete("/guest-links/:id", (req: Request, res: Response) => {
    if (config.AUTH_DISABLED) {
      return res.status(403).json({ error: "Guest links not available" })
    }

    const token = parseBrowserSessionToken(req)
    if (!token || !activeSessions.has(token)) {
      return res.status(401).json({ error: "Unauthorized" })
    }

    const { id } = req.params as { id: string }
    if (!guestLinks.has(id)) {
      return res.status(404).json({ error: "Guest link not found" })
    }

    const affectedClientIds = [...activeGuestSessions.values()]
      .filter(s => s.linkId === id && s.clientId)
      .map(s => s.clientId!)

    revokeGuestLink(id)

    if (affectedClientIds.length > 0) {
      broadcastSync({ type: 'guest-revoked', clientIds: affectedClientIds })
    }

    res.json({ success: true })
  })

  // POST /api/guest/redeem - Consume a one-time token (guest - rate limited)
  router.post(
    "/guest/redeem",
    guestRedeemLimiter,
    (req: Request, res: Response) => {
      let { token } = req.body
      if (Array.isArray(token)) token = token[0]
      if (!token || typeof token !== "string") {
        return res.status(400).json({ error: "Token is required" })
      }

      const session = redeemGuestLink(token)
      if (!session) {
        return res
          .status(401)
          .json({ error: "Invalid or already-used token" })
      }

      const secure = process.env.SECURE_COOKIE !== '0'
      res.cookie('_wt_guest', session.id, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 4 * 60 * 60 * 1000, // 4 hours in milliseconds
        secure: secure
      })
      res.json({ name: session.name })
    }
  )

  // GET /api/guest/status - Check guest session validity
  router.get("/guest/status", (req: Request, res: Response) => {
    const token = parseGuestSessionToken(req)
    if (!token) {
      return res.json({ valid: false })
    }

    const session = activeGuestSessions.get(token)
    if (!session || session.expiresAt < Date.now()) {
      activeGuestSessions.delete(token)
      return res.json({ valid: false })
    }

    res.json({ valid: true, name: session.name })
  })

  // DELETE /api/guest - Logout guest (guest only)
  router.delete("/guest", (req: Request, res: Response) => {
    const token = parseGuestSessionToken(req)
    if (token) {
      activeGuestSessions.delete(token)
    }

    res.clearCookie('_wt_guest', {
      httpOnly: true,
      sameSite: 'lax',
      path: '/'
    })
    res.json({ success: true })
  })

  // POST /api/guest/lock-requests/:requestId/approve - Grant control (owner only)
  router.post(
    "/guest/lock-requests/:requestId/approve",
    (req: Request, res: Response) => {
      if (config.AUTH_DISABLED) {
        return res.status(403).json({ error: "Not available" })
      }

      const ownerToken = parseBrowserSessionToken(req)
      if (!ownerToken || !activeSessions.has(ownerToken)) {
        return res.status(401).json({ error: "Unauthorized" })
      }

      const { requestId } = req.params as { requestId: string }
      const request = resolveLockRequest(requestId)

      if (!request) {
        return res.status(404).json({ error: "Request not found" })
      }

      approveGuestLockRequest(request.sessionId, request.guestClientId, requestId)
      res.json({ success: true })
    }
  )

  // POST /api/guest/lock-requests/:requestId/deny - Deny control (owner only)
  router.post(
    "/guest/lock-requests/:requestId/deny",
    (req: Request, res: Response) => {
      if (config.AUTH_DISABLED) {
        return res.status(403).json({ error: "Not available" })
      }

      const ownerToken = parseBrowserSessionToken(req)
      if (!ownerToken || !activeSessions.has(ownerToken)) {
        return res.status(401).json({ error: "Unauthorized" })
      }

      const { requestId } = req.params as { requestId: string }
      const request = resolveLockRequest(requestId)

      if (!request) {
        return res.status(404).json({ error: "Request not found" })
      }

      denyGuestLockRequest(request.sessionId, requestId)
      res.json({ success: true })
    }
  )

  return router
}
