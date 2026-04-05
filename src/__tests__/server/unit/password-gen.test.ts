import { describe, it, expect } from "vitest"
import { generateXkcdPassword, generateRandomPassword } from "../../../shared/utils/password-gen"

describe("password-gen", () => {
  describe("generateXkcdPassword", () => {
    it("should generate XKCD-style passwords with default 4 words", () => {
      const password = generateXkcdPassword()

      expect(password).toBeTruthy()
      const parts = password.split("-")
      // Should have 4 words + 1 digit = 5 parts
      expect(parts).toHaveLength(5)
    })

    it("should have hyphen-separated words", () => {
      const password = generateXkcdPassword()
      const parts = password.split("-")

      // Check that all but the last part are words (lowercase letters only)
      for (let i = 0; i < parts.length - 1; i++) {
        expect(parts[i]).toMatch(/^[a-z]+$/)
      }
    })

    it("should end with a single digit", () => {
      const password = generateXkcdPassword()
      const lastPart = password.split("-").pop()!

      expect(lastPart).toMatch(/^\d$/)
    })

    it("should generate different passwords each time", () => {
      const password1 = generateXkcdPassword()
      const password2 = generateXkcdPassword()

      expect(password1).not.toBe(password2)
    })

    it("should support custom word count", () => {
      const password = generateXkcdPassword(6)
      const parts = password.split("-")

      // Should have 6 words + 1 digit = 7 parts
      expect(parts).toHaveLength(7)
    })

    it("should support single word", () => {
      const password = generateXkcdPassword(1)
      const parts = password.split("-")

      // Should have 1 word + 1 digit = 2 parts
      expect(parts).toHaveLength(2)
    })

    it("should support many words", () => {
      const password = generateXkcdPassword(10)
      const parts = password.split("-")

      // Should have 10 words + 1 digit = 11 parts
      expect(parts).toHaveLength(11)
    })

    it("should be memorable format (words-words-words-digit)", () => {
      const password = generateXkcdPassword(3)

      // Check format: word-word-word-digit
      expect(password).toMatch(/^[a-z]+-[a-z]+-[a-z]+-\d$/)
    })

    it("should only use lowercase words", () => {
      for (let i = 0; i < 10; i++) {
        const password = generateXkcdPassword()
        const words = password.split("-").slice(0, -1)

        for (const word of words) {
          expect(word).toMatch(/^[a-z]+$/)
        }
      }
    })
  })

  describe("generateRandomPassword", () => {
    it("should generate random passwords with default 16 characters", () => {
      const password = generateRandomPassword()

      expect(password).toBeTruthy()
      expect(password).toHaveLength(16)
    })

    it("should only contain alphanumeric characters", () => {
      const password = generateRandomPassword()

      expect(password).toMatch(/^[A-Za-z0-9]+$/)
    })

    it("should support custom length", () => {
      const password = generateRandomPassword(32)
      expect(password).toHaveLength(32)
    })

    it("should support short passwords", () => {
      const password = generateRandomPassword(1)
      expect(password).toHaveLength(1)
    })

    it("should support long passwords", () => {
      const password = generateRandomPassword(128)
      expect(password).toHaveLength(128)
    })

    it("should generate different passwords each time", () => {
      const password1 = generateRandomPassword()
      const password2 = generateRandomPassword()

      expect(password1).not.toBe(password2)
    })

    it("should include mix of uppercase, lowercase, and digits over multiple generations", () => {
      const passwords = Array.from({ length: 20 }, () => generateRandomPassword(32))
      const combined = passwords.join("")

      // With 20 passwords of 32 chars, we should see all character types
      expect(combined).toMatch(/[A-Z]/)
      expect(combined).toMatch(/[a-z]/)
      expect(combined).toMatch(/[0-9]/)
    })

    it("should be cryptographically random (different on each call)", () => {
      const passwords = new Set()

      for (let i = 0; i < 100; i++) {
        passwords.add(generateRandomPassword(16))
      }

      // All 100 passwords should be unique (probability of collision is negligible)
      expect(passwords.size).toBe(100)
    })

    it("should handle empty password", () => {
      const password = generateRandomPassword(0)
      expect(password).toBe("")
    })
  })
})
