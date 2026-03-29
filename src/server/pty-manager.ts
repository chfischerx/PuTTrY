import { spawn } from "node-pty"
import type { IPty } from "node-pty"
import { WebSocket } from "ws"
import { randomUUID } from "node:crypto"
import { execFileSync } from "node:child_process"
import { userInfo, hostname } from "node:os"
import { basename } from "node:path"
import logger from "./logger"
import { broadcastSync } from "./sync-bus.js"
import { config } from "./settings-api.js"
import { activeSessions } from "./session-store.js"

export interface TerminalSession {
  id: string
  label: string
  pty: IPty
  clients: Set<WebSocket>
  clientIds: Map<WebSocket, string>
  cols: number
  rows: number
  createdAt: Date
  outputBuffer: string
  outputBufferLines: number
  inputLockClientId: string | null
}

interface ResizeMessage {
  type: "resize"
  cols: number
  rows: number
}

// HIGH-9: Maximum size for a single PTY input write (64 KB)
const MAX_PTY_INPUT_SIZE = 64 * 1024

const sessions = new Map<string, TerminalSession>()
const dataActivityDebounceTimers = new Map<string, NodeJS.Timeout>()
const lockReleaseTimers = new Map<string, NodeJS.Timeout>()

function countNewlines(str: string): number {
  let count = 0
  for (let i = 0; i < str.length; i++) {
    if (str[i] === '\n') count++
  }
  return count
}

export function createSession(cols: number, rows: number, creatorClientId?: string | null): TerminalSession {
  const id = randomUUID()
  const shell = process.env.SHELL || userInfo().shell || '/bin/sh'
  const label = `${basename(shell)} ${sessions.size + 1}`

  const host = hostname()
  const pty = spawn(shell, [], {
    name: "xterm-256color",
    cols,
    rows,
    cwd: process.env.HOME,
    env: {
      ...process.env,
      HOST: host,
      HOSTNAME: host,
    },
  })

  const session: TerminalSession = {
    id,
    label,
    pty,
    clients: new Set(),
    clientIds: new Map(),
    cols,
    rows,
    createdAt: new Date(),
    outputBuffer: "",
    outputBufferLines: 0,
    inputLockClientId: creatorClientId ?? null,
  }

  // Handle PTY output
  pty.onData((data) => {
    // Append to output buffer
    session.outputBuffer += data
    session.outputBufferLines += countNewlines(data)

    // Trim from earliest newline when over cap
    while (session.outputBufferLines > config.SCROLLBACK_LINES) {
      const idx = session.outputBuffer.indexOf('\n')
      if (idx === -1) {
        session.outputBuffer = ''
        session.outputBufferLines = 0
        break
      }
      session.outputBuffer = session.outputBuffer.slice(idx + 1)
      session.outputBufferLines--
    }

    // Broadcast raw data to all connected clients
    for (const client of session.clients) {
      if (client.readyState === 1) {
        client.send(data)
      }
    }

    // Broadcast data-activity event immediately, then debounce follow-ups for 300ms
    const existingTimer = dataActivityDebounceTimers.get(id)
    if (!existingTimer) {
      // First event in this burst - broadcast immediately
      broadcastSync({ type: 'data-activity', sessionId: id })

      // Set debounce timer to prevent rapid re-broadcasts
      const timer = setTimeout(() => {
        dataActivityDebounceTimers.delete(id)
      }, 300)
      dataActivityDebounceTimers.set(id, timer)
    }
  })

  // Handle PTY exit
  pty.onExit(() => {
    logger.info(`[pty-manager] PTY ${id} exited`)
    // Send exit message to all clients
    for (const client of session.clients) {
      if (client.readyState === 1) {
        client.send(JSON.stringify({ type: "exit" }))
      }
    }
    session.clients.clear()
    sessions.delete(id)
    broadcastSync({ type: "session-deleted", sessionId: id })
  })

  sessions.set(id, session)
  logger.info(`[pty-manager] Created session ${id} (${label})`)
  broadcastSync({ type: "session-created", session: { id, label, createdAt: session.createdAt, cols, rows } })
  return session
}

export function getSession(id: string): TerminalSession | undefined {
  return sessions.get(id)
}

export function getAllSessions(): TerminalSession[] {
  return Array.from(sessions.values()).map((s) => ({
    id: s.id,
    label: s.label,
    pty: s.pty,
    clients: s.clients,
    clientIds: s.clientIds,
    cols: s.cols,
    rows: s.rows,
    createdAt: s.createdAt,
    outputBuffer: s.outputBuffer,
    outputBufferLines: s.outputBufferLines,
    inputLockClientId: s.inputLockClientId,
  }))
}

export function attachWebSocket(id: string, ws: WebSocket, clientId: string = "", browserToken: string = ""): boolean {
  const session = sessions.get(id)
  if (!session) {
    logger.warn(`[pty-manager] Cannot attach WebSocket: session ${id} not found`)
    return false
  }

  // Replay scrollback to new joiner
  if (session.outputBuffer.length > 0) {
    ws.send(session.outputBuffer)
  }

  session.clients.add(ws)
  session.clientIds.set(ws, clientId)

  // HIGH-10: Periodically revalidate session token for long-lived WebSocket connections
  let revalidationTimer: NodeJS.Timeout | null = null
  if (browserToken && !config.AUTH_DISABLED) {
    revalidationTimer = setInterval(() => {
      const session = activeSessions.get(browserToken)
      const isValid = !!session && session.expiresAt > Date.now()
      if (!isValid) {
        logger.warn(`[pty-manager] WebSocket session ${id} token expired or invalid, closing`)
        ws.close()
      }
    }, 30 * 1000) // Check every 30 seconds
  }

  // Handle WebSocket messages
  ws.on("message", (data) => {
    try {
      // Try to parse as JSON for control messages
      const message = JSON.parse(data.toString()) as ResizeMessage & { type: string; force?: boolean }
      if (message.type === "resize") {
        // Validate and clamp cols/rows to reasonable bounds
        const cols = Math.max(1, Math.min(500, Number(message.cols) || 80))
        const rows = Math.max(1, Math.min(500, Number(message.rows) || 24))
        session.pty.resize(cols, rows)
        session.cols = cols
        session.rows = rows
      } else if (message.type === "acquire-lock") {
        const force = !!message.force
        const wasHeld = session.inputLockClientId
        if (force || !session.inputLockClientId || session.inputLockClientId === clientId) {
          session.inputLockClientId = clientId
          broadcastSync({ type: "input-lock-acquired", sessionId: id, clientId })
          logger.info(`[pty-manager] Lock acquired for session ${id} by ${clientId} (force=${force}, wasHeld=${wasHeld})`)
        } else {
          logger.info(`[pty-manager] Lock denied for session ${id} by ${clientId} (held by ${session.inputLockClientId})`)
        }
      } else if (message.type === "release-lock") {
        if (session.inputLockClientId === clientId) {
          session.inputLockClientId = null
          broadcastSync({ type: "input-lock-released", sessionId: id })
        }
      }
    } catch {
      // Not JSON, treat as raw input (keystrokes)
      if (session.inputLockClientId === clientId) {
        // HIGH-9: Enforce maximum input size to prevent memory exhaustion
        const input = data.toString()
        if (input.length > MAX_PTY_INPUT_SIZE) {
          logger.warn(`[pty-manager] Input exceeds maximum size (${input.length} > ${MAX_PTY_INPUT_SIZE}), truncating`)
          session.pty.write(input.slice(0, MAX_PTY_INPUT_SIZE))
        } else {
          session.pty.write(input)
        }
      }
    }
  })

  ws.on("close", () => {
    logger.info(`[pty-manager] WebSocket closed for session ${id}`)
    session.clients.delete(ws)
    session.clientIds.delete(ws)
    // Clean up revalidation timer
    if (revalidationTimer) {
      clearInterval(revalidationTimer)
    }
    // Lock is NOT released here — sync WS disconnect handles that
  })

  ws.on("error", (err) => {
    logger.error(`[pty-manager] WebSocket error for session ${id}: ${err.message}`)
    session.clients.delete(ws)
    if (revalidationTimer) {
      clearInterval(revalidationTimer)
    }
  })

  logger.info(`[pty-manager] WebSocket attached to session ${id}`)
  return true
}

export function renameSession(id: string, newLabel: string): boolean {
  const session = sessions.get(id)
  if (!session) return false
  session.label = newLabel
  logger.info(`[pty-manager] Renamed session ${id} to "${newLabel}"`)
  broadcastSync({ type: "session-renamed", sessionId: id, label: newLabel })
  return true
}

export function killSession(id: string): boolean {
  const session = sessions.get(id)
  if (!session) return false

  // Send exit to all clients
  for (const client of session.clients) {
    if (client.readyState === 1) {
      client.send(JSON.stringify({ type: "exit" }))
      client.close()
    }
  }
  session.clients.clear()

  // Clean up any pending lock release timer
  const releaseTimer = lockReleaseTimers.get(id)
  if (releaseTimer) {
    clearTimeout(releaseTimer)
    lockReleaseTimers.delete(id)
  }

  try {
    session.pty.kill()
  } catch {
    // Already killed
  }

  sessions.delete(id)
  logger.info(`[pty-manager] Killed session ${id}`)
  broadcastSync({ type: "session-deleted", sessionId: id })
  return true
}

// Called when a clientId's sync WS reconnects — cancel any pending grace timers
export function onSyncClientConnect(clientId: string): void {
  let cancelledCount = 0
  for (const [sessionId, timer] of lockReleaseTimers) {
    const session = sessions.get(sessionId)
    if (session && session.inputLockClientId === clientId) {
      clearTimeout(timer)
      lockReleaseTimers.delete(sessionId)
      cancelledCount++
      logger.info(`[pty-manager] Cancelled pending lock release for session ${sessionId} (sync reconnect by ${clientId})`)
    }
  }
  logger.info(`[pty-manager] Sync client connected: ${clientId} (cancelled ${cancelledCount} timers)`)
}

// Called when a clientId's sync WS closes — start grace timers for all held locks
export function onSyncClientDisconnect(clientId: string): void {
  let timerCount = 0
  for (const [id, session] of sessions) {
    if (session.inputLockClientId === clientId) {
      const existing = lockReleaseTimers.get(id)
      if (existing) clearTimeout(existing)
      const timer = setTimeout(() => {
        lockReleaseTimers.delete(id)
        if (session.inputLockClientId === clientId) {
          session.inputLockClientId = null
          broadcastSync({ type: 'input-lock-released', sessionId: id })
          logger.info(`[pty-manager] Lock released for session ${id} (sync timeout for ${clientId})`)
        }
      }, 2000)
      lockReleaseTimers.set(id, timer)
      timerCount++
      logger.info(`[pty-manager] Started 2s grace timer for session ${id} (lock held by ${clientId})`)
    }
  }
  logger.info(`[pty-manager] Sync client disconnected: ${clientId} (started ${timerCount} grace timers)`)
}

export function cleanupAll(): void {
  for (const [id] of sessions) {
    killSession(id)
  }
  logger.info(`[pty-manager] Cleaned up all sessions`)
}

export interface ProcessInfo {
  pid: number
  memory: string // Human-readable memory usage
  memoryBytes: number // Raw memory in bytes
  cpu: number // CPU percentage
  startedAt: string // ISO timestamp
  uptime: string // Human-readable uptime
  uptimeSeconds: number // Raw uptime in seconds
}

export function getSessionProcessInfo(id: string): ProcessInfo | null {
  const session = sessions.get(id)
  if (!session) return null

  try {
    const pid = (session.pty as any).pid as number
    if (!pid) return null

    // Use ps command to get process info (works on macOS and Linux)
    const psOutput = execFileSync("ps", ["-p", String(pid), "-o", "rss=,pcpu="], {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "ignore"], // Ignore stderr
    }).trim()

    let memory = "N/A"
    let memoryBytes = 0
    let cpu = 0

    if (psOutput) {
      const [rssStr, cpuStr] = psOutput.split(/\s+/)
      const rssKb = parseInt(rssStr, 10)
      memoryBytes = rssKb * 1024
      memory = formatBytes(memoryBytes)
      cpu = parseFloat(cpuStr) || 0
    }

    const createdAt = session.createdAt.getTime()
    const now = Date.now()
    const uptimeSeconds = Math.floor((now - createdAt) / 1000)
    const uptime = formatUptime(uptimeSeconds)

    return {
      pid,
      memory,
      memoryBytes,
      cpu,
      startedAt: session.createdAt.toISOString(),
      uptime,
      uptimeSeconds,
    }
  } catch (err) {
    logger.warn(`[pty-manager] Failed to get process info for session ${id}: ${err instanceof Error ? err.message : err}`)
    return null
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60

  const parts = []
  if (days > 0) parts.push(`${days}d`)
  if (hours > 0) parts.push(`${hours}h`)
  if (minutes > 0) parts.push(`${minutes}m`)
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`)

  return parts.join(" ")
}
