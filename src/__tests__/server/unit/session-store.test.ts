import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import {
  activeSessions,
  pendingTotpSessions,
  parseBrowserSessionToken,
  parseTempSessionToken,
  getCookieSecureFlag,
  createBrowserSession,
  createTempSession,
  clearBrowserSessionCookie,
  clearTempSessionCookie,
} from "../../../server/session-store"

describe("session-store", () => {
  beforeEach(() => {
    // Clear all session maps
    activeSessions.clear()
    pendingTotpSessions.clear()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe("parseBrowserSessionToken", () => {
    it("should extract session token from cookie header", () => {
      const req = { headers: { cookie: "_wt_session=abc123; Path=/" } }
      const token = parseBrowserSessionToken(req as any)
      expect(token).toBe("abc123")
    })

    it("should extract session token with multiple cookies", () => {
      const req = { headers: { cookie: "other=value; _wt_session=xyz789; Path=/" } }
      const token = parseBrowserSessionToken(req as any)
      expect(token).toBe("xyz789")
    })

    it("should return null if no session cookie", () => {
      const req = { headers: { cookie: "other=value; another=test" } }
      const token = parseBrowserSessionToken(req as any)
      expect(token).toBeNull()
    })

    it("should return null if no cookie header", () => {
      const req = { headers: {} }
      const token = parseBrowserSessionToken(req as any)
      expect(token).toBeNull()
    })

    it("should handle cookie without space after semicolon", () => {
      const req = { headers: { cookie: "_wt_session=token123;Path=/" } }
      const token = parseBrowserSessionToken(req as any)
      expect(token).toBe("token123")
    })
  })

  describe("parseTempSessionToken", () => {
    it("should extract temp session token from cookie header", () => {
      const req = { headers: { cookie: "_wt_temp=temp456; Path=/" } }
      const token = parseTempSessionToken(req as any)
      expect(token).toBe("temp456")
    })

    it("should return null if no temp session cookie", () => {
      const req = { headers: { cookie: "other=value" } }
      const token = parseTempSessionToken(req as any)
      expect(token).toBeNull()
    })
  })

  describe("getCookieSecureFlag", () => {
    it("should return empty string in development", () => {
      process.env.NODE_ENV = "development"
      process.env.PASSKEY_RP_ORIGIN = "http://localhost:5173"

      const flag = getCookieSecureFlag()
      expect(flag).toBe("")
    })

    it("should return Secure flag in production", () => {
      process.env.NODE_ENV = "production"
      const flag = getCookieSecureFlag()
      expect(flag).toContain("Secure")
    })

    it("should return Secure flag when HTTPS origin is set", () => {
      process.env.NODE_ENV = "development"
      process.env.PASSKEY_RP_ORIGIN = "https://app.example.com"

      const flag = getCookieSecureFlag()
      expect(flag).toContain("Secure")
    })
  })

  describe("createBrowserSession", () => {
    it("should create a new session with token and cookie header", () => {
      const session = createBrowserSession()

      expect(session.token).toBeTruthy()
      expect(session.setCookieHeader).toContain("_wt_session=")
      expect(session.setCookieHeader).toContain("HttpOnly")
      expect(session.setCookieHeader).toContain("SameSite=Strict")
    })

    it("should add session to activeSessions map", () => {
      const session = createBrowserSession()

      expect(activeSessions.has(session.token)).toBe(true)
    })

    it("should set 24 hour expiration", () => {
      const now = Date.now()
      vi.setSystemTime(now)

      const session = createBrowserSession()
      const sessionData = activeSessions.get(session.token)!

      expect(sessionData.expiresAt).toBe(now + 24 * 60 * 60 * 1000)
    })

    it("should clean up expired session automatically", () => {
      const session = createBrowserSession()
      expect(activeSessions.has(session.token)).toBe(true)

      // Advance time by 24 hours + 1 second
      vi.advanceTimersByTime(24 * 60 * 60 * 1000 + 1000)

      expect(activeSessions.has(session.token)).toBe(false)
    })
  })

  describe("createTempSession", () => {
    it("should create a temporary session with token and cookie header", () => {
      const session = createTempSession()

      expect(session.token).toBeTruthy()
      expect(session.setCookieHeader).toContain("_wt_temp=")
      expect(session.setCookieHeader).toContain("HttpOnly")
      expect(session.setCookieHeader).toContain("SameSite=Strict")
    })

    it("should add session to pendingTotpSessions map", () => {
      const session = createTempSession()

      expect(pendingTotpSessions.has(session.token)).toBe(true)
    })

    it("should set 5 minute expiration", () => {
      const now = Date.now()
      vi.setSystemTime(now)

      const session = createTempSession()
      const sessionData = pendingTotpSessions.get(session.token)!

      expect(sessionData.expiresAt).toBe(now + 5 * 60 * 1000)
    })

    it("should clean up expired session automatically", () => {
      const session = createTempSession()
      expect(pendingTotpSessions.has(session.token)).toBe(true)

      // Advance time by 5 minutes + 1 second
      vi.advanceTimersByTime(5 * 60 * 1000 + 1000)

      expect(pendingTotpSessions.has(session.token)).toBe(false)
    })
  })

  describe("clearBrowserSessionCookie", () => {
    it("should return a Set-Cookie header with Max-Age=0", () => {
      const clearHeader = clearBrowserSessionCookie()

      expect(clearHeader).toContain("_wt_session=")
      expect(clearHeader).toContain("Max-Age=0")
      expect(clearHeader).toContain("HttpOnly")
    })
  })

  describe("clearTempSessionCookie", () => {
    it("should return a Set-Cookie header with Max-Age=0", () => {
      const clearHeader = clearTempSessionCookie()

      expect(clearHeader).toContain("_wt_temp=")
      expect(clearHeader).toContain("Max-Age=0")
      expect(clearHeader).toContain("HttpOnly")
    })
  })
})
