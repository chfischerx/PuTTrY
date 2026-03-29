import { useState, useEffect, useRef } from 'react'
import { Eye, EyeOff, Loader2, Copy, Check, RotateCw, Plus, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose, DialogBody, DialogFooter } from '@/components/ui/dialog'
import { SettingRow, SettingSection } from '@/components/ui/settings'
import toast from 'react-hot-toast'

interface PasskeyInfo {
  id: string
  name: string
  counter: number
  registeredAt: string
  transports: string[]
}

interface PasswordSettings {
  SESSION_PASSWORD_TYPE: string
  SESSION_PASSWORD_LENGTH: number
  TOTP_ENABLED: boolean
}

interface PasswordDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function PasswordDialog({ open, onOpenChange }: PasswordDialogProps) {
  const [settings, setSettings] = useState<PasswordSettings | null>(null)
  const [pending, setPending] = useState<PasswordSettings | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [newPassword, setNewPassword] = useState<string | null>(null)
  const [isRotatingPassword, setIsRotatingPassword] = useState(false)
  const [copiedField, setCopiedField] = useState<'new' | null>(null)
  const [passkeys, setPasskeys] = useState<PasskeyInfo[]>([])
  const [passkeyLoading, setPasskeyLoading] = useState(false)
  const [passkeyError, setPasskeyError] = useState('')
  const [totpQrCode, setTotpQrCode] = useState<string | null>(null)
  const [totpManualKey, setTotpManualKey] = useState<string | null>(null)
  const [totpDigits, setTotpDigits] = useState<string[]>(['', '', '', '', '', ''])
  const [totpLoading, setTotpLoading] = useState(false)
  const [showManualKey, setShowManualKey] = useState(false)
  const [activeTab, setActiveTab] = useState<'password' | 'passkeys' | 'totp'>('password')
  const [customPassword, setCustomPassword] = useState('')
  const [showCustomPasswordForm, setShowCustomPasswordForm] = useState(false)
  const [isSettingPassword, setIsSettingPassword] = useState(false)
  const [showCustomPassword, setShowCustomPassword] = useState(false)
  const totpInputRefs = useRef<(HTMLInputElement | null)[]>([])

  // Fetch authentication settings and passkeys when dialog opens
  useEffect(() => {
    if (!open) return

    async function fetchData() {
      try {
        const [settingsRes, passkeysRes] = await Promise.all([
          fetch('/api/settings', { credentials: 'include' }),
          fetch('/api/auth/passkeys', { credentials: 'include' }),
        ])

        if (settingsRes.ok) {
          const data = (await settingsRes.json()) as PasswordSettings
          setSettings(data)
          setPending(data)
        }
        if (passkeysRes.ok) {
          const data = (await passkeysRes.json()) as PasskeyInfo[]
          setPasskeys(data)
        }
      } catch (err) {
        console.error('Failed to fetch settings:', err)
      }
    }

    fetchData()
  }, [open])

  // Clear state when dialog closes
  useEffect(() => {
    if (!open) {
      setSettings(null)
      setPending(null)
      setNewPassword(null)
      setShowNewPassword(false)
      setCopiedField(null)
    }
  }, [open])

  const saveSetting = async (key: string, value: any) => {
    const res = await fetch('/api/settings', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value: String(value) }),
    })
    if (res.ok) {
      const result = (await res.json()) as { success: boolean }
      if (result.success) {
        setSettings((prev) => (prev ? { ...prev, [key]: value } : null))
      }
    }
  }

  const isDirty =
    pending !== null &&
    settings !== null &&
    (Object.keys(pending) as (keyof PasswordSettings)[]).some(
      (key) => String(pending[key]) !== String(settings[key])
    )

  async function handleSaveAll() {
    if (!pending || !settings) return
    setIsSaving(true)
    try {
      for (const key of Object.keys(pending) as (keyof PasswordSettings)[]) {
        if (String(pending[key]) !== String(settings[key])) {
          await saveSetting(key, pending[key])
        }
      }
      toast.success('Settings saved')
    } catch (err) {
      console.error('Failed to save settings:', err)
      toast.error('Failed to save settings')
    } finally {
      setIsSaving(false)
    }
  }

  function handleDiscard() {
    setPending(settings)
  }

  function updatePending<K extends keyof PasswordSettings>(key: K, value: PasswordSettings[K]) {
    setPending((prev) => (prev ? { ...prev, [key]: value } : null))
  }

  async function handleRotatePassword() {
    setIsRotatingPassword(true)
    try {
      const res = await fetch('/api/auth/session-password/rotate', {
        method: 'POST',
        credentials: 'include',
      })
      if (res.ok) {
        const data = (await res.json()) as { password: string }
        setNewPassword(data.password)
        toast.success('Password rotated')
      }
    } catch (err) {
      console.error('Failed to rotate password:', err)
      toast.error('Failed to rotate password')
    } finally {
      setIsRotatingPassword(false)
    }
  }

  async function handleSetPassword() {
    if (!customPassword || customPassword.length === 0) {
      toast.error('Please enter a password')
      return
    }

    setIsSettingPassword(true)
    try {
      const res = await fetch('/api/auth/session-password/set', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: customPassword }),
      })

      if (res.ok) {
        setNewPassword(customPassword)
        setCustomPassword('')
        setShowCustomPasswordForm(false)
        setShowCustomPassword(false)
        toast.success('Password set successfully')
      } else {
        toast.error('Failed to set password')
      }
    } catch (err) {
      console.error('Failed to set password:', err)
      toast.error('Failed to set password')
    } finally {
      setIsSettingPassword(false)
    }
  }

  async function handleRegisterPasskey() {
    setPasskeyLoading(true)
    setPasskeyError('')
    try {
      const { startRegistration } = await import('@simplewebauthn/browser')

      const optRes = await fetch('/api/auth/passkey/register/options', { credentials: 'include' })
      if (!optRes.ok) {
        setPasskeyError('Failed to start registration')
        return
      }

      const optionsJSON = await optRes.json()
      const credential = await startRegistration({ optionsJSON })

      const name = window.prompt('Name this passkey (e.g. "iPhone Touch ID"):', '')
      if (!name) {
        setPasskeyLoading(false)
        return
      }

      const verRes = await fetch('/api/auth/passkey/register/verify', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response: credential, name }),
      })

      if (!verRes.ok) {
        const error = (await verRes.json()) as { error?: string }
        setPasskeyError(error.error || 'Registration failed')
        return
      }

      const passkeysRes = await fetch('/api/auth/passkeys', { credentials: 'include' })
      if (passkeysRes.ok) {
        const data = (await passkeysRes.json()) as PasskeyInfo[]
        setPasskeys(data)
      }
    } catch (err: any) {
      if (err.name === 'NotAllowedError') {
        setPasskeyError('Registration cancelled')
      } else {
        setPasskeyError('Registration failed')
        console.error('[Passkey] Registration error:', err)
      }
    } finally {
      setPasskeyLoading(false)
    }
  }

  async function handleDeletePasskey(id: string) {
    try {
      const res = await fetch(`/api/auth/passkey/${id}`, { method: 'DELETE', credentials: 'include' })
      if (res.ok) {
        setPasskeys((prev) => prev.filter((pk) => pk.id !== id))
      }
    } catch (err) {
      console.error('Failed to delete passkey:', err)
    }
  }

  async function handleEnableTOTP() {
    setTotpLoading(true)
    try {
      const res = await fetch('/api/auth/2fa/qr', { credentials: 'include' })
      if (res.ok) {
        const data = (await res.json()) as { dataUrl: string }
        setTotpQrCode(data.dataUrl)
        setTotpManualKey(null) // HIGH-3: Secret is no longer returned to client
        setTotpDigits(['', '', '', '', '', ''])
      } else {
        toast.error('Failed to generate QR code')
      }
    } catch (err) {
      console.error('Failed to enable TOTP:', err)
      toast.error('Failed to enable TOTP')
    } finally {
      setTotpLoading(false)
    }
  }

  function handleTotpDigitChange(index: number, value: string) {
    const newDigits = [...totpDigits]
    newDigits[index] = value.replace(/\D/g, '').slice(0, 1)
    setTotpDigits(newDigits)

    // Auto-focus next input after state updates
    if (newDigits[index] && index < 5) {
      setTimeout(() => {
        totpInputRefs.current[index + 1]?.focus()
      }, 0)
    }
  }

  function handleTotpDigitKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !totpDigits[index] && index > 0) {
      totpInputRefs.current[index - 1]?.focus()
    }
  }

  async function handleVerifyTOTP() {
    const totpSetupCode = totpDigits.join('')
    if (!totpSetupCode || totpSetupCode.length < 6) {
      toast.error('Please enter a 6-digit code')
      return
    }

    setTotpLoading(true)
    try {
      // HIGH-3: Don't send secret to server (it's stored server-side)
      const body: { code: string } = { code: totpSetupCode }

      const res = await fetch('/api/auth/2fa/setup', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (res.ok) {
        // Only save TOTP_ENABLED if it's not already enabled
        if (!pending?.TOTP_ENABLED) {
          await saveSetting('TOTP_ENABLED', true)
        }
        toast.success('2FA enabled successfully')
        setTotpQrCode(null)
        setTotpManualKey(null)
        setTotpDigits(['', '', '', '', '', ''])
        updatePending('TOTP_ENABLED', true)
      } else {
        const error = (await res.json()) as { error?: string }
        toast.error(error.error || 'Invalid verification code')
      }
    } catch (err) {
      console.error('Failed to verify TOTP:', err)
      toast.error('Failed to verify TOTP')
    } finally {
      setTotpLoading(false)
    }
  }

  async function handleDisableTOTP() {
    try {
      // Disable TOTP requirement without clearing the 2FA registration
      await saveSetting('TOTP_ENABLED', false)

      // Update UI state
      setTotpQrCode(null)
      setTotpManualKey(null)
      setTotpDigits(['', '', '', '', '', ''])
      updatePending('TOTP_ENABLED', false)
      toast.success('2FA disabled. Your registration is saved - enable it anytime without re-registering.')
    } catch (err) {
      console.error('Failed to disable TOTP:', err)
      toast.error('Failed to disable 2FA')
    }
  }

  async function handleResetTOTP() {
    setTotpLoading(true)
    try {
      const res = await fetch('/api/auth/2fa/qr', { credentials: 'include' })
      if (res.ok) {
        const data = (await res.json()) as { dataUrl: string }
        setTotpQrCode(data.dataUrl)
        setTotpManualKey(null) // HIGH-3: Secret is no longer returned to client
        setTotpDigits(['', '', '', '', '', ''])
        toast.success('Ready to register new device')
      } else {
        toast.error('Failed to reset 2FA')
      }
    } catch (err) {
      console.error('Failed to reset TOTP:', err)
      toast.error('Failed to reset 2FA')
    } finally {
      setTotpLoading(false)
    }
  }

  if (!settings || !pending) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Authentication</DialogTitle>
            <DialogClose />
          </DialogHeader>
          <DialogBody className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </DialogBody>
        </DialogContent>
      </Dialog>
    )
  }


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Authentication</DialogTitle>
          <DialogClose />
        </DialogHeader>
        <div className="border-b border-border">
          <div className="flex gap-0 px-6">
            <button
              onClick={() => setActiveTab('password')}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'password'
                  ? 'border-foreground text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              Password
            </button>
            <button
              onClick={() => setActiveTab('totp')}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'totp'
                  ? 'border-foreground text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              2FA
            </button>
            <button
              onClick={() => setActiveTab('passkeys')}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'passkeys'
                  ? 'border-foreground text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              Passkeys
            </button>
          </div>
        </div>

        <DialogBody className="sm:min-h-[400px] sm:max-h-[500px] overflow-y-auto">
          {/* Password Tab */}
          {activeTab === 'password' && (
            <>
              <SettingSection title="Set Custom Password">
                {showCustomPasswordForm ? (
                  <div className="px-4 py-4 space-y-4">
                    <label className="text-sm font-medium block">Enter a custom password:</label>
                    <div className="flex gap-2">
                      <input
                        type={showCustomPassword ? "text" : "password"}
                        value={customPassword}
                        onChange={(e) => setCustomPassword(e.target.value)}
                        placeholder="Enter password..."
                        className="flex-1 px-3 py-2 rounded border border-input bg-background text-sm outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-ring/50 focus:ring-[3px]"
                        disabled={isSettingPassword}
                        autoFocus
                      />
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setShowCustomPassword((v) => !v)}
                        title={showCustomPassword ? 'Hide password' : 'Show password'}
                        disabled={isSettingPassword}
                      >
                        {showCustomPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <Button
                        variant="outline"
                        onClick={() => {
                          setShowCustomPasswordForm(false)
                          setCustomPassword('')
                          setShowCustomPassword(false)
                        }}
                        disabled={isSettingPassword}
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={handleSetPassword}
                        disabled={isSettingPassword || !customPassword.trim()}
                      >
                        {isSettingPassword ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            Setting...
                          </>
                        ) : (
                          'Set Password'
                        )}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="px-4 py-4 border-b border-border/50 last:border-b-0 flex items-center justify-between">
                    <label className="text-sm font-medium">Set Custom Password</label>
                    <Button
                      variant="outline"
                      size="icon-sm"
                      onClick={() => setShowCustomPasswordForm(true)}
                      disabled={isSettingPassword}
                      title="Set custom password"
                    >
                      {isSettingPassword ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Plus className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                )}
              </SettingSection>

              <SettingSection title="Generate Password">
                <SettingRow
                  label="Password Type"
                  description="xkcd: memorable words, random: cryptographic string"
                >
                  <select
                    value={pending.SESSION_PASSWORD_TYPE}
                    onChange={(e) => updatePending('SESSION_PASSWORD_TYPE', e.target.value)}
                    className="px-2 py-2 rounded border border-input bg-background text-sm"
                  >
                    <option value="xkcd">xkcd</option>
                    <option value="random">random</option>
                  </select>
                </SettingRow>
                <SettingRow label="Password Length">
                  <input
                    type="number"
                    value={pending.SESSION_PASSWORD_LENGTH}
                    onChange={(e) => updatePending('SESSION_PASSWORD_LENGTH', parseInt(e.target.value))}
                    min={pending.SESSION_PASSWORD_TYPE === 'xkcd' ? 2 : 8}
                    max={pending.SESSION_PASSWORD_TYPE === 'xkcd' ? 10 : 64}
                    className="w-20 px-2 py-2 rounded border border-input bg-background text-sm text-center"
                  />
                </SettingRow>
                {newPassword ? (
                  <SettingRow label="Generated Password" note="">
                    <div className="w-full max-w-80 flex items-center gap-1">
                      <div className="flex-1 px-2 py-1 rounded border border-green-500/30 bg-green-500/5 font-mono text-sm break-all">
                        {showNewPassword ? newPassword : '••••••••'}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setShowNewPassword((v) => !v)}
                        title={showNewPassword ? 'Hide' : 'Show'}
                      >
                        {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => {
                          if (newPassword) {
                            navigator.clipboard.writeText(newPassword)
                            setCopiedField('new')
                            setTimeout(() => setCopiedField(null), 2000)
                          }
                        }}
                        className={copiedField === 'new' ? 'text-green-600 dark:text-green-400' : ''}
                        title="Copy to clipboard"
                      >
                        {copiedField === 'new' ? (
                          <Check className="h-4 w-4" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </SettingRow>
                ) : (
                  <div className="px-4 py-4 border-b border-border/50 last:border-b-0 flex items-center justify-between">
                    <label className="text-sm font-medium">Generate New Password</label>
                    <Button
                      variant="outline"
                      size="icon-sm"
                      onClick={handleRotatePassword}
                      disabled={isRotatingPassword}
                      title={isRotatingPassword ? 'Generating...' : 'Generate new password'}
                    >
                      {isRotatingPassword ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RotateCw className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                )}
              </SettingSection>
            </>
          )}

          {/* 2FA Tab */}
          {activeTab === 'totp' && (
            <>
              <SettingSection title="Two-Factor Authentication">
                {totpQrCode ? (
                  <div className="px-4 py-4 space-y-4">
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-sm font-medium">
                          {showManualKey ? 'Enter this key in your authenticator app:' : 'Scan this QR code with your authenticator app:'}
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setShowManualKey(!showManualKey)}
                        >
                          {showManualKey ? 'Show QR code' : 'Manual entry'}
                        </Button>
                      </div>
                      <div className="flex justify-center items-center mb-4 p-4 bg-muted rounded-lg h-64">
                        {showManualKey && totpManualKey ? (
                          <div className="p-3 rounded border border-border bg-muted/50 font-mono text-sm break-all w-full">
                            {totpManualKey}
                          </div>
                        ) : (
                          <img src={totpQrCode} alt="TOTP QR Code" className="w-48 h-48" />
                        )}
                      </div>
                    </div>

                    <div>
                      <label className="text-sm font-medium mb-3 block">
                        Enter 6-digit code to verify:
                      </label>
                      <div className="flex items-center gap-4">
                        <div className="flex-1 flex justify-center">
                          <div className="flex gap-2">
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
                        <div className="flex gap-2 flex-shrink-0">
                          <Button
                            onClick={handleVerifyTOTP}
                            disabled={totpDigits.join('').length !== 6 || totpLoading}
                            size="icon-sm"
                          >
                            {totpLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                          </Button>
                          <Button
                            variant="outline"
                            size="icon-sm"
                            onClick={() => {
                              setTotpQrCode(null)
                              setTotpManualKey(null)
                              setTotpDigits(['', '', '', '', '', ''])
                            }}
                            disabled={totpLoading}
                            title="Cancel setup"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="px-4 py-4 flex items-center justify-between">
                    <div>
                      <label className="text-sm font-medium block">Enable Two-Factor Authentication</label>
                      <p className="text-xs text-muted-foreground mt-1">
                        Requires an authenticator app (Google Authenticator, Authy, etc.)
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Switch
                        checked={pending.TOTP_ENABLED}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            handleEnableTOTP()
                          } else {
                            handleDisableTOTP()
                          }
                        }}
                        disabled={totpLoading}
                      />
                    </div>
                  </div>
                )}
              </SettingSection>

              {pending.TOTP_ENABLED && !totpQrCode && (
                <div className="mt-4 p-4 rounded-lg border border-border bg-muted/50">
                  <p className="text-sm font-medium mb-3">Need to use a different device?</p>
                  <Button
                    variant="outline"
                    onClick={handleResetTOTP}
                    disabled={totpLoading}
                  >
                    {totpLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Re-register Device
                  </Button>
                </div>
              )}
            </>
          )}

          {/* Passkeys Tab */}
          {activeTab === 'passkeys' && (
            <>
              <SettingSection title="Passkeys">
                <div className="px-4 py-4 border-b border-border/50 last:border-b-0">
                  <div className="flex items-center justify-between mb-4">
                    <label className="text-sm font-medium">Registered Passkeys</label>
                    <Button
                      variant="outline"
                      size="icon-sm"
                      onClick={handleRegisterPasskey}
                      disabled={passkeyLoading}
                      title="Add passkey"
                    >
                      {passkeyLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Plus className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  {passkeyError && (
                    <div className="rounded-md bg-destructive/10 border border-destructive/30 p-2 mb-3">
                      <p className="text-xs text-destructive">{passkeyError}</p>
                    </div>
                  )}
                  {passkeys.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">No passkeys registered</p>
                  ) : (
                    <div className="space-y-2">
                      {passkeys.map((pk) => (
                        <div
                          key={pk.id}
                          className="flex items-center justify-between p-3 rounded border border-border bg-muted/30 text-sm"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{pk.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(pk.registeredAt).toLocaleDateString()}
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => handleDeletePasskey(pk.id)}
                            className="ml-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </SettingSection>
            </>
          )}
        </DialogBody>

        {isDirty && (
          <DialogFooter>
            <Button variant="ghost" onClick={handleDiscard} disabled={isSaving}>
              Discard
            </Button>
            <Button onClick={handleSaveAll} disabled={isSaving}>
              {isSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Save
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
