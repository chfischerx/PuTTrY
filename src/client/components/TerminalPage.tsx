import { Menu, MoreHorizontal, Search, LogOut, Settings, FolderOpen, Upload, Ban, Users, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SessionsSidebar } from '@/components/SessionsSidebar'
import { SettingsDialog } from '@/components/SettingsDialog'
import { UploadDialog, DownloadDialog } from '@/components/FileManagerDialog'
import TerminalPane from '@/components/TerminalPane'
import MobileKeyToolbar from '@/components/MobileKeyToolbar'
import { WebTerminalLogo } from '@/components/WebTerminalLogo'
import { GuestPanel } from '@/components/GuestPanel'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { MobileMenuDrawer } from '@/components/layout/MobileMenuDrawer'
import { ProcessInfoPopup } from '@/components/layout/ProcessInfoPopup'
import { Toaster } from 'react-hot-toast'
import type { GuestLink } from '@shared/types/guest'

interface TerminalPageProps {
  auth: any
  sync: any
  layout: any
  terminal: any
  locks: any
  guestLinks: GuestLink[]
  setGuestLinks: (links: GuestLink[]) => void
  clientId: string
  showUpload: boolean
  setShowUpload: (show: boolean) => void
  showDownload: boolean
  setShowDownload: (show: boolean) => void
  showSettings: boolean
  setShowSettings: (show: boolean) => void
  showGuestPanel: boolean
  setShowGuestPanel: (show: boolean) => void
  showProcessInfo: boolean
  setShowProcessInfo: (show: boolean) => void
  processInfo: any
  processInfoLoading: boolean
  handleShowProcessInfo: () => void
}

export function TerminalPage(props: TerminalPageProps) {

  const {
    auth,
    sync,
    layout,
    terminal,
    locks,
    guestLinks,
    setGuestLinks,
    clientId,
    showUpload,
    setShowUpload,
    showDownload,
    setShowDownload,
    showSettings,
    setShowSettings,
    showGuestPanel,
    setShowGuestPanel,
    showProcessInfo,
    setShowProcessInfo,
    processInfo,
    processInfoLoading,
    handleShowProcessInfo,
  } = props

  return (
    <div style={{ height: layout.viewportHeight ? `${layout.viewportHeight}px` : '100dvh' }} className="flex flex-col w-full bg-background text-foreground">
      {/* Auth disabled warning */}
      {auth.showAuthDisabledWarning && (
        <div className="px-4 py-2 bg-amber-400/40 border-b border-amber-600/50 text-sm text-black dark:text-black text-center animate-pulse">
          ⚠️ Authentication is disabled
        </div>
      )}

      {/* Toast notifications */}
      <Toaster position="bottom-right" toastOptions={{ style: { fontSize: '12px', padding: '8px 12px' } }} />

      {/* Locked Session Dialog */}
      <ConfirmDialog
        open={locks.showLockedDialog !== null}
        onOpenChange={(open) => !open && locks.setShowLockedDialog(null)}
        title="Session In Use"
        description={(() => {
          const lockClientId = sync.inputLocks?.[locks.showLockedDialog || '']
          const guestName = lockClientId
            ? guestLinks.find(l => l.sessionIds.includes(lockClientId))?.name
            : undefined
          return (
            <>
              This session is currently being used by {guestName ? `guest ${guestName}` : 'another client'} <span className="font-mono text-xs">({sync.inputLocks?.[locks.showLockedDialog || '']?.slice(-12)})</span>. Would you like to {auth.isGuestMode ? 'request control' : 'take control'}?
            </>
          )
        })()}
        confirmLabel={auth.isGuestMode ? 'Request Control' : 'Take Control'}
        onConfirm={() => {
          if (locks.showLockedDialog) {
            locks.handleTakeControl(locks.showLockedDialog)
          }
          locks.setShowLockedDialog(null)
        }}
      />

      {/* Mobile menu drawer */}
      <MobileMenuDrawer
        mobileMenuOpen={layout.mobileMenuOpen}
        setMobileMenuOpen={layout.setMobileMenuOpen}
        isGuestMode={auth.isGuestMode}
        authStatus={auth.authStatus}
        authDisabled={auth.authDisabled}
        activeSessionId={sync.activeSessionId}
        handleShowProcessInfo={handleShowProcessInfo}
        setShowUpload={setShowUpload}
        setShowDownload={setShowDownload}
        setShowGuestPanel={setShowGuestPanel}
        setShowSettings={setShowSettings}
        handleLogout={auth.handleLogout}
      />

      <div className="flex flex-1 w-full overflow-hidden z-10">
        {/* Sidebar — on desktop, always visible; on mobile, drawer overlay */}
        {!layout.isMobile && (
          <SessionsSidebar
            sessions={sync.sessions}
            activeSessionId={sync.activeSessionId}
            onSelectSession={sync.setActiveSessionId}
            onNewSession={sync.createSession}
            onRenameSession={sync.handleRenameSession}
            onCloseSession={sync.handleCloseSession}
            onCloseAllSessions={sync.handleCloseAllSessions}
            loading={sync.loading}
            collapsed={layout.sidebarCollapsed}
            onToggleCollapse={() => {
              layout.setSidebarCollapsed(!layout.sidebarCollapsed)
              if (layout.sidebarCollapsed) {
                layout.setSidebarWidth(192)
              }
            }}
            width={layout.sidebarWidth}
            onWidthChange={layout.setSidebarWidth}
            inputLocks={sync.inputLocks}
            clientId={clientId}
            onTakeControl={locks.handleTakeControl}
            dataReceivedSessions={sync.dataReceivedSessions}
            guestViewers={sync.guestViewers}
            guestLinks={guestLinks}
            lockRequests={sync.lockRequests}
            isGuestMode={auth.isGuestMode}
          />
        )}

        {/* Mobile sidebar drawer */}
        {layout.isMobile && (
          <SessionsSidebar
            sessions={sync.sessions}
            activeSessionId={sync.activeSessionId}
            onSelectSession={sync.setActiveSessionId}
            onNewSession={() => { sync.createSession(); layout.setSidebarMobileOpen(false) }}
            onRenameSession={sync.handleRenameSession}
            onCloseSession={sync.handleCloseSession}
            onCloseAllSessions={sync.handleCloseAllSessions}
            loading={sync.loading}
            collapsed={layout.sidebarCollapsed}
            onToggleCollapse={() => {
              layout.setSidebarCollapsed(!layout.sidebarCollapsed)
              if (layout.sidebarCollapsed) {
                layout.setSidebarWidth(192)
              }
            }}
            width={layout.sidebarWidth}
            onWidthChange={layout.setSidebarWidth}
            inputLocks={sync.inputLocks}
            clientId={clientId}
            onTakeControl={locks.handleTakeControl}
            dataReceivedSessions={sync.dataReceivedSessions}
            guestViewers={sync.guestViewers}
            guestLinks={guestLinks}
            lockRequests={sync.lockRequests}
            mobileOpen={layout.sidebarMobileOpen}
            onMobileClose={() => layout.setSidebarMobileOpen(false)}
            isGuestMode={auth.isGuestMode}
          />
        )}

        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Top bar */}
          <div className="border-b border-border bg-card px-4 py-2 flex items-center gap-2 relative z-40 flex-shrink-0">
            {/* Hamburger — mobile only */}
            <button
              className="md:hidden p-2 rounded transition-colors hover:bg-accent"
              onClick={() => layout.setSidebarMobileOpen(true)}
              type="button"
              title="Open sidebar">
              <Menu className="h-5 w-5" />
            </button>

            {/* Logo */}
            <WebTerminalLogo size="sm" />

            {/* Active session name and lock indicator */}
            {sync.activeSessionId && sync.sessions.length > 0 && (
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-foreground">
                  {sync.sessions.find((s: any) => s.id === sync.activeSessionId)?.label}
                </p>
                {sync.inputLocks[sync.activeSessionId] && sync.inputLocks[sync.activeSessionId] !== clientId && (
                  <button
                    onClick={() => locks.setShowLockedDialog(sync.activeSessionId)}
                    className="rounded hover:bg-red-500/20 transition-colors p-1.5"
                    title="Read-only: another client has control"
                  >
                    <Ban className="text-red-500 flex-shrink-0 h-4 w-4" />
                  </button>
                )}
              </div>
            )}

            {/* Spacer to push menu button right on mobile */}
            <div className="flex-1" />

            {/* Desktop buttons (hidden on mobile) */}
            {!layout.isMobile && (
              <div className="flex items-center gap-2">
                {auth.authStatus === 'authenticated' && sync.activeSessionId && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => layout.setSearchOpen(true)}
                    className="[&_svg]:size-4"
                    title="Find in terminal (Ctrl+F)"
                  >
                    <Search className="h-4 w-4" />
                  </Button>
                )}
                {auth.authStatus === 'authenticated' && sync.activeSessionId && (
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
                {auth.authStatus === 'authenticated' && !auth.isGuestMode && (
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
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowGuestPanel(true)}
                      className="[&_svg]:size-4"
                      title="Guest Links"
                    >
                      <Users className="h-4 w-4" />
                    </Button>
                  </>
                )}
                {!auth.isGuestMode && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowSettings(true)}
                    className="[&_svg]:size-4"
                    title="Settings"
                  >
                    <Settings className="h-4 w-4" />
                  </Button>
                )}
                {!auth.authDisabled && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={auth.handleLogout}
                    className="[&_svg]:size-4"
                    title="Logout"
                  >
                    <LogOut className="h-4 w-4" />
                  </Button>
                )}
              </div>
            )}

            {/* Mobile search button */}
            {layout.isMobile && sync.activeSessionId && (
              <button
                type="button"
                className="p-2 hover:bg-accent rounded transition-colors"
                onClick={() => layout.setSearchOpen(true)}
                title="Find in terminal">
                <Search className="h-5 w-5" />
              </button>
            )}

            {/* Mobile ⋯ menu button — only trigger stays in top bar */}
            {layout.isMobile && (
              <button
                type="button"
                className="p-2 hover:bg-accent rounded transition-colors"
                onClick={() => layout.setMobileMenuOpen(true)}
                title="More options">
                <MoreHorizontal className="h-5 w-5" />
              </button>
            )}
          </div>

          {/* Terminal area */}
          {(() => {
            const keyboardHeight = Math.max(0, window.innerHeight - (layout.viewportHeight ?? window.innerHeight))
            const keyboardVisible = keyboardHeight > 0
            const TOOLBAR_HEIGHT = layout.isMobile && sync.activeSessionId && keyboardVisible ? 44 : 0

            return (
              <>
                <div
                  className={
                    layout.isMobile && sync.activeSessionId
                      ? "fixed inset-x-0 top-[44px] z-30 overflow-hidden"
                      : "flex-1 relative overflow-hidden"
                  }
                  style={layout.isMobile && sync.activeSessionId ? { bottom: `${keyboardHeight + TOOLBAR_HEIGHT}px`, paddingTop: '8px' } : undefined}
                  data-terminal-active={sync.activeSessionId || undefined}
                >
                  {sync.sessions.map((session: any) => (
                    <TerminalPane
                      ref={terminal.getTerminalRef(session.id)}
                      key={session.id}
                      sessionId={session.id}
                      isActive={sync.activeSessionId === session.id}
                      clientId={clientId}
                      lockHeldBy={sync.inputLocks[session.id] ?? null}
                      scrollbackLines={sync.scrollbackLines}
                      fontSize={terminal.fontSize}
                      searchOpen={layout.searchOpen && sync.activeSessionId === session.id}
                      onSearchClose={() => layout.setSearchOpen(false)}
                      onSearchOpen={() => layout.setSearchOpen(true)}
                      onReadOnlyInput={(lockHeldBy) => {
                        const message = lockHeldBy
                          ? `Terminal locked by another browser with Session ID: ${lockHeldBy.split('-').pop()}`
                          : 'Terminal locked by another browser'
                        locks.showNotification(message)
                      }}
                    />
                  ))}
                </div>

                {/* Mobile keyboard toolbar */}
                {layout.isMobile && sync.activeSessionId && keyboardVisible && (
                  <MobileKeyToolbar
                    onKey={terminal.sendToActiveTerminal}
                    keyboardHeight={keyboardHeight}
                    isShiftPressed={layout.isShiftPressed}
                    onCopy={terminal.handleCopy}
                    onSelectAll={terminal.handleSelectAll}
                    onPaste={terminal.handlePaste}
                  />
                )}
              </>
            )
          })()}
        </div>
      </div>

      {/* Dialogs */}
      <SettingsDialog
        open={showSettings}
        onOpenChange={setShowSettings}
        fontSize={terminal.fontSize}
        onFontSizeChange={terminal.handleFontSizeChange}
      />

      <UploadDialog open={showUpload} onOpenChange={setShowUpload} />

      <DownloadDialog open={showDownload} onOpenChange={setShowDownload} />

      {!auth.isGuestMode && (
        <GuestPanel
          open={showGuestPanel}
          onOpenChange={setShowGuestPanel}
          hideTrigger
          guestLinks={guestLinks}
          setGuestLinks={setGuestLinks}
        />
      )}

      {/* Process info popup */}
      <ProcessInfoPopup
        showProcessInfo={showProcessInfo}
        setShowProcessInfo={setShowProcessInfo}
        processInfo={processInfo}
      />

      {/* Hidden input to keep keyboard alive on mobile */}
      {layout.isMobile && (
        <input
          ref={terminal.hiddenInputRef}
          type="text"
          style={{ position: 'absolute', left: '-9999px', width: '1px', height: '1px' }}
          aria-hidden="true"
          tabIndex={-1}
        />
      )}
    </div>
  )
}
