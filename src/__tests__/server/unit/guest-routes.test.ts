import { describe, it, expect, beforeEach, vi } from "vitest"
import express from "express"
import request from "supertest"

// Mock dependencies before importing guest-routes
vi.mock("../../../server/sessions/pty-manager.js", () => ({
  approveGuestLockRequest: vi.fn(),
  denyGuestLockRequest: vi.fn(),
}))

vi.mock("../../../server/sessions/sync-bus.js", () => ({
  broadcastSync: vi.fn(),
}))

vi.mock("../../../server/lib/logger.js", () => ({
  default: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}))

import { activeSessions } from "../../../server/sessions/store"
import {
  guestLinks,
  activeGuestSessions,
  lockRequests,
  createGuestLink,
  redeemGuestLink,
  createLockRequest,
} from "../../../server/sessions/guest-store"
import { createGuestRouter } from "../../../server/routes/guest"
import { broadcastSync } from "../../../server/sessions/sync-bus"
import { approveGuestLockRequest, denyGuestLockRequest } from "../../../server/sessions/pty-manager.js"

describe("guest-routes", () => {
  let app: any
  let ownerCookie: string

  beforeEach(() => {
    // Clear all session stores
    activeSessions.clear()
    guestLinks.clear()
    activeGuestSessions.clear()
    lockRequests.clear()
    vi.clearAllMocks()

    // Create test app
    app = express()
    app.use(express.json())
    app.use("/api", createGuestRouter({}, {}))

    // Create owner session
    const ownerToken = "owner-token-test"
    activeSessions.set(ownerToken, {
      expiresAt: Date.now() + 86400000, // 24 hours
    })
    ownerCookie = `_wt_session=${ownerToken}`
  })

  describe("GET /api/guest-links", () => {
    it("should return 401 without auth cookie", async () => {
      const response = await request(app).get("/api/guest-links")
      expect(response.status).toBe(401)
    })

    it("should return 200 with empty array when no links", async () => {
      const response = await request(app)
        .get("/api/guest-links")
        .set("Cookie", ownerCookie)
      expect(response.status).toBe(200)
      expect(Array.isArray(response.body)).toBe(true)
      expect(response.body).toHaveLength(0)
    })

    it("should return links with status, activeSessions, and sessionIds", async () => {
      const link = createGuestLink("Test Link")
      const _session = redeemGuestLink(link.id)!

      const response = await request(app)
        .get("/api/guest-links")
        .set("Cookie", ownerCookie)

      expect(response.status).toBe(200)
      expect(response.body).toHaveLength(1)

      const returnedLink = response.body[0]
      expect(returnedLink.id).toBe(link.id)
      expect(returnedLink.name).toBe("Test Link")
      expect(returnedLink.status).toBeDefined() // "used" or "unused"
      expect(returnedLink.activeSessions).toBe(1)
      expect(Array.isArray(returnedLink.sessionIds)).toBe(true)
    })

    it("should show unused status for unredeemed links", async () => {
      createGuestLink("Unused Link")

      const response = await request(app)
        .get("/api/guest-links")
        .set("Cookie", ownerCookie)

      expect(response.status).toBe(200)
      expect(response.body[0].status).toBe("unused")
      expect(response.body[0].activeSessions).toBe(0)
    })
  })

  describe("POST /api/guest-links", () => {
    it("should return 401 without auth cookie", async () => {
      const response = await request(app)
        .post("/api/guest-links")
        .send({ name: "Test" })
      expect(response.status).toBe(401)
    })

    it("should return 400 with empty name", async () => {
      const response = await request(app)
        .post("/api/guest-links")
        .set("Cookie", ownerCookie)
        .send({ name: "" })
      expect(response.status).toBe(400)
    })

    it("should return 400 with missing name", async () => {
      const response = await request(app)
        .post("/api/guest-links")
        .set("Cookie", ownerCookie)
        .send({})
      expect(response.status).toBe(400)
    })

    it("should return 400 if name is not a string", async () => {
      const response = await request(app)
        .post("/api/guest-links")
        .set("Cookie", ownerCookie)
        .send({ name: 123 })
      expect(response.status).toBe(400)
    })

    it("should create a link and return 200 with url", async () => {
      const response = await request(app)
        .post("/api/guest-links")
        .set("Cookie", ownerCookie)
        .send({ name: "Team Review" })

      expect(response.status).toBe(200)
      expect(response.body).toHaveProperty("id")
      expect(response.body).toHaveProperty("name", "Team Review")
      expect(response.body).toHaveProperty("url")
      expect(response.body.url).toContain("/guest/")
    })

    it("should store link in guestLinks map", async () => {
      const response = await request(app)
        .post("/api/guest-links")
        .set("Cookie", ownerCookie)
        .send({ name: "Test" })

      expect(guestLinks.has(response.body.id)).toBe(true)
    })

    it("should trim whitespace from name", async () => {
      const response = await request(app)
        .post("/api/guest-links")
        .set("Cookie", ownerCookie)
        .send({ name: "  Trimmed Name  " })

      expect(response.status).toBe(200)
      expect(response.body.name).toBe("Trimmed Name")
    })
  })

  describe("DELETE /api/guest-links/:id", () => {
    it("should return 401 without auth cookie", async () => {
      const link = createGuestLink("Test")
      const response = await request(app).delete(`/api/guest-links/${link.id}`)
      expect(response.status).toBe(401)
    })

    it("should return 404 for unknown link", async () => {
      const response = await request(app)
        .delete("/api/guest-links/unknown-id")
        .set("Cookie", ownerCookie)
      expect(response.status).toBe(404)
    })

    it("should return 200 and remove link", async () => {
      const link = createGuestLink("Test")
      expect(guestLinks.has(link.id)).toBe(true)

      const response = await request(app)
        .delete(`/api/guest-links/${link.id}`)
        .set("Cookie", ownerCookie)

      expect(response.status).toBe(200)
      expect(response.body).toEqual({ success: true })
      expect(guestLinks.has(link.id)).toBe(false)
    })

    it("should call broadcastSync when active sessions exist", async () => {
      const link = createGuestLink("Test")
      const session = redeemGuestLink(link.id)!
      session.clientId = "client-123"

      await request(app)
        .delete(`/api/guest-links/${link.id}`)
        .set("Cookie", ownerCookie)

      expect(vi.mocked(broadcastSync)).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "guest-revoked",
          clientIds: expect.arrayContaining(["client-123"]),
        })
      )
    })

    it("should not call broadcastSync when no active sessions", async () => {
      const link = createGuestLink("Test")

      await request(app)
        .delete(`/api/guest-links/${link.id}`)
        .set("Cookie", ownerCookie)

      expect(vi.mocked(broadcastSync)).not.toHaveBeenCalled()
    })

    it("should remove all sessions from revoked link", async () => {
      const link = createGuestLink("Test")
      const session = redeemGuestLink(link.id)!

      expect(activeGuestSessions.has(session.id)).toBe(true)

      await request(app)
        .delete(`/api/guest-links/${link.id}`)
        .set("Cookie", ownerCookie)

      expect(activeGuestSessions.has(session.id)).toBe(false)
    })
  })

  describe("POST /api/guest/redeem", () => {
    it("should return 401 for invalid token", async () => {
      const response = await request(app)
        .post("/api/guest/redeem")
        .send({ token: "invalid-token" })
      expect(response.status).toBe(401)
    })

    it("should return 200 and set cookie on valid token", async () => {
      const link = createGuestLink("Test")

      const response = await request(app)
        .post("/api/guest/redeem")
        .send({ token: link.id })

      expect(response.status).toBe(200)
      expect(response.body).toHaveProperty("name", "Test")

      // Check for Set-Cookie header
      const setCookieHeader = response.headers["set-cookie"]
      expect(setCookieHeader).toBeDefined()
      expect(setCookieHeader[0]).toContain("_wt_guest=")
      expect(setCookieHeader[0]).toContain("HttpOnly")
      expect(setCookieHeader[0]).toContain("SameSite=Lax")
    })

    it("should return 401 on second redemption (one-time use)", async () => {
      const link = createGuestLink("Test")

      // First redemption succeeds
      const response1 = await request(app)
        .post("/api/guest/redeem")
        .send({ token: link.id })
      expect(response1.status).toBe(200)

      // Second redemption fails
      const response2 = await request(app)
        .post("/api/guest/redeem")
        .send({ token: link.id })
      expect(response2.status).toBe(401)
    })

    it("should store session in activeGuestSessions", async () => {
      const link = createGuestLink("Test")

      const response = await request(app)
        .post("/api/guest/redeem")
        .send({ token: link.id })

      expect(response.status).toBe(200)

      // Parse sessionId from the response (it's in the cookie)
      const _sessionId = response.body.sessionId || activeGuestSessions.size > 0
      expect(activeGuestSessions.size).toBe(1)
    })
  })

  describe("GET /api/guest/status", () => {
    it("should return valid:false without guest cookie", async () => {
      const response = await request(app).get("/api/guest/status")
      expect(response.status).toBe(200)
      expect(response.body).toEqual({ valid: false })
    })

    it("should return valid:false for unknown session", async () => {
      const response = await request(app)
        .get("/api/guest/status")
        .set("Cookie", "_wt_guest=unknown-session-id")
      expect(response.status).toBe(200)
      expect(response.body).toEqual({ valid: false })
    })

    it("should return valid:true with name for valid session", async () => {
      const link = createGuestLink("Test Link")
      const session = redeemGuestLink(link.id)!

      const response = await request(app)
        .get("/api/guest/status")
        .set("Cookie", `_wt_guest=${session.id}`)

      expect(response.status).toBe(200)
      expect(response.body).toEqual({ valid: true, name: "Test Link" })
    })

    it("should return valid:false for expired session", async () => {
      const link = createGuestLink("Test")
      const session = redeemGuestLink(link.id)!

      // Manually set expiration to the past
      session.expiresAt = Date.now() - 1000

      const response = await request(app)
        .get("/api/guest/status")
        .set("Cookie", `_wt_guest=${session.id}`)

      expect(response.status).toBe(200)
      expect(response.body).toEqual({ valid: false })
    })
  })

  describe("DELETE /api/guest", () => {
    it("should return 200 and remove session", async () => {
      const link = createGuestLink("Test")
      const session = redeemGuestLink(link.id)!

      const response = await request(app)
        .delete("/api/guest")
        .set("Cookie", `_wt_guest=${session.id}`)

      expect(response.status).toBe(200)
      expect(response.body).toEqual({ success: true })
      expect(activeGuestSessions.has(session.id)).toBe(false)
    })

    it("should return 200 even without a guest cookie", async () => {
      const response = await request(app).delete("/api/guest")
      expect(response.status).toBe(200)
      expect(response.body).toEqual({ success: true })
    })

    it("should clear the guest cookie", async () => {
      const link = createGuestLink("Test")
      const session = redeemGuestLink(link.id)!

      const response = await request(app)
        .delete("/api/guest")
        .set("Cookie", `_wt_guest=${session.id}`)

      expect(response.status).toBe(200)
      const setCookieHeader = response.headers["set-cookie"]
      expect(setCookieHeader).toBeDefined()
      expect(setCookieHeader[0]).toContain("_wt_guest=")
      // Express res.clearCookie uses Expires with past date instead of Max-Age=0
      expect(setCookieHeader[0]).toContain("Expires=")
    })
  })

  describe("POST /api/guest/lock-requests/:id/approve", () => {
    it("should return 401 without auth cookie", async () => {
      const response = await request(app)
        .post("/api/guest/lock-requests/request-123/approve")
      expect(response.status).toBe(401)
    })

    it("should return 404 for unknown request", async () => {
      const response = await request(app)
        .post("/api/guest/lock-requests/unknown-id/approve")
        .set("Cookie", ownerCookie)
      expect(response.status).toBe(404)
    })

    it("should return 200 and call approveGuestLockRequest", async () => {
      const link = createGuestLink("Test")
      const session = redeemGuestLink(link.id)!
      const lockReq = createLockRequest(session.id, "Guest", "client-123", () => {})

      const response = await request(app)
        .post(`/api/guest/lock-requests/${lockReq.id}/approve`)
        .set("Cookie", ownerCookie)

      expect(response.status).toBe(200)
      expect(vi.mocked(approveGuestLockRequest)).toHaveBeenCalledWith(
        session.id,
        "client-123",
        lockReq.id
      )
    })

    it("should remove lock request from map", async () => {
      const link = createGuestLink("Test")
      const session = redeemGuestLink(link.id)!
      const lockReq = createLockRequest(session.id, "Guest", "client-123", () => {})

      expect(lockRequests.has(lockReq.id)).toBe(true)

      await request(app)
        .post(`/api/guest/lock-requests/${lockReq.id}/approve`)
        .set("Cookie", ownerCookie)

      expect(lockRequests.has(lockReq.id)).toBe(false)
    })
  })

  describe("POST /api/guest/lock-requests/:id/deny", () => {
    it("should return 401 without auth cookie", async () => {
      const response = await request(app)
        .post("/api/guest/lock-requests/request-123/deny")
      expect(response.status).toBe(401)
    })

    it("should return 404 for unknown request", async () => {
      const response = await request(app)
        .post("/api/guest/lock-requests/unknown-id/deny")
        .set("Cookie", ownerCookie)
      expect(response.status).toBe(404)
    })

    it("should return 200 and call denyGuestLockRequest", async () => {
      const link = createGuestLink("Test")
      const session = redeemGuestLink(link.id)!
      const lockReq = createLockRequest(session.id, "Guest", "client-123", () => {})

      const response = await request(app)
        .post(`/api/guest/lock-requests/${lockReq.id}/deny`)
        .set("Cookie", ownerCookie)

      expect(response.status).toBe(200)
      expect(vi.mocked(denyGuestLockRequest)).toHaveBeenCalledWith(
        session.id,
        lockReq.id
      )
    })

    it("should remove lock request from map", async () => {
      const link = createGuestLink("Test")
      const session = redeemGuestLink(link.id)!
      const lockReq = createLockRequest(session.id, "Guest", "client-123", () => {})

      expect(lockRequests.has(lockReq.id)).toBe(true)

      await request(app)
        .post(`/api/guest/lock-requests/${lockReq.id}/deny`)
        .set("Cookie", ownerCookie)

      expect(lockRequests.has(lockReq.id)).toBe(false)
    })
  })
})
