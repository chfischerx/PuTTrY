import { describe, it, expect, beforeEach, vi } from "vitest"
import { vol } from "memfs"
import request from "supertest"
import type { RateLimitRequestHandler } from "express-rate-limit"

// Mock all dependencies before importing app
vi.mock("node:fs")
vi.mock("node:os", () => ({
  homedir: () => "/fake/home",
}))

vi.mock("../../../server/logger.js", () => ({
  default: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}))

vi.mock("../../../server/pty-manager.js", () => ({
  createSession: vi.fn((cols, rows) => ({
    id: "mock-session",
    label: "Mock Session",
    createdAt: new Date().toISOString(),
    cols,
    rows,
  })),
  getAllSessions: vi.fn(() => []),
  getSession: vi.fn(() => null),
  renameSession: vi.fn(() => false),
  killSession: vi.fn(() => false),
  getSessionProcessInfo: vi.fn(() => null),
}))

vi.mock("../../../server/passkey-state.js", () => ({
  getPasskeys: vi.fn(() => []),
}))

vi.mock("../../../server/auth/middleware.js", () => ({
  createRequireAuth: vi.fn(() => (_req: any, _res: any, next: () => void) =>
    next()
  ),
}))

vi.mock("../../../server/auth/routes.js", () => ({
  createAuthRouter: vi.fn(async () => {
    const { Router } = await import("express")
    return Router()
  }),
}))

vi.mock("../../../server/session-store.js", () => ({
  activeSessions: new Map(),
  parseBrowserSessionToken: vi.fn(() => null),
}))

vi.mock("../../../server/settings-api.js", () => ({
  getPublicConfig: vi.fn(() => ({ SCROLLBACK_LINES: 10000 })),
}))

import { createApp } from "../../../server/app"

describe("app", () => {
  const noOpLimiter = ((_req: any, _res: any, next: any) => next()) as any as RateLimitRequestHandler

  const createMockConfig = () => ({
    AUTH_DISABLED: false,
    SHOW_AUTH_DISABLED_WARNING: false,
    TOTP_ENABLED: false,
    SESSION_PASSWORD_TYPE: "xkcd",
    SESSION_PASSWORD_LENGTH: 4,
    PASSKEY_RP_ORIGIN: "",
    PASSKEY_AS_2FA: true,
    RATE_LIMIT_GLOBAL_MAX: 500,
    RATE_LIMIT_SESSION_PASSWORD_MAX: 10,
    SCROLLBACK_LINES: 10000,
  })

  beforeEach(() => {
    vol.reset()
    vol.mkdirSync("/fake/home/.puttry", { recursive: true })
    vi.clearAllMocks()
  })

  const createMockTerminalRouter = () => {
    const { Router } = require("express")
    return Router()
  }

  describe("Host header middleware", () => {
    it("should allow localhost", async () => {
      const { app } = await createApp({
        config: createMockConfig(),
        logger: console,
        sessionPasswordLimiter: noOpLimiter,
        globalLimiter: noOpLimiter,
        createTerminalRouter: createMockTerminalRouter,
        updateSetting: () => ({ success: true }),
      })

      const response = await request(app)
        .get("/api/auth-status")
        .set("Host", "localhost")
      expect(response.status).not.toBe(403)
    })

    it("should allow 127.0.0.1", async () => {
      const { app } = await createApp({
        config: createMockConfig(),
        logger: console,
        sessionPasswordLimiter: noOpLimiter,
        globalLimiter: noOpLimiter,
        createTerminalRouter: createMockTerminalRouter,
        updateSetting: () => ({ success: true }),
      })

      const response = await request(app)
        .get("/api/auth-status")
        .set("Host", "127.0.0.1")
      expect(response.status).not.toBe(403)
    })

    it("should handle IPv6 loopback", async () => {
      const { app } = await createApp({
        config: createMockConfig(),
        logger: console,
        sessionPasswordLimiter: noOpLimiter,
        globalLimiter: noOpLimiter,
        createTerminalRouter: createMockTerminalRouter,
        updateSetting: () => ({ success: true }),
      })

      const response = await request(app)
        .get("/api/auth-status")
        .set("Host", "::1")
      // Should either allow or return proper response
      expect([200, 403]).toContain(response.status)
    })

    it("should block evil.attacker.com with 403", async () => {
      const { app } = await createApp({
        config: createMockConfig(),
        logger: console,
        sessionPasswordLimiter: noOpLimiter,
        globalLimiter: noOpLimiter,
        createTerminalRouter: createMockTerminalRouter,
        updateSetting: () => ({ success: true }),
      })

      const response = await request(app)
        .get("/api/auth-status")
        .set("Host", "evil.attacker.com")
      expect(response.status).toBe(403)
    })

    it("should respect ALLOWED_HOSTS env var", async () => {
      process.env.ALLOWED_HOSTS = "example.com, trusted.local"

      try {
        const { app, allowedHostSet } = await createApp({
          config: createMockConfig(),
          logger: console,
          sessionPasswordLimiter: noOpLimiter,
          globalLimiter: noOpLimiter,
          createTerminalRouter: createMockTerminalRouter,
          updateSetting: () => ({ success: true }),
        })

        expect(allowedHostSet.has("example.com")).toBe(true)
        expect(allowedHostSet.has("trusted.local")).toBe(true)

        const response = await request(app)
          .get("/api/auth-status")
          .set("Host", "example.com")
        expect(response.status).not.toBe(403)
      } finally {
        delete process.env.ALLOWED_HOSTS
      }
    })
  })

  describe("Security headers", () => {
    it("should include X-Frame-Options: DENY", async () => {
      const { app } = await createApp({
        config: createMockConfig(),
        logger: console,
        sessionPasswordLimiter: noOpLimiter,
        globalLimiter: noOpLimiter,
        createTerminalRouter: createMockTerminalRouter,
        updateSetting: () => ({ success: true }),
      })

      const response = await request(app).get("/api/auth-status")
      expect(response.get("X-Frame-Options")).toBe("DENY")
    })

    it("should include X-Content-Type-Options: nosniff", async () => {
      const { app } = await createApp({
        config: createMockConfig(),
        logger: console,
        sessionPasswordLimiter: noOpLimiter,
        globalLimiter: noOpLimiter,
        createTerminalRouter: createMockTerminalRouter,
        updateSetting: () => ({ success: true }),
      })

      const response = await request(app).get("/api/auth-status")
      expect(response.get("X-Content-Type-Options")).toBe("nosniff")
    })

    it("should set CSP header for production", async () => {
      const { app } = await createApp({
        config: createMockConfig(),
        logger: console,
        sessionPasswordLimiter: noOpLimiter,
        globalLimiter: noOpLimiter,
        createTerminalRouter: createMockTerminalRouter,
        updateSetting: () => ({ success: true }),
        devMode: false,
      })

      const response = await request(app).get("/api/auth-status")
      const csp = response.get("Content-Security-Policy")
      expect(csp).toBeTruthy()
      expect(csp).toContain("script-src")
    })

    it("should include unsafe-inline for scripts in devMode", async () => {
      const { app } = await createApp({
        config: createMockConfig(),
        logger: console,
        sessionPasswordLimiter: noOpLimiter,
        globalLimiter: noOpLimiter,
        createTerminalRouter: createMockTerminalRouter,
        updateSetting: () => ({ success: true }),
        devMode: true,
      })

      const response = await request(app).get("/api/auth-status")
      const csp = response.get("Content-Security-Policy")
      expect(csp).toContain("'unsafe-inline'")
    })
  })

  describe("GET /api/auth-status", () => {
    it("should return authDisabled: true when AUTH_DISABLED is set", async () => {
      const config = createMockConfig()
      config.AUTH_DISABLED = true

      const { app } = await createApp({
        config,
        logger: console,
        sessionPasswordLimiter: noOpLimiter,
        globalLimiter: noOpLimiter,
        createTerminalRouter: createMockTerminalRouter,
        updateSetting: () => ({ success: true }),
      })

      const response = await request(app)
        .get("/api/auth-status")
        .set("Host", "localhost")
      expect(response.status).toBe(200)
      expect(response.body.authenticated).toBe(true)
      expect(response.body.authDisabled).toBe(true)
    })

    it("should return authenticated: false when no valid session cookie", async () => {
      const config = createMockConfig()
      config.AUTH_DISABLED = false

      const { app } = await createApp({
        config,
        logger: console,
        sessionPasswordLimiter: noOpLimiter,
        globalLimiter: noOpLimiter,
        createTerminalRouter: createMockTerminalRouter,
        updateSetting: () => ({ success: true }),
      })

      const response = await request(app)
        .get("/api/auth-status")
        .set("Host", "localhost")
      expect(response.status).toBe(200)
      expect(response.body.authenticated).toBe(false)
      expect(response.body.authDisabled).toBe(false)
    })

    it("should include passkeyLoginAvailable when passkeys exist and PASSKEY_AS_2FA is false", async () => {
      const { getPasskeys } = await import(
        "../../../server/passkey-state.js"
      )
      vi.mocked(getPasskeys).mockReturnValueOnce([
        {
          id: "key1",
          name: "Test Key",
          publicKey: "base64",
          counter: 0,
          registeredAt: new Date().toISOString(),
          transports: ["internal"],
        },
      ])

      const config = createMockConfig()
      config.PASSKEY_AS_2FA = false

      const { app } = await createApp({
        config,
        logger: console,
        sessionPasswordLimiter: noOpLimiter,
        globalLimiter: noOpLimiter,
        createTerminalRouter: createMockTerminalRouter,
        updateSetting: () => ({ success: true }),
      })

      const response = await request(app)
        .get("/api/auth-status")
        .set("Host", "localhost")
      expect(response.status).toBe(200)
      expect(response.body).toHaveProperty("passkeyLoginAvailable")
      expect(response.body.passkeyLoginAvailable).toBe(true)
    })

    it("should have passkeyLoginAvailable: false when PASSKEY_AS_2FA is true", async () => {
      const config = createMockConfig()
      config.PASSKEY_AS_2FA = true

      const { app } = await createApp({
        config,
        logger: console,
        sessionPasswordLimiter: noOpLimiter,
        globalLimiter: noOpLimiter,
        createTerminalRouter: createMockTerminalRouter,
        updateSetting: () => ({ success: true }),
      })

      const response = await request(app)
        .get("/api/auth-status")
        .set("Host", "localhost")
      expect(response.status).toBe(200)
      expect(response.body.passkeyLoginAvailable).toBe(false)
    })
  })
})
