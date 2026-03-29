import { verifySync, generateSecret, generateURI } from "otplib"
import QRCode from "qrcode"

export interface QRCodeData {
  dataUrl: string
  manualEntryKey: string
}

// TOTP replay prevention: track the last used code and timestamp per secret
const lastUsedCodes = new Map<string, { code: string; timestamp: number }>()

export async function generateTotpSecret(): Promise<string> {
  return generateSecret()
}

export async function generateQRCode(secret: string, email: string, appName = "PuTTrY"): Promise<QRCodeData> {
  const keyUri = generateURI({
    secret,
    label: email,
    issuer: appName,
  })
  const dataUrl = await QRCode.toDataURL(keyUri)
  return {
    dataUrl,
    manualEntryKey: secret,
  }
}

export async function verifyTotp(secret: string, token: string): Promise<boolean> {
  try {
    // First validate the code format
    if (!/^\d{6}$/.test(token)) {
      return false
    }

    const result = verifySync({ token, secret })
    if (!result?.valid) {
      return false
    }

    // Check for replay attack: reject if the same code was used within the same 30-second time window
    const lastUsed = lastUsedCodes.get(secret)
    const now = Date.now()
    const timeWindowSeconds = 30

    if (lastUsed && lastUsed.code === token && (now - lastUsed.timestamp) < timeWindowSeconds * 1000) {
      return false // Replay detected
    }

    // Record this code as used
    lastUsedCodes.set(secret, { code: token, timestamp: now })

    // Clean up old entries (older than 2 minutes)
    if (lastUsedCodes.size > 100) {
      for (const [key, entry] of lastUsedCodes.entries()) {
        if (now - entry.timestamp > 2 * 60 * 1000) {
          lastUsedCodes.delete(key)
        }
      }
    }

    return true
  } catch {
    return false
  }
}
