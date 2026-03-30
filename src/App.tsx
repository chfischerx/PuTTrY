import { useState, useEffect, useRef, useCallback, createRef } from 'react'
import { LogOut, Loader2, Settings, Smartphone, Info, Eye, EyeOff, KeyRound, FolderOpen, Upload, Menu, MoreHorizontal, X, Ban } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SessionsSidebar, type SessionInfo } from '@/components/SessionsSidebar'
import { SettingsDialog } from '@/components/SettingsDialog'
import { PasswordDialog } from '@/components/PasswordDialog'
import { UploadDialog, DownloadDialog } from '@/components/FileManagerDialog'
import TerminalPane, { type TerminalPaneHandle } from '@/components/TerminalPane'
import MobileKeyToolbar from '@/components/MobileKeyToolbar'
import { WebTerminalLogo } from '@/components/WebTerminalLogo'
import toast, { Toaster } from 'react-hot-toast'
import { getClientId } from '@/lib/clientId'

type AuthStatus = 'loading' | 'unauthenticated' | 'authenticated' | 'totp-setup' | 'totp-verify' | 'passkey-verify'

interface AuthState {
  authenticated: boolean
  authDisabled: boolean
  showAuthDisabledWarning?: boolean
  requiresTOTP?: boolean
  totpMode?: string
  requiresPasskey?: boolean
  canChoose?: boolean
  passkeyLoginAvailable?: boolean
}

export default function App() {
  const [authStatus, setAuthStatus] = useState<AuthStatus>('loading')
  const [authDisabled, setAuthDisabled] = useState(false)
  const [authError, setAuthError] = useState<string>('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  // TOTP setup/verify state
  const [totpDigits, setTotpDigits] = useState<string[]>(['', '', '', '', '', ''])
  const [totpQrDataUrl, setTotpQrDataUrl] = useState('')
  const [totpManualKey, setTotpManualKey] = useState('')
  const [showTotpManualKey, setShowTotpManualKey] = useState(false)
  const [totpLoading, setTotpLoading] = useState(false)
  const totpInputRefs = useRef<(HTMLInputElement | null)[]>([])

  const getTotpCode = () => totpDigits.join('')

  // Passkey state
  const [canChoose2FA, setCanChoose2FA] = useState(false)
  const [passkeyLoading, setPasskeyLoading] = useState(false)
  const [passkeyError, setPasskeyError] = useState('')
  const [passkeyLoginAvailable, setPasskeyLoginAvailable] = useState(false)

  const [sessions, setSessions] = useState<SessionInfo[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [sidebarWidth, setSidebarWidth] = useState(192)
  const [loading, setLoading] = useState(false)
  const [scrollbackLines, setScrollbackLines] = useState(10000)
  const [fontSize, setFontSize] = useState<number>(() => {
    const stored = localStorage.getItem('terminal-font-size')
    return stored ? Number(stored) : 14
  })

  // Mobile layout state
  const [sidebarMobileOpen, setSidebarMobileOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [viewportHeight, setViewportHeight] = useState<number | null>(null)
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768)
  const [isShiftPressed, setIsShiftPressed] = useState(false)

  // Input lock management
  const clientId = useRef(getClientId())
  const [inputLocks, setInputLocks] = useState<Record<string, string | null>>({})
  const [showLockedDialog, setShowLockedDialog] = useState<string | null>(null)
  const lastToastTimeRef = useRef<number>(0)
  const prevLocksRef = useRef<Record<string, string | null>>({})

  // Terminal refs for mobile keyboard toolbar
  const terminalRefs = useRef<Map<string, React.RefObject<TerminalPaneHandle | null>>>(new Map())

  // Hidden input to keep keyboard alive on mobile
  const hiddenInputRef = useRef<HTMLInputElement | null>(null)

  // Get or create a ref for each session
  const getTerminalRef = useCallback((sessionId: string) => {
    if (!terminalRefs.current.has(sessionId)) {
      terminalRefs.current.set(sessionId, createRef<TerminalPaneHandle | null>())
    }
    return terminalRefs.current.get(sessionId)!
  }, [])

  // Helper to send data to the active terminal
  const sendToActiveTerminal = useCallback((data: string) => {
    if (!activeSessionId) return
    terminalRefs.current.get(activeSessionId)?.current?.sendData(data)
    // Refocus terminal container on mobile to prevent keyboard dismissal
    if (isMobile) {
      setTimeout(() => {
        const terminalContainer = document.querySelector('[data-terminal-active]')
        if (terminalContainer) {
          (terminalContainer as HTMLElement).focus()
        }
      }, 0)
    }
  }, [activeSessionId, isMobile])

  // Clipboard handlers
  const handleCopy = useCallback(() => {
    if (!activeSessionId) return
    try {
      const termRef = terminalRefs.current.get(activeSessionId)?.current
      termRef?.copy()
      toast.success('Copied to clipboard', { duration: 2000 })
      console.log('✓ Copy successful')
    } catch (e) {
      console.error('Copy error:', e)
      toast.error('Failed to copy')
      alert('Copy failed: ' + (e as Error).message)
    }
  }, [activeSessionId])

  const handleSelectAll = useCallback(() => {
    if (!activeSessionId) return
    terminalRefs.current.get(activeSessionId)?.current?.selectAll()
  }, [activeSessionId])

  const handlePaste = useCallback(async () => {
    console.log('Paste button clicked')
    try {
      if (!navigator.clipboard) {
        alert('Clipboard API not available. Try on a real device or enable in simulator settings.')
        return
      }
      const text = await navigator.clipboard.readText()
      console.log('Clipboard text length:', text?.length)
      if (text) {
        console.log('✓ Sending to terminal:', text)
        sendToActiveTerminal(text)
        toast.success('Pasted', { duration: 1500 })
        alert(`Pasted: ${text.substring(0, 50)}${text.length > 50 ? '...' : ''}`)
      } else {
        console.warn('Clipboard is empty')
        toast.error('Clipboard is empty')
        alert('Clipboard is empty')
      }
    } catch (e) {
      const error = e as Error
      console.error('Paste error:', error.name, error.message)
      const errorMsg = error.name === 'NotAllowedError'
        ? 'iOS: Grant clipboard permission in Settings → Privacy → Clipboard'
        : error.name === 'NotSupportedError'
        ? 'Clipboard not supported on this browser'
        : `Paste failed: ${error.message}`
      toast.error(errorMsg)
      alert(errorMsg)
    }
  }, [sendToActiveTerminal])

  // Data received notification tracking
  const [dataReceivedSessions, setDataReceivedSessions] = useState<Set<string>>(new Set())
  const dataReceivedTimeoutsRef = useRef<Record<string, NodeJS.Timeout>>({})

  // Notification helper using react-hot-toast (debounced)
  const showNotification = (message: string) => {
    const now = Date.now()
    const toastDuration = 3000

    // Only show if enough time has passed since the last toast
    if (now - lastToastTimeRef.current < toastDuration) {
      return
    }

    toast.error(message, {
      position: 'bottom-right',
      duration: toastDuration,
      style: {
        fontSize: '12px',
        padding: '8px 12px',
      },
    })
    lastToastTimeRef.current = now
  }

  // Handle take control request
  const handleTakeControl = (sessionId: string) => {
    const ws = new WebSocket(`${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/terminal/${sessionId}?clientId=${encodeURIComponent(clientId.current)}`)
    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'acquire-lock', force: true }))
    }
    // Keep connection open for 500ms to ensure message is processed, then close
    setTimeout(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close()
      }
    }, 500)
  }

  // Handle font size change
  const handleFontSizeChange = useCallback((size: number) => {
    setFontSize(size)
    localStorage.setItem('terminal-font-size', String(size))
  }, [])

  // Settings dialog state
  const [showSettings, setShowSettings] = useState(false)

  // Password dialog state
  const [showPasswordDialog, setShowPasswordDialog] = useState(false)

  // File manager dialog states
  const [showUpload, setShowUpload] = useState(false)
  const [showDownload, setShowDownload] = useState(false)

  // Process info dialog state
  const [showProcessInfo, setShowProcessInfo] = useState(false)
  const [processInfo, setProcessInfo] = useState<any>(null)
  const [processInfoLoading, setProcessInfoLoading] = useState(false)

  // Sync WebSocket ref
  const syncWsRef = useRef<WebSocket | null>(null)
  // Track the newly created session ID to activate it when sync event arrives
  const pendingSessionRef = useRef<string | null>(null)
  // Track whether the sync WebSocket should be active
  const syncActiveRef = useRef(false)

  // Auth disabled warning
  const [showAuthDisabledWarning, setShowAuthDisabledWarning] = useState(false)
  useEffect(() => {
    if (!showAuthDisabledWarning) return
    const timer = setTimeout(() => setShowAuthDisabledWarning(false), 4000)
    return () => clearTimeout(timer)
  }, [showAuthDisabledWarning])

  // Check auth status on mount
  useEffect(() => {
    checkAuthStatus()
  }, [])

  // Track visualViewport for soft keyboard handling
  useEffect(() => {
    const vvp = window.visualViewport
    if (!vvp) return
    const handler = () => setViewportHeight(vvp.height)

    // Listen to multiple events for faster keyboard detection
    vvp.addEventListener('resize', handler)
    vvp.addEventListener('scroll', handler)

    // Hide toolbar immediately when user taps away from keyboard
    const handleTouchEnd = () => {
      // Use a very short delay to let current touch action complete
      requestAnimationFrame(() => {
        handler()
      })
    }
    window.addEventListener('touchend', handleTouchEnd)

    return () => {
      vvp.removeEventListener('resize', handler)
      vvp.removeEventListener('scroll', handler)
      window.removeEventListener('touchend', handleTouchEnd)
    }
  }, [])

  // Only listen to visualViewport to track keyboard visibility
  // Don't proactively hide it—let iOS dismiss the keyboard naturally
  // The visualViewport handler above will detect when the keyboard is actually dismissed

  // Keep a hidden input focused on mobile to prevent iOS from dismissing keyboard
  useEffect(() => {
    if (!isMobile || !activeSessionId) return

    const input = hiddenInputRef.current
    if (!input) return

    // Focus the hidden input
    input.focus()

    // Refocus if it loses focus, but not when clicking terminal or toolbar
    const handleBlur = (e: FocusEvent) => {
      const relatedTarget = e.relatedTarget as HTMLElement | null
      // Don't refocus if moving to terminal or toolbar
      if (relatedTarget?.closest('[data-terminal-active]') || relatedTarget?.closest('button[type="button"]')) {
        return
      }
      setTimeout(() => input.focus(), 0)
    }

    input.addEventListener('blur', handleBlur as EventListener)
    return () => input.removeEventListener('blur', handleBlur as EventListener)
  }, [isMobile, activeSessionId])

  // Track shift key at document level so it works even when focus is on toolbar buttons
  useEffect(() => {
    if (!isMobile) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setIsShiftPressed(true)
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setIsShiftPressed(false)
    }

    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('keyup', handleKeyUp)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('keyup', handleKeyUp)
    }
  }, [isMobile])

  // Detect mobile with matchMedia
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  // Connect to sync WebSocket when authenticated
  const connectSync = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${protocol}://${window.location.host}/sync?clientId=${encodeURIComponent(clientId.current)}`)
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
      }
    }
    ws.onclose = () => { if (syncActiveRef.current) setTimeout(connectSync, 2000) }
  }, [])

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

  // Detect when current client loses control of a session
  useEffect(() => {
    for (const [sessionId, currentLock] of Object.entries(inputLocks)) {
      const prevLock = prevLocksRef.current[sessionId]
      // If we had the lock and now we don't (someone else took it)
      if (prevLock === clientId.current && currentLock !== clientId.current && currentLock !== null) {
        showNotification(`Session control lost to another browser with Session ID: ${currentLock.split('-').pop()}`)
      }
    }
    prevLocksRef.current = { ...inputLocks }
  }, [inputLocks])

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      Object.values(dataReceivedTimeoutsRef.current).forEach(timeout => clearTimeout(timeout))
    }
  }, [])

  // Set active session on first available
  useEffect(() => {
    if (sessions.length > 0 && !activeSessionId) {
      setActiveSessionId(sessions[0].id)
    }
  }, [sessions, activeSessionId])



  async function checkAuthStatus() {
    try {
      const res = await fetch('/api/auth-status')
      const data = (await res.json()) as AuthState
      setAuthDisabled(data.authDisabled)
      setPasskeyLoginAvailable(data.passkeyLoginAvailable ?? false)
      if (data.authDisabled && data.showAuthDisabledWarning) {
        setShowAuthDisabledWarning(true)
      }
      if (data.authenticated) {
        setAuthStatus('authenticated')
      } else {
        setAuthStatus('unauthenticated')
      }
    } catch (err) {
      console.error('Auth check failed:', err)
      setAuthStatus('unauthenticated')
    }
  }

  async function createSession() {
    setLoading(true)
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: clientId.current }),
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
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setAuthError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })

      const data = (await res.json()) as AuthState

      if (!res.ok) {
        setAuthError('Invalid password')
        return
      }

      if (data.authenticated) {
        setPassword('')
        setAuthStatus('authenticated')
      } else if (data.requiresPasskey && !data.requiresTOTP) {
        setPassword('')
        setCanChoose2FA(false)
        setAuthStatus('passkey-verify')
      } else if (data.canChoose) {
        setPassword('')
        setCanChoose2FA(true)
        setAuthStatus('totp-verify')
      } else if (data.requiresTOTP) {
        setPassword('')
        setCanChoose2FA(false)
        if (data.totpMode === 'setup') {
          setAuthStatus('totp-setup')
          // Fetch QR code
          await fetchTotpQr()
        } else if (data.totpMode === 'verify') {
          setAuthStatus('totp-verify')
        }
      }
    } catch (err) {
      setAuthError('Login failed')
      console.error('Login error:', err)
    } finally {
      setLoading(false)
    }
  }

  async function fetchTotpQr() {
    try {
      const res = await fetch('/api/auth/2fa/qr', { credentials: 'include' })
      if (res.ok) {
        const data = (await res.json()) as { dataUrl: string }
        setTotpQrDataUrl(data.dataUrl)
        setTotpManualKey(null) // HIGH-3: Secret is no longer returned to client
      } else {
        setAuthError('Failed to generate QR code')
      }
    } catch (err) {
      setAuthError('Failed to fetch QR code')
      console.error('QR fetch error:', err)
    }
  }

  async function handleStandalonePasskeyLogin() {
    setPasskeyError('')
    setPasskeyLoading(true)

    try {
      const { startAuthentication } = await import('@simplewebauthn/browser')

      // Get options from server
      const optionsRes = await fetch('/api/auth/passkey/standalone/options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      if (!optionsRes.ok) {
        const errorData = (await optionsRes.json()) as { error: string }
        setPasskeyError(errorData.error || 'Failed to get passkey options')
        return
      }

      const optionsData = (await optionsRes.json()) as any
      const nonce = optionsData.nonce

      // Build options object with only the fields WebAuthn spec expects
      const optionsJSON = {
        challenge: optionsData.challenge,
        rpId: optionsData.rpId,
        allowCredentials: optionsData.allowCredentials,
        timeout: optionsData.timeout,
        userVerification: optionsData.userVerification,
      }

      // Start authentication with browser
      // Note: simplewebauthn v13 has a known issue with warning about incorrect call structure
      // even though the call is correct and succeeds. Suppress console warnings temporarily.
      const originalWarn = console.warn
      console.warn = (...args) => {
        if (typeof args[0] === 'string' && args[0].includes('startAuthentication')) {
          return // Suppress simplewebauthn warning
        }
        originalWarn.apply(console, args)
      }

      let assertion
      try {
        assertion = await startAuthentication({ optionsJSON })
      } finally {
        console.warn = originalWarn
      }

      // Verify with server
      const verifyRes = await fetch('/api/auth/passkey/standalone/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response: assertion, nonce }),
      })

      if (!verifyRes.ok) {
        const errorData = (await verifyRes.json()) as { error: string }
        setPasskeyError(errorData.error || 'Passkey verification failed')
        return
      }

      // Success - set authenticated status
      setAuthStatus('authenticated')
    } catch (err) {
      // Suppress NotAllowedError (user cancelled) from console and UI
      if (err instanceof Error && err.name === 'NotAllowedError') {
        setPasskeyError('')
      } else {
        const message = err instanceof Error ? err.message : 'Passkey authentication failed'
        setPasskeyError(message)
        console.error('Passkey login error:', err)
      }
    } finally {
      setPasskeyLoading(false)
    }
  }

  function handleTotpDigitChange(index: number, value: string) {
    // Only allow digits
    const digit = value.replace(/\D/g, '').slice(0, 1)
    const newDigits = [...totpDigits]
    newDigits[index] = digit

    setTotpDigits(newDigits)

    // Auto-focus next field if digit entered
    if (digit && index < 5) {
      totpInputRefs.current[index + 1]?.focus()
    }

    // Auto-submit if all digits filled - pass the complete code
    if (digit && newDigits.every(d => d !== '')) {
      const completeCode = newDigits.join('')
      if (authStatus === 'totp-setup') {
        handleTotpSetup(completeCode)
      } else if (authStatus === 'totp-verify') {
        handleTotpVerify(completeCode)
      }
    }
  }

  function handleTotpDigitKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !totpDigits[index] && index > 0) {
      totpInputRefs.current[index - 1]?.focus()
    }
  }

  async function handleTotpSetup(codeOrEvent: any) {
    // Handle both direct code string and event object for manual submit
    const code = typeof codeOrEvent === 'string' ? codeOrEvent : getTotpCode()
    codeOrEvent?.preventDefault?.()
    setAuthError('')
    setTotpLoading(true)

    try {
      // HIGH-3: Don't send secret to server (it's stored server-side)
      const body: { code: string } = { code }

      const res = await fetch('/api/auth/2fa/setup', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const data = (await res.json()) as { success?: boolean; error?: string }

      if (!res.ok) {
        setAuthError(data.error || 'Failed to setup 2FA')
        setTotpDigits(['', '', '', '', '', ''])
        totpInputRefs.current[0]?.focus()
        setTotpLoading(false)
        return
      }

      setTotpDigits(['', '', '', '', '', ''])
      setTotpQrDataUrl('')
      setTotpManualKey('')
      setAuthStatus('authenticated')
    } catch (err) {
      console.error('[TOTP] Setup error:', err)
      setAuthError('Setup failed')
      setTotpLoading(false)
    }
  }

  async function handleTotpVerify(codeOrEvent: any) {
    // Handle both direct code string and event object for manual submit
    const code = typeof codeOrEvent === 'string' ? codeOrEvent : getTotpCode()
    codeOrEvent?.preventDefault?.()
    setAuthError('')
    setTotpLoading(true)

    try {
      const res = await fetch('/api/auth/2fa/verify', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })

      const data = (await res.json()) as { authenticated?: boolean; error?: string }

      if (!res.ok) {
        setAuthError(data.error || 'Invalid code')
        setTotpDigits(['', '', '', '', '', ''])
        totpInputRefs.current[0]?.focus()
        setTotpLoading(false)
        return
      }

      setTotpDigits(['', '', '', '', '', ''])
      setAuthStatus('authenticated')
    } catch (err) {
      console.error('[TOTP] Verify error:', err)
      setAuthError('Verification failed')
      setTotpLoading(false)
    }
  }

  async function handlePasskeyAuth() {
    setPasskeyError('')
    setPasskeyLoading(true)

    try {
      const { startAuthentication } = await import('@simplewebauthn/browser')

      // Get authentication options
      const optRes = await fetch('/api/auth/passkey/auth/options', {
        method: 'POST',
        credentials: 'include',
      })

      if (!optRes.ok) {
        setPasskeyError('Failed to start authentication')
        return
      }

      const optionsJSON = await optRes.json()

      // Start authentication
      const assertion = await startAuthentication(optionsJSON)

      // Verify authentication
      const verRes = await fetch('/api/auth/passkey/auth/verify', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response: assertion }),
      })

      if (!verRes.ok) {
        const error = await verRes.json() as { error?: string }
        setPasskeyError(error.error || 'Authentication failed')
        return
      }

      setAuthStatus('authenticated')
    } catch (err: any) {
      // NotAllowedError = user cancelled
      if (err.name === 'NotAllowedError') {
        setPasskeyError('Authentication cancelled')
      } else {
        setPasskeyError('Authentication failed')
        console.error('[Passkey] Auth error:', err)
      }
    } finally {
      setPasskeyLoading(false)
    }
  }


  async function handleShowProcessInfo() {
    if (!activeSessionId) return
    setProcessInfoLoading(true)
    try {
      const res = await fetch(`/api/sessions/${activeSessionId}/info`)
      if (res.ok) {
        const info = (await res.json()) as any
        setProcessInfo(info)
        setShowProcessInfo(true)
      }
    } catch (err) {
      console.error('Failed to fetch process info:', err)
    } finally {
      setProcessInfoLoading(false)
    }
  }

  async function handleLogout() {
    try {
      await fetch('/api/auth', { method: 'DELETE' })
      setAuthStatus('unauthenticated')
      setSessions([])
      setActiveSessionId(null)
    } catch (err) {
      console.error('Logout failed:', err)
    }
  }


  async function handleRenameSession(sessionId: string, newLabel: string) {
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
  }

  async function handleCloseSession(sessionId: string) {
    try {
      await fetch(`/api/sessions/${sessionId}`, { method: 'DELETE' })
      setSessions((prev) => prev.filter((s) => s.id !== sessionId))
      if (activeSessionId === sessionId) {
        setActiveSessionId(sessions.find((s) => s.id !== sessionId)?.id ?? null)
      }
    } catch (err) {
      console.error('Failed to close session:', err)
    }
  }

  async function handleCloseAllSessions() {
    try {
      await Promise.all(sessions.map((s) => fetch(`/api/sessions/${s.id}`, { method: 'DELETE' })))
      setSessions([])
      setActiveSessionId(null)
    } catch (err) {
      console.error('Failed to close all sessions:', err)
    }
  }

  // Loading state
  if (authStatus === 'loading') {
    return (
      <div className="flex items-center justify-center w-full h-screen bg-background text-foreground">
        <div className="text-center">
          <div className="mb-4 inline-block">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-border border-t-primary" />
          </div>
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  // Login state
  if (authStatus === 'unauthenticated') {
    return (
      <div className="flex flex-col items-center justify-center w-full h-screen bg-background text-foreground">
        <div className="w-full max-w-sm px-6 -mt-24">
          <div className="flex flex-col items-center mb-4">
            <WebTerminalLogo />
          </div>

          <div className="rounded-lg border border-border bg-card p-6 space-y-4">
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">Enter your session password to continue</p>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleLogin(e)
                  }}
                  placeholder="Enter password..."
                  className="w-full rounded-md border border-input bg-background px-3 py-2 pr-10 text-sm outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-ring/50 focus:ring-[3px]"
                  disabled={loading}
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {authError && (
                <div className="rounded-md bg-destructive/10 border border-destructive/30 p-3">
                  <p className="text-xs text-destructive">{authError}</p>
                </div>
              )}
              <Button
                className="w-full"
                disabled={!password.trim() || loading || passkeyLoading}
                onClick={handleLogin}
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Verifying...
                  </>
                ) : (
                  'Continue'
                )}
              </Button>
              {passkeyLoginAvailable && (
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={loading || passkeyLoading}
                  onClick={handleStandalonePasskeyLogin}
                >
                  {passkeyLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Authenticating...
                    </>
                  ) : (
                    <>
                      <KeyRound className="h-4 w-4 mr-2" />
                      Sign in with Passkey
                    </>
                  )}
                </Button>
              )}
              {passkeyError && (
                <div className="rounded-md bg-destructive/10 border border-destructive/30 p-3">
                  <p className="text-xs text-destructive">{passkeyError}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // TOTP setup state
  if (authStatus === 'totp-setup') {
    return (
      <div className="flex flex-col items-center justify-center w-full h-screen bg-background text-foreground">
        <div className="w-full max-w-sm px-6 -mt-24">
          <div className="flex flex-col items-center mb-4">
            <WebTerminalLogo />
          </div>

          <div className="rounded-lg border border-border bg-card p-6 space-y-4">
            <div className="space-y-3">
              <p className="text-sm font-medium">Setup Two-Factor Authentication</p>
              <p className="text-xs text-muted-foreground">Scan the QR code with your authenticator app</p>

              {totpQrDataUrl && (
                <div className="flex justify-center">
                  <img src={totpQrDataUrl} alt="TOTP QR Code" className="border border-border rounded-md p-2 bg-white dark:bg-slate-900" />
                </div>
              )}

              {totpManualKey && (
                <div className="space-y-1">
                  <button
                    type="button"
                    onClick={() => setShowTotpManualKey(!showTotpManualKey)}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    {showTotpManualKey ? 'Hide' : 'Or enter manually'}
                  </button>
                  {showTotpManualKey && (
                    <div className="px-3 py-2 rounded border border-border bg-muted/50 font-mono text-sm break-all text-center">
                      {totpManualKey}
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-3 pt-2">
                <label className="text-xs font-medium block">Enter 6-digit code</label>
                <div className="flex justify-center gap-2">
                  {totpDigits.map((digit, index) => (
                    <input
                      key={index}
                      ref={(el) => {
                        totpInputRefs.current[index] = el
                      }}
                      type="text"
                      inputMode="numeric"
                      value={digit}
                      onChange={(e) => handleTotpDigitChange(index, e.target.value)}
                      onKeyDown={(e) => handleTotpDigitKeyDown(index, e)}
                      maxLength={1}
                      className="w-10 h-10 rounded-md border border-input bg-background text-sm font-semibold text-center outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-ring/50 focus:ring-[2px]"
                      disabled={totpLoading}
                      autoFocus={index === 0}
                    />
                  ))}
                </div>
              </div>

              {authError && (
                <div className="rounded-md bg-destructive/10 border border-destructive/30 p-3 mt-3">
                  <p className="text-xs text-destructive">{authError}</p>
                </div>
              )}

              {totpLoading && (
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground mt-3">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Verifying...
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // TOTP verify state
  if (authStatus === 'totp-verify') {
    return (
      <div className="flex flex-col items-center justify-center w-full h-screen bg-background text-foreground">
        <div className="w-full max-w-sm px-6 -mt-24">
          <div className="flex flex-col items-center mb-4">
            <WebTerminalLogo />
          </div>

          <div className="rounded-lg border border-border bg-card p-6 space-y-4">
            <div className="space-y-3">
              <p className="text-sm font-medium">Enter Verification Code</p>
              <p className="text-xs text-muted-foreground">Enter the 6-digit code from your authenticator app</p>

              <div className="space-y-3 pt-4">
                <div className="flex justify-center gap-2">
                  {totpDigits.map((digit, index) => (
                    <input
                      key={index}
                      ref={(el) => {
                        totpInputRefs.current[index] = el
                      }}
                      type="text"
                      inputMode="numeric"
                      value={digit}
                      onChange={(e) => handleTotpDigitChange(index, e.target.value)}
                      onKeyDown={(e) => handleTotpDigitKeyDown(index, e)}
                      maxLength={1}
                      className="w-10 h-10 rounded-md border border-input bg-background text-sm font-semibold text-center outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-ring/50 focus:ring-[2px]"
                      disabled={totpLoading}
                      autoFocus={index === 0}
                    />
                  ))}
                </div>
              </div>

              {authError && (
                <div className="rounded-md bg-destructive/10 border border-destructive/30 p-3 mt-3">
                  <p className="text-xs text-destructive">{authError}</p>
                </div>
              )}

              {totpLoading && (
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground mt-3">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Verifying...
                </div>
              )}

              {canChoose2FA && (
                <div className="pt-2 border-t border-border/50">
                  <p className="text-xs text-muted-foreground text-center mb-3">or</p>
                  <Button
                    className="w-full"
                    disabled={passkeyLoading}
                    onClick={handlePasskeyAuth}
                  >
                    {passkeyLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Waiting...
                      </>
                    ) : (
                      <>
                        <Smartphone className="h-4 w-4 mr-2" />
                        Use Passkey
                      </>
                    )}
                  </Button>
                  {passkeyError && (
                    <div className="rounded-md bg-destructive/10 border border-destructive/30 p-3 mt-3">
                      <p className="text-xs text-destructive">{passkeyError}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Passkey verify state
  if (authStatus === 'passkey-verify') {
    return (
      <div className="flex flex-col items-center justify-center w-full h-screen bg-background text-foreground">
        <div className="w-full max-w-sm px-6 -mt-24">
          <div className="flex flex-col items-center mb-4">
            <WebTerminalLogo />
          </div>

          <div className="rounded-lg border border-border bg-card p-6 space-y-4">
            <div className="space-y-3">
              <p className="text-sm font-medium">Verify with Passkey</p>
              <p className="text-xs text-muted-foreground">Use your fingerprint, face, or security key to continue</p>

              <Button
                className="w-full"
                disabled={passkeyLoading}
                onClick={handlePasskeyAuth}
              >
                {passkeyLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Waiting...
                  </>
                ) : (
                  <>
                    <Smartphone className="h-4 w-4 mr-2" />
                    Continue with Passkey
                  </>
                )}
              </Button>

              {passkeyError && (
                <div className="rounded-md bg-destructive/10 border border-destructive/30 p-3">
                  <p className="text-xs text-destructive">{passkeyError}</p>
                </div>
              )}

              {canChoose2FA && (
                <div className="pt-2 border-t border-border/50">
                  <p className="text-xs text-muted-foreground text-center mb-3">or</p>
                  <Button
                    className="w-full"
                    onClick={() => setAuthStatus('totp-verify')}
                  >
                    Use Authenticator App
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Calculate keyboard height for iOS Safari fix
  const keyboardHeight = Math.max(0, window.innerHeight - (viewportHeight ?? window.innerHeight))
  const keyboardVisible = keyboardHeight > 0

  // Toolbar height only on mobile when a session is active and keyboard is visible
  const TOOLBAR_HEIGHT = isMobile && activeSessionId && keyboardVisible ? 44 : 0

  // Main app
  return (
    <div style={{ height: viewportHeight ? `${viewportHeight}px` : '100dvh' }} className="flex flex-col w-full bg-background text-foreground">
      {/* Auth disabled warning */}
      {showAuthDisabledWarning && (
        <div className="px-4 py-2 bg-amber-400/40 border-b border-amber-600/50 text-sm text-black dark:text-black text-center animate-pulse">
          ⚠️ Authentication is disabled
        </div>
      )}

      {/* Toast notifications */}
      <Toaster position="bottom-right" />

      {/* Locked Session Dialog */}
      {showLockedDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowLockedDialog(null)} />
          <div className="relative bg-card border border-border rounded-lg p-6 shadow-lg max-w-sm mx-4">
            <h2 className="text-lg font-semibold mb-2">Session In Use</h2>
            <p className="text-sm text-muted-foreground mb-6">
              This session is currently being used by another client. Would you like to take control?
            </p>
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowLockedDialog(null)}
              >
                Cancel
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={() => {
                  if (showLockedDialog) {
                    handleTakeControl(showLockedDialog)
                  }
                  setShowLockedDialog(null)
                }}
              >
                Take Control
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile menu sidebar — full-screen drawer */}
      {isMobile && mobileMenuOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMobileMenuOpen(false)} />
          <div className="fixed inset-0 z-50 flex flex-col bg-sidebar">
            {/* Header */}
            <div className="px-4 py-3 border-b border-border">
              <h2 className="text-lg font-semibold">Menu</h2>
            </div>

            {/* Menu items */}
            <div className="flex-1 overflow-y-auto flex flex-col gap-2 p-4">
              {authStatus === 'authenticated' && activeSessionId && (
                <button
                  type="button"
                  onClick={() => {
                    handleShowProcessInfo()
                    setMobileMenuOpen(false)
                  }}
                  className="w-full px-4 py-3 text-left rounded-md bg-muted/30 hover:bg-muted transition-colors flex items-center gap-3">
                  <Info className="h-5 w-5 flex-shrink-0" />
                  <span className="text-base">Session Info</span>
                </button>
              )}
              {authStatus === 'authenticated' && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setShowUpload(true)
                      setMobileMenuOpen(false)
                    }}
                    className="w-full px-4 py-3 text-left rounded-md bg-muted/30 hover:bg-muted transition-colors flex items-center gap-3">
                    <Upload className="h-5 w-5 flex-shrink-0" />
                    <span className="text-base">Upload Files</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowDownload(true)
                      setMobileMenuOpen(false)
                    }}
                    className="w-full px-4 py-3 text-left rounded-md bg-muted/30 hover:bg-muted transition-colors flex items-center gap-3">
                    <FolderOpen className="h-5 w-5 flex-shrink-0" />
                    <span className="text-base">Explorer</span>
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => {
                  setShowPasswordDialog(true)
                  setMobileMenuOpen(false)
                }}
                className="w-full px-4 py-3 text-left rounded-md bg-muted/30 hover:bg-muted transition-colors flex items-center gap-3">
                <KeyRound className="h-5 w-5 flex-shrink-0" />
                <span className="text-base">Authentication</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowSettings(true)
                  setMobileMenuOpen(false)
                }}
                className="w-full px-4 py-3 text-left rounded-md bg-muted/30 hover:bg-muted transition-colors flex items-center gap-3">
                <Settings className="h-5 w-5 flex-shrink-0" />
                <span className="text-base">Settings</span>
              </button>
              {!authDisabled && (
                <button
                  type="button"
                  onClick={() => {
                    handleLogout()
                    setMobileMenuOpen(false)
                  }}
                  className="w-full px-4 py-3 text-left rounded-md bg-destructive/10 hover:bg-destructive/20 transition-colors flex items-center gap-3 text-destructive">
                  <LogOut className="h-5 w-5 flex-shrink-0" />
                  <span className="text-base">Logout</span>
                </button>
              )}
            </div>

            {/* Footer with close button */}
            <div className="border-t border-border px-4 py-3 flex justify-end">
              <Button
                variant="ghost"
                size="icon"
                title="Close menu"
                onClick={() => setMobileMenuOpen(false)}
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </>
      )}

      <div className="flex flex-1 w-full overflow-hidden z-10">
        {/* Sidebar — on desktop, always visible; on mobile, drawer overlay */}
        {!isMobile && (
        <SessionsSidebar
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSelectSession={setActiveSessionId}
          onNewSession={createSession}
          onCloseSession={handleCloseSession}
          onRenameSession={handleRenameSession}
          onCloseAllSessions={handleCloseAllSessions}
          loading={loading}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => {
            setSidebarCollapsed(!sidebarCollapsed)
            if (sidebarCollapsed) {
              setSidebarWidth(192)
            }
          }}
          width={sidebarWidth}
          onWidthChange={setSidebarWidth}
          inputLocks={inputLocks}
          clientId={clientId.current}
          onTakeControl={handleTakeControl}
          dataReceivedSessions={dataReceivedSessions}
        />
        )}

        {/* Mobile sidebar drawer */}
        {isMobile && (
        <SessionsSidebar
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSelectSession={setActiveSessionId}
          onNewSession={() => { createSession(); setSidebarMobileOpen(false) }}
          onCloseSession={handleCloseSession}
          onRenameSession={handleRenameSession}
          onCloseAllSessions={handleCloseAllSessions}
          loading={loading}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => {
            setSidebarCollapsed(!sidebarCollapsed)
            if (sidebarCollapsed) {
              setSidebarWidth(192)
            }
          }}
          width={sidebarWidth}
          onWidthChange={setSidebarWidth}
          inputLocks={inputLocks}
          clientId={clientId.current}
          onTakeControl={handleTakeControl}
          dataReceivedSessions={dataReceivedSessions}
          mobileOpen={sidebarMobileOpen}
          onMobileClose={() => setSidebarMobileOpen(false)}
        />
        )}

      {/* Main content */}
      <div className="flex-1 flex flex-col">
        {/* Top bar */}
        <div className="border-b border-border bg-card px-4 py-2 flex items-center gap-2 relative z-40">
          {/* Hamburger — mobile only */}
          <button
            className="md:hidden p-2 rounded transition-colors hover:bg-accent"
            onClick={() => setSidebarMobileOpen(true)}
            type="button"
            title="Open sidebar">
            <Menu className="h-5 w-5" />
          </button>

          {/* Logo */}
          <WebTerminalLogo size="sm" />

          {/* Active session name and lock indicator */}
          {activeSessionId && sessions.length > 0 && (
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-foreground">
                {sessions.find(s => s.id === activeSessionId)?.label}
              </p>
              {inputLocks[activeSessionId] && inputLocks[activeSessionId] !== clientId.current && (
                <button
                  onClick={() => setShowLockedDialog(activeSessionId)}
                  className={`rounded hover:bg-red-500/20 transition-colors ${
                    isMobile ? 'p-2' : 'p-1.5'
                  }`}
                  title="Read-only: another client has control"
                >
                  <Ban className={`text-red-500 flex-shrink-0 ${
                    isMobile ? 'h-6 w-6' : 'h-4 w-4'
                  }`} />
                </button>
              )}
            </div>
          )}

          {/* Spacer to push menu button right on mobile */}
          <div className="flex-1" />

          {/* Desktop buttons (hidden on mobile) — only show on desktop or non-fullscreen */}
          {!isMobile && (
          <div className="flex items-center gap-2">
            {authStatus === 'authenticated' && activeSessionId && !isMobile && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleShowProcessInfo}
                disabled={processInfoLoading}
                className="[&_svg]:size-4"
                title="Session info"
              >
                <Info className="h-4 w-4" />
              </Button>
            )}
            {authStatus === 'authenticated' && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowUpload(true)}
                  className="[&_svg]:size-4"
                  title="Upload files"
                >
                  <Upload className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowDownload(true)}
                  className="[&_svg]:size-4"
                  title="Browse & Download"
                >
                  <FolderOpen className="h-4 w-4" />
                </Button>
              </>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowPasswordDialog(true)}
              className="[&_svg]:size-4"
              title="Session Password"
            >
              <KeyRound className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowSettings(true)}
              className="[&_svg]:size-4"
              title="Settings"
            >
              <Settings className="h-4 w-4" />
            </Button>
            {!authDisabled && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleLogout}
                className="[&_svg]:size-4"
              >
                <LogOut className="mr-2" />
                Logout
              </Button>
            )}
          </div>
          )}

          {/* Dialogs & info popup — always mounted so mobile menu can open them */}
          <PasswordDialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog} />
          <SettingsDialog
            open={showSettings}
            onOpenChange={setShowSettings}
            fontSize={fontSize}
            onFontSizeChange={handleFontSizeChange}
          />
          <UploadDialog open={showUpload} onOpenChange={setShowUpload} />
          <DownloadDialog open={showDownload} onOpenChange={setShowDownload} />

          {/* Info popup — works on both desktop and mobile */}
          {showProcessInfo && processInfo && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowProcessInfo(false)} />
              <div className="fixed top-16 right-4 z-50 bg-card border border-border rounded-lg shadow-lg w-80 max-sm:w-[calc(100%-2rem)]" onClick={(e) => e.stopPropagation()}>
                <div className="p-3 space-y-2">
                  <div className="flex justify-between items-center pb-2 border-b border-border/50">
                    <span className="text-xs font-medium font-mono text-muted-foreground">PID</span>
                    <span className="text-xs font-mono font-bold">{processInfo.pid}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-medium font-mono text-muted-foreground">Memory</span>
                    <span className="text-xs font-mono font-bold">{processInfo.memory}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-medium font-mono text-muted-foreground">CPU</span>
                    <span className="text-xs font-mono font-bold">{processInfo.cpu.toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-medium font-mono text-muted-foreground">Uptime</span>
                    <span className="text-xs font-mono font-bold">{processInfo.uptime}</span>
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t border-border/50">
                    <span className="text-xs font-medium font-mono text-muted-foreground">Started</span>
                    <span className="text-xs font-mono font-bold text-right">{new Date(processInfo.startedAt).toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Mobile ⋯ menu button — only trigger stays in top bar */}
          {isMobile && (
            <button
              type="button"
              className="p-2 hover:bg-accent rounded transition-colors"
              onClick={() => setMobileMenuOpen(v => !v)}
              title="More options">
              <MoreHorizontal className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* Hidden input to keep keyboard alive on mobile */}
        {isMobile && (
          <input
            ref={hiddenInputRef}
            type="text"
            style={{ position: 'absolute', left: '-9999px', width: '1px', height: '1px' }}
            aria-hidden="true"
            tabIndex={-1}
          />
        )}

        {/* Terminal panes container */}
        <div
          className={
            isMobile && activeSessionId
              ? "fixed inset-x-0 top-[44px] z-30 overflow-hidden"
              : "flex-1 relative overflow-hidden"
          }
          style={isMobile && activeSessionId ? { bottom: `${keyboardHeight + TOOLBAR_HEIGHT}px`, paddingTop: '8px' } : undefined}
          data-terminal-active={activeSessionId || undefined}
        >
          {sessions.map((session) => (
            <TerminalPane
              ref={getTerminalRef(session.id)}
              key={session.id}
              sessionId={session.id}
              isActive={activeSessionId === session.id}
              clientId={clientId.current}
              lockHeldBy={inputLocks[session.id] ?? null}
              scrollbackLines={scrollbackLines}
              fontSize={fontSize}
              onReadOnlyInput={(lockHeldBy) => {
                const message = lockHeldBy
                  ? `Terminal locked by another browser with Session ID: ${lockHeldBy.split('-').pop()}`
                  : 'Terminal locked by another browser'
                showNotification(message)
              }}
            />
          ))}
        </div>

        {/* Mobile keyboard toolbar */}
        {isMobile && activeSessionId && keyboardVisible && (
          <MobileKeyToolbar
            onKey={sendToActiveTerminal}
            keyboardHeight={keyboardHeight}
            isShiftPressed={isShiftPressed}
            onCopy={handleCopy}
            onSelectAll={handleSelectAll}
            onPaste={handlePaste}
          />
        )}
      </div>
      </div>

    </div>
  )
}
