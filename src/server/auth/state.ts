import { readFileSync, writeFileSync, mkdirSync, existsSync, watchFile, unlinkSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"
import { EventEmitter } from "node:events"
import { generateXkcdPassword, generateRandomPassword } from "../../shared/utils/password-gen.js"
import { hashPassword, verifyPassword } from "./password-hash.js"
import logger from "../lib/logger.js"

export interface TotpState {
  secret: string
  verified: boolean
  setupAt: string
}

const STATE_DIR = join(homedir(), ".puttry")
const SESSION_PASSWORD_PATH = join(STATE_DIR, "session-password.txt")
const TOTP_STATE_PATH = join(STATE_DIR, "2fa-state.json")

class AuthState extends EventEmitter {
  private storedPassword: string | null = null
  private totpState: TotpState | null = null

  async init(): Promise<void> {
    mkdirSync(STATE_DIR, { recursive: true })
    await this.loadSessionPassword()
    this.loadTotpState()
    this.watchFiles()
  }

  private async loadSessionPassword(): Promise<void> {
    if (existsSync(SESSION_PASSWORD_PATH)) {
      try {
        this.storedPassword = readFileSync(SESSION_PASSWORD_PATH, "utf-8").trim()
      } catch (err) {
        logger.error(`[auth-state] Failed to load session password: ${err instanceof Error ? err.message : err}`)
        await this.generateNewSessionPassword()
      }
    } else {
      await this.generateNewSessionPassword()
    }
  }

  private async generateNewSessionPassword(): Promise<string> {
    const type = (process.env.SESSION_PASSWORD_TYPE || "xkcd").toLowerCase()
    const length = parseInt(process.env.SESSION_PASSWORD_LENGTH || "4", 10)

    let plaintext: string
    if (type === "random") {
      plaintext = generateRandomPassword(length)
    } else {
      plaintext = generateXkcdPassword(length)
    }

    this.storedPassword = await hashPassword(plaintext)
    await this.persistStoredPassword()
    logger.info(`[auth-state] Generated new session password`)
    return plaintext
  }

  private async persistStoredPassword(): Promise<void> {
    if (!this.storedPassword) return
    try {
      writeFileSync(SESSION_PASSWORD_PATH, this.storedPassword, { mode: 0o600 })
    } catch (err) {
      logger.error(`[auth-state] Failed to save session password: ${err instanceof Error ? err.message : err}`)
    }
  }

  private loadTotpState(): void {
    if (existsSync(TOTP_STATE_PATH)) {
      try {
        const data = readFileSync(TOTP_STATE_PATH, "utf-8")
        const parsed = JSON.parse(data)
        // HIGH-5: Validate parsed object has expected schema
        if (this.validateTotpStateSchema(parsed)) {
          this.totpState = parsed as TotpState
          logger.info(`[auth-state] TOTP state loaded from ${TOTP_STATE_PATH}: verified=${this.totpState?.verified}`)
        } else {
          logger.error(`[auth-state] Invalid TOTP state schema`)
          this.totpState = null
        }
      } catch (err) {
        logger.error(`[auth-state] Failed to load TOTP state from ${TOTP_STATE_PATH}: ${err instanceof Error ? err.message : err}`)
        this.totpState = null
      }
    } else {
      this.totpState = null
    }
  }

  private validateTotpStateSchema(obj: any): boolean {
    // HIGH-5: Validate that obj has exactly the expected fields with correct types
    if (!obj || typeof obj !== 'object') return false
    if (typeof obj.secret !== 'string') return false
    if (typeof obj.verified !== 'boolean') return false
    if (typeof obj.setupAt !== 'string') return false
    // Ensure no unexpected fields
    const keys = Object.keys(obj)
    const allowedKeys = new Set(['secret', 'verified', 'setupAt'])
    return keys.every(k => allowedKeys.has(k)) && keys.length === allowedKeys.size
  }

  private watchFiles(): void {
    // Watch session password file for external changes
    watchFile(SESSION_PASSWORD_PATH, async () => {
      const oldPassword = this.storedPassword
      await this.loadSessionPassword()
      if (oldPassword !== this.storedPassword) {
        logger.info(`[auth-state] Session password changed externally`)
        this.emit("passwordRotated")
      }
    })

    // Watch TOTP state file for external changes
    watchFile(TOTP_STATE_PATH, () => {
      const oldState = this.totpState
      this.loadTotpState()
      if (JSON.stringify(oldState) !== JSON.stringify(this.totpState)) {
        logger.info(`[auth-state] TOTP state changed externally`)
        this.emit("2faChanged")
      }
    })
  }

  async verifySessionPassword(candidate: string): Promise<boolean> {
    if (!this.storedPassword) {
      return false
    }
    return verifyPassword(candidate, this.storedPassword)
  }

  async rotateSessionPassword(): Promise<string> {
    const plaintext = await this.generateNewSessionPassword()
    this.emit("passwordRotated")
    return plaintext
  }

  async setSessionPassword(plaintext: string): Promise<void> {
    this.storedPassword = await hashPassword(plaintext)
    await this.persistStoredPassword()
    this.emit("passwordRotated")
    logger.info(`[auth-state] Session password set manually`)
  }

  get2FAState(): TotpState | null {
    // Always reload from disk to handle external changes and server restarts
    this.loadTotpState()
    logger.info(`[auth-state] get2FAState() returning: ${this.totpState ? `verified=${this.totpState.verified}` : 'null'}`)
    return this.totpState
  }

  save2FAState(state: TotpState): void {
    this.totpState = state
    try {
      mkdirSync(STATE_DIR, { recursive: true })
      writeFileSync(TOTP_STATE_PATH, JSON.stringify(state, null, 2), { mode: 0o600 })
      this.emit("2faChanged")
      logger.info(`[auth-state] TOTP state saved`)
    } catch (err) {
      logger.error(`[auth-state] Failed to save TOTP state: ${err instanceof Error ? err.message : err}`)
    }
  }

  clear2FAState(): void {
    this.totpState = null
    try {
      if (existsSync(TOTP_STATE_PATH)) {
        unlinkSync(TOTP_STATE_PATH)
      }
      this.emit("2faChanged")
      logger.info(`[auth-state] TOTP state cleared`)
    } catch (err) {
      logger.error(`[auth-state] Failed to clear TOTP state: ${err instanceof Error ? err.message : err}`)
    }
  }

  cleanup(): void {
    this.removeAllListeners()
  }
}

const authState = new AuthState()

export async function initAuthState(): Promise<void> {
  await authState.init()
}

export async function verifySessionPassword(candidate: string): Promise<boolean> {
  return authState.verifySessionPassword(candidate)
}

export async function rotateSessionPassword(): Promise<string> {
  return authState.rotateSessionPassword()
}

export async function setSessionPassword(plaintext: string): Promise<void> {
  return authState.setSessionPassword(plaintext)
}

export function get2FAState(): TotpState | null {
  return authState.get2FAState()
}

export function save2FAState(state: TotpState): void {
  authState.save2FAState(state)
}

export function clear2FAState(): void {
  authState.clear2FAState()
}
