import { LogOut, Settings, Info, Upload, FolderOpen, Users, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface MobileMenuDrawerProps {
  mobileMenuOpen: boolean
  setMobileMenuOpen: (open: boolean) => void
  isGuestMode: boolean
  authStatus: 'loading' | 'unauthenticated' | 'authenticated' | 'totp-setup' | 'totp-verify' | 'passkey-verify'
  authDisabled: boolean
  activeSessionId: string | null
  handleShowProcessInfo: () => void
  setShowUpload: (show: boolean) => void
  setShowDownload: (show: boolean) => void
  setShowGuestPanel: (show: boolean) => void
  setShowSettings: (show: boolean) => void
  handleLogout: () => Promise<void>
}

export function MobileMenuDrawer(props: MobileMenuDrawerProps) {
  const {
    mobileMenuOpen,
    setMobileMenuOpen,
    isGuestMode,
    authStatus,
    authDisabled,
    activeSessionId,
    handleShowProcessInfo,
    setShowUpload,
    setShowDownload,
    setShowGuestPanel,
    setShowSettings,
    handleLogout,
  } = props

  if (!mobileMenuOpen) return null

  return (
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
              {!isGuestMode && (
                <button
                  type="button"
                  onClick={() => {
                    setShowGuestPanel(true)
                    setMobileMenuOpen(false)
                  }}
                  className="w-full px-4 py-3 text-left rounded-md bg-muted/30 hover:bg-muted transition-colors flex items-center gap-3">
                  <Users className="h-5 w-5 flex-shrink-0" />
                  <span className="text-base">Guest Links</span>
                </button>
              )}
            </>
          )}
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
  )
}
