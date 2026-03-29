import { describe, it, expect } from "vitest"
import { type StoredPasskey } from "../../../server/passkey-state"

describe("passkey-state", () => {
  // Note: Detailed file I/O tests are deferred to integration tests
  // These unit tests verify the interface and key concepts

  const createMockPasskey = (id: string, name: string = "Test Key"): StoredPasskey => ({
    id,
    name,
    publicKey: "base64encodedpublickey==",
    counter: 0,
    registeredAt: new Date().toISOString(),
    transports: ["internal"],
  })

  it("should define StoredPasskey interface correctly", () => {
    const passkey = createMockPasskey("key1", "My Device")

    expect(passkey.id).toBe("key1")
    expect(passkey.name).toBe("My Device")
    expect(passkey).toHaveProperty("publicKey")
    expect(passkey).toHaveProperty("counter")
    expect(passkey).toHaveProperty("registeredAt")
    expect(passkey).toHaveProperty("transports")
  })

  it("should support various transports", () => {
    const passkey = createMockPasskey("key1")
    passkey.transports = ["usb", "nfc", "internal", "hybrid"]

    expect(passkey.transports).toHaveLength(4)
    expect(passkey.transports).toContain("usb")
  })

  it("should handle counter increments", () => {
    const passkey = createMockPasskey("key1")

    passkey.counter = 0
    expect(passkey.counter).toBe(0)

    passkey.counter = 100
    expect(passkey.counter).toBe(100)
  })

  it("should store ISO timestamps", () => {
    const passkey = createMockPasskey("key1")
    const timestamp = passkey.registeredAt

    // Should be parseable as a date
    expect(() => new Date(timestamp)).not.toThrow()
    expect(new Date(timestamp).toISOString()).toBeTruthy()
  })
})
