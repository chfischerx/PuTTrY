import { Loader2, Eye, EyeOff, KeyRound, Smartphone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { WebTerminalLogo } from '@/components/WebTerminalLogo'
import type { AuthStatus } from '@shared/types/auth'

interface AuthScreensProps {
  authStatus: AuthStatus
  password: string
  setPassword: (password: string) => void
  showPassword: boolean
  setShowPassword: (show: boolean) => void
  authError: string
  loading: boolean
  handleLogin: (e: React.FormEvent) => Promise<void>
  passkeyLoginAvailable: boolean
  passkeyLoading: boolean
  passkeyError: string
  handleStandalonePasskeyLogin: () => Promise<void>
  totpDigits: string[]
  totpInputRefs: React.MutableRefObject<(HTMLInputElement | null)[]>
  totpQrDataUrl: string
  totpLoading: boolean
  handleTotpDigitChange: (index: number, value: string) => void
  handleTotpDigitKeyDown: (index: number, e: React.KeyboardEvent<HTMLInputElement>) => void
  handleTotpSetup: (e: React.FormEvent) => Promise<void>
  handleTotpVerify: (e: React.FormEvent) => Promise<void>
  canChoose2FA: boolean
  handlePasskeyAuth: () => Promise<void>
  setAuthStatus: (status: AuthStatus) => void
}

export function AuthScreens(props: AuthScreensProps) {
  const {
    authStatus,
    password,
    setPassword,
    showPassword,
    setShowPassword,
    authError,
    loading,
    handleLogin,
    passkeyLoginAvailable,
    passkeyLoading,
    passkeyError,
    handleStandalonePasskeyLogin,
    totpDigits,
    totpInputRefs,
    totpQrDataUrl,
    totpLoading,
    handleTotpDigitChange,
    handleTotpDigitKeyDown,
    canChoose2FA,
    handlePasskeyAuth,
    setAuthStatus,
  } = props

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
                    if (e.key === 'Enter') handleLogin(e as any)
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
                onClick={(e) => handleLogin(e as any)}
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

  return null
}
