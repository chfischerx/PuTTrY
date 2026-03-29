import { loadEnvFiles } from "./env-loader.js"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"

/**
 * Interactive configuration wizard for PuTTrY settings
 */
export async function runConfigureWizard(): Promise<void> {
  loadEnvFiles()
  const { getEnvFilePath, parseEnvFile, writeEnvFile } = await import("./settings-api.js")
  const readline = await import("node:readline")

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const ask = (question: string): Promise<string> => new Promise(resolve => rl.question(question, resolve))

  const envPath = getEnvFilePath()
  const current = parseEnvFile(envPath)

  const changes: Record<string, string> = {}

  // Helper to display current value
  function currentDisplay(key: string, defaultVal: string): string {
    return current[key] !== undefined ? `${current[key]}` : `${defaultVal} (default)`
  }

  // Helper to get user input and normalize
  async function promptSetting(
    key: string,
    description: string,
    defaultVal: string,
    type: "string" | "boolean" | "number" | "enum",
    enumValues?: string[],
  ): Promise<void> {
    const display = currentDisplay(key, defaultVal)
    console.log(`\n${key}`)
    console.log(`  ${description}`)
    console.log(`  Current value: ${display}`)

    let input = await ask("> ")

    // Skip if empty (user pressed Enter)
    if (input.trim() === "") {
      return
    }

    let normalized = input.trim()

    // Normalize boolean input
    if (type === "boolean") {
      const lower = normalized.toLowerCase()
      if (["true", "yes", "y", "1"].includes(lower)) {
        normalized = "true"
      } else if (["false", "no", "n", "0"].includes(lower)) {
        normalized = "false"
      } else {
        console.log(`  Invalid boolean value. Use true/false, yes/no, y/n, or 1/0.`)
        return
      }
    }

    // Validate enum
    if (type === "enum" && enumValues && !enumValues.includes(normalized)) {
      console.log(`  Invalid value. Must be one of: ${enumValues.join(", ")}`)
      return
    }

    // Validate number
    if (type === "number" && isNaN(Number(normalized))) {
      console.log(`  Invalid number.`)
      return
    }

    // Only add to changes if different from current
    if (current[key] !== normalized) {
      changes[key] = normalized
    }
  }

  console.log("\nWelcome to PuTTrY configuration. Press Enter to keep the current value.\n")

  // Network section
  console.log("─── Network ───────────────────────────────────────\n")
  await promptSetting("PORT", "HTTP port the server listens on", "5174", "number")
  await promptSetting("HOST", "Network interface to bind to (0.0.0.0 = all interfaces, 127.0.0.1 = localhost only)", "0.0.0.0", "string")

  // Use HOST value as default for ALLOWED_HOSTS if not already set
  const hostValue = changes["HOST"] !== undefined ? changes["HOST"] : (current["HOST"] || "0.0.0.0")
  const allowedHostsDefault = hostValue === "0.0.0.0" ? "" : hostValue

  await promptSetting(
    "ALLOWED_HOSTS",
    "Comma-separated list of allowed hostnames for Host header validation. Prevents DNS rebinding attacks. (localhost, 127.0.0.1, ::1 are always allowed)",
    allowedHostsDefault,
    "string",
  )

  // Authentication section
  console.log("\n─── Authentication ────────────────────────────────\n")
  await promptSetting(
    "AUTH_DISABLED",
    "Disable password authentication. Anyone with the URL can access the terminal. Not recommended for remote access. (true/false)",
    "false",
    "boolean",
  )

  const authDisabled = changes["AUTH_DISABLED"] === "true" || (changes["AUTH_DISABLED"] === undefined && (current["AUTH_DISABLED"] === "true" || current["AUTH_DISABLED"] === "1"))

  await promptSetting(
    "SESSION_PASSWORD_TYPE",
    "Password style: 'xkcd' = memorable word phrase (e.g. \"correct horse battery staple\"), 'random' = hex string",
    "xkcd",
    "enum",
    ["xkcd", "random"],
  )
  await promptSetting("SESSION_PASSWORD_LENGTH", "Number of words (xkcd) or characters (random) in the session password", "4", "number")
  await promptSetting(
    "PASSKEY_RP_ORIGIN",
    "WebAuthn passkey origin, e.g. https://example.com — required for passkey login from a custom domain",
    "",
    "string",
  )

  // Rate limiting section (skip if auth disabled)
  if (!authDisabled) {
    console.log("\n─── Rate Limiting ────────────────────────────────\n")
    await promptSetting("RATE_LIMIT_GLOBAL_MAX", "Max HTTP requests per 15 minutes per IP", "500", "number")
    await promptSetting("RATE_LIMIT_SESSION_PASSWORD_MAX", "Max login attempts per hour per IP", "10", "number")
    await promptSetting("RATE_LIMIT_TOTP_MAX", "Max 2FA/passkey verification attempts per 10 minutes per IP", "5", "number")
    await promptSetting("RATE_LIMIT_PASSKEY_CHALLENGE_MAX", "Max passkey challenge creation requests per 15 minutes per IP", "10", "number")
  }

  // Terminal section
  console.log("\n─── Terminal ──────────────────────────────────────\n")
  await promptSetting("SCROLLBACK_LINES", "Terminal scrollback buffer — lines kept in memory per session", "10000", "number")

  // Logging section
  console.log("\n─── Logging ───────────────────────────────────────\n")
  await promptSetting(
    "LOG_FILE",
    "Path to write server logs to a file. Leave empty to disable file logging, or use default (e.g., ~/.puttry/server.log)",
    "~/.puttry/server.log",
    "string",
  )

  // Check if we need to generate a password (before handling changes)
  const passwordFilePath = join(homedir(), ".puttry", "session-password.txt")
  const passwordFileExists = existsSync(passwordFilePath)
  const authDisabledInConfig = changes["AUTH_DISABLED"] === "true" || (changes["AUTH_DISABLED"] === undefined && (current["AUTH_DISABLED"] === "true" || current["AUTH_DISABLED"] === "1"))
  const shouldGeneratePassword = !authDisabledInConfig && !passwordFileExists

  // Check if any changes to config
  if (Object.keys(changes).length === 0) {
    rl.close()
    if (shouldGeneratePassword) {
      // Skip the "no changes" message and go straight to password generation
      console.log("")
    } else {
      console.log("\nNo changes made. Configuration unchanged.")
      return
    }
  } else {
    // Show summary
    console.log("\n─── Summary ────────────────────────────────────────\n")
    console.log("Changes to apply:")
    for (const [k, v] of Object.entries(changes)) {
      console.log(`  ${k}=${v}`)
    }

    const confirm = await ask("\nApply changes? (y/N): ")
    rl.close()

    if (confirm.trim().toLowerCase() !== "y") {
      console.log("Cancelled.")
      return
    }

    // Merge and write
    const merged = { ...current, ...changes }
    writeEnvFile(envPath, merged)
    console.log("\n✓ Configuration saved.")
  }

  // Generate password if needed (whether or not there were config changes)
  if (shouldGeneratePassword) {
    console.log("─── Generating Session Password ───────────────────\n")
    try {
      const { initializeConfig } = await import("./settings-api.js")
      const { initAuthState, rotateSessionPassword } = await import("./auth-state.js")

      initializeConfig()
      await initAuthState()
      const newPassword = await rotateSessionPassword()

      console.log("✓ New session password generated!")
      console.log("")
      console.log("─── Session Password ───")
      console.log(newPassword)
      console.log("")
      console.log("⚠️  IMPORTANT: Remember this password. It will be shown only once.")
      console.log("   You can generate a new password later with: puttry password rotate")
      console.log("")
    } catch (err) {
      console.error(`\nWarning: Failed to generate password: ${err instanceof Error ? err.message : err}`)
    }
  }

  // Exit explicitly to close file watchers opened by initAuthState
  process.exit(0)
}
