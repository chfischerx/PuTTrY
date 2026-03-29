import { useState, useEffect, useCallback } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose, DialogBody, DialogFooter } from '@/components/ui/dialog'
import { SettingRow, SettingSection } from '@/components/ui/settings'
import toast from 'react-hot-toast'

interface SettingsConfig {
  AUTH_DISABLED: boolean
  SHOW_AUTH_DISABLED_WARNING: boolean
  RATE_LIMIT_GLOBAL_MAX: number
  RATE_LIMIT_SESSION_PASSWORD_MAX: number
  SCROLLBACK_LINES: number
  PASSKEY_RP_ORIGIN: string
  PASSKEY_AS_2FA: boolean
}

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  fontSize: number
  onFontSizeChange: (size: number) => void
}

export function SettingsDialog({ open, onOpenChange, fontSize, onFontSizeChange }: SettingsDialogProps) {
  const [settings, setSettings] = useState<SettingsConfig | null>(null)
  const [pending, setPending] = useState<SettingsConfig | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  // Fetch settings and passwords when dialog opens
  useEffect(() => {
    if (!open) return

    async function fetchData() {
      try {
        const res = await fetch('/api/settings', { credentials: 'include' })
        if (res.ok) {
          const data = (await res.json()) as SettingsConfig
          setSettings(data)
          setPending(data)
        }
      } catch (err) {
        console.error('Failed to fetch settings:', err)
      }
    }

    fetchData()
  }, [open])

  // Discard pending changes when dialog closes
  useEffect(() => {
    if (!open) {
      setSettings(null)
      setPending(null)
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
    (Object.keys(pending) as (keyof SettingsConfig)[]).some(
      (key) => String(pending[key]) !== String(settings[key])
    )

  async function handleSaveAll() {
    if (!pending || !settings) return
    setIsSaving(true)
    try {
      for (const key of Object.keys(pending) as (keyof SettingsConfig)[]) {
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

  function updatePending<K extends keyof SettingsConfig>(key: K, value: SettingsConfig[K]) {
    setPending((prev) => (prev ? { ...prev, [key]: value } : null))
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
      <DialogContent className="w-screen h-screen max-w-none max-h-none rounded-none sm:max-w-2xl sm:max-h-[90vh] sm:rounded-lg">
        <DialogHeader className="sticky top-0 bg-background border-b border-border/50 sm:border-b-0 sm:bg-transparent">
          <DialogTitle>Settings</DialogTitle>
          <DialogClose />
        </DialogHeader>
        <DialogBody className="max-sm:px-3 overflow-y-auto flex-1">
          {/* Terminal Section */}
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

          {/* Authentication Section */}
          <SettingSection title="Authentication">
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

          {/* Passkeys Section */}
          <SettingSection title="Passkeys">
            <SettingRow
              label="Require Password with Passkey"
              description="When enabled, passkey is used as a second factor after entering the password. When disabled, passkey can be used as a standalone login method without a password"
            >
              <Switch
                checked={pending.PASSKEY_AS_2FA}
                onCheckedChange={(checked) => updatePending('PASSKEY_AS_2FA', checked)}
              />
            </SettingRow>
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
          </SettingSection>

          {/* Rate Limiting Section */}
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
          </SettingSection>
        </DialogBody>

        {isDirty && (
          <DialogFooter className="max-sm:flex-col-reverse max-sm:gap-2">
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
