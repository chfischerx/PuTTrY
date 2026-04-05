import rateLimit from "express-rate-limit"
import type { Request, Response } from "express"
import { config } from "./settings.js"
import { activeSessions, pendingTotpSessions, parseBrowserSessionToken, parseTempSessionToken } from "../sessions/store.js"

// CRIT-3: Helper to check if request is authenticated (validate token value)
function isAuthenticated(req: Request): boolean {
  // Check for valid browser session token
  const browserToken = parseBrowserSessionToken(req)
  if (browserToken && activeSessions.has(browserToken)) {
    return true
  }
  // Check for valid temp session token (TOTP setup)
  const tempToken = parseTempSessionToken(req)
  if (tempToken && pendingTotpSessions.has(tempToken)) {
    return true
  }
  return false
}

// Global DDoS protection (only for unauthenticated requests)
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: (_req: Request, _res: Response) => config.RATE_LIMIT_GLOBAL_MAX,
  message: { error: "Too many requests" },
  standardHeaders: false, // Disable `RateLimit-*` headers
  skip: (req: Request) => {
    // CRIT-3: Skip rate limiting only for authenticated requests (validate token value)
    return isAuthenticated(req)
  },
})

// Session password login rate limiting (brute-force protection)
export const sessionPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: (_req: Request, _res: Response) => config.RATE_LIMIT_SESSION_PASSWORD_MAX,
  message: { error: "Too many requests" },
  standardHeaders: false,
  handler: (req, res) => {
    console.log(`[rate-limit] Rate limit exceeded for ${req.ip}`)
    res.status(429).json({ error: "Too many requests" })
  },
})

// CRIT-4: 2FA/Passkey verification rate limiting (strict: 5 attempts per 10 min)
export const totpVerifyLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: (_req: Request, _res: Response) => config.RATE_LIMIT_TOTP_MAX,
  message: { error: "Too many verification attempts" },
  standardHeaders: false,
  handler: (req, res) => {
    console.log(`[rate-limit] TOTP verification rate limit exceeded for ${req.ip}`)
    res.status(429).json({ error: "Too many verification attempts" })
  },
})

// CRIT-5: Passkey standalone challenge creation rate limiting
export const passkeyChallengeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: (_req: Request, _res: Response) => config.RATE_LIMIT_PASSKEY_CHALLENGE_MAX,
  message: { error: "Too many challenge requests" },
  standardHeaders: false,
  handler: (req, res) => {
    console.log(`[rate-limit] Passkey challenge rate limit exceeded for ${req.ip}`)
    res.status(429).json({ error: "Too many challenge requests" })
  },
})

// Guest link redemption rate limiting
export const guestRedeemLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 attempts per 15 minutes
  message: { error: "Too many redemption attempts" },
  standardHeaders: false,
  handler: (req, res) => {
    console.log(`[rate-limit] Guest redeem rate limit exceeded for ${req.ip}`)
    res.status(429).json({ error: "Too many redemption attempts" })
  },
})

