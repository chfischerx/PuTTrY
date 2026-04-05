import { Router, type Request, type Response } from "express"
import { userInfo, hostname } from "node:os"
import type { RateLimitRequestHandler } from "express-rate-limit"
import {
  activeSessions, pendingTotpSessions, parseBrowserSessionToken, parseTempSessionToken,
  createBrowserSession, createTempSession, clearBrowserSessionCookie, clearTempSessionCookie,
  standaloneChallenges, pendingTotpSecrets,
} from "../sessions/store.js"
import { RP_NAME, getPasskeyOrigin, getPasskeyRpId, storeChallengeForSession, getChallengeForSession } from "./passkey-config.js"
import { createRequireAuth, createRequireAuthOrTempSession } from "./middleware.js"

/**
 * Create auth router with all /api/auth/* endpoints
 */
export async function createAuthRouter(
  config: any,
  logger: any,
  sessionPasswordLimiter: RateLimitRequestHandler,
  totpVerifyLimiter?: RateLimitRequestHandler,
  passkeyChallengeLimiter?: RateLimitRequestHandler,
) {
  const router = Router()

  // Import dependencies
  const { verifySessionPassword, rotateSessionPassword, get2FAState, save2FAState, clear2FAState, setSessionPassword } = await import("./state.js")
  const { verifyTotp, generateQRCode, generateTotpSecret } = await import("./totp-helper.js")
  const { getPasskeys, savePasskey, deletePasskey, getPasskeyById } = await import("./passkey-state.js")
  const { generateRegistrationOptions, verifyRegistrationResponse, generateAuthenticationOptions, verifyAuthenticationResponse } = await import("@simplewebauthn/server")

  const requireAuth = createRequireAuth(config)
  const requireAuthOrTempSession = createRequireAuthOrTempSession(config)

  // POST /api/auth/login
  router.post("/login", sessionPasswordLimiter, async (req: Request<unknown, unknown, { password: string }>, res: Response) => {
    if (config.AUTH_DISABLED) {
      const session = createBrowserSession()
      res.set("Set-Cookie", session.setCookieHeader)
      res.json({ authenticated: true, requiresTOTP: false })
      return
    }

    const { password } = req.body

    // Reject excessively long passwords to prevent DoS
    if (!password || password.length > 1024) {
      res.status(400).json({ error: "Invalid password" })
      return
    }

    if (!(await verifySessionPassword(password))) {
      res.status(401).json({ error: "Invalid password" })
      return
    }

    const totpState = get2FAState()
    const totpEnabled = config.TOTP_ENABLED
    const totpActive = totpEnabled && totpState?.verified === true
    const passkeysActive = config.PASSKEY_AS_2FA && getPasskeys().length > 0

    // TOTP needs setup
    if (totpEnabled && !totpActive && !passkeysActive) {
      const tempSession = createTempSession()
      logger.info(`[auth] Creating temp session for TOTP setup: ${tempSession.token.slice(0, 8)}...`)
      res.set("Set-Cookie", tempSession.setCookieHeader)
      res.json({ authenticated: false, requiresTOTP: true, totpMode: "setup" })
      return
    }

    // No 2FA at all
    if (!totpActive && !passkeysActive) {
      const session = createBrowserSession()
      res.set("Set-Cookie", session.setCookieHeader)
      res.json({ authenticated: true, requiresTOTP: false })
      return
    }

    const tempSession = createTempSession()
    logger.info(`[auth] Creating temp session for 2FA verification: ${tempSession.token.slice(0, 8)}...`)
    res.set("Set-Cookie", tempSession.setCookieHeader)

    // Both TOTP and passkey available - allow user to choose
    if (totpActive && passkeysActive) {
      res.json({ authenticated: false, requiresTOTP: true, totpMode: "verify", requiresPasskey: true, canChoose: true })
      return
    }

    // TOTP only
    if (totpActive) {
      res.json({ authenticated: false, requiresTOTP: true, totpMode: "verify" })
      return
    }

    // Passkey only
    res.json({ authenticated: false, requiresPasskey: true })
  })

  // HIGH-8: DELETE /api/auth - require authentication to prevent CSRF logout
  router.delete("/", requireAuth, (req: Request, res: Response) => {
    const browserToken = parseBrowserSessionToken(req)
    if (browserToken) {
      activeSessions.delete(browserToken)
    }
    const tempToken = parseTempSessionToken(req)
    if (tempToken) {
      pendingTotpSessions.delete(tempToken)
    }
    res.set("Set-Cookie", [clearBrowserSessionCookie(), clearTempSessionCookie()])
    res.json({ cleared: true })
  })

  // HIGH-3: GET /api/auth/2fa/qr - generate and store secret server-side, never send to client
  router.get("/2fa/qr", requireAuthOrTempSession, async (req: Request, res: Response) => {
    try {
      let secret = await generateTotpSecret()

      // HIGH-3: Store secret server-side, keyed by temp or browser session token
      const tempToken = parseTempSessionToken(req)
      const browserToken = parseBrowserSessionToken(req)
      const sessionToken = tempToken || browserToken

      if (sessionToken) {
        pendingTotpSecrets.set(sessionToken, { secret, expiresAt: Date.now() + 5 * 60 * 1000 })
        setTimeout(() => pendingTotpSecrets.delete(sessionToken), 5 * 60 * 1000)
      }

      const accountLabel = `${userInfo().username}@${hostname()}`
      // HIGH-3: Generate QR code but don't return the secret to client
      const { dataUrl } = await generateQRCode(secret, accountLabel, "PuTTrY")
      res.json({ dataUrl })
    } catch (err) {
      logger.error(`[auth] QR generation failed: ${err instanceof Error ? err.message : err}`)
      res.status(500).json({ error: "Failed to generate QR code" })
    }
  })

  // HIGH-3: POST /api/auth/2fa/setup - accept only verification code, not secret
  router.post("/2fa/setup", requireAuthOrTempSession, async (req: Request<unknown, unknown, { code: string }>, res: Response) => {
    const { code } = req.body
    const tempToken = parseTempSessionToken(req)
    const browserToken = parseBrowserSessionToken(req)
    const sessionToken = tempToken || browserToken

    if (!code) {
      res.status(400).json({ error: "Missing verification code" })
      return
    }

    // HIGH-3: Retrieve the stored secret from server-side storage (keyed by temp or browser session)
    const pendingSecret = sessionToken ? pendingTotpSecrets.get(sessionToken) : null
    if (!pendingSecret || pendingSecret.expiresAt < Date.now()) {
      res.status(400).json({ error: "No pending TOTP setup or expired" })
      return
    }

    // Verify the new code with the pending secret
    if (!(await verifyTotp(pendingSecret.secret, code))) {
      res.status(400).json({ error: "Invalid verification code" })
      return
    }

    // Save the new TOTP secret
    save2FAState({
      secret: pendingSecret.secret,
      verified: true,
      setupAt: new Date().toISOString(),
    })

    // Cleanup pending secret
    if (sessionToken) {
      pendingTotpSecrets.delete(sessionToken)
    }

    // If temp session, clean it up and create browser session
    if (tempToken) {
      pendingTotpSessions.delete(tempToken)
      const session = createBrowserSession()
      res.set("Set-Cookie", [session.setCookieHeader, clearTempSessionCookie()])
    }

    res.json({ success: true, authenticated: true })
  })

  // CRIT-4: POST /api/auth/2fa/verify - with rate limiting
  router.post("/2fa/verify", totpVerifyLimiter || ((_req: Request, _res: Response, next: () => void) => next()), async (req: Request<unknown, unknown, { code: string }>, res: Response) => {
    const tempToken = parseTempSessionToken(req)
    if (!tempToken || !pendingTotpSessions.has(tempToken)) {
      res.status(401).json({ error: "No pending authentication" })
      return
    }

    const { code } = req.body

    if (!code) {
      res.status(400).json({ error: "Missing code" })
      return
    }

    const totpState = get2FAState()
    if (!totpState || !totpState.verified || !totpState.secret) {
      res.status(500).json({ error: "2FA not properly configured" })
      return
    }

    try {
      const valid = await verifyTotp(totpState.secret, code)
      if (!valid) {
        res.status(401).json({ error: "Invalid verification code" })
        return
      }

      pendingTotpSessions.delete(tempToken)
      const session = createBrowserSession()
      res.set("Set-Cookie", [session.setCookieHeader, clearTempSessionCookie()])
      res.json({ authenticated: true })
    } catch (err) {
      logger.error(`[auth] TOTP verification error: ${err instanceof Error ? err.message : err}`)
      res.status(500).json({ error: "Verification failed" })
    }
  })

  // GET /api/auth/2fa/status - check if TOTP is registered
  router.get("/2fa/status", requireAuth, async (_req: Request, res: Response) => {
    const totpState = get2FAState()
    res.json({ registered: totpState !== null && totpState.verified === true })
  })

  // POST /api/auth/2fa/disable
  router.post("/2fa/disable", requireAuth, async (_req: Request, res: Response) => {
    clear2FAState()
    res.json({ success: true })
  })

  // GET /api/auth/passkey/register/options
  router.get("/passkey/register/options", requireAuth, async (req: Request, res: Response) => {
    try {
      const username = userInfo().username
      const options = await generateRegistrationOptions({
        rpName: RP_NAME,
        rpID: getPasskeyRpId(),
        userID: Buffer.from(username),
        userName: username,
        userDisplayName: `${username} (PuTTrY)`,
        attestationType: "direct",
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          residentKey: "preferred",
        },
      })
      storeChallengeForSession(req, options.challenge, parseBrowserSessionToken, parseTempSessionToken)
      res.json(options)
    } catch (err) {
      logger.error(`[auth] Passkey registration options failed: ${err instanceof Error ? err.message : err}`)
      res.status(500).json({ error: "Failed to generate registration options" })
    }
  })

  // POST /api/auth/passkey/register/verify
  router.post("/passkey/register/verify", requireAuth, async (req: Request<unknown, unknown, { response: any; name: string }>, res: Response) => {
    try {
      const { response: credentialResponse, name } = req.body
      if (!credentialResponse || !name) {
        res.status(400).json({ error: "Missing credential response or name" })
        return
      }

      const challenge = getChallengeForSession(req, parseBrowserSessionToken, parseTempSessionToken)
      if (!challenge) {
        res.status(400).json({ error: "No pending registration challenge" })
        return
      }

      const verification = await verifyRegistrationResponse({
        response: credentialResponse,
        expectedChallenge: challenge,
        expectedOrigin: getPasskeyOrigin(),
        expectedRPID: getPasskeyRpId(),
      })

      if (!verification.verified || !verification.registrationInfo) {
        res.status(400).json({ error: "Registration verification failed" })
        return
      }

      const { credential } = verification.registrationInfo
      savePasskey({
        id: credential.id,
        name,
        publicKey: Buffer.from(credential.publicKey).toString("base64"),
        counter: credential.counter,
        registeredAt: new Date().toISOString(),
        transports: credential.transports ?? [],
      })

      res.json({ verified: true })
    } catch (err) {
      logger.error(`[auth] Passkey verification failed: ${err instanceof Error ? err.message : err}`)
      res.status(500).json({ error: "Verification failed" })
    }
  })

  // POST /api/auth/passkey/auth/options
  router.post("/passkey/auth/options", requireAuthOrTempSession, async (req: Request, res: Response) => {
    try {
      const passkeys = getPasskeys()
      const options = await generateAuthenticationOptions({
        rpID: getPasskeyRpId(),
        allowCredentials: passkeys.map(pk => ({
          id: pk.id,
          transports: pk.transports as any,
        })),
      })
      storeChallengeForSession(req, options.challenge, parseBrowserSessionToken, parseTempSessionToken)
      res.json(options)
    } catch (err) {
      logger.error(`[auth] Passkey auth options failed: ${err instanceof Error ? err.message : err}`)
      res.status(500).json({ error: "Failed to generate auth options" })
    }
  })

  // CRIT-4: POST /api/auth/passkey/auth/verify - with rate limiting
  router.post("/passkey/auth/verify", totpVerifyLimiter || ((_req: Request, _res: Response, next: () => void) => next()), requireAuthOrTempSession, async (req: Request<unknown, unknown, { response: any }>, res: Response) => {
    try {
      const { response: assertionResponse } = req.body
      if (!assertionResponse) {
        res.status(400).json({ error: "Missing assertion response" })
        return
      }

      const challenge = getChallengeForSession(req, parseBrowserSessionToken, parseTempSessionToken)
      if (!challenge) {
        res.status(400).json({ error: "No pending auth challenge" })
        return
      }

      const credentialId = Buffer.from(assertionResponse.id, "base64url").toString("base64url")
      const passkey = getPasskeyById(credentialId)
      if (!passkey) {
        res.status(400).json({ error: "Passkey not found" })
        return
      }

      const verification = await verifyAuthenticationResponse({
        response: assertionResponse,
        expectedChallenge: challenge,
        expectedOrigin: getPasskeyOrigin(),
        expectedRPID: getPasskeyRpId(),
        credential: {
          id: passkey.id,
          publicKey: new Uint8Array(Buffer.from(passkey.publicKey, "base64")),
          counter: passkey.counter,
          transports: passkey.transports as any,
        },
      })

      if (!verification.verified) {
        res.status(400).json({ error: "Authentication verification failed" })
        return
      }

      // Update counter
      savePasskey({
        ...passkey,
        counter: verification.authenticationInfo.newCounter,
      })

      // Delete temp session and create full session
      const tempToken = parseTempSessionToken(req)
      if (tempToken) {
        pendingTotpSessions.delete(tempToken)
      }

      const session = createBrowserSession()
      res.set("Set-Cookie", [session.setCookieHeader, clearTempSessionCookie()])
      res.json({ authenticated: true })
    } catch (err) {
      logger.error(`[auth] Passkey verification failed: ${err instanceof Error ? err.message : err}`)
      res.status(500).json({ error: "Verification failed" })
    }
  })

  // GET /api/auth/passkeys
  router.get("/passkeys", requireAuth, (_req: Request, res: Response) => {
    const passkeys = getPasskeys()
    const result = passkeys.map(pk => ({
      id: pk.id,
      name: pk.name,
      counter: pk.counter,
      registeredAt: pk.registeredAt,
      transports: pk.transports,
    }))
    res.json(result)
  })

  // DELETE /api/auth/passkey/:id
  router.delete("/passkey/:id", requireAuth, (req: Request<{ id: string }>, res: Response) => {
    const { id } = req.params
    deletePasskey(id)
    res.json({ deleted: true })
  })

  // CRIT-5: POST /api/auth/passkey/standalone/options - with rate limiting to prevent unbounded challenge creation
  router.post("/passkey/standalone/options", passkeyChallengeLimiter || ((_req: Request, _res: Response, next: () => void) => next()), async (_req: Request, res: Response) => {
    if (config.PASSKEY_AS_2FA) {
      res.status(403).json({ error: "Standalone passkey login is disabled" })
      return
    }

    const passkeys = getPasskeys()
    if (passkeys.length === 0) {
      res.status(400).json({ error: "No passkeys registered" })
      return
    }

    try {
      const options = await generateAuthenticationOptions({
        rpID: getPasskeyRpId(),
        allowCredentials: passkeys.map(pk => ({
          id: pk.id,
          transports: pk.transports as any,
        })),
      })

      const { randomUUID } = await import("node:crypto")
      const nonce = randomUUID()
      standaloneChallenges.set(nonce, { challenge: options.challenge, expiresAt: Date.now() + 5 * 60 * 1000 })
      setTimeout(() => standaloneChallenges.delete(nonce), 5 * 60 * 1000)

      res.json({ ...options, nonce })
    } catch (err) {
      logger.error(`[auth] Standalone passkey options failed: ${err instanceof Error ? err.message : err}`)
      res.status(500).json({ error: "Failed to generate authentication options" })
    }
  })

  // CRIT-4: POST /api/auth/passkey/standalone/verify - with rate limiting
  router.post("/passkey/standalone/verify", totpVerifyLimiter || ((_req: Request, _res: Response, next: () => void) => next()), async (req: Request<unknown, unknown, { response: any; nonce: string }>, res: Response) => {
    if (config.PASSKEY_AS_2FA) {
      res.status(403).json({ error: "Standalone passkey login is disabled" })
      return
    }

    try {
      const { response: assertionResponse, nonce } = req.body
      if (!assertionResponse || !nonce) {
        res.status(400).json({ error: "Missing assertion response or nonce" })
        return
      }

      const challengeEntry = standaloneChallenges.get(nonce)
      if (!challengeEntry) {
        res.status(400).json({ error: "Invalid or expired nonce" })
        return
      }
      standaloneChallenges.delete(nonce)

      const credentialId = Buffer.from(assertionResponse.id, "base64url").toString("base64url")
      const passkey = getPasskeyById(credentialId)
      if (!passkey) {
        res.status(400).json({ error: "Passkey not found" })
        return
      }

      const verification = await verifyAuthenticationResponse({
        response: assertionResponse,
        expectedChallenge: challengeEntry.challenge,
        expectedOrigin: getPasskeyOrigin(),
        expectedRPID: getPasskeyRpId(),
        credential: {
          id: passkey.id,
          publicKey: new Uint8Array(Buffer.from(passkey.publicKey, "base64")),
          counter: passkey.counter,
          transports: passkey.transports as any,
        },
      })

      if (!verification.verified) {
        res.status(400).json({ error: "Authentication verification failed" })
        return
      }

      // Update counter
      savePasskey({
        ...passkey,
        counter: verification.authenticationInfo.newCounter,
      })

      // Create full session
      const session = createBrowserSession()
      res.set("Set-Cookie", session.setCookieHeader)
      res.json({ authenticated: true })
    } catch (err) {
      logger.error(`[auth] Standalone passkey verification failed: ${err instanceof Error ? err.message : err}`)
      res.status(500).json({ error: "Verification failed" })
    }
  })

  // POST /api/auth/session-password/rotate
  router.post("/session-password/rotate", requireAuth, async (_req: Request, res: Response) => {
    const newPassword = await rotateSessionPassword()
    logger.info(`[auth] Session password rotated`)
    res.json({ password: newPassword })
  })

  // POST /api/auth/session-password/set
  router.post("/session-password/set", requireAuth, async (req: Request<unknown, unknown, { password: string }>, res: Response) => {
    const { password } = req.body
    if (!password || typeof password !== "string" || password.length === 0 || password.length > 1024) {
      res.status(400).json({ error: "Password is required and must be under 1024 characters" })
      return
    }
    try {
      await setSessionPassword(password)
      logger.info(`[auth] Session password set manually`)
      res.json({ success: true })
    } catch (err) {
      logger.error(`[auth] Failed to set password: ${err instanceof Error ? err.message : err}`)
      res.status(500).json({ error: "Failed to set password" })
    }
  })

  return router
}
