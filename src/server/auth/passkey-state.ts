import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"
import logger from "../lib/logger.js"

export interface StoredPasskey {
  id: string                        // base64url credential ID
  name: string                      // friendly name, e.g. "iPhone Touch ID"
  publicKey: string                 // Buffer.from(Uint8Array).toString('base64')
  counter: number
  registeredAt: string              // ISO timestamp
  transports: string[]
}

const STATE_DIR = join(homedir(), ".puttry")
const PASSKEYS_PATH = join(STATE_DIR, "passkeys.json")

function validatePasskeySchema(obj: any): boolean {
  // HIGH-5: Validate that obj has exactly the expected fields with correct types
  if (!obj || typeof obj !== 'object') return false
  if (typeof obj.id !== 'string') return false
  if (typeof obj.name !== 'string') return false
  if (typeof obj.publicKey !== 'string') return false
  if (typeof obj.counter !== 'number') return false
  if (typeof obj.registeredAt !== 'string') return false
  if (!Array.isArray(obj.transports) || !obj.transports.every((t: any) => typeof t === 'string')) return false
  // Ensure no unexpected fields
  const keys = Object.keys(obj)
  const allowedKeys = new Set(['id', 'name', 'publicKey', 'counter', 'registeredAt', 'transports'])
  return keys.every(k => allowedKeys.has(k)) && keys.length === allowedKeys.size
}

function loadPasskeys(): StoredPasskey[] {
  if (existsSync(PASSKEYS_PATH)) {
    try {
      const data = readFileSync(PASSKEYS_PATH, "utf-8")
      const parsed = JSON.parse(data)
      // HIGH-5: Validate schema - must be an array of passkeys with correct schema
      if (!Array.isArray(parsed)) {
        logger.error(`[passkey-state] Invalid passkeys schema: not an array`)
        return []
      }
      const passkeys = parsed.filter((pk: any) => {
        if (!validatePasskeySchema(pk)) {
          logger.warn(`[passkey-state] Skipping invalid passkey entry`)
          return false
        }
        return true
      }) as StoredPasskey[]
      logger.info(`[passkey-state] Loaded ${passkeys.length} passkeys from disk`)
      return passkeys
    } catch (err) {
      logger.error(`[passkey-state] Failed to load passkeys: ${err instanceof Error ? err.message : err}`)
      return []
    }
  }
  return []
}

function savePasskeys(passkeys: StoredPasskey[]): void {
  try {
    mkdirSync(STATE_DIR, { recursive: true })
    writeFileSync(PASSKEYS_PATH, JSON.stringify(passkeys, null, 2), { mode: 0o600 })
    logger.info(`[passkey-state] Saved ${passkeys.length} passkeys to disk`)
  } catch (err) {
    logger.error(`[passkey-state] Failed to save passkeys: ${err instanceof Error ? err.message : err}`)
  }
}

export function getPasskeys(): StoredPasskey[] {
  return loadPasskeys()
}

export function savePasskey(cred: StoredPasskey): void {
  const passkeys = loadPasskeys()
  const existingIndex = passkeys.findIndex(p => p.id === cred.id)
  if (existingIndex >= 0) {
    passkeys[existingIndex] = cred
  } else {
    passkeys.push(cred)
  }
  savePasskeys(passkeys)
}

export function deletePasskey(id: string): void {
  const passkeys = loadPasskeys()
  const filtered = passkeys.filter(p => p.id !== id)
  savePasskeys(filtered)
  logger.info(`[passkey-state] Deleted passkey ${id.slice(0, 8)}...`)
}

export function getPasskeyById(id: string): StoredPasskey | null {
  const passkeys = loadPasskeys()
  return passkeys.find(p => p.id === id) ?? null
}

export function clearPasskeys(): void {
  try {
    if (existsSync(PASSKEYS_PATH)) {
      unlinkSync(PASSKEYS_PATH)
    }
    logger.info(`[passkey-state] All passkeys cleared`)
  } catch (err) {
    logger.error(`[passkey-state] Failed to clear passkeys: ${err instanceof Error ? err.message : err}`)
  }
}
