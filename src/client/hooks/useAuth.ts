import { useState, useCallback, useEffect, useRef } from 'react'
import type { AuthStatus, AuthState } from '@shared/types/auth'

interface UseAuthReturn {
  authStatus: AuthStatus
  setAuthStatus: (status: AuthStatus) => void
  authDisabled: boolean
  authError: string
  setAuthError: (error: string) => void
  password: string
  setPassword: (password: string) => void
  showPassword: boolean
  setShowPassword: (show: boolean) => void
  totpDigits: string[]
  setTotpDigits: (digits: string[]) => void
  totpQrDataUrl: string
  setTotpQrDataUrl: (url: string) => void
  totpLoading: boolean
  setTotpLoading: (loading: boolean) => void
  totpInputRefs: React.MutableRefObject<(HTMLInputElement | null)[]>
  canChoose2FA: boolean
  setCanChoose2FA: (canChoose: boolean) => void
  passkeyLoading: boolean
  setPasskeyLoading: (loading: boolean) => void
  passkeyError: string
  setPasskeyError: (error: string) => void
  passkeyLoginAvailable: boolean
  setPasskeyLoginAvailable: (available: boolean) => void
  showAuthDisabledWarning: boolean
  setShowAuthDisabledWarning: (show: boolean) => void
  isGuestMode: boolean
  setIsGuestMode: (isGuest: boolean) => void
  checkAuthStatus: () => Promise<void>
  handleLogin: (e: React.FormEvent) => Promise<void>
  fetchTotpQr: () => Promise<void>
  handleTotpSetup: (codeOrEvent: any) => Promise<void>
  handleTotpVerify: (codeOrEvent: any) => Promise<void>
  handleTotpDigitChange: (index: number, value: string) => void
  handleTotpDigitKeyDown: (index: number, e: React.KeyboardEvent<HTMLInputElement>) => void
  handleStandalonePasskeyLogin: () => Promise<void>
  handlePasskeyAuth: () => Promise<void>
  handleLogout: () => Promise<void>
}

export function useAuth(): UseAuthReturn {
  // Basic auth state
  const [authStatus, setAuthStatus] = useState<AuthStatus>('loading')
  const [authDisabled, setAuthDisabled] = useState(false)
  const [authError, setAuthError] = useState<string>('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  // TOTP setup/verify state
  const [totpDigits, setTotpDigits] = useState<string[]>(['', '', '', '', '', ''])
  const [totpQrDataUrl, setTotpQrDataUrl] = useState('')
  const [totpLoading, setTotpLoading] = useState(false)
  const totpInputRefs = useRef<(HTMLInputElement | null)[]>([])

  const getTotpCode = () => totpDigits.join('')

  // Passkey state
  const [canChoose2FA, setCanChoose2FA] = useState(false)
  const [passkeyLoading, setPasskeyLoading] = useState(false)
  const [passkeyError, setPasskeyError] = useState('')
  const [passkeyLoginAvailable, setPasskeyLoginAvailable] = useState(false)

  // Auth disabled warning
  const [showAuthDisabledWarning, setShowAuthDisabledWarning] = useState(false)

  // Guest mode state
  const [isGuestMode, setIsGuestMode] = useState(false)

  // Auto-dismiss warning after 4 seconds
  useEffect(() => {
    if (!showAuthDisabledWarning) return
    const timer = setTimeout(() => setShowAuthDisabledWarning(false), 4000)
    return () => clearTimeout(timer)
  }, [showAuthDisabledWarning])

  // Check auth status on mount
  useEffect(() => {
    checkAuthStatus()
  }, [])

  const checkAuthStatus = useCallback(async () => {
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
        // Set guest mode if this is a guest session
        if (data.isGuest) {
          setIsGuestMode(true)
        }
      } else {
        setAuthStatus('unauthenticated')
      }
    } catch (err) {
      console.error('Auth check failed:', err)
      setAuthStatus('unauthenticated')
    }
  }, [])

  const handleLogin = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    setAuthError('')

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
    }
  }, [password])

  const fetchTotpQr = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/2fa/qr', { credentials: 'include' })
      if (res.ok) {
        const data = (await res.json()) as { dataUrl: string }
        setTotpQrDataUrl(data.dataUrl)
      } else {
        setAuthError('Failed to generate QR code')
      }
    } catch (err) {
      setAuthError('Failed to fetch QR code')
      console.error('QR fetch error:', err)
    }
  }, [])

  const handleStandalonePasskeyLogin = useCallback(async () => {
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
  }, [])

  const handleTotpDigitChange = useCallback((index: number, value: string) => {
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
  }, [totpDigits, authStatus])

  const handleTotpDigitKeyDown = useCallback((index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !totpDigits[index] && index > 0) {
      totpInputRefs.current[index - 1]?.focus()
    }
  }, [totpDigits])

  const handleTotpSetup = useCallback(async (codeOrEvent: any) => {
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
      setAuthStatus('authenticated')
    } catch (err) {
      console.error('[TOTP] Setup error:', err)
      setAuthError('Setup failed')
      setTotpLoading(false)
    }
  }, [totpDigits])

  const handleTotpVerify = useCallback(async (codeOrEvent: any) => {
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
  }, [totpDigits])

  const handlePasskeyAuth = useCallback(async () => {
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
  }, [])

  const handleLogout = useCallback(async () => {
    try {
      await fetch('/api/auth', { method: 'DELETE' })
      setAuthStatus('unauthenticated')
      setIsGuestMode(false)
    } catch (err) {
      console.error('Logout failed:', err)
    }
  }, [])

  return {
    authStatus,
    setAuthStatus,
    authDisabled,
    authError,
    setAuthError,
    password,
    setPassword,
    showPassword,
    setShowPassword,
    totpDigits,
    setTotpDigits,
    totpQrDataUrl,
    setTotpQrDataUrl,
    totpLoading,
    setTotpLoading,
    totpInputRefs,
    canChoose2FA,
    setCanChoose2FA,
    passkeyLoading,
    setPasskeyLoading,
    passkeyError,
    setPasskeyError,
    passkeyLoginAvailable,
    setPasskeyLoginAvailable,
    showAuthDisabledWarning,
    setShowAuthDisabledWarning,
    isGuestMode,
    setIsGuestMode,
    checkAuthStatus,
    handleLogin,
    fetchTotpQr,
    handleTotpSetup,
    handleTotpVerify,
    handleTotpDigitChange,
    handleTotpDigitKeyDown,
    handleStandalonePasskeyLogin,
    handlePasskeyAuth,
    handleLogout,
  }
}