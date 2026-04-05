import type { Request } from "express"
import type { IncomingMessage } from "node:http"
import { randomUUID } from "node:crypto"

// Session state
export const activeSessions = new Map<string, { expiresAt: number }>()
export const pendingTotpSessions = new Map<string, { createdAt: number; expiresAt: number }>()
export const pendingChallenges = new Map<string, { challenge: string; expiresAt: number }>()
export const standaloneChallenges = new Map<string, { challenge: string; expiresAt: number }>()
// HIGH-3: Temporary storage for pending TOTP secrets (never sent to client)
export const pendingTotpSecrets = new Map<string, { secret: string; expiresAt: number }>()

/**
 * Parse browser session token from request cookies
 */
export function parseBrowserSessionToken(req: Request | IncomingMessage): string | null {
  const cookieHeader = req.headers.cookie
  if (!cookieHeader) return null
  const match = cookieHeader.match(/(?:^|;\s*)_wt_session=([^;]+)/)
  return match ? match[1] : null
}

/**
 * Parse temporary session token (TOTP setup) from request cookies
 */
export function parseTempSessionToken(req: Request | IncomingMessage): string | null {
  const cookieHeader = req.headers.cookie
  if (!cookieHeader) return null
  const match = cookieHeader.match(/(?:^|;\s*)_wt_temp=([^;]+)/)
  return match ? match[1] : null
}

/**
 * Get Secure cookie flag for production (HTTPS) environments
 */
export function getCookieSecureFlag(): string {
  // Add Secure flag for production (HTTPS) or when explicitly set
  const isProduction = process.env.NODE_ENV === "production"
  const isHttps = process.env.PASSKEY_RP_ORIGIN?.startsWith("https://") ?? false
  return (isProduction || isHttps) ? "; Secure" : ""
}

/**
 * Create a new browser session (long-lived auth token)
 */
export function createBrowserSession(): { token: string; setCookieHeader: string } {
  const token = randomUUID()
  const expiresAt = Date.now() + 24 * 60 * 60 * 1000 // 24 hour TTL
  activeSessions.set(token, { expiresAt })
  // Cleanup after TTL expires
  setTimeout(() => activeSessions.delete(token), 24 * 60 * 60 * 1000)
  return {
    token,
    setCookieHeader: `_wt_session=${token}; HttpOnly; SameSite=Strict; Path=/${getCookieSecureFlag()}`,
  }
}

/**
 * Create a temporary session (TOTP setup in progress)
 */
export function createTempSession(): { token: string; setCookieHeader: string } {
  const token = randomUUID()
  pendingTotpSessions.set(token, { createdAt: Date.now(), expiresAt: Date.now() + 5 * 60 * 1000 })
  // 5 minute TTL
  setTimeout(() => pendingTotpSessions.delete(token), 5 * 60 * 1000)
  return {
    token,
    setCookieHeader: `_wt_temp=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=300${getCookieSecureFlag()}`,
  }
}

/**
 * Get Set-Cookie header to clear browser session
 */
export function clearBrowserSessionCookie(): string {
  return `_wt_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${getCookieSecureFlag()}`
}

/**
 * Get Set-Cookie header to clear temporary session
 */
export function clearTempSessionCookie(): string {
  return `_wt_temp=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${getCookieSecureFlag()}`
}
