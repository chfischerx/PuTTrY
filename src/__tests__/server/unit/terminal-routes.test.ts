import { describe, it, expect, beforeEach, vi } from "vitest"
import express from "express"
import request from "supertest"

// Mock pty-manager before importing terminal-routes
// Use a shared Map so state persists across mocks
let mockSessions = new Map<string, any>()

vi.mock("../../../server/sessions/pty-manager.js", () => ({
  createSession: vi.fn((cols: number, rows: number, _clientId: any) => {
    const id = `session-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const session = {
      id,
      label: `Terminal ${id.slice(0, 8)}`,
      createdAt: new Date().toISOString(),
      cols,
      rows,
    }
    mockSessions.set(id, session)
    return session
  }),
  getAllSessions: vi.fn(() => Array.from(mockSessions.values())),
  getSession: vi.fn((id: string) => mockSessions.get(id) || null),
  renameSession: vi.fn((id: string, label: string) => {
    const session = mockSessions.get(id)
    if (!session) return false
    session.label = label
    return true
  }),
  killSession: vi.fn((id: string) => {
    const existed = mockSessions.has(id)
    mockSessions.delete(id)
    return existed
  }),
  getSessionProcessInfo: vi.fn((id: string) => {
    const session = mockSessions.get(id)
    if (!session) return null
    return {
      pid: 12345,
      command: "bash",
      user: "testuser",
      cpuUsage: 0.1,
      memoryUsage: 1024,
    }
  }),
}))

vi.mock("../../../server/lib/logger.js", () => ({
  default: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}))

import { createTerminalRouter } from "../../../server/routes/terminal"

describe("terminal-routes", () => {
  let app: any

  beforeEach(() => {
    mockSessions.clear()
    vi.clearAllMocks()
    app = express()
    app.use(express.json())
    app.use("/api/sessions", createTerminalRouter())
  })

  describe("GET /", () => {
    it("should return empty array when no sessions", async () => {
      const response = await request(app).get("/api/sessions")
      expect(response.status).toBe(200)
      expect(Array.isArray(response.body)).toBe(true)
      expect(response.body).toEqual([])
    })

    it("should return mapped session objects (not internal PTY data)", async () => {
      // Create a session first
      await request(app).post("/api/sessions").send({})

      const response = await request(app).get("/api/sessions")
      expect(response.status).toBe(200)
      expect(Array.isArray(response.body)).toBe(true)
      expect(response.body.length).toBe(1)

      const session = response.body[0]
      expect(session).toHaveProperty("id")
      expect(session).toHaveProperty("label")
      expect(session).toHaveProperty("createdAt")
      expect(session).toHaveProperty("cols")
      expect(session).toHaveProperty("rows")
      // Should not expose internal PTY data
      expect(session).not.toHaveProperty("pty")
      expect(session).not.toHaveProperty("process")
    })
  })

  describe("POST /", () => {
    it("should return 201 on success", async () => {
      const response = await request(app).post("/api/sessions").send({})
      expect(response.status).toBe(201)
      expect(response.body).toHaveProperty("id")
      expect(response.body).toHaveProperty("label")
      expect(response.body).toHaveProperty("createdAt")
    })

    it("should return 201 with clientId in request body", async () => {
      const response = await request(app)
        .post("/api/sessions")
        .send({ clientId: "client-123" })
      expect(response.status).toBe(201)
      expect(response.body).toHaveProperty("id")
    })

    it("should set default cols and rows", async () => {
      const response = await request(app).post("/api/sessions").send({})
      expect(response.status).toBe(201)
      expect(response.body.cols).toBe(80)
      expect(response.body.rows).toBe(24)
    })

    it("should return 500 when createSession throws", async () => {
      const { createSession } = await import("../../../server/sessions/pty-manager.js")
      vi.mocked(createSession).mockImplementationOnce(() => {
        throw new Error("Failed to create session")
      })
      const response = await request(app).post("/api/sessions").send({})
      expect(response.status).toBe(500)
      expect(response.body).toHaveProperty("error")
    })
  })

  describe("PATCH /:id", () => {
    it("should return 400 for missing label", async () => {
      // Create a session first
      const createResp = await request(app).post("/api/sessions").send({})
      const sessionId = createResp.body.id

      const response = await request(app)
        .patch(`/api/sessions/${sessionId}`)
        .send({})
      expect(response.status).toBe(400)
      expect(response.body).toHaveProperty("error")
    })

    it("should return 400 for empty string label", async () => {
      const createResp = await request(app).post("/api/sessions").send({})
      const sessionId = createResp.body.id

      const response = await request(app)
        .patch(`/api/sessions/${sessionId}`)
        .send({ label: "" })
      expect(response.status).toBe(400)
    })

    it("should return 400 for whitespace-only label", async () => {
      const createResp = await request(app).post("/api/sessions").send({})
      const sessionId = createResp.body.id

      const response = await request(app)
        .patch(`/api/sessions/${sessionId}`)
        .send({ label: "   " })
      expect(response.status).toBe(400)
    })

    it("should return 400 for label > 1024 characters", async () => {
      const createResp = await request(app).post("/api/sessions").send({})
      const sessionId = createResp.body.id

      const response = await request(app)
        .patch(`/api/sessions/${sessionId}`)
        .send({ label: "a".repeat(1025) })
      expect(response.status).toBe(400)
      expect(response.body).toHaveProperty("error")
      expect(response.body.error).toContain("1024")
    })

    it("should return 404 for unknown ID", async () => {
      const response = await request(app)
        .patch("/api/sessions/unknown-id")
        .send({ label: "New Label" })
      expect(response.status).toBe(404)
      expect(response.body).toHaveProperty("error")
    })

    it("should return 200 with updated session for valid label", async () => {
      const createResp = await request(app).post("/api/sessions").send({})
      const sessionId = createResp.body.id

      const response = await request(app)
        .patch(`/api/sessions/${sessionId}`)
        .send({ label: "New Label" })
      expect(response.status).toBe(200)
      expect(response.body).toHaveProperty("label", "New Label")
      expect(response.body).toHaveProperty("id", sessionId)
    })

    it("should trim whitespace from label", async () => {
      const createResp = await request(app).post("/api/sessions").send({})
      const sessionId = createResp.body.id

      const response = await request(app)
        .patch(`/api/sessions/${sessionId}`)
        .send({ label: "  New Label  " })
      expect(response.status).toBe(200)
      expect(response.body.label).toBe("New Label")
    })
  })

  describe("DELETE /:id", () => {
    it("should return 404 for unknown ID", async () => {
      const response = await request(app).delete("/api/sessions/unknown-id")
      expect(response.status).toBe(404)
      expect(response.body).toHaveProperty("error")
    })

    it("should return 404 for session that doesn't exist", async () => {
      const response = await request(app).delete("/api/sessions/invalid-id")
      expect(response.status).toBe(404)
    })

    it("should return { success: true } on success", async () => {
      const createResp = await request(app).post("/api/sessions").send({})
      const sessionId = createResp.body.id

      const response = await request(app).delete(`/api/sessions/${sessionId}`)
      expect(response.status).toBe(200)
      expect(response.body).toEqual({ success: true })
    })

    it("should remove session after deletion", async () => {
      const createResp = await request(app).post("/api/sessions").send({})
      const sessionId = createResp.body.id

      await request(app).delete(`/api/sessions/${sessionId}`)

      const listResp = await request(app).get("/api/sessions")
      const ids = listResp.body.map((s: any) => s.id)
      expect(ids).not.toContain(sessionId)
    })
  })

  describe("GET /:id/info", () => {
    it("should return 404 for unknown ID", async () => {
      const response = await request(app).get("/api/sessions/unknown-id/info")
      expect(response.status).toBe(404)
      expect(response.body).toHaveProperty("error")
    })

    it("should return 404 when session doesn't exist", async () => {
      const response = await request(app).get("/api/sessions/test-id/info")
      expect(response.status).toBe(404)
    })

    it("should return process info on success", async () => {
      const createResp = await request(app).post("/api/sessions").send({})
      const sessionId = createResp.body.id

      const response = await request(app).get(`/api/sessions/${sessionId}/info`)
      expect(response.status).toBe(200)
      expect(response.body).toHaveProperty("pid")
      expect(response.body).toHaveProperty("command")
      expect(response.body).toHaveProperty("user")
      expect(response.body).toHaveProperty("cpuUsage")
      expect(response.body).toHaveProperty("memoryUsage")
    })
  })
})
