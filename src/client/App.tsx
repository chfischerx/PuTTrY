import { useState, useRef, useCallback } from 'react'
import { GuestLandingScreen } from '@/components/GuestLandingScreen'
import { AuthScreens } from '@/components/auth/AuthScreens'
import { TerminalPage } from '@/components/TerminalPage'
import { getClientId } from '@/lib/clientId'
import { useAuth } from '@/hooks/useAuth'
import { useSync } from '@/hooks/useSync'
import { useGuestMode } from '@/hooks/useGuestMode'
import { useInputLocks } from '@/hooks/useInputLocks'
import { useMobileLayout } from '@/hooks/useMobileLayout'
import { useTerminal } from '@/hooks/useTerminal'

export default function App() {
  const clientId = useRef(getClientId())

  // Auth hook
  const auth = useAuth()

  // Sync hook (needs setAuthStatus from auth)
  const sync = useSync({
    authStatus: auth.authStatus,
    isGuestMode: auth.isGuestMode,
    clientId: clientId.current,
    setAuthStatus: auth.setAuthStatus,
  })

  // Guest mode hook
  const { guestLinks, setGuestLinks } = useGuestMode({
    authStatus: auth.authStatus,
    isGuestMode: auth.isGuestMode,
  })

  // Terminal hook
  const terminal = useTerminal({
    activeSessionId: sync.activeSessionId,
  })

  // Mobile layout hook
  const layout = useMobileLayout({
    activeSessionId: sync.activeSessionId,
    terminalRefs: terminal.terminalRefs,
    hiddenInputRef: terminal.hiddenInputRef,
    isGuestMode: auth.isGuestMode,
  })

  // Input locks hook
  const locks = useInputLocks({
    inputLocks: sync.inputLocks,
    clientId: clientId.current,
    isGuestMode: auth.isGuestMode,
    guestLinks,
  })

  // Local dialog state
  const [showUpload, setShowUpload] = useState(false)
  const [showDownload, setShowDownload] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showGuestPanel, setShowGuestPanel] = useState(false)
  const [showProcessInfo, setShowProcessInfo] = useState(false)
  const [processInfo, setProcessInfo] = useState<any>(null)
  const [processInfoLoading, setProcessInfoLoading] = useState(false)

  const handleShowProcessInfo = useCallback(async () => {
    if (!sync.activeSessionId) return
    setProcessInfoLoading(true)
    try {
      const res = await fetch(`/api/sessions/${sync.activeSessionId}/info`)
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
  }, [sync.activeSessionId])

  // Guest landing route
  const guestTokenMatch = window.location.pathname.match(/^\/guest\/([a-f0-9]+)$/)
  if (guestTokenMatch) {
    return <GuestLandingScreen token={guestTokenMatch[1]} />
  }

  // Auth screens
  if (auth.authStatus !== 'authenticated') {
    return (
      <AuthScreens
        authStatus={auth.authStatus}
        password={auth.password}
        setPassword={auth.setPassword}
        showPassword={auth.showPassword}
        setShowPassword={auth.setShowPassword}
        authError={auth.authError}
        loading={sync.loading}
        handleLogin={auth.handleLogin}
        passkeyLoginAvailable={auth.passkeyLoginAvailable}
        passkeyLoading={auth.passkeyLoading}
        passkeyError={auth.passkeyError}
        handleStandalonePasskeyLogin={auth.handleStandalonePasskeyLogin}
        totpDigits={auth.totpDigits}
        totpInputRefs={auth.totpInputRefs}
        totpQrDataUrl={auth.totpQrDataUrl}
        totpLoading={auth.totpLoading}
        handleTotpDigitChange={auth.handleTotpDigitChange}
        handleTotpDigitKeyDown={auth.handleTotpDigitKeyDown}
        handleTotpSetup={auth.handleTotpSetup}
        handleTotpVerify={auth.handleTotpVerify}
        canChoose2FA={auth.canChoose2FA}
        handlePasskeyAuth={auth.handlePasskeyAuth}
        setAuthStatus={auth.setAuthStatus}
      />
    )
  }

  // Main app
  return (
    <TerminalPage
      auth={auth}
      sync={sync}
      layout={layout}
      terminal={terminal}
      locks={locks}
      guestLinks={guestLinks}
      setGuestLinks={setGuestLinks}
      clientId={clientId.current}
      showUpload={showUpload}
      setShowUpload={setShowUpload}
      showDownload={showDownload}
      setShowDownload={setShowDownload}
      showSettings={showSettings}
      setShowSettings={setShowSettings}
      showGuestPanel={showGuestPanel}
      setShowGuestPanel={setShowGuestPanel}
      showProcessInfo={showProcessInfo}
      setShowProcessInfo={setShowProcessInfo}
      processInfo={processInfo}
      processInfoLoading={processInfoLoading}
      handleShowProcessInfo={handleShowProcessInfo}
    />
  )
}
