import { useState, useEffect, useCallback, useRef } from 'react'
import { Eye, EyeOff, Loader2, Copy, Check, RotateCw, Plus, Trash2, X, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose, DialogBody, DialogFooter } from '@/components/ui/dialog'
import { SettingRow, SettingSection } from '@/components/ui/settings'
import toast from 'react-hot-toast'

type Section = 'terminal' | 'password' | 'totp' | 'passkeys' | 'access' | 'rate-limits'

interface PasskeyInfo {
  id: string
  name: string
  counter: number
  registeredAt: string
  transports: string[]
}

interface AllSettings {
  SCROLLBACK_LINES: number
  SESSION_PASSWORD_TYPE: string
  SESSION_PASSWORD_LENGTH: number
  TOTP_ENABLED: boolean
  PASSKEY_RP_ORIGIN: string
  PASSKEY_AS_2FA: boolean
  AUTH_DISABLED: boolean
  SHOW_AUTH_DISABLED_WARNING: boolean
  RATE_LIMIT_GLOBAL_MAX: number
  RATE_LIMIT_SESSION_PASSWORD_MAX: number
  RATE_LIMIT_TOTP_MAX: number
  RATE_LIMIT_PASSKEY_CHALLENGE_MAX: number
}

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  fontSize: number
  onFontSizeChange: (size: number) => void
  initialSection?: Section
}

const SECTION_LABELS: Record<Section, string> = {
  terminal: 'Terminal',
  password: 'Password',
  totp: 'Two-Factor Auth',
  passkeys: 'Passkeys',
  access: 'Access Control',
  'rate-limits': 'Rate Limiting',
}

const SECTIONS: Section[] = ['terminal', 'password', 'totp', 'passkeys', 'access', 'rate-limits']

export function SettingsDialog({ open, onOpenChange, fontSize, onFontSizeChange, initialSection }: SettingsDialogProps) {
  const [settings, setSettings] = useState<AllSettings | null>(null)
  const [pending, setPending] = useState<AllSettings | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [activeSection, setActiveSection] = useState<Section>(initialSection || 'terminal')
  const [mobileShowContent, setMobileShowContent] = useState(!!initialSection)

  // Password/auth state
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [newPassword, setNewPassword] = useState<string | null>(null)
  const [isRotatingPassword, setIsRotatingPassword] = useState(false)
  const [copiedField, setCopiedField] = useState<'new' | null>(null)
  const [customPassword, setCustomPassword] = useState('')
  const [showCustomPasswordForm, setShowCustomPasswordForm] = useState(false)
  const [isSettingPassword, setIsSettingPassword] = useState(false)
  const [showCustomPassword, setShowCustomPassword] = useState(false)

  // Passkeys state
  const [passkeys, setPasskeys] = useState<PasskeyInfo[]>([])
  const [passkeyLoading, setPasskeyLoading] = useState(false)
  const [passkeyError, setPasskeyError] = useState('')

  // TOTP state
  const [totpQrCode, setTotpQrCode] = useState<string | null>(null)
  const [totpDigits, setTotpDigits] = useState<string[]>(['', '', '', '', '', ''])
  const [totpLoading, setTotpLoading] = useState(false)
  const totpInputRefs = useRef<(HTMLInputElement | null)[]>([])

  // Update initial section when prop changes
  useEffect(() => {
    if (initialSection) {
      setActiveSection(initialSection)
      setMobileShowContent(true)
    }
  }, [initialSection])

  // Fetch all settings when dialog opens
  useEffect(() => {
    if (!open) return

    async function fetchData() {
      try {
        const [settingsRes, passkeysRes] = await Promise.all([
          fetch('/api/settings', { credentials: 'include' }),
          fetch('/api/auth/passkeys', { credentials: 'include' }),
        ])

        if (settingsRes.ok) {
          const data = (await settingsRes.json()) as Partial<AllSettings>
          const fullData: AllSettings = {
            SCROLLBACK_LINES: 10000,
            SESSION_PASSWORD_TYPE: 'xkcd',
            SESSION_PASSWORD_LENGTH: 4,
            TOTP_ENABLED: false,
            PASSKEY_RP_ORIGIN: '',
            PASSKEY_AS_2FA: true,
            AUTH_DISABLED: false,
            SHOW_AUTH_DISABLED_WARNING: false,
            RATE_LIMIT_GLOBAL_MAX: 500,
            RATE_LIMIT_SESSION_PASSWORD_MAX: 10,
            RATE_LIMIT_TOTP_MAX: 5,
            RATE_LIMIT_PASSKEY_CHALLENGE_MAX: 10,
            ...data,
          }
          setSettings(fullData)
          setPending(fullData)
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
      setTotpQrCode(null)
      setTotpDigits(['', '', '', '', '', ''])
    }
  }, [open])

  const saveSetting = useCallback(async (key: string, value: any) => {
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
  }, [])

  const isDirty =
    pending !== null &&
    settings !== null &&
    (Object.keys(pending) as (keyof AllSettings)[]).some(
      (key) => String(pending[key]) !== String(settings[key])
    )

  async function handleSaveAll() {
    if (!pending || !settings) return
    setIsSaving(true)
    try {
      for (const key of Object.keys(pending) as (keyof AllSettings)[]) {
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

  function updatePending<K extends keyof AllSettings>(key: K, value: AllSettings[K]) {
    setPending((prev) => (prev ? { ...prev, [key]: value } : null))
  }

  // Password handlers
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

  // Passkey handlers
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

  // TOTP handlers
  async function handleEnableTOTP() {
    setTotpLoading(true)
    try {
      // Check if TOTP registration already exists
      const statusRes = await fetch('/api/auth/2fa/status', { credentials: 'include' })
      if (statusRes.ok) {
        const { registered } = (await statusRes.json()) as { registered: boolean }

        // If registration exists, just re-enable without QR
        if (registered) {
          await saveSetting('TOTP_ENABLED', true)
          updatePending('TOTP_ENABLED', true)
          toast.success('2FA re-enabled')
          return
        }
      }

      // First-time setup: generate QR code for verification
      const res = await fetch('/api/auth/2fa/qr', { credentials: 'include' })
      if (res.ok) {
        const data = (await res.json()) as { dataUrl: string }
        setTotpQrCode(data.dataUrl)
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
      const res = await fetch('/api/auth/2fa/setup', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: totpSetupCode }),
      })

      if (res.ok) {
        if (!pending?.TOTP_ENABLED) {
          await saveSetting('TOTP_ENABLED', true)
        }
        toast.success('2FA enabled successfully')
        setTotpQrCode(null)
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
      await saveSetting('TOTP_ENABLED', false)
      setTotpQrCode(null)
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
            <DialogTitle>Settings</DialogTitle>
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
      <DialogContent className="w-screen h-screen max-w-none max-h-none rounded-none sm:w-[800px] sm:h-[640px] sm:rounded-lg flex flex-col">
        {/* Mobile: show either list or content */}
        {/* Desktop: sidebar + content */}
        <div className="hidden sm:flex sm:flex-col sm:h-full">
          {/* Desktop header */}
          <DialogHeader className="border-b border-border/50">
            <DialogTitle>Settings</DialogTitle>
            <DialogClose />
          </DialogHeader>

          {/* Desktop two-column layout */}
          <div className="flex flex-1 overflow-hidden">
            {/* Sidebar */}
            <div className="w-40 border-r border-border bg-muted/30 overflow-y-auto">
              {SECTIONS.map((section) => (
                <button
                  key={section}
                  onClick={() => setActiveSection(section)}
                  className={`w-full px-4 py-3 text-left text-sm font-medium border-l-2 transition-colors ${
                    activeSection === section
                      ? 'border-foreground bg-background text-foreground'
                      : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50'
                  }`}
                >
                  {SECTION_LABELS[section]}
                </button>
              ))}
            </div>

            {/* Content panel */}
            <div className="flex-1 overflow-y-auto h-[500px]">
              <div className="px-6 py-4">
                <SettingsContent
                  section={activeSection}
                  pending={pending}
                  updatePending={updatePending}
                  fontSize={fontSize}
                  onFontSizeChange={onFontSizeChange}
                  newPassword={newPassword}
                  showNewPassword={showNewPassword}
                  setShowNewPassword={setShowNewPassword}
                  copiedField={copiedField}
                  setCopiedField={setCopiedField}
                  handleRotatePassword={handleRotatePassword}
                  isRotatingPassword={isRotatingPassword}
                  showCustomPasswordForm={showCustomPasswordForm}
                  setShowCustomPasswordForm={setShowCustomPasswordForm}
                  customPassword={customPassword}
                  setCustomPassword={setCustomPassword}
                  showCustomPassword={showCustomPassword}
                  setShowCustomPassword={setShowCustomPassword}
                  handleSetPassword={handleSetPassword}
                  isSettingPassword={isSettingPassword}
                  totpQrCode={totpQrCode}
                  setTotpQrCode={setTotpQrCode}
                  totpDigits={totpDigits}
                  totpInputRefs={totpInputRefs}
                  handleTotpDigitChange={handleTotpDigitChange}
                  handleTotpDigitKeyDown={handleTotpDigitKeyDown}
                  totpLoading={totpLoading}
                  handleVerifyTOTP={handleVerifyTOTP}
                  handleEnableTOTP={handleEnableTOTP}
                  handleDisableTOTP={handleDisableTOTP}
                  handleResetTOTP={handleResetTOTP}
                  setTotpDigits={setTotpDigits}
                  passkeys={passkeys}
                  passkeyLoading={passkeyLoading}
                  passkeyError={passkeyError}
                  handleRegisterPasskey={handleRegisterPasskey}
                  handleDeletePasskey={handleDeletePasskey}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Mobile layout */}
        <div className="sm:hidden flex flex-col h-full">
          {!mobileShowContent ? (
            /* Section list */
            <>
              <DialogHeader className="border-b border-border/50">
                <DialogTitle>Settings</DialogTitle>
                <DialogClose />
              </DialogHeader>
              <DialogBody className="flex-1 overflow-y-auto">
                <div className="space-y-1">
                  {SECTIONS.map((section) => (
                    <button
                      key={section}
                      onClick={() => {
                        setActiveSection(section)
                        setMobileShowContent(true)
                      }}
                      className="w-full px-4 py-3 flex items-center justify-between text-left rounded-md hover:bg-muted transition-colors"
                    >
                      <span className="font-medium text-sm">{SECTION_LABELS[section]}</span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </button>
                  ))}
                </div>
              </DialogBody>
            </>
          ) : (
            /* Section content with back button */
            <>
              <DialogHeader className="border-b border-border/50">
                <button
                  onClick={() => setMobileShowContent(false)}
                  className="flex items-center gap-2 text-sm font-medium text-foreground hover:text-muted-foreground transition-colors"
                >
                  ← {SECTION_LABELS[activeSection]}
                </button>
                <DialogClose />
              </DialogHeader>
              <DialogBody className="flex-1 overflow-y-auto px-3">
                <SettingsContent
                  section={activeSection}
                  pending={pending}
                  updatePending={updatePending}
                  fontSize={fontSize}
                  onFontSizeChange={onFontSizeChange}
                  newPassword={newPassword}
                  showNewPassword={showNewPassword}
                  setShowNewPassword={setShowNewPassword}
                  copiedField={copiedField}
                  setCopiedField={setCopiedField}
                  handleRotatePassword={handleRotatePassword}
                  isRotatingPassword={isRotatingPassword}
                  showCustomPasswordForm={showCustomPasswordForm}
                  setShowCustomPasswordForm={setShowCustomPasswordForm}
                  customPassword={customPassword}
                  setCustomPassword={setCustomPassword}
                  showCustomPassword={showCustomPassword}
                  setShowCustomPassword={setShowCustomPassword}
                  handleSetPassword={handleSetPassword}
                  isSettingPassword={isSettingPassword}
                  totpQrCode={totpQrCode}
                  setTotpQrCode={setTotpQrCode}
                  totpDigits={totpDigits}
                  totpInputRefs={totpInputRefs}
                  handleTotpDigitChange={handleTotpDigitChange}
                  handleTotpDigitKeyDown={handleTotpDigitKeyDown}
                  totpLoading={totpLoading}
                  handleVerifyTOTP={handleVerifyTOTP}
                  handleEnableTOTP={handleEnableTOTP}
                  handleDisableTOTP={handleDisableTOTP}
                  handleResetTOTP={handleResetTOTP}
                  setTotpDigits={setTotpDigits}
                  passkeys={passkeys}
                  passkeyLoading={passkeyLoading}
                  passkeyError={passkeyError}
                  handleRegisterPasskey={handleRegisterPasskey}
                  handleDeletePasskey={handleDeletePasskey}
                />
              </DialogBody>
            </>
          )}
        </div>

        {isDirty && (
          <DialogFooter className="max-sm:flex-col-reverse max-sm:gap-2 sm:border-t sm:border-border/50">
            <Button variant="ghost" onClick={handleDiscard} disabled={isSaving} className="max-sm:w-full">
              Discard
            </Button>
            <Button onClick={handleSaveAll} disabled={isSaving} className="max-sm:w-full">
              {isSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Save
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}

// Separate component for section content to keep main component cleaner
interface SettingsContentProps {
  section: Section
  pending: AllSettings
  updatePending: <K extends keyof AllSettings>(key: K, value: AllSettings[K]) => void
  fontSize: number
  onFontSizeChange: (size: number) => void
  newPassword: string | null
  showNewPassword: boolean
  setShowNewPassword: (show: boolean) => void
  copiedField: 'new' | null
  setCopiedField: (field: 'new' | null) => void
  handleRotatePassword: () => Promise<void>
  isRotatingPassword: boolean
  showCustomPasswordForm: boolean
  setShowCustomPasswordForm: (show: boolean) => void
  customPassword: string
  setCustomPassword: (pwd: string) => void
  showCustomPassword: boolean
  setShowCustomPassword: (show: boolean) => void
  handleSetPassword: () => Promise<void>
  isSettingPassword: boolean
  totpQrCode: string | null
  setTotpQrCode: (code: string | null) => void
  totpDigits: string[]
  setTotpDigits: (digits: string[]) => void
  totpInputRefs: React.MutableRefObject<(HTMLInputElement | null)[]>
  handleTotpDigitChange: (index: number, value: string) => void
  handleTotpDigitKeyDown: (index: number, e: React.KeyboardEvent<HTMLInputElement>) => void
  totpLoading: boolean
  handleVerifyTOTP: () => Promise<void>
  handleEnableTOTP: () => Promise<void>
  handleDisableTOTP: () => Promise<void>
  handleResetTOTP: () => Promise<void>
  passkeys: PasskeyInfo[]
  passkeyLoading: boolean
  passkeyError: string
  handleRegisterPasskey: () => Promise<void>
  handleDeletePasskey: (id: string) => Promise<void>
}

function SettingsContent(props: SettingsContentProps) {
  const {
    section,
    pending,
    updatePending,
    fontSize,
    onFontSizeChange,
    newPassword,
    showNewPassword,
    setShowNewPassword,
    copiedField,
    setCopiedField,
    handleRotatePassword,
    isRotatingPassword,
    showCustomPasswordForm,
    setShowCustomPasswordForm,
    customPassword,
    setCustomPassword,
    showCustomPassword,
    setShowCustomPassword,
    handleSetPassword,
    isSettingPassword,
    totpQrCode,
    setTotpQrCode,
    totpDigits,
    setTotpDigits,
    totpInputRefs,
    handleTotpDigitChange,
    handleTotpDigitKeyDown,
    totpLoading,
    handleVerifyTOTP,
    handleEnableTOTP,
    handleDisableTOTP,
    handleResetTOTP,
    passkeys,
    passkeyLoading,
    passkeyError,
    handleRegisterPasskey,
    handleDeletePasskey,
  } = props

  if (section === 'terminal') {
    return (
      <SettingSection title="Terminal">
        <SettingRow
          label="Scrollback Buffer Size"
          description="Number of lines to keep in history. Affects new sessions"
        >
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => updatePending('SCROLLBACK_LINES', Math.max(100, pending.SCROLLBACK_LINES - 1000))}
              className="px-2 py-1 rounded border border-input bg-background hover:bg-accent text-sm font-medium active:bg-accent"
            >
              −
            </button>
            <input
              type="number"
              value={pending.SCROLLBACK_LINES}
              onChange={(e) => updatePending('SCROLLBACK_LINES', parseInt(e.target.value))}
              min={100}
              max={100000}
              className="flex-1 sm:w-32 px-2 py-1 rounded border border-input bg-background text-sm text-center"
            />
            <button
              type="button"
              onClick={() => updatePending('SCROLLBACK_LINES', Math.min(100000, pending.SCROLLBACK_LINES + 1000))}
              className="px-2 py-1 rounded border border-input bg-background hover:bg-accent text-sm font-medium active:bg-accent"
            >
              +
            </button>
          </div>
        </SettingRow>
        <SettingRow
          label="Font Size"
          description="Terminal font size in pixels. Updates all sessions immediately"
        >
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => onFontSizeChange(Math.max(6, fontSize - 1))}
              className="px-2 py-1 rounded border border-input bg-background hover:bg-accent text-sm font-medium active:bg-accent"
            >
              −
            </button>
            <input
              type="number"
              value={fontSize}
              onChange={(e) => onFontSizeChange(Number(e.target.value))}
              min={6}
              max={72}
              className="flex-1 sm:w-32 px-2 py-1 rounded border border-input bg-background text-sm text-center"
            />
            <button
              type="button"
              onClick={() => onFontSizeChange(Math.min(72, fontSize + 1))}
              className="px-2 py-1 rounded border border-input bg-background hover:bg-accent text-sm font-medium active:bg-accent"
            >
              +
            </button>
          </div>
        </SettingRow>
      </SettingSection>
    )
  }

  if (section === 'password') {
    return (
      <>
        <SettingSection title="Set Custom Password">
          {showCustomPasswordForm ? (
            <div className="px-4 py-4 space-y-4">
              <label className="text-sm font-medium block">Enter a custom password:</label>
              <div className="flex gap-2">
                <input
                  type={showCustomPassword ? 'text' : 'password'}
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
                  onClick={() => setShowCustomPassword(!showCustomPassword)}
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
                  onClick={() => setShowNewPassword(!showNewPassword)}
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
    )
  }

  if (section === 'totp') {
    return (
      <SettingSection title="Two-Factor Authentication">
        {totpQrCode ? (
          <div className="px-4 py-4 space-y-4">
            <div>
              <p className="text-sm font-medium mb-3">
                Scan this QR code with your authenticator app:
              </p>
              <div className="flex justify-center items-center mb-4 p-4 bg-muted rounded-lg h-64">
                <img src={totpQrCode} alt="TOTP QR Code" className="w-48 h-48" />
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

        {pending.TOTP_ENABLED && !totpQrCode && (
          <div className="mt-3 p-4">
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
      </SettingSection>
    )
  }

  if (section === 'passkeys') {
    return (
      <>
        <SettingSection title="Passkey Settings">
          <SettingRow
            label="Relying Party Origin"
            description="URL for passkey verification"
          >
            <input
              type="text"
              value={pending.PASSKEY_RP_ORIGIN}
              onChange={(e) => updatePending('PASSKEY_RP_ORIGIN', e.target.value)}
              placeholder="https://example.com"
              className="w-full max-w-80 px-3 py-2 rounded border border-input bg-background text-sm"
            />
          </SettingRow>
          <SettingRow
            label="Require Password with Passkey"
            description="When enabled, passkey is used as a second factor after entering the password. When disabled, passkey can be used as a standalone login method without a password"
          >
            <Switch
              checked={pending.PASSKEY_AS_2FA}
              onCheckedChange={(checked) => updatePending('PASSKEY_AS_2FA', checked)}
            />
          </SettingRow>
        </SettingSection>

        <SettingSection title="Registered Passkeys">
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
    )
  }

  if (section === 'access') {
    return (
      <SettingSection title="Access Control">
        <SettingRow
          label="Disable Authentication"
          description="Allow access without password (skip login)"
          note={pending.AUTH_DISABLED ? "⚠️ Security risk" : undefined}
        >
          <Switch
            checked={pending.AUTH_DISABLED}
            onCheckedChange={(checked) => updatePending('AUTH_DISABLED', checked)}
          />
        </SettingRow>
        <SettingRow
          label="Show Auth Disabled Warning"
          description="Show warning banner when auth is disabled"
        >
          <Switch
            checked={pending.SHOW_AUTH_DISABLED_WARNING}
            onCheckedChange={(checked) => updatePending('SHOW_AUTH_DISABLED_WARNING', checked)}
          />
        </SettingRow>
      </SettingSection>
    )
  }

  if (section === 'rate-limits') {
    return (
      <SettingSection title="Rate Limiting">
        <SettingRow
          label="Global Rate Limit"
          description="Max requests per 15 minutes (unauthenticated requests only)"
        >
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => updatePending('RATE_LIMIT_GLOBAL_MAX', Math.max(10, pending.RATE_LIMIT_GLOBAL_MAX - 10))}
              className="px-2 py-1 rounded border border-input bg-background hover:bg-accent text-sm font-medium active:bg-accent"
            >
              −
            </button>
            <input
              type="number"
              value={pending.RATE_LIMIT_GLOBAL_MAX}
              onChange={(e) => updatePending('RATE_LIMIT_GLOBAL_MAX', parseInt(e.target.value))}
              min={10}
              className="flex-1 sm:w-24 px-2 py-1 rounded border border-input bg-background text-sm text-center"
            />
            <button
              type="button"
              onClick={() => updatePending('RATE_LIMIT_GLOBAL_MAX', pending.RATE_LIMIT_GLOBAL_MAX + 10)}
              className="px-2 py-1 rounded border border-input bg-background hover:bg-accent text-sm font-medium active:bg-accent"
            >
              +
            </button>
          </div>
        </SettingRow>
        <SettingRow
          label="Password Login Rate Limit"
          description="Max login attempts per hour"
        >
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => updatePending('RATE_LIMIT_SESSION_PASSWORD_MAX', Math.max(1, pending.RATE_LIMIT_SESSION_PASSWORD_MAX - 1))}
              className="px-2 py-1 rounded border border-input bg-background hover:bg-accent text-sm font-medium active:bg-accent"
            >
              −
            </button>
            <input
              type="number"
              value={pending.RATE_LIMIT_SESSION_PASSWORD_MAX}
              onChange={(e) => updatePending('RATE_LIMIT_SESSION_PASSWORD_MAX', parseInt(e.target.value))}
              min={1}
              className="flex-1 sm:w-24 px-2 py-1 rounded border border-input bg-background text-sm text-center"
            />
            <button
              type="button"
              onClick={() => updatePending('RATE_LIMIT_SESSION_PASSWORD_MAX', pending.RATE_LIMIT_SESSION_PASSWORD_MAX + 1)}
              className="px-2 py-1 rounded border border-input bg-background hover:bg-accent text-sm font-medium active:bg-accent"
            >
              +
            </button>
          </div>
        </SettingRow>
        <SettingRow
          label="2FA Verification Rate Limit"
          description="Max TOTP/passkey verification attempts per 10 minutes"
        >
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => updatePending('RATE_LIMIT_TOTP_MAX', Math.max(1, pending.RATE_LIMIT_TOTP_MAX - 1))}
              className="px-2 py-1 rounded border border-input bg-background hover:bg-accent text-sm font-medium active:bg-accent"
            >
              −
            </button>
            <input
              type="number"
              value={pending.RATE_LIMIT_TOTP_MAX}
              onChange={(e) => updatePending('RATE_LIMIT_TOTP_MAX', parseInt(e.target.value))}
              min={1}
              className="flex-1 sm:w-24 px-2 py-1 rounded border border-input bg-background text-sm text-center"
            />
            <button
              type="button"
              onClick={() => updatePending('RATE_LIMIT_TOTP_MAX', pending.RATE_LIMIT_TOTP_MAX + 1)}
              className="px-2 py-1 rounded border border-input bg-background hover:bg-accent text-sm font-medium active:bg-accent"
            >
              +
            </button>
          </div>
        </SettingRow>
        <SettingRow
          label="Passkey Challenge Rate Limit"
          description="Max passkey challenge creation requests per 15 minutes"
        >
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => updatePending('RATE_LIMIT_PASSKEY_CHALLENGE_MAX', Math.max(1, pending.RATE_LIMIT_PASSKEY_CHALLENGE_MAX - 1))}
              className="px-2 py-1 rounded border border-input bg-background hover:bg-accent text-sm font-medium active:bg-accent"
            >
              −
            </button>
            <input
              type="number"
              value={pending.RATE_LIMIT_PASSKEY_CHALLENGE_MAX}
              onChange={(e) => updatePending('RATE_LIMIT_PASSKEY_CHALLENGE_MAX', parseInt(e.target.value))}
              min={1}
              className="flex-1 sm:w-24 px-2 py-1 rounded border border-input bg-background text-sm text-center"
            />
            <button
              type="button"
              onClick={() => updatePending('RATE_LIMIT_PASSKEY_CHALLENGE_MAX', pending.RATE_LIMIT_PASSKEY_CHALLENGE_MAX + 1)}
              className="px-2 py-1 rounded border border-input bg-background hover:bg-accent text-sm font-medium active:bg-accent"
            >
              +
            </button>
          </div>
        </SettingRow>
      </SettingSection>
    )
  }

  return null
}
