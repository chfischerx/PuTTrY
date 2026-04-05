import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { homedir } from "node:os"
import logger from "./logger.js"

// Central mutable configuration object
export const config = {
  AUTH_DISABLED: false,
  SHOW_AUTH_DISABLED_WARNING: false,
  TOTP_ENABLED: false,
  SESSION_PASSWORD_TYPE: "xkcd" as "xkcd" | "random",
  SESSION_PASSWORD_LENGTH: 4,
  PASSKEY_RP_ORIGIN: "",
  PASSKEY_AS_2FA: true,
  RATE_LIMIT_GLOBAL_MAX: 500,
  RATE_LIMIT_SESSION_PASSWORD_MAX: 10,
  RATE_LIMIT_TOTP_MAX: 5,
  RATE_LIMIT_PASSKEY_CHALLENGE_MAX: 10,
  SCROLLBACK_LINES: 10000,
}

// Settings registry with metadata
const SETTINGS_REGISTRY = {
  // AUTH_DISABLED: CLI/file-only (CRIT-1 - cannot be changed via API)
  SHOW_AUTH_DISABLED_WARNING: { type: "boolean", live: true, requiresRestart: false },
  TOTP_ENABLED: { type: "boolean", live: true, requiresRestart: false, note: "Affects next login attempt" },
  SESSION_PASSWORD_TYPE: { type: "enum", values: ["xkcd", "random"], live: true, requiresRestart: false },
  SESSION_PASSWORD_LENGTH: { type: "number", live: true, requiresRestart: false, min: 1, max: 100 },
  PASSKEY_RP_ORIGIN: { type: "string", live: true, requiresRestart: false },
  PASSKEY_AS_2FA: { type: "boolean", live: true, requiresRestart: false },
  RATE_LIMIT_GLOBAL_MAX: { type: "number", live: false, requiresRestart: true, min: 10 },
  RATE_LIMIT_SESSION_PASSWORD_MAX: { type: "number", live: false, requiresRestart: true, min: 1 },
  RATE_LIMIT_TOTP_MAX: { type: "number", live: false, requiresRestart: true, min: 1 },
  RATE_LIMIT_PASSKEY_CHALLENGE_MAX: { type: "number", live: false, requiresRestart: true, min: 1 },
  SCROLLBACK_LINES: { type: "number", live: true, requiresRestart: false, note: "Affects new sessions", min: 100, max: 1000000 },
} as const

type ConfigKey = keyof typeof config

// Get public config (only keys in SETTINGS_REGISTRY)
// HIGH-1: Excludes sensitive operational keys like AUTH_DISABLED and rate limits
export function getPublicConfig(): Record<string, any> {
  const publicConfig: Record<string, any> = {}
  for (const key of Object.keys(SETTINGS_REGISTRY)) {
    publicConfig[key] = (config as Record<string, any>)[key]
  }
  return publicConfig
}

// Determine which .env file to use
export function getEnvFilePath(): string {
  const localPath = join(import.meta.dirname, "../../.env.local")
  if (existsSync(localPath)) {
    return localPath
  }
  return join(homedir(), ".puttry", ".env")
}

// Parse .env file
export function parseEnvFile(filePath: string): Record<string, string> {
  if (!existsSync(filePath)) {
    return {}
  }
  const content = readFileSync(filePath, "utf-8")
  const result: Record<string, string> = {}
  for (const line of content.split("\n")) {
    const trimmed = line.trim()
    if (trimmed && !trimmed.startsWith("#")) {
      const [key, ...valueParts] = trimmed.split("=")
      if (key) {
        result[key] = valueParts.join("=")
      }
    }
  }
  return result
}

// Write .env file
export function writeEnvFile(filePath: string, data: Record<string, string>): void {
  mkdirSync(dirname(filePath), { recursive: true })
  // CRIT-2: Sanitize values to prevent newline injection
  const lines = Object.entries(data)
    .map(([key, value]) => {
      // Remove newlines, carriage returns, and null bytes
      const sanitized = value.replace(/[\n\r\0]/g, "")
      return `${key}=${sanitized}`
    })
    .join("\n")
  writeFileSync(filePath, lines + "\n", "utf-8")
}

// Initialize config from process.env
export function initializeConfig(): void {
  // Parse from process.env
  config.AUTH_DISABLED = process.env.AUTH_DISABLED === "1" || process.env.AUTH_DISABLED === "true"
  config.SHOW_AUTH_DISABLED_WARNING = process.env.SHOW_AUTH_DISABLED_WARNING === "1" || process.env.SHOW_AUTH_DISABLED_WARNING === "true"
  config.TOTP_ENABLED = process.env.TOTP_ENABLED === "1" || process.env.TOTP_ENABLED === "true"
  config.SESSION_PASSWORD_TYPE = (process.env.SESSION_PASSWORD_TYPE ?? "xkcd") as "xkcd" | "random"
  config.SESSION_PASSWORD_LENGTH = Number(process.env.SESSION_PASSWORD_LENGTH ?? 4)
  config.PASSKEY_RP_ORIGIN = process.env.PASSKEY_RP_ORIGIN ?? ""
  config.PASSKEY_AS_2FA = process.env.PASSKEY_AS_2FA === "0" || process.env.PASSKEY_AS_2FA === "false" ? false : true
  config.RATE_LIMIT_GLOBAL_MAX = Number(process.env.RATE_LIMIT_GLOBAL_MAX ?? 500)
  config.RATE_LIMIT_SESSION_PASSWORD_MAX = Number(process.env.RATE_LIMIT_SESSION_PASSWORD_MAX ?? 10)
  config.RATE_LIMIT_TOTP_MAX = Number(process.env.RATE_LIMIT_TOTP_MAX ?? 5)
  config.RATE_LIMIT_PASSKEY_CHALLENGE_MAX = Number(process.env.RATE_LIMIT_PASSKEY_CHALLENGE_MAX ?? 10)
  config.SCROLLBACK_LINES = Number(process.env.SCROLLBACK_LINES ?? 10000)
}

// Update a setting
export function updateSetting(key: string, value: string): { success: boolean; requiresRestart?: boolean; note?: string; error?: string } {
  if (!(key in config)) {
    return { success: false, error: `Unknown setting: ${key}` }
  }

  const configKey = key as ConfigKey
  const metadata = (SETTINGS_REGISTRY as Record<string, any>)[configKey]

  if (!metadata) {
    return { success: false, error: `Setting not registered: ${key}` }
  }

  // Type conversion and validation
  let convertedValue: any = value
  if (metadata.type === "boolean") {
    convertedValue = value === "true" || value === "1" ? true : false
  } else if (metadata.type === "number") {
    convertedValue = Number(value)
    if (isNaN(convertedValue)) {
      return { success: false, error: `Invalid number for ${key}` }
    }
    // HIGH-2: Validate numeric bounds
    const meta = metadata as any
    if (meta.min !== undefined && convertedValue < meta.min) {
      return { success: false, error: `${key} must be >= ${meta.min}` }
    }
    if (meta.max !== undefined && convertedValue > meta.max) {
      return { success: false, error: `${key} must be <= ${meta.max}` }
    }
  } else if (metadata.type === "enum" && "values" in metadata) {
    const validValues = (metadata as any).values
    if (!validValues.includes(value)) {
      return { success: false, error: `Invalid value for ${key}. Must be one of: ${validValues.join(", ")}` }
    }
    convertedValue = value as "xkcd" | "random"
  }

  // Update config
  ;(config[configKey] as any) = convertedValue

  // Update process.env
  if (metadata.type === "boolean") {
    process.env[configKey] = convertedValue ? "1" : "0"
  } else {
    process.env[configKey] = String(convertedValue)
  }

  // Persist to .env file
  try {
    const envPath = getEnvFilePath()
    const envData = parseEnvFile(envPath)
    envData[configKey] = process.env[configKey]!
    writeEnvFile(envPath, envData)
    logger.info(`[settings] Updated ${configKey} = ${process.env[configKey]}`)
  } catch (err) {
    logger.error(`[settings] Failed to persist ${configKey}:`, err)
    return { success: false, error: `Failed to persist setting: ${err}` }
  }

  return {
    success: true,
    requiresRestart: false,
    note: (metadata as any).note,
  }
}
