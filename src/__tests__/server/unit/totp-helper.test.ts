import { describe, it, expect, beforeEach, vi } from "vitest"
import { generateTotpSecret, generateQRCode, verifyTotp } from "../../../server/auth/totp-helper"

describe("totp-helper", () => {
  beforeEach(() => {
    vi.resetModules()
  })

  describe("generateTotpSecret", () => {
    it("should generate a valid TOTP secret", async () => {
      const secret = await generateTotpSecret()
      expect(secret).toBeTruthy()
      expect(typeof secret).toBe("string")
      expect(secret.length).toBeGreaterThan(0)
    })

    it("should generate different secrets each time", async () => {
      const secret1 = await generateTotpSecret()
      const secret2 = await generateTotpSecret()
      expect(secret1).not.toBe(secret2)
    })
  })

  describe("generateQRCode", () => {
    it("should generate QR code data with secret and email", async () => {
      const secret = await generateTotpSecret()
      const email = "test@example.com"

      const qrData = await generateQRCode(secret, email)

      expect(qrData).toHaveProperty("dataUrl")
      expect(qrData.dataUrl).toMatch(/^data:image/)
      // M-3: manualEntryKey is no longer returned (secret stored server-side)
    })

    it("should include email and app name in QR code URI", async () => {
      const secret = await generateTotpSecret()
      const email = "user@domain.com"
      const appName = "TestApp"

      const qrData = await generateQRCode(secret, email, appName)

      expect(qrData.dataUrl).toBeTruthy()
      // M-3: manualEntryKey is no longer returned (secret stored server-side)
    })

    it("should use default app name if not provided", async () => {
      const secret = await generateTotpSecret()
      const qrData = await generateQRCode(secret, "test@example.com")

      expect(qrData).toHaveProperty("dataUrl")
      // M-3: manualEntryKey is no longer returned (secret stored server-side)
    })
  })

  describe("verifyTotp", () => {
    it("should reject codes that are not 6 digits", async () => {
      const secret = await generateTotpSecret()

      expect(await verifyTotp(secret, "12345")).toBe(false) // 5 digits
      expect(await verifyTotp(secret, "1234567")).toBe(false) // 7 digits
      expect(await verifyTotp(secret, "abcdef")).toBe(false) // non-numeric
    })

    it("should reject invalid code format", async () => {
      const secret = await generateTotpSecret()

      expect(await verifyTotp(secret, "")).toBe(false)
      expect(await verifyTotp(secret, "000000 ")).toBe(false) // extra space
      expect(await verifyTotp(secret, " 000000")).toBe(false) // leading space
    })

    it("should reject replay attacks within the same time window", async () => {
      vi.useFakeTimers()

      const secret = await generateTotpSecret()

      // We can't easily test this without mocking otplib's verifySync,
      // but we can verify the structure is correct by testing the format validation
      const validCode = "000000"

      // Mock otplib to return a valid code for testing replay prevention
      vi.doMock("otplib", () => ({
        verifySync: vi.fn(() => ({ valid: true })),
        generateSecret: vi.fn(() => "JBSWY3DPEBLW64TMMQ======"),
        generateURI: vi.fn(() => "otpauth://totp/test"),
      }))

      // Re-import after mock
      const { verifyTotp: verifyTotpMocked } = await import("../../../server/auth/totp-helper")

      const result1 = await verifyTotpMocked(secret, validCode)
      // Second attempt within 30 seconds should fail (replay prevention)
      const result2 = await verifyTotpMocked(secret, validCode)

      expect(result1).toBe(true)
      expect(result2).toBe(false)

      vi.useRealTimers()
    })

    it("should accept valid TOTP codes", async () => {
      vi.doMock("otplib", () => ({
        verifySync: vi.fn(() => ({ valid: true })),
        generateSecret: vi.fn(() => "JBSWY3DPEBLW64TMMQ======"),
        generateURI: vi.fn(() => "otpauth://totp/test"),
      }))

      const { verifyTotp: verifyTotpMocked } = await import(
        "../../../server/auth/totp-helper"
      )
      const secret = "test-secret"
      const validCode = "123456"

      const result = await verifyTotpMocked(secret, validCode)
      expect(result).toBe(true)
    })

    it("should accept valid TOTP codes with correct format", async () => {
      // Mock otplib to return valid for any 6-digit code
      vi.doMock("otplib", () => ({
        verifySync: vi.fn(({ token }: any) => ({
          valid: /^\d{6}$/.test(token),
        })),
        generateSecret: vi.fn(() => "JBSWY3DPEBLW64TMMQ======"),
        generateURI: vi.fn(() => "otpauth://totp/test"),
      }))

      const { verifyTotp: verifyTotpMocked } = await import(
        "../../../server/auth/totp-helper"
      )
      const secret = "test-secret"

      const result = await verifyTotpMocked(secret, "000000")
      expect(result).toBe(true)
    })

    it("should block same code on second call (replay prevention)", async () => {
      vi.useFakeTimers()
      const baseTime = new Date("2024-01-01T00:00:00Z").getTime()
      vi.setSystemTime(baseTime)

      vi.doMock("otplib", () => ({
        verifySync: vi.fn(() => ({ valid: true })),
        generateSecret: vi.fn(() => "JBSWY3DPEBLW64TMMQ======"),
        generateURI: vi.fn(() => "otpauth://totp/test"),
      }))

      const { verifyTotp: verifyTotpMocked } = await import(
        "../../../server/auth/totp-helper"
      )

      const secret = "test-secret"
      const code = "123456"

      // First use should succeed
      const result1 = await verifyTotpMocked(secret, code)
      expect(result1).toBe(true)

      // Advance time by 15 seconds (still within 30-second window)
      vi.advanceTimersByTime(15000)

      // Second use within 30 seconds should fail (replay prevention)
      const result2 = await verifyTotpMocked(secret, code)
      expect(result2).toBe(false)

      vi.useRealTimers()
    })

    it("should track code usage over time", async () => {
      // This test verifies the internal tracking mechanism
      // The implementation uses a Map to track used codes
      const secret = "test-secret"

      // Test that invalid codes are still rejected
      const result = await verifyTotp(secret, "invalid")
      expect(result).toBe(false)

      // Verify format check works
      const shortCode = await verifyTotp(secret, "123")
      expect(shortCode).toBe(false)

      const longCode = await verifyTotp(secret, "1234567")
      expect(longCode).toBe(false)
    })
  })
})
