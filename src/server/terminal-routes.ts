import { Router } from "express"
import type { Request, Response } from "express"
import { createSession, getAllSessions, getSession, renameSession, killSession, getSessionProcessInfo } from "./pty-manager"
import logger from "./logger"

export function createTerminalRouter(): Router {
  const router = Router()

  // GET /api/sessions - List all sessions
  router.get("/", (_req: Request, res: Response) => {
    try {
      const sessions = getAllSessions().map((s) => ({
        id: s.id,
        label: s.label,
        createdAt: s.createdAt,
        cols: s.cols,
        rows: s.rows,
      }))
      res.json(sessions)
    } catch (err) {
      logger.error(`[terminal-routes] Failed to list sessions: ${err instanceof Error ? err.message : err}`)
      res.status(500).json({ error: "Failed to list sessions" })
    }
  })

  // POST /api/sessions - Create a new session
  router.post("/", (req: Request, res: Response) => {
    try {
      const { clientId } = req.body ?? {}
      const cols = 80
      const rows = 24
      const session = createSession(cols, rows, clientId ?? null)
      res.status(201).json({
        id: session.id,
        label: session.label,
        createdAt: session.createdAt,
        cols: session.cols,
        rows: session.rows,
      })
    } catch (err) {
      logger.error(`[terminal-routes] Failed to create session: ${err instanceof Error ? err.message : err}`)
      res.status(500).json({ error: "Failed to create session" })
    }
  })

  // PATCH /api/sessions/:id - Rename a session
  router.patch("/:id", (req: Request<{ id: string }, unknown, { label?: string }>, res: Response) => {
    try {
      const { id } = req.params
      const { label } = req.body

      if (!label || typeof label !== "string" || !label.trim()) {
        res.status(400).json({ error: "Label is required and must be a non-empty string" })
        return
      }

      // H-4: Prevent memory exhaustion from oversized labels
      if (label.length > 1024) {
        res.status(400).json({ error: "Label must be 1024 characters or less" })
        return
      }

      const session = getSession(id)
      if (!session) {
        res.status(404).json({ error: "Session not found" })
        return
      }

      if (!renameSession(id, label.trim())) {
        res.status(500).json({ error: "Failed to rename session" })
        return
      }

      res.json({
        id: session.id,
        label: label.trim(),
        createdAt: session.createdAt,
        cols: session.cols,
        rows: session.rows,
      })
    } catch (err) {
      logger.error(`[terminal-routes] Failed to rename session: ${err instanceof Error ? err.message : err}`)
      res.status(500).json({ error: "Failed to rename session" })
    }
  })

  // GET /api/sessions/:id/info - Get process info
  router.get("/:id/info", (req: Request<{ id: string }>, res: Response) => {
    try {
      const { id } = req.params

      const session = getSession(id)
      if (!session) {
        res.status(404).json({ error: "Session not found" })
        return
      }

      const processInfo = getSessionProcessInfo(id)
      if (!processInfo) {
        res.status(500).json({ error: "Failed to get process info" })
        return
      }

      res.json(processInfo)
    } catch (err) {
      logger.error(`[terminal-routes] Failed to get process info: ${err instanceof Error ? err.message : err}`)
      res.status(500).json({ error: "Failed to get process info" })
    }
  })

  // DELETE /api/sessions/:id - Kill a session
  router.delete("/:id", (req: Request<{ id: string }>, res: Response) => {
    try {
      const { id } = req.params

      const session = getSession(id)
      if (!session) {
        res.status(404).json({ error: "Session not found" })
        return
      }

      if (!killSession(id)) {
        res.status(500).json({ error: "Failed to kill session" })
        return
      }

      res.json({ success: true })
    } catch (err) {
      logger.error(`[terminal-routes] Failed to kill session: ${err instanceof Error ? err.message : err}`)
      res.status(500).json({ error: "Failed to kill session" })
    }
  })

  return router
}
