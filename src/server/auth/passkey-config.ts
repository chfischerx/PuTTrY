import type { Request } from "express"
import type { IncomingMessage } from "node:http"
import { pendingChallenges } from "../session-store.js"

export const RP_NAME = "PuTTrY"

/**
 * Get passkey RP origin from environment or construct from request
 */
export function getPasskeyOrigin(): string {
  const PORT = Number(process.env.PORT ?? 5174)
  return process.env.PASSKEY_RP_ORIGIN ?? `http://localhost:${PORT}`
}

/**
 * Extract RP ID (domain) from origin
 */
export function getPasskeyRpId(): string {
  try {
    return new URL(getPasskeyOrigin()).hostname
  } catch {
    return "localhost"
  }
}

/**
 * Store a WebAuthn challenge for later verification
 * Associates challenge with the request's session token
 */
export function storeChallengeForSession(
  req: Request | IncomingMessage,
  challenge: string,
  parseBrowserSessionToken: (req: Request | IncomingMessage) => string | null,
  parseTempSessionToken: (req: Request | IncomingMessage) => string | null,
): void {
  const token = parseBrowserSessionToken(req) ?? parseTempSessionToken(req)
  if (!token) return
  pendingChallenges.set(token, { challenge, expiresAt: Date.now() + 5 * 60 * 1000 })
  setTimeout(() => pendingChallenges.delete(token), 5 * 60 * 1000)
}

/**
 * Retrieve and consume a stored challenge for verification
 * Single-use: challenge is deleted after retrieval
 */
export function getChallengeForSession(
  req: Request | IncomingMessage,
  parseBrowserSessionToken: (req: Request | IncomingMessage) => string | null,
  parseTempSessionToken: (req: Request | IncomingMessage) => string | null,
): string | null {
  const token = parseBrowserSessionToken(req) ?? parseTempSessionToken(req)
  if (!token) return null
  const entry = pendingChallenges.get(token)
  if (!entry || entry.expiresAt < Date.now()) {
    pendingChallenges.delete(token)
    return null
  }
  pendingChallenges.delete(token) // single-use
  return entry.challenge
}
