import { useState, useCallback, useEffect, useRef } from 'react'
import toast from 'react-hot-toast'
import type { SessionInfo } from '@shared/types/session'
import type { AuthStatus } from '@shared/types/auth'

interface UseSyncReturn {
  sessions: SessionInfo[]
  setActiveSessionId: (id: string | null) => void
  activeSessionId: string | null
  inputLocks: Record<string, string | null>
  guestViewers: Record<string, string[]>
  lockRequests: Record<string, { sessionId: string; guestName: string; requestId: string }>
  dataReceivedSessions: Set<string>
  scrollbackLines: number
  loading: boolean
  createSession: () => Promise<void>
  handleRenameSession: (sessionId: string, newLabel: string) => Promise<void>
  handleCloseSession: (sessionId: string) => Promise<void>
  handleCloseAllSessions: () => Promise<void>
}

export function useSync(params: {
  authStatus: AuthStatus
  isGuestMode: boolean
  clientId: string
  setAuthStatus: (status: AuthStatus) => void
}): UseSyncReturn {
  const { authStatus, isGuestMode, clientId, setAuthStatus } = params

  const [sessions, setSessions] = useState<SessionInfo[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [inputLocks, setInputLocks] = useState<Record<string, string | null>>({})
  const [guestViewers, setGuestViewers] = useState<Record<string, string[]>>({})
  const [lockRequests, setLockRequests] = useState<Record<string, { sessionId: string; guestName: string; requestId: string }>>({})
  const [dataReceivedSessions, setDataReceivedSessions] = useState<Set<string>>(new Set())
  const [scrollbackLines, setScrollbackLines] = useState(10000)
  const [loading, setLoading] = useState(false)

  const syncWsRef = useRef<WebSocket | null>(null)
  const pendingSessionRef = useRef<string | null>(null)
  const syncActiveRef = useRef(false)
  const dataReceivedTimeoutsRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const connectSync = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${protocol}://${window.location.host}/sync?clientId=${encodeURIComponent(clientId)}`)
    syncWsRef.current = ws

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data)
      if (msg.type === 'snapshot') {
        setSessions(msg.sessions)
        // Initialize locks from snapshot
        const locks: Record<string, string | null> = {}
        for (const s of msg.sessions) {
          locks[s.id] = s.inputLockClientId ?? null
        }
        setInputLocks(locks)
        // If there's a pending session, activate it if it exists in the snapshot
        if (pendingSessionRef.current && msg.sessions.find((s: SessionInfo) => s.id === pendingSessionRef.current)) {
          setActiveSessionId(pendingSessionRef.current)
          pendingSessionRef.current = null
        }
      } else if (msg.type === 'session-created') {
        setSessions(prev => prev.find(s => s.id === msg.session.id) ? prev : [...prev, msg.session])
        // If this is the pending session, activate it
        if (pendingSessionRef.current === msg.session.id) {
          setActiveSessionId(msg.session.id)
          pendingSessionRef.current = null
        }
      } else if (msg.type === 'session-deleted') {
        setSessions(prev => prev.filter(s => s.id !== msg.sessionId))
        setActiveSessionId(prev => prev === msg.sessionId ? null : prev)
        setInputLocks(prev => {
          const updated = { ...prev }
          delete updated[msg.sessionId]
          return updated
        })
      } else if (msg.type === 'session-renamed') {
        setSessions(prev => prev.map(s => s.id === msg.sessionId ? { ...s, label: msg.label } : s))
      } else if (msg.type === 'input-lock-acquired') {
        setInputLocks(prev => ({ ...prev, [msg.sessionId]: msg.clientId }))
      } else if (msg.type === 'input-lock-released') {
        setInputLocks(prev => ({ ...prev, [msg.sessionId]: null }))
      } else if (msg.type === 'data-activity') {
        // Add class immediately
        setDataReceivedSessions(prev => {
          const updated = new Set(prev)
          updated.add(msg.sessionId)
          return updated
        })

        // Clear existing timeout
        if (dataReceivedTimeoutsRef.current[msg.sessionId]) {
          clearTimeout(dataReceivedTimeoutsRef.current[msg.sessionId])
        }

        // Remove after 0.5s (one animation cycle) - timeout resets on each new event
        dataReceivedTimeoutsRef.current[msg.sessionId] = setTimeout(() => {
          setDataReceivedSessions(prev => {
            const updated = new Set(prev)
            updated.delete(msg.sessionId)
            return updated
          })
          delete dataReceivedTimeoutsRef.current[msg.sessionId]
        }, 500)
      } else if (msg.type === 'guest-viewer-added') {
        setGuestViewers(prev => ({
          ...prev,
          [msg.sessionId]: [...(prev[msg.sessionId] ?? []), msg.guestName]
        }))
      } else if (msg.type === 'guest-viewer-removed') {
        setGuestViewers(prev => ({
          ...prev,
          [msg.sessionId]: (prev[msg.sessionId] ?? []).filter(name => name !== msg.guestName)
        }))
      } else if (msg.type === 'lock-request') {
        // Owner received a guest lock request (ignore if guest)
        if (!isGuestMode) {
          setLockRequests(prev => ({
            ...prev,
            [msg.requestId]: {
              sessionId: msg.sessionId,
              guestName: msg.guestName,
              requestId: msg.requestId
            }
          }))
          toast.success(`${msg.guestName} wants control of a session`)
        }
      } else if (msg.type === 'lock-request-resolved') {
        // Clean up resolved request
        setLockRequests(prev => {
          const updated = { ...prev }
          Object.keys(updated).forEach(key => {
            if (updated[key].requestId === msg.requestId) {
              delete updated[key]
            }
          })
          return updated
        })
        // Show confirmation toast to guest if approved
        if (isGuestMode && msg.approved) {
          toast.success('Control granted!')
        } else if (isGuestMode && !msg.approved) {
          toast.error('Control request denied')
        }
      } else if (msg.type === 'lock-request-expired') {
        // Clean up expired request
        setLockRequests(prev => {
          const updated = { ...prev }
          Object.keys(updated).forEach(key => {
            if (updated[key].requestId === msg.requestId) {
              delete updated[key]
            }
          })
          return updated
        })
      } else if (msg.type === 'guest-revoked') {
        // Logout guest if their session was revoked
        if (isGuestMode && msg.clientIds.includes(clientId)) {
          syncActiveRef.current = false
          setAuthStatus('unauthenticated')
        }
      }
    }
    ws.onclose = () => { if (syncActiveRef.current) setTimeout(connectSync, 2000) }
  }, [isGuestMode, clientId, setAuthStatus])

  // Sync lifecycle - connect when authenticated, disconnect when not
  useEffect(() => {
    if (authStatus !== 'authenticated') {
      syncActiveRef.current = false
      return
    }
    syncActiveRef.current = true
    connectSync()
    return () => {
      syncActiveRef.current = false
      syncWsRef.current?.close()
    }
  }, [authStatus, connectSync])

  // Fetch config (scrollback lines) when authenticated
  useEffect(() => {
    if (authStatus !== 'authenticated') return
    async function fetchConfig() {
      try {
        const res = await fetch('/api/config')
        if (res.ok) {
          const data = (await res.json()) as { scrollbackLines: number }
          setScrollbackLines(data.scrollbackLines)
        }
      } catch {
        // Config fetch is optional; failure is not critical
      }
    }
    fetchConfig()
  }, [authStatus])

  // Set active session on first available
  useEffect(() => {
    if (sessions.length > 0 && !activeSessionId) {
      setActiveSessionId(sessions[0].id)
    }
  }, [sessions, activeSessionId])

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      Object.values(dataReceivedTimeoutsRef.current).forEach(timeout => clearTimeout(timeout))
    }
  }, [])

  const createSession = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId }),
      })
      if (res.ok) {
        const session = (await res.json()) as SessionInfo
        // Mark this session as pending activation
        // It will be activated when the sync event arrives
        pendingSessionRef.current = session.id
        // Fallback: activate after 500ms if sync event hasn't done it yet
        setTimeout(() => {
          if (pendingSessionRef.current === session.id) {
            setActiveSessionId(session.id)
            pendingSessionRef.current = null
          }
        }, 500)
      }
    } catch (err) {
      console.error('Failed to create session:', err)
    } finally {
      setLoading(false)
    }
  }, [clientId])

  const handleRenameSession = useCallback(async (sessionId: string, newLabel: string) => {
    try {
      await fetch(`/api/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: newLabel }),
      })
      setSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, label: newLabel } : s))
      )
    } catch (err) {
      console.error('Failed to rename session:', err)
    }
  }, [])

  const handleCloseSession = useCallback(async (sessionId: string) => {
    try {
      await fetch(`/api/sessions/${sessionId}`, { method: 'DELETE' })
      setSessions((prev) => prev.filter((s) => s.id !== sessionId))
      if (activeSessionId === sessionId) {
        setActiveSessionId(sessions.find((s) => s.id !== sessionId)?.id ?? null)
      }
    } catch (err) {
      console.error('Failed to close session:', err)
    }
  }, [activeSessionId, sessions])

  const handleCloseAllSessions = useCallback(async () => {
    try {
      await Promise.all(sessions.map((s) => fetch(`/api/sessions/${s.id}`, { method: 'DELETE' })))
      setSessions([])
      setActiveSessionId(null)
    } catch (err) {
      console.error('Failed to close all sessions:', err)
    }
  }, [sessions])

  return {
    sessions,
    setActiveSessionId,
    activeSessionId,
    inputLocks,
    guestViewers,
    lockRequests,
    dataReceivedSessions,
    scrollbackLines,
    loading,
    createSession,
    handleRenameSession,
    handleCloseSession,
    handleCloseAllSessions,
  }
}
