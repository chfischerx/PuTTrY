import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"

// CRIT-6: Allowlist of environment keys that can be loaded from .env files
// Prevents arbitrary process.env injection attacks like NODE_OPTIONS, LD_PRELOAD, PATH
const ALLOWED_ENV_KEYS = new Set([
  // Settings that can be configured via .env
  "AUTH_DISABLED",
  "SHOW_AUTH_DISABLED_WARNING",
  "TOTP_ENABLED",
  "SESSION_PASSWORD_TYPE",
  "SESSION_PASSWORD_LENGTH",
  "PASSKEY_RP_ORIGIN",
  "PASSKEY_AS_2FA",
  "RATE_LIMIT_GLOBAL_MAX",
  "RATE_LIMIT_SESSION_PASSWORD_MAX",
  "RATE_LIMIT_TOTP_MAX",
  "RATE_LIMIT_PASSKEY_CHALLENGE_MAX",
  "SCROLLBACK_LINES",
  // Standard PuTTrY runtime configuration
  "PORT",
  "HOST",
  "NODE_ENV",
  "ALLOWED_HOSTS",
  "LOG_FILE",
  "VERBOSE", // L-2: Enable verbose logging
])

/**
 * Load .env files into process.env
 * Checks .env.local (development) first, then ~/.puttry/.env (production)
 * Does not override existing environment variables
 * CRIT-6: Only loads keys from the allowlist to prevent arbitrary env injection
 */
export function loadEnvFiles(logStartup = false): void {
  const envPaths = [
    join(import.meta.dirname, "../../.env.local"),
    join(homedir(), ".puttry", ".env"),
  ]

  if (logStartup) {
    console.log("[startup] Loading env files from:", envPaths)
  }

  for (const envPath of envPaths) {
    if (logStartup) {
      console.log(`[startup] Checking ${envPath}...`)
    }
    if (existsSync(envPath)) {
      if (logStartup) {
        console.log(`[startup] Found ${envPath}, loading...`)
      }
      try {
        const envContent = readFileSync(envPath, "utf-8")
        const lines = envContent.split("\n")
        for (const line of lines) {
          const trimmed = line.trim()
          if (trimmed && !trimmed.startsWith("#")) {
            const [key, ...valueParts] = trimmed.split("=")
            const value = valueParts.join("=")
            // CRIT-6: Only load keys in the allowlist
            if (key && ALLOWED_ENV_KEYS.has(key) && !process.env[key]) {
              if (logStartup) {
                console.log(`[startup] Set ${key}`)
              }
              process.env[key] = value
            } else if (key && process.env[key] && logStartup) {
              console.log(`[startup] Skipped ${key} (already set)`)
            } else if (key && !ALLOWED_ENV_KEYS.has(key) && logStartup) {
              console.log(`[startup] Skipped ${key} (not in allowlist)`)
            }
          }
        }
      } catch (err) {
        console.error(`Failed to load .env from ${envPath}`, err)
      }
    } else if (logStartup) {
      console.log(`[startup] Not found: ${envPath}`)
    }
  }
}
