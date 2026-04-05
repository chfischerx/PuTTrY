import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { createRequireAuth, createRequireAuthOrTempSession } from "../../../server/auth/middleware"
import { activeSessions, pendingTotpSessions, createBrowserSession, createTempSession } from "../../../server/sessions/store"

describe("auth-middleware", () => {
  beforeEach(() => {
    activeSessions.clear()
    pendingTotpSessions.clear()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe("createRequireAuth", () => {
    it("should bypass auth when AUTH_DISABLED is true", () => {
      const config = { AUTH_DISABLED: true }
      const middleware = createRequireAuth(config)

      const req = { headers: {} } as any
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any
      const next = vi.fn()

      middleware(req, res, next)

      expect(next).toHaveBeenCalled()
      expect(res.status).not.toHaveBeenCalled()
    })

    it("should allow authenticated request with valid browser session", () => {
      const config = { AUTH_DISABLED: false }
      const middleware = createRequireAuth(config)

      const session = createBrowserSession()
      const req = { headers: { cookie: `_wt_session=${session.token}` } } as any
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any
      const next = vi.fn()

      middleware(req, res, next)

      expect(next).toHaveBeenCalled()
      expect(res.status).not.toHaveBeenCalled()
    })

    it("should reject request without session cookie", () => {
      const config = { AUTH_DISABLED: false }
      const middleware = createRequireAuth(config)

      const req = { headers: {} } as any
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any
      const next = vi.fn()

      middleware(req, res, next)

      expect(next).not.toHaveBeenCalled()
      expect(res.status).toHaveBeenCalledWith(401)
      expect(res.json).toHaveBeenCalledWith({ error: "Not authenticated" })
    })

    it("should reject request with invalid session token", () => {
      const config = { AUTH_DISABLED: false }
      const middleware = createRequireAuth(config)

      const req = { headers: { cookie: "_wt_session=invalid-token" } } as any
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any
      const next = vi.fn()

      middleware(req, res, next)

      expect(next).not.toHaveBeenCalled()
      expect(res.status).toHaveBeenCalledWith(401)
    })

    it("should reject expired browser session", () => {
      const config = { AUTH_DISABLED: false }
      const middleware = createRequireAuth(config)

      const session = createBrowserSession()

      // Advance time past 24 hours
      vi.advanceTimersByTime(25 * 60 * 60 * 1000)

      const req = { headers: { cookie: `_wt_session=${session.token}` } } as any
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any
      const next = vi.fn()

      middleware(req, res, next)

      expect(next).not.toHaveBeenCalled()
      expect(res.status).toHaveBeenCalledWith(401)
    })

    it("should clean up expired session from map", () => {
      const config = { AUTH_DISABLED: false }
      const middleware = createRequireAuth(config)

      const session = createBrowserSession()
      expect(activeSessions.has(session.token)).toBe(true)

      // Advance time past 24 hours
      vi.advanceTimersByTime(25 * 60 * 60 * 1000)

      const req = { headers: { cookie: `_wt_session=${session.token}` } } as any
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any

      middleware(req, res, () => {})

      // Session should be cleaned up from the map
      expect(activeSessions.has(session.token)).toBe(false)
    })
  })

  describe("createRequireAuthOrTempSession", () => {
    it("should bypass auth when AUTH_DISABLED is true", () => {
      const config = { AUTH_DISABLED: true }
      const middleware = createRequireAuthOrTempSession(config)

      const req = { headers: {} } as any
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any
      const next = vi.fn()

      middleware(req, res, next)

      expect(next).toHaveBeenCalled()
    })

    it("should allow valid browser session", () => {
      const config = { AUTH_DISABLED: false }
      const middleware = createRequireAuthOrTempSession(config)

      const session = createBrowserSession()
      const req = { headers: { cookie: `_wt_session=${session.token}` } } as any
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any
      const next = vi.fn()

      middleware(req, res, next)

      expect(next).toHaveBeenCalled()
    })

    it("should allow valid temp session", () => {
      const config = { AUTH_DISABLED: false }
      const middleware = createRequireAuthOrTempSession(config)

      const session = createTempSession()
      const req = { headers: { cookie: `_wt_temp=${session.token}` } } as any
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any
      const next = vi.fn()

      middleware(req, res, next)

      expect(next).toHaveBeenCalled()
    })

    it("should prefer browser session over temp session", () => {
      const config = { AUTH_DISABLED: false }
      const middleware = createRequireAuthOrTempSession(config)

      const browserSession = createBrowserSession()
      const tempSession = createTempSession()

      const req = {
        headers: {
          cookie: `_wt_session=${browserSession.token}; _wt_temp=${tempSession.token}`,
        },
      } as any
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any
      const next = vi.fn()

      middleware(req, res, next)

      expect(next).toHaveBeenCalled()
      expect(res.status).not.toHaveBeenCalled()
    })

    it("should reject expired temp session", () => {
      const config = { AUTH_DISABLED: false }
      const middleware = createRequireAuthOrTempSession(config)

      const session = createTempSession()

      // Advance time past 5 minutes
      vi.advanceTimersByTime(6 * 60 * 1000)

      const req = { headers: { cookie: `_wt_temp=${session.token}` } } as any
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any
      const next = vi.fn()

      middleware(req, res, next)

      expect(next).not.toHaveBeenCalled()
      expect(res.status).toHaveBeenCalledWith(401)
    })

    it("should reject when no valid session present", () => {
      const config = { AUTH_DISABLED: false }
      const middleware = createRequireAuthOrTempSession(config)

      const req = { headers: {} } as any
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any
      const next = vi.fn()

      middleware(req, res, next)

      expect(next).not.toHaveBeenCalled()
      expect(res.status).toHaveBeenCalledWith(401)
    })
  })
})
