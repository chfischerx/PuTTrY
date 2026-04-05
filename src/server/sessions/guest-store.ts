import type { Request } from "express"
import type { IncomingMessage } from "node:http"
import { randomBytes, randomUUID } from "node:crypto"
import { getCookieSecureFlag } from "./store.js"

export interface GuestLink {
  id: string // token (crypto.randomBytes(32).toString('hex'))
  name: string // display name
  createdAt: number
  usedAt?: number // set when redeemed; link is then invalid
}

export interface ActiveGuestSession {
  id: string // cookie token (randomUUID)
  linkId: string
  name: string // inherited from GuestLink
  expiresAt: number
  clientId?: string // current active browser clientId
}

export interface LockRequest {
  id: string
  sessionId: string
  guestName: string
  guestClientId: string
  timeoutHandle: NodeJS.Timeout
}

// In-memory stores (all lost on server restart)
export const guestLinks = new Map<string, GuestLink>()
export const activeGuestSessions = new Map<string, ActiveGuestSession>()
export const lockRequests = new Map<string, LockRequest>()

export function parseGuestSessionToken(
  req: Request | IncomingMessage
): string | null {
  const cookieHeader = req.headers.cookie
  if (!cookieHeader) return null
  const match = cookieHeader.match(/(?:^|;\s*)_wt_guest=([^;]+)/)
  return match ? match[1] : null
}

export function createGuestLink(name: string): GuestLink {
  const id = randomBytes(32).toString("hex")
  const link: GuestLink = {
    id,
    name,
    createdAt: Date.now(),
  }
  guestLinks.set(id, link)
  return link
}

export function redeemGuestLink(token: string): ActiveGuestSession | null {
  const link = guestLinks.get(token)
  if (!link || link.usedAt !== undefined) {
    return null
  }

  // Mark as used
  link.usedAt = Date.now()

  // Create active session
  const sessionId = randomUUID()
  const expiresAt = Date.now() + 4 * 60 * 60 * 1000 // 4 hour TTL
  const session: ActiveGuestSession = {
    id: sessionId,
    linkId: token,
    name: link.name,
    expiresAt,
  }
  activeGuestSessions.set(sessionId, session)

  // Auto-cleanup on expiry
  setTimeout(() => activeGuestSessions.delete(sessionId), 4 * 60 * 60 * 1000)

  return session
}

export function revokeGuestLink(linkId: string): void {
  guestLinks.delete(linkId)

  // Also revoke any active sessions from this link
  for (const [sessionId, session] of activeGuestSessions.entries()) {
    if (session.linkId === linkId) {
      activeGuestSessions.delete(sessionId)
    }
  }
}

export function createGuestCookie(token: string): string {
  return `_wt_guest=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=14400${getCookieSecureFlag()}`
}

export function clearGuestCookie(): string {
  return `_wt_guest=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${getCookieSecureFlag()}`
}

export function createLockRequest(
  sessionId: string,
  guestName: string,
  guestClientId: string,
  timeoutCallback: () => void
): LockRequest {
  const id = randomUUID()

  // 30 second timeout
  const timeoutHandle = setTimeout(() => {
    lockRequests.delete(id)
    timeoutCallback()
  }, 30 * 1000)

  const request: LockRequest = {
    id,
    sessionId,
    guestName,
    guestClientId,
    timeoutHandle,
  }

  lockRequests.set(id, request)
  return request
}

export function resolveLockRequest(
  requestId: string
): LockRequest | undefined {
  const request = lockRequests.get(requestId)
  if (request) {
    clearTimeout(request.timeoutHandle)
    lockRequests.delete(requestId)
  }
  return request
}

export function setGuestClientId(sessionId: string, clientId: string): void {
  const session = activeGuestSessions.get(sessionId)
  if (session) {
    session.clientId = clientId
  }
}
