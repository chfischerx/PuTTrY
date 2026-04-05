import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { RP_NAME, getPasskeyOrigin, getPasskeyRpId, storeChallengeForSession, getChallengeForSession } from "../../../server/auth/passkey-config"
import { pendingChallenges } from "../../../server/sessions/store"

describe("passkey-config", () => {
  beforeEach(() => {
    pendingChallenges.clear()
    vi.useFakeTimers()
    delete process.env.PASSKEY_RP_ORIGIN
    delete process.env.PORT
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe("RP_NAME", () => {
    it("should export RP_NAME as PuTTrY", () => {
      expect(RP_NAME).toBe("PuTTrY")
    })
  })

  describe("getPasskeyOrigin", () => {
    it("should return PASSKEY_RP_ORIGIN from environment", () => {
      process.env.PASSKEY_RP_ORIGIN = "https://app.example.com"

      const origin = getPasskeyOrigin()
      expect(origin).toBe("https://app.example.com")
    })

    it("should construct localhost origin with default port", () => {
      delete process.env.PASSKEY_RP_ORIGIN
      delete process.env.PORT

      const origin = getPasskeyOrigin()
      expect(origin).toBe("http://localhost:5174")
    })

    it("should construct localhost origin with custom port", () => {
      delete process.env.PASSKEY_RP_ORIGIN
      process.env.PORT = "3000"

      const origin = getPasskeyOrigin()
      expect(origin).toBe("http://localhost:3000")
    })

    it("should prefer PASSKEY_RP_ORIGIN over PORT", () => {
      process.env.PASSKEY_RP_ORIGIN = "https://custom.example.com"
      process.env.PORT = "3000"

      const origin = getPasskeyOrigin()
      expect(origin).toBe("https://custom.example.com")
    })
  })

  describe("getPasskeyRpId", () => {
    it("should extract hostname from origin", () => {
      process.env.PASSKEY_RP_ORIGIN = "https://app.example.com"

      const rpId = getPasskeyRpId()
      expect(rpId).toBe("app.example.com")
    })

    it("should extract localhost from default origin", () => {
      delete process.env.PASSKEY_RP_ORIGIN
      delete process.env.PORT

      const rpId = getPasskeyRpId()
      expect(rpId).toBe("localhost")
    })

    it("should handle ports in origin URL", () => {
      process.env.PASSKEY_RP_ORIGIN = "https://app.example.com:8443"

      const rpId = getPasskeyRpId()
      expect(rpId).toBe("app.example.com")
    })

    it("should return localhost for invalid origin", () => {
      process.env.PASSKEY_RP_ORIGIN = "not-a-valid-url"

      const rpId = getPasskeyRpId()
      expect(rpId).toBe("localhost")
    })

    it("should return localhost for empty origin", () => {
      process.env.PASSKEY_RP_ORIGIN = ""

      const rpId = getPasskeyRpId()
      expect(rpId).toBe("localhost")
    })
  })

  describe("storeChallengeForSession", () => {
    it("should store challenge with 5-minute expiry", () => {
      const mockReq = { headers: { cookie: "_wt_session=token123" } } as any
      const mockParseBrowserToken = () => "token123"
      const mockParseTempToken = () => null

      const challenge = "challenge-string-123"
      storeChallengeForSession(mockReq, challenge, mockParseBrowserToken, mockParseTempToken)

      const stored = pendingChallenges.get("token123")
      expect(stored).not.toBeNull()
      expect(stored?.challenge).toBe(challenge)
    })

    it("should prefer browser session over temp session", () => {
      const mockReq = { headers: { cookie: "_wt_session=browser123; _wt_temp=temp456" } } as any
      const mockParseBrowserToken = () => "browser123"
      const mockParseTempToken = () => "temp456"

      const challenge = "challenge"
      storeChallengeForSession(mockReq, challenge, mockParseBrowserToken, mockParseTempToken)

      expect(pendingChallenges.has("browser123")).toBe(true)
      expect(pendingChallenges.has("temp456")).toBe(false)
    })

    it("should use temp session if no browser session", () => {
      const mockReq = { headers: { cookie: "_wt_temp=temp456" } } as any
      const mockParseBrowserToken = () => null
      const mockParseTempToken = () => "temp456"

      const challenge = "challenge"
      storeChallengeForSession(mockReq, challenge, mockParseBrowserToken, mockParseTempToken)

      expect(pendingChallenges.has("temp456")).toBe(true)
    })

    it("should not store challenge without session", () => {
      const mockReq = { headers: {} } as any
      const mockParseBrowserToken = () => null
      const mockParseTempToken = () => null

      const challenge = "challenge"
      storeChallengeForSession(mockReq, challenge, mockParseBrowserToken, mockParseTempToken)

      expect(pendingChallenges.size).toBe(0)
    })

    it("should auto-delete challenge after 5 minutes", () => {
      const mockReq = { headers: { cookie: "_wt_session=token123" } } as any
      const mockParseBrowserToken = () => "token123"
      const mockParseTempToken = () => null

      storeChallengeForSession(mockReq, "challenge", mockParseBrowserToken, mockParseTempToken)
      expect(pendingChallenges.has("token123")).toBe(true)

      // Advance time by 5 minutes
      vi.advanceTimersByTime(5 * 60 * 1000)

      expect(pendingChallenges.has("token123")).toBe(false)
    })
  })

  describe("getChallengeForSession", () => {
    it("should retrieve and delete challenge (single-use)", () => {
      const mockReq = { headers: { cookie: "_wt_session=token123" } } as any
      const mockParseBrowserToken = () => "token123"
      const mockParseTempToken = () => null

      storeChallengeForSession(mockReq, "my-challenge", mockParseBrowserToken, mockParseTempToken)

      const retrieved = getChallengeForSession(mockReq, mockParseBrowserToken, mockParseTempToken)
      expect(retrieved).toBe("my-challenge")

      // Challenge should be deleted after retrieval
      const secondRetrieval = getChallengeForSession(mockReq, mockParseBrowserToken, mockParseTempToken)
      expect(secondRetrieval).toBeNull()
    })

    it("should return null for expired challenge", () => {
      const mockReq = { headers: { cookie: "_wt_session=token123" } } as any
      const mockParseBrowserToken = () => "token123"
      const mockParseTempToken = () => null

      storeChallengeForSession(mockReq, "challenge", mockParseBrowserToken, mockParseTempToken)

      // Advance time past 5 minutes
      vi.advanceTimersByTime(5 * 60 * 1000 + 1000)

      const retrieved = getChallengeForSession(mockReq, mockParseBrowserToken, mockParseTempToken)
      expect(retrieved).toBeNull()
    })

    it("should return null when no session", () => {
      const mockReq = { headers: {} } as any
      const mockParseBrowserToken = () => null
      const mockParseTempToken = () => null

      const challenge = getChallengeForSession(mockReq, mockParseBrowserToken, mockParseTempToken)
      expect(challenge).toBeNull()
    })

    it("should return null for non-existent session token", () => {
      const mockReq = { headers: { cookie: "_wt_session=unknown-token" } } as any
      const mockParseBrowserToken = () => "unknown-token"
      const mockParseTempToken = () => null

      const challenge = getChallengeForSession(mockReq, mockParseBrowserToken, mockParseTempToken)
      expect(challenge).toBeNull()
    })

    it("should prefer browser session over temp session when retrieving", () => {
      const mockReq = { headers: { cookie: "_wt_session=browser123; _wt_temp=temp456" } } as any
      const mockParseBrowserToken = () => "browser123"
      const mockParseTempToken = () => "temp456"

      storeChallengeForSession(mockReq, "browser-challenge", mockParseBrowserToken, mockParseTempToken)

      const retrieved = getChallengeForSession(mockReq, mockParseBrowserToken, mockParseTempToken)
      expect(retrieved).toBe("browser-challenge")
    })

    it("should clean up expired challenge entry", () => {
      const mockReq = { headers: { cookie: "_wt_session=token123" } } as any
      const mockParseBrowserToken = () => "token123"
      const mockParseTempToken = () => null

      storeChallengeForSession(mockReq, "challenge", mockParseBrowserToken, mockParseTempToken)

      // Advance time past expiry
      vi.advanceTimersByTime(5 * 60 * 1000 + 1000)

      getChallengeForSession(mockReq, mockParseBrowserToken, mockParseTempToken)

      // Entry should be deleted from the map
      expect(pendingChallenges.has("token123")).toBe(false)
    })
  })
})
