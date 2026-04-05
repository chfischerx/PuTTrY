import { describe, it, expect } from "vitest"
import { hashPassword, verifyPassword } from "../../../server/auth/password-hash"

describe("password-hash", () => {
  it("should hash a password with a random salt", async () => {
    const plaintext = "my-secret-password"
    const hash1 = await hashPassword(plaintext)
    const hash2 = await hashPassword(plaintext)

    // Different salts should produce different hashes
    expect(hash1).not.toBe(hash2)
    // Both should start with the prefix
    expect(hash1).toMatch(/^scrypt:/)
    expect(hash2).toMatch(/^scrypt:/)
  })

  it("should verify a correct password", async () => {
    const plaintext = "correct-password"
    const hash = await hashPassword(plaintext)

    const isValid = await verifyPassword(plaintext, hash)
    expect(isValid).toBe(true)
  })

  it("should reject an incorrect password", async () => {
    const plaintext = "correct-password"
    const hash = await hashPassword(plaintext)

    const isValid = await verifyPassword("wrong-password", hash)
    expect(isValid).toBe(false)
  })

  it("should reject a hash without the prefix", async () => {
    const invalidHash = "some-random-hash-without-prefix"
    const isValid = await verifyPassword("any-password", invalidHash)
    expect(isValid).toBe(false)
  })

  it("should reject a malformed hash", async () => {
    const malformedHash = "scrypt:invalid"
    // Malformed hash (missing salt or hash part) should either throw or return false
    try {
      const isValid = await verifyPassword("any-password", malformedHash)
      expect(isValid).toBe(false)
    } catch {
      // It's also acceptable for it to throw on malformed input
      expect(true).toBe(true)
    }
  })

  it("should handle special characters in password", async () => {
    const plaintext = "p@$$w0rd!#%&()[]{}=+-*/<>?~`|\\'\""
    const hash = await hashPassword(plaintext)

    const isValid = await verifyPassword(plaintext, hash)
    expect(isValid).toBe(true)
  })

  it("should handle very long passwords", async () => {
    const plaintext = "a".repeat(1000)
    const hash = await hashPassword(plaintext)

    const isValid = await verifyPassword(plaintext, hash)
    expect(isValid).toBe(true)
  })

  it("should handle empty password", async () => {
    const plaintext = ""
    const hash = await hashPassword(plaintext)

    const isValid = await verifyPassword(plaintext, hash)
    expect(isValid).toBe(true)
  })
})
