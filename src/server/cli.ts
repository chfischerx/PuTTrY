#!/usr/bin/env node

import { spawn } from "node:child_process"
import { existsSync, readFileSync, unlinkSync, openSync, closeSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"
import { setTimeout as setTimeoutPromise } from "node:timers/promises"
import { loadEnvFiles } from "./lib/env.js"
import { runConfigureWizard } from "./cli-configure.js"

const PID_DIR = join(homedir(), ".puttry")
const PID_PATH = join(PID_DIR, "server.pid")

function printHelp(): void {
  console.log(`
Usage: puttry <command>

Commands:
  start               Start the server in the background
  stop                Stop the running server
  restart             Restart the server
  status              Show server status

  password rotate     Rotate to a new session password
  password set PWD    Set a custom session password

  totp enable         Enable TOTP (2FA) requirement
  totp disable        Disable TOTP (2FA) requirement
  totp reset          Clear TOTP configuration and secret
  passkey list        List registered passkeys
  passkey reset       Clear all registered passkeys

  configure           Interactive configuration wizard
  config list         List all configuration values
  config set KEY VAL  Update a configuration value

  help                Show this help message
`)
}

async function startServer(): Promise<void> {
  const serverPath = join(import.meta.dirname, "server.js")

  if (!existsSync(serverPath)) {
    console.error(`Error: Server not found at ${serverPath}`)
    console.error("Run 'npm run build:server' to compile the server.")
    process.exit(1)
  }

  // Check if already running
  if (existsSync(PID_PATH)) {
    const pidContent = readFileSync(PID_PATH, "utf-8").trim()
    const pid = parseInt(pidContent)
    try {
      process.kill(pid, 0) // Check if process exists
      console.log(`Server is already running (PID: ${pid})`)
      return
    } catch {
      // Process doesn't exist, clean up stale PID file
      try { unlinkSync(PID_PATH) } catch {}
    }
  }

  // Resolve log file path (mirrors logger.ts logic)
  const logFilePath = process.env.LOG_FILE !== undefined
    ? process.env.LOG_FILE
    : join(homedir(), ".puttry", "server.log")

  const stderrFd = logFilePath ? openSync(logFilePath, "a") : "ignore" as const

  const child = spawn(process.execPath, [serverPath], {
    detached: true,
    stdio: ["ignore", "ignore", stderrFd],
    env: { ...process.env },
  })

  child.unref()

  if (typeof stderrFd === "number") closeSync(stderrFd)

  // Poll for PID file — server only writes it after httpServer.listen() succeeds
  const POLL_MS = 200
  const TIMEOUT_MS = 8000
  const deadline = Date.now() + TIMEOUT_MS
  let started = false

  while (Date.now() < deadline) {
    await setTimeoutPromise(POLL_MS)
    if (existsSync(PID_PATH)) {
      started = true
      break
    }
  }

  if (!started) {
    console.error("")
    console.error("✗ Server failed to start.")
    if (logFilePath) console.error(`  Check logs for details: ${logFilePath}`)
    console.error("")
    process.exit(1)
  }

  const port = process.env.PORT || "5174"
  const host = process.env.HOST || "localhost"

  console.log("")
  console.log("✓ Server started successfully")
  console.log("")
  console.log("─── Direct Link ───")
  console.log(`http://${host}:${port}/`)
  console.log("")
  const logFile = process.env.LOG_FILE !== undefined
    ? process.env.LOG_FILE || "(disabled)"
    : "~/.puttry/server.log"
  console.log(`Logs: ${logFile}`)
  console.log("")
  console.log("Use 'puttry password rotate' to generate and display a password.")
  console.log("")

  // Check if this is a first-run (no env files exist)
  const envLocal = join(import.meta.dirname, "../../.env.local")
  const envUser = join(homedir(), ".puttry", ".env")
  const isFirstRun = !existsSync(envLocal) && !existsSync(envUser)

  if (isFirstRun) {
    console.log("ℹ  Running with default settings. Use 'puttry config list' to view or 'puttry config set KEY VALUE' to change.")
    console.log("")
  }
}

async function stopServer(): Promise<void> {
  if (!existsSync(PID_PATH)) {
    console.log("Server is not running")
    return
  }

  try {
    const pidContent = readFileSync(PID_PATH, "utf-8").trim()
    const pid = parseInt(pidContent)

    // Check if process exists
    try {
      process.kill(pid, 0)
    } catch {
      console.log("Server is not running (stale PID file)")
      unlinkSync(PID_PATH)
      return
    }

    process.kill(pid, "SIGTERM")
    try { unlinkSync(PID_PATH) } catch {}
    console.log(`Stopped server (PID: ${pid})`)
  } catch (err) {
    console.error(`Failed to stop server: ${err instanceof Error ? err.message : err}`)
    process.exit(1)
  }
}

async function restartServer(): Promise<void> {
  if (existsSync(PID_PATH)) {
    await stopServer()
    // Give it a moment to shut down
    await setTimeoutPromise(500)
  }
  await startServer()
}

async function statusServer(): Promise<void> {
  if (!existsSync(PID_PATH)) {
    console.log("Server is stopped")
    return
  }

  try {
    const pidContent = readFileSync(PID_PATH, "utf-8").trim()
    const pid = parseInt(pidContent)

    // Check if process exists
    try {
      process.kill(pid, 0)
      const port = process.env.PORT || "5174"
      console.log(`Server is running (PID: ${pid}, http://localhost:${port})`)
      return
    } catch {
      console.log("Server is stopped (stale PID file)")
      unlinkSync(PID_PATH)
    }
  } catch (err) {
    console.error(`Failed to check status: ${err instanceof Error ? err.message : err}`)
    process.exit(1)
  }
}

async function showPassword(): Promise<void> {
  console.error("")
  console.error("Error: The session password cannot be retrieved after it has been set.")
  console.error("Use 'puttry password rotate' to generate and display a new password.")
  console.error("")
  process.exit(1)
}

async function rotatePassword(): Promise<void> {
  loadEnvFiles()
  const { initializeConfig } = await import("./lib/settings.js")
  const { initAuthState, rotateSessionPassword } = await import("./auth/state.js")

  initializeConfig()
  await initAuthState()

  const newPassword = await rotateSessionPassword()

  console.log("")
  console.log("✓ Password rotated successfully!")
  console.log("")
  console.log("─── New Session Password ───")
  console.log(newPassword)
  console.log("")
  console.log("⚠️  IMPORTANT: Remember this password. It will be shown only once.")
  console.log("")
  console.log("If the server is running, it will automatically invalidate all existing sessions.")
  console.log("Users will need to log in again with the new password.")
  console.log("")

  process.exit(0)
}

async function setPassword(password: string): Promise<void> {
  loadEnvFiles()
  const { initializeConfig } = await import("./lib/settings.js")
  const { initAuthState, setSessionPassword } = await import("./auth/state.js")

  initializeConfig()
  await initAuthState()

  await setSessionPassword(password)

  console.log("")
  console.log("✓ Password set successfully!")
  console.log("")
  console.log("─── Session Password ───")
  console.log(password)
  console.log("")
  console.log("If the server is running, it will automatically invalidate all existing sessions.")
  console.log("Users will need to log in again with the new password.")
  console.log("")

  process.exit(0)
}

async function listConfig(): Promise<void> {
  loadEnvFiles()
  const { initializeConfig, config } = await import("./lib/settings.js")

  initializeConfig()

  console.log("")
  console.log("─── Configuration ───")
  for (const [key, value] of Object.entries(config)) {
    console.log(`${key}=${value}`)
  }
  console.log("")
}

async function setConfig(key: string, value: string): Promise<void> {
  loadEnvFiles()
  const { initializeConfig, updateSetting } = await import("./lib/settings.js")

  initializeConfig()
  const result = updateSetting(key, value)

  if (!result.success) {
    console.error(`Error: ${result.error}`)
    process.exit(1)
  }

  console.log(`✓ Updated ${key}=${value}`)
  if (result.note) {
    console.log(`  Note: ${result.note}`)
  }
}

async function enableTotp(): Promise<void> {
  loadEnvFiles()
  const { initializeConfig, updateSetting } = await import("./lib/settings.js")

  initializeConfig()
  const result = updateSetting("TOTP_ENABLED", "true")

  if (!result.success) {
    console.error(`Error: ${result.error}`)
    process.exit(1)
  }

  console.log("✓ TOTP enabled.")
  console.log("  Users will be required to set up 2FA on their next login.")
}

async function disableTotp(): Promise<void> {
  loadEnvFiles()
  const { initializeConfig, updateSetting } = await import("./lib/settings.js")

  initializeConfig()
  const result = updateSetting("TOTP_ENABLED", "false")

  if (!result.success) {
    console.error(`Error: ${result.error}`)
    process.exit(1)
  }

  console.log("✓ TOTP disabled.")
  console.log("  2FA requirement removed. Your device registration is saved.")
  console.log("  Use 'puttry totp reset' to clear the registration if needed.")
}

async function resetTotp(): Promise<void> {
  loadEnvFiles()
  const { clear2FAState } = await import("./auth/state.js")

  clear2FAState()
  console.log("✓ TOTP configuration cleared.")
  console.log("  Users will need to re-scan the QR code on their next login to set up 2FA again.")
}

async function listPasskeys(): Promise<void> {
  const { getPasskeys } = await import("./auth/passkey-state.js")

  const passkeys = getPasskeys()
  if (passkeys.length === 0) {
    console.log("No passkeys registered.")
    return
  }

  console.log("")
  console.log("─── Registered Passkeys ───")
  for (const pk of passkeys) {
    const registeredDate = new Date(pk.registeredAt).toLocaleDateString()
    console.log(`  • ${pk.name} (${registeredDate})`)
    console.log(`    ID: ${pk.id.slice(0, 16)}...`)
  }
  console.log("")
}

async function resetPasskeys(): Promise<void> {
  const { getPasskeys, clearPasskeys } = await import("./auth/passkey-state.js")

  const passkeys = getPasskeys()
  if (passkeys.length === 0) {
    console.log("No passkeys registered.")
    return
  }

  clearPasskeys()
  console.log(`✓ Cleared ${passkeys.length} passkey(s).`)
  console.log("  Users will need to register a new passkey on their next login.")
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)

  if (args.length === 0) {
    printHelp()
    return
  }

  const command = args[0]

  try {
    switch (command) {
      case "help":
        printHelp()
        break
      case "start":
        await startServer()
        break
      case "stop":
        await stopServer()
        break
      case "restart":
        await restartServer()
        break
      case "status":
        await statusServer()
        break
      case "password":
        if (args[1] === "show" || args.length === 1) {
          await showPassword()
        } else if (args[1] === "rotate") {
          await rotatePassword()
        } else if (args[1] === "set") {
          if (args.length < 3) {
            console.error("Usage: puttry password set PASSWORD")
            process.exit(1)
          }
          await setPassword(args[2])
        } else {
          console.error(`Unknown password command: ${args[1]}`)
          printHelp()
          process.exit(1)
        }
        break
      case "configure":
        await runConfigureWizard()
        break
      case "config":
        if (args[1] === "list") {
          await listConfig()
        } else if (args[1] === "set") {
          if (args.length < 4) {
            console.error("Usage: puttry config set KEY VALUE")
            process.exit(1)
          }
          await setConfig(args[2], args[3])
        } else {
          console.error(`Unknown config command: ${args[1]}`)
          printHelp()
          process.exit(1)
        }
        break
      case "totp":
        if (args[1] === "enable") {
          await enableTotp()
        } else if (args[1] === "disable") {
          await disableTotp()
        } else if (args[1] === "reset") {
          await resetTotp()
        } else {
          console.error(`Unknown totp command: ${args[1]}`)
          printHelp()
          process.exit(1)
        }
        break
      case "passkey":
        if (args[1] === "list") {
          await listPasskeys()
        } else if (args[1] === "reset") {
          await resetPasskeys()
        } else {
          console.error(`Unknown passkey command: ${args[1]}`)
          printHelp()
          process.exit(1)
        }
        break
      default:
        console.error(`Unknown command: ${command}`)
        printHelp()
        process.exit(1)
    }
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : err}`)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(`Fatal error: ${err instanceof Error ? err.message : err}`)
  process.exit(1)
})
