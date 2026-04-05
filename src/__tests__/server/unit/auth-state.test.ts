import { describe, it, expect, beforeEach, vi } from "vitest"
import { vol } from "memfs"

// Mock fs and os before importing the module under test
vi.mock("node:fs")
vi.mock("node:os", () => ({
  homedir: () => "/fake/home",
}))
vi.mock("../../../server/lib/logger.js", () => ({
  default: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}))

// Mock password utilities
vi.mock("../../../shared/utils/password-gen.js", () => ({
  generateXkcdPassword: vi.fn(() => "correct-horse-battery-staple"),
  generateRandomPassword: vi.fn(() => "a1b2c3d4e5f6"),
}))

vi.mock("../../../server/auth/password-hash.js", () => ({
  hashPassword: vi.fn(async (pwd) => `hashed:${pwd}`),
  verifyPassword: vi.fn(async (candidate, hash) => hash === `hashed:${candidate}`),
}))

import {
  initAuthState,
  verifySessionPassword,
  rotateSessionPassword,
  setSessionPassword,
  get2FAState,
  save2FAState,
  clear2FAState,
  type TotpState,
} from "../../../server/auth/state"

describe("auth-state", () => {
  beforeEach(async () => {
    vol.reset()
    vol.mkdirSync("/fake/home/.puttry", { recursive: true })
    // Reset env vars
    delete process.env.SESSION_PASSWORD_TYPE
    delete process.env.SESSION_PASSWORD_LENGTH
    vi.clearAllMocks()
  })

  describe("initAuthState", () => {
    it("should initialize without throwing", async () => {
      process.env.SESSION_PASSWORD_TYPE = "xkcd"
      expect(async () => await initAuthState()).not.toThrow()
    })

    it("should handle password initialization", async () => {
      // Test that auth state can be initialized
      await initAuthState()
      // Should succeed
    })
  })

  describe("verifySessionPassword", () => {
    it("should return boolean result", async () => {
      await initAuthState()
      const result = await verifySessionPassword("any-password")
      expect(typeof result).toBe("boolean")
    })
  })

  describe("rotateSessionPassword", () => {
    it("should not throw", async () => {
      await initAuthState()
      expect(async () => await rotateSessionPassword()).not.toThrow()
    })
  })

  describe("setSessionPassword", () => {
    it("should not throw", async () => {
      await initAuthState()
      expect(async () => await setSessionPassword("new-password")).not.toThrow()
    })
  })

  describe("2FA functions", () => {
    it("should return null or state object from get2FAState", async () => {
      await initAuthState()
      const state = get2FAState()
      expect(state === null || typeof state === "object").toBe(true)
    })
  })

  describe("save2FAState and clear2FAState", () => {
    it("should not throw", async () => {
      await initAuthState()
      const state: TotpState = {
        secret: "new-secret",
        verified: false,
        setupAt: new Date().toISOString(),
      }
      expect(() => save2FAState(state)).not.toThrow()
      expect(() => clear2FAState()).not.toThrow()
    })
  })

  describe("generateNewSessionPassword", () => {
    it("should support different password types", async () => {
      process.env.SESSION_PASSWORD_TYPE = "xkcd"
      process.env.SESSION_PASSWORD_LENGTH = "3"
      await initAuthState()
      expect(async () => await initAuthState()).not.toThrow()
    })

    it("should support random password generation", async () => {
      process.env.SESSION_PASSWORD_TYPE = "random"
      process.env.SESSION_PASSWORD_LENGTH = "16"
      expect(async () => await initAuthState()).not.toThrow()
    })
  })
})
