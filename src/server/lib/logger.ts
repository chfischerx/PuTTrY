import winston from "winston"
import { homedir } from "node:os"
import { join } from "node:path"

const { combine, timestamp, printf } = winston.format

let logger: winston.Logger | null = null

function getLogger(): winston.Logger {
  if (logger) return logger

  const level =
    process.env.VERBOSE === "1" || process.env.VERBOSE === "true"
      ? "debug"
      : "info"

  const fmt = printf(({ level, message, timestamp }) =>
    `${timestamp} [${level}] ${message}`
  )

  // Resolve log file path: explicit override or default to ~/.puttry/server.log
  const logFilePath = process.env.LOG_FILE !== undefined
    ? process.env.LOG_FILE          // explicit override (empty string = disabled)
    : join(homedir(), ".puttry", "server.log")  // default

  const transports: winston.transport[] = [new winston.transports.Console()]

  // Add File transport if log file path is not empty (skip in test environment)
  if (logFilePath && process.env.NODE_ENV !== "test") {
    try {
      transports.push(new winston.transports.File({ filename: logFilePath, format: combine(timestamp({ format: "YYYY-MM-DD HH:mm:ss" }), fmt) }))
    } catch (err) {
      // If file transport fails to initialize, just continue with console-only logging
      console.error("[logger] Warning: Failed to initialize file logging", err instanceof Error ? err.message : err)
    }
  }

  logger = winston.createLogger({
    level,
    format: combine(timestamp({ format: "YYYY-MM-DD HH:mm:ss" }), fmt),
    transports,
  })

  // Log the configured level for debugging
  if (level === "debug") {
    logger.debug("[logger] Debug level logging ENABLED")
  }

  return logger
}

// Export a Proxy that creates the logger on first use
export default new Proxy(
  {},
  {
    get(_target, prop: string | symbol) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (getLogger() as any)[prop]
    },
  }
) as winston.Logger
