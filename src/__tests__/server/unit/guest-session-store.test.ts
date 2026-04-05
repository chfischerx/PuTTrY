import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import {
  guestLinks,
  activeGuestSessions,
  lockRequests,
  parseGuestSessionToken,
  createGuestLink,
  redeemGuestLink,
  revokeGuestLink,
  createGuestCookie,
  clearGuestCookie,
  createLockRequest,
  resolveLockRequest,
  setGuestClientId,
} from "../../../server/sessions/guest-store"

describe("guest-session-store", () => {
  beforeEach(() => {
    guestLinks.clear()
    activeGuestSessions.clear()
    lockRequests.clear()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe("parseGuestSessionToken", () => {
    it("should extract guest session token from cookie header", () => {
      const req = { headers: { cookie: "_wt_guest=abc123; Path=/" } }
      const token = parseGuestSessionToken(req as any)
      expect(token).toBe("abc123")
    })

    it("should extract guest token with multiple cookies", () => {
      const req = { headers: { cookie: "other=value; _wt_guest=xyz789; Path=/" } }
      const token = parseGuestSessionToken(req as any)
      expect(token).toBe("xyz789")
    })

    it("should return null if no guest session cookie", () => {
      const req = { headers: { cookie: "other=value; another=test" } }
      const token = parseGuestSessionToken(req as any)
      expect(token).toBeNull()
    })

    it("should return null if no cookie header", () => {
      const req = { headers: {} }
      const token = parseGuestSessionToken(req as any)
      expect(token).toBeNull()
    })

    it("should handle cookie without space after semicolon", () => {
      const req = { headers: { cookie: "_wt_guest=token123;Path=/" } }
      const token = parseGuestSessionToken(req as any)
      expect(token).toBe("token123")
    })

    it("should extract token from IncomingMessage shape", () => {
      const req = { headers: { cookie: "_wt_guest=raw-msg-token" } }
      const token = parseGuestSessionToken(req as any)
      expect(token).toBe("raw-msg-token")
    })
  })

  describe("createGuestLink", () => {
    it("should create a guest link with token, name, and createdAt", () => {
      const link = createGuestLink("Test Invite")

      expect(link.id).toBeTruthy()
      expect(link.id).toHaveLength(64) // randomBytes(32).toString('hex') = 64 chars
      expect(link.name).toBe("Test Invite")
      expect(link.createdAt).toBeTruthy()
      expect(link.usedAt).toBeUndefined()
    })

    it("should store link in guestLinks map", () => {
      const link = createGuestLink("Test Invite")

      expect(guestLinks.has(link.id)).toBe(true)
      expect(guestLinks.get(link.id)).toEqual(link)
    })

    it("should generate unique tokens for multiple links", () => {
      const link1 = createGuestLink("Invite 1")
      const link2 = createGuestLink("Invite 2")

      expect(link1.id).not.toBe(link2.id)
    })
  })

  describe("redeemGuestLink", () => {
    it("should return null for unknown token", () => {
      const session = redeemGuestLink("unknown-token")
      expect(session).toBeNull()
    })

    it("should return null if link already used", () => {
      const link = createGuestLink("Test")
      const session1 = redeemGuestLink(link.id)
      expect(session1).not.toBeNull()

      // Second redemption should fail
      const session2 = redeemGuestLink(link.id)
      expect(session2).toBeNull()
    })

    it("should create an active guest session on success", () => {
      const link = createGuestLink("Test")
      const session = redeemGuestLink(link.id)

      expect(session).not.toBeNull()
      expect(session!.id).toBeTruthy()
      expect(session!.linkId).toBe(link.id)
      expect(session!.name).toBe("Test")
      expect(session!.expiresAt).toBeTruthy()
      expect(session!.clientId).toBeUndefined()
    })

    it("should store session in activeGuestSessions map", () => {
      const link = createGuestLink("Test")
      const session = redeemGuestLink(link.id)!

      expect(activeGuestSessions.has(session.id)).toBe(true)
      expect(activeGuestSessions.get(session.id)).toEqual(session)
    })

    it("should set 4-hour expiration", () => {
      const now = Date.now()
      vi.setSystemTime(now)

      const link = createGuestLink("Test")
      const session = redeemGuestLink(link.id)!

      expect(session.expiresAt).toBe(now + 4 * 60 * 60 * 1000)
    })

    it("should mark link as used", () => {
      const link = createGuestLink("Test")
      const before = link.usedAt
      redeemGuestLink(link.id)
      const after = guestLinks.get(link.id)!.usedAt

      expect(before).toBeUndefined()
      expect(after).toBeTruthy()
    })

    it("should auto-delete session after 4 hours", () => {
      const link = createGuestLink("Test")
      const session = redeemGuestLink(link.id)!

      expect(activeGuestSessions.has(session.id)).toBe(true)

      // Advance time by 4 hours + 1 second
      vi.advanceTimersByTime(4 * 60 * 60 * 1000 + 1000)

      expect(activeGuestSessions.has(session.id)).toBe(false)
    })
  })

  describe("revokeGuestLink", () => {
    it("should remove link from guestLinks map", () => {
      const link = createGuestLink("Test")
      expect(guestLinks.has(link.id)).toBe(true)

      revokeGuestLink(link.id)

      expect(guestLinks.has(link.id)).toBe(false)
    })

    it("should remove all sessions derived from that link", () => {
      const link = createGuestLink("Test")
      const session1 = redeemGuestLink(link.id)!

      expect(activeGuestSessions.has(session1.id)).toBe(true)

      revokeGuestLink(link.id)

      expect(activeGuestSessions.has(session1.id)).toBe(false)
    })

    it("should not affect sessions from other links", () => {
      const link1 = createGuestLink("Invite 1")
      const link2 = createGuestLink("Invite 2")

      const session1 = redeemGuestLink(link1.id)!
      const session2 = redeemGuestLink(link2.id)!

      revokeGuestLink(link1.id)

      expect(activeGuestSessions.has(session1.id)).toBe(false)
      expect(activeGuestSessions.has(session2.id)).toBe(true)
    })

    it("should not error when revoking non-existent link", () => {
      expect(() => revokeGuestLink("unknown-link")).not.toThrow()
    })
  })

  describe("createGuestCookie", () => {
    it("should return a Set-Cookie header with guest token", () => {
      const header = createGuestCookie("test-token-123")

      expect(header).toContain("_wt_guest=test-token-123")
      expect(header).toContain("HttpOnly")
      expect(header).toContain("SameSite=Strict")
      expect(header).toContain("Max-Age=14400")
      expect(header).toContain("Path=/")
    })
  })

  describe("clearGuestCookie", () => {
    it("should return a Set-Cookie header with Max-Age=0", () => {
      const header = clearGuestCookie()

      expect(header).toContain("_wt_guest=")
      expect(header).toContain("Max-Age=0")
      expect(header).toContain("HttpOnly")
      expect(header).toContain("SameSite=Strict")
    })
  })

  describe("createLockRequest", () => {
    it("should create a lock request with all fields", () => {
      const callback = vi.fn()
      const request = createLockRequest("session-123", "Guest User", "client-456", callback)

      expect(request.id).toBeTruthy()
      expect(request.sessionId).toBe("session-123")
      expect(request.guestName).toBe("Guest User")
      expect(request.guestClientId).toBe("client-456")
      expect(request.timeoutHandle).toBeTruthy()
    })

    it("should store request in lockRequests map", () => {
      const request = createLockRequest("session-123", "Guest", "client-456", () => {})

      expect(lockRequests.has(request.id)).toBe(true)
      expect(lockRequests.get(request.id)).toEqual(request)
    })

    it("should call timeout callback after 30 seconds", () => {
      const callback = vi.fn()
      const _request = createLockRequest("session-123", "Guest", "client-456", callback)

      expect(callback).not.toHaveBeenCalled()

      // Advance time by 30 seconds
      vi.advanceTimersByTime(30 * 1000)

      expect(callback).toHaveBeenCalledOnce()
    })

    it("should auto-delete request from map on timeout", () => {
      const request = createLockRequest("session-123", "Guest", "client-456", () => {})

      expect(lockRequests.has(request.id)).toBe(true)

      vi.advanceTimersByTime(30 * 1000 + 1)

      expect(lockRequests.has(request.id)).toBe(false)
    })

    it("should generate unique request IDs", () => {
      const req1 = createLockRequest("session-1", "Guest 1", "client-1", () => {})
      const req2 = createLockRequest("session-2", "Guest 2", "client-2", () => {})

      expect(req1.id).not.toBe(req2.id)
    })
  })

  describe("resolveLockRequest", () => {
    it("should return the lock request and remove it from map", () => {
      const request = createLockRequest("session-123", "Guest", "client-456", () => {})
      const id = request.id

      expect(lockRequests.has(id)).toBe(true)

      const resolved = resolveLockRequest(id)

      expect(resolved).toEqual(request)
      expect(lockRequests.has(id)).toBe(false)
    })

    it("should return undefined for unknown request ID", () => {
      const result = resolveLockRequest("unknown-id")
      expect(result).toBeUndefined()
    })

    it("should clear the timeout so callback is not called", () => {
      const callback = vi.fn()
      const request = createLockRequest("session-123", "Guest", "client-456", callback)

      resolveLockRequest(request.id)

      // Advance time past the 30 second mark
      vi.advanceTimersByTime(30 * 1000 + 1)

      // Callback should not have been called since we resolved it
      expect(callback).not.toHaveBeenCalled()
    })
  })

  describe("setGuestClientId", () => {
    it("should set clientId on an existing session", () => {
      const link = createGuestLink("Test")
      const session = redeemGuestLink(link.id)!

      expect(session.clientId).toBeUndefined()

      setGuestClientId(session.id, "client-abc")

      const updated = activeGuestSessions.get(session.id)!
      expect(updated.clientId).toBe("client-abc")
    })

    it("should not error when setting clientId on non-existent session", () => {
      expect(() => setGuestClientId("unknown-session", "client-123")).not.toThrow()
    })

    it("should update clientId on subsequent calls", () => {
      const link = createGuestLink("Test")
      const session = redeemGuestLink(link.id)!

      setGuestClientId(session.id, "client-1")
      let updated = activeGuestSessions.get(session.id)!
      expect(updated.clientId).toBe("client-1")

      setGuestClientId(session.id, "client-2")
      updated = activeGuestSessions.get(session.id)!
      expect(updated.clientId).toBe("client-2")
    })
  })
})
