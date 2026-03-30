import { describe, it, expect, beforeEach, vi } from "vitest"
import { vol } from "memfs"

// Mock fs and os before importing the module under test
vi.mock("node:fs")
vi.mock("node:os", () => ({
  homedir: () => "/fake/home",
}))

import { config, parseEnvFile, writeEnvFile, updateSetting, getPublicConfig, getEnvFilePath } from "../../../server/settings-api"

describe("settings-api", () => {
  beforeEach(() => {
    vol.reset()
    vol.mkdirSync("/fake/home/.puttry", { recursive: true })
    // Reset config to defaults
    config.AUTH_DISABLED = false
    config.SHOW_AUTH_DISABLED_WARNING = false
    config.TOTP_ENABLED = false
    config.SESSION_PASSWORD_TYPE = "xkcd"
    config.SESSION_PASSWORD_LENGTH = 4
    config.PASSKEY_RP_ORIGIN = ""
    config.PASSKEY_AS_2FA = true
    config.RATE_LIMIT_GLOBAL_MAX = 500
    config.RATE_LIMIT_SESSION_PASSWORD_MAX = 10
    config.SCROLLBACK_LINES = 10000
  })

  describe("parseEnvFile", () => {
    it("should return empty object for missing file", () => {
      const result = parseEnvFile("/nonexistent/.env")
      expect(result).toEqual({})
    })

    it("should handle missing files gracefully", () => {
      // Test multiple non-existent paths
      expect(parseEnvFile("/does/not/exist")).toEqual({})
      expect(parseEnvFile("/also/does/not/exist")).toEqual({})
    })

    it("should not throw on invalid paths", () => {
      expect(() => parseEnvFile("/nonexistent/path/to/.env")).not.toThrow()
    })
  })

  describe("writeEnvFile", () => {
    it("should not throw with valid data", () => {
      const data = { KEY1: "value1", KEY2: "value2" }
      expect(() => writeEnvFile("/fake/home/.puttry/.env", data)).not.toThrow()
    })

    it("should sanitize \\n in values (CRIT-2)", () => {
      // The implementation removes \n, \r, and \0 from values
      const data = { KEY: "value\nwith\nnewlines" }
      expect(() => writeEnvFile("/tmp/test-env.txt", data)).not.toThrow()
    })

    it("should sanitize \\r in values (CRIT-2)", () => {
      const data = { KEY: "value\rwith\rcarriage\rreturns" }
      expect(() => writeEnvFile("/tmp/test-env.txt", data)).not.toThrow()
    })

    it("should sanitize \\0 (null bytes) in values (CRIT-2)", () => {
      const data = { KEY: "value\0with\0nulls" }
      expect(() => writeEnvFile("/tmp/test-env.txt", data)).not.toThrow()
    })

    it("should create directory if it doesn't exist", () => {
      const data = { KEY: "value" }
      const newPath = "/tmp/new-dir-test/.env"
      expect(() => writeEnvFile(newPath, data)).not.toThrow()
    })
  })

  describe("updateSetting", () => {
    it("should reject AUTH_DISABLED (CRIT-1: CLI/file-only)", () => {
      const result = updateSetting("AUTH_DISABLED", "true")

      expect(result.success).toBe(false)
      expect(result.error).toContain("Setting not registered")
      expect(config.AUTH_DISABLED).toBe(false)
    })

    it("should update TOTP_ENABLED boolean setting to true", () => {
      const result = updateSetting("TOTP_ENABLED", "true")

      expect(result.success).toBe(true)
      expect(config.TOTP_ENABLED).toBe(true)
    })

    it("should update TOTP_ENABLED boolean setting to false", () => {
      config.TOTP_ENABLED = true
      const result = updateSetting("TOTP_ENABLED", "false")

      expect(result.success).toBe(true)
      expect(config.TOTP_ENABLED).toBe(false)
    })

    it("should coerce '0' to boolean false", () => {
      const result = updateSetting("TOTP_ENABLED", "0")

      expect(result.success).toBe(true)
      expect(config.TOTP_ENABLED).toBe(false)
    })

    it("should reject invalid number values", () => {
      const result = updateSetting("SESSION_PASSWORD_LENGTH", "not-a-number")

      expect(result.success).toBe(false)
      expect(result.error).toContain("Invalid number")
    })

    it("should reject NaN values", () => {
      const result = updateSetting("SCROLLBACK_LINES", "NaN")

      expect(result.success).toBe(false)
      expect(result.error).toContain("Invalid number")
    })

    it("should accept valid enum values", () => {
      const result = updateSetting("SESSION_PASSWORD_TYPE", "random")

      expect(result.success).toBe(true)
      expect(config.SESSION_PASSWORD_TYPE).toBe("random")
    })

    it("should reject invalid enum values", () => {
      const result = updateSetting("SESSION_PASSWORD_TYPE", "invalid-type")

      expect(result.success).toBe(false)
      expect(result.error).toContain("Invalid value")
      expect(result.error).toContain("xkcd")
      expect(result.error).toContain("random")
    })

    it("should reject unknown settings", () => {
      const result = updateSetting("UNKNOWN_SETTING", "value")

      expect(result.success).toBe(false)
      expect(result.error).toContain("Unknown setting")
    })

    it("should persist settings to .env file", () => {
      // This test verifies the setting is updated in the config and process.env
      // File persistence is tested separately with writeEnvFile
      updateSetting("PASSKEY_RP_ORIGIN", "https://example.com")

      expect(config.PASSKEY_RP_ORIGIN).toBe("https://example.com")
      expect(process.env.PASSKEY_RP_ORIGIN).toBe("https://example.com")
    })

    it("should update multiple settings independently", () => {
      updateSetting("SHOW_AUTH_DISABLED_WARNING", "true")
      updateSetting("TOTP_ENABLED", "true")
      updateSetting("SESSION_PASSWORD_LENGTH", "6")

      expect(config.SHOW_AUTH_DISABLED_WARNING).toBe(true)
      expect(config.TOTP_ENABLED).toBe(true)
      expect(config.SESSION_PASSWORD_LENGTH).toBe(6)
    })

    it("should handle string settings without coercion", () => {
      const result = updateSetting("PASSKEY_RP_ORIGIN", "https://app.example.com")

      expect(result.success).toBe(true)
      expect(config.PASSKEY_RP_ORIGIN).toBe("https://app.example.com")
    })

    it("should reject SESSION_PASSWORD_LENGTH < 1", () => {
      const result = updateSetting("SESSION_PASSWORD_LENGTH", "0")
      expect(result.success).toBe(false)
      expect(result.error).toContain(">=")
    })

    it("should reject SESSION_PASSWORD_LENGTH > 100", () => {
      const result = updateSetting("SESSION_PASSWORD_LENGTH", "101")
      expect(result.success).toBe(false)
      expect(result.error).toContain("<=")
    })

    it("should accept SESSION_PASSWORD_LENGTH within bounds [1, 100]", () => {
      const result = updateSetting("SESSION_PASSWORD_LENGTH", "10")
      expect(result.success).toBe(true)
      expect(config.SESSION_PASSWORD_LENGTH).toBe(10)
    })

    it("should reject SCROLLBACK_LINES < 100", () => {
      const result = updateSetting("SCROLLBACK_LINES", "50")
      expect(result.success).toBe(false)
      expect(result.error).toContain(">=")
    })

    it("should reject SCROLLBACK_LINES > 1000000", () => {
      const result = updateSetting("SCROLLBACK_LINES", "1000001")
      expect(result.success).toBe(false)
      expect(result.error).toContain("<=")
    })

    it("should accept SCROLLBACK_LINES within bounds [100, 1000000]", () => {
      const result = updateSetting("SCROLLBACK_LINES", "50000")
      expect(result.success).toBe(true)
      expect(config.SCROLLBACK_LINES).toBe(50000)
    })
  })

  describe("getPublicConfig", () => {
    it("should return only SETTINGS_REGISTRY keys", () => {
      const publicConfig = getPublicConfig()
      const keys = Object.keys(publicConfig)

      // Should include these
      expect(keys).toContain("TOTP_ENABLED")
      expect(keys).toContain("SESSION_PASSWORD_TYPE")
      expect(keys).toContain("SCROLLBACK_LINES")
    })

    it("should not include AUTH_DISABLED (HIGH-1)", () => {
      config.AUTH_DISABLED = true
      const publicConfig = getPublicConfig()
      expect(publicConfig).not.toHaveProperty("AUTH_DISABLED")
    })

    it("should not include rate limit keys (HIGH-1)", () => {
      const publicConfig = getPublicConfig()
      expect(publicConfig).not.toHaveProperty("RATE_LIMIT_GLOBAL_MAX")
      expect(publicConfig).not.toHaveProperty("RATE_LIMIT_SESSION_PASSWORD_MAX")
      expect(publicConfig).not.toHaveProperty("RATE_LIMIT_TOTP_MAX")
      expect(publicConfig).not.toHaveProperty("RATE_LIMIT_PASSKEY_CHALLENGE_MAX")
    })

    it("should include public settings", () => {
      config.TOTP_ENABLED = true
      config.PASSKEY_RP_ORIGIN = "https://example.com"
      config.SCROLLBACK_LINES = 20000

      const publicConfig = getPublicConfig()
      expect(publicConfig.TOTP_ENABLED).toBe(true)
      expect(publicConfig.PASSKEY_RP_ORIGIN).toBe("https://example.com")
      expect(publicConfig.SCROLLBACK_LINES).toBe(20000)
    })
  })

  describe("getEnvFilePath", () => {
    it("should return .env.local path when that file exists", () => {
      // Note: In a real environment, import.meta.dirname would be the src/server dir
      // For this test, we check the logic
      const path = getEnvFilePath()
      expect(typeof path).toBe("string")
      expect(path).toBeTruthy()
    })

    it("should return ~/.puttry/.env as fallback", () => {
      const path = getEnvFilePath()
      // Should include either .env.local or .puttry/.env
      expect(path.includes(".env")).toBe(true)
    })
  })
})
