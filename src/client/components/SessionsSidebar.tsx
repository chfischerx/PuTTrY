import { useRef, useState, useEffect } from "react"
import { Loader2, Plus, X, PanelLeftClose, PanelLeftOpen, Pencil, Ban } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ConfirmDialog"
import type { GuestLink } from "@shared/types/guest"
import type { SessionInfo } from "@shared/types/session"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog"

export interface SessionsSidebarProps {
  sessions: SessionInfo[]
  activeSessionId: string | null
  onSelectSession: (sessionId: string) => void
  onNewSession: () => void
  onCloseSession: (sessionId: string) => void
  onRenameSession: (sessionId: string, label: string) => void
  onCloseAllSessions: () => void
  loading?: boolean
  collapsed: boolean
  onToggleCollapse: () => void
  mobileOpen?: boolean
  onMobileClose?: () => void
  width?: number
  onWidthChange?: (width: number) => void
  inputLocks?: Record<string, string | null>
  clientId?: string
  onTakeControl?: (sessionId: string) => void
  dataReceivedSessions?: Set<string>
  guestViewers?: Record<string, string[]>
  guestLinks?: GuestLink[]
  lockRequests?: Record<string, { sessionId: string; guestName: string; requestId: string }>
  isGuestMode?: boolean
}

export function SessionsSidebar({
  sessions,
  activeSessionId,
  onSelectSession,
  onNewSession,
  onCloseSession,
  onRenameSession,
  onCloseAllSessions,
  loading,
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onMobileClose,
  width = 192,
  onWidthChange,
  inputLocks = {},
  guestViewers = {},
  guestLinks = [],
  lockRequests = {},
  clientId = '',
  onTakeControl,
  dataReceivedSessions = new Set(),
  isGuestMode = false,
}: SessionsSidebarProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState("")
  const [lockedSessionDialog, setLockedSessionDialog] = useState<string | null>(null)
  const [closeConfirmDialog, setCloseConfirmDialog] = useState<string | null>(null)
  const [closeAllConfirmDialog, setCloseAllConfirmDialog] = useState(false)
  const editRef = useRef<HTMLInputElement>(null)
  const isResizingRef = useRef(false)
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizingRef.current) return
      // Allow dragging between 180px and 500px
      const newWidth = Math.max(180, Math.min(500, e.clientX))
      onWidthChange?.(newWidth)

      // Auto-collapse if dragging very far left (trying to minimize)
      if (e.clientX < 100) {
        onToggleCollapse()
      }
    }

    const handleMouseUp = () => {
      isResizingRef.current = false
    }

    const handleMouseLeave = () => {
      if (isResizingRef.current) {
        isResizingRef.current = false
      }
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    window.addEventListener('blur', handleMouseLeave)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      window.removeEventListener('blur', handleMouseLeave)
    }
  }, [onWidthChange])

  const handleMouseDown = () => {
    isResizingRef.current = true
  }

  // Determine if this is mobile drawer mode
  const isMobileDrawer = mobileOpen !== undefined

  // Check if current user has control of a session
  const hasControl = (sessionId: string): boolean => {
    const lockHolder = inputLocks?.[sessionId]
    return !lockHolder || lockHolder === clientId
  }

  function startEditing(s: SessionInfo) {
    if (!hasControl(s.id)) return
    setEditingId(s.id)
    setEditValue(s.label)
    // Focus after render
    requestAnimationFrame(() => editRef.current?.focus())
  }

  function commitEdit() {
    if (editingId && editValue.trim()) {
      onRenameSession(editingId, editValue.trim())
    }
    setEditingId(null)
  }

  function handlePointerDown(s: SessionInfo) {
    if (!hasControl(s.id)) return
    longPressTimerRef.current = setTimeout(() => {
      startEditing(s)
    }, 500)
  }

  function handlePointerUp() {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }

  /* ---- Mobile drawer (overlay) ---- */
  if (isMobileDrawer) {
    return (
      <>
        <div
          className={`fixed inset-0 z-40 bg-black/20 transition-opacity duration-200 ${
            mobileOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
          onClick={onMobileClose}
        />
        <div
          className={`fixed inset-0 z-50 flex flex-col bg-sidebar transition-transform duration-200 ease-in-out ${
            mobileOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
        {/* Header with close all button */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <Button
            variant="outline"
            size="default"
            onClick={() => setCloseAllConfirmDialog(true)}
            disabled={sessions.length === 0}
            title="Close all sessions"
          >
            <X className="h-4 w-4 flex-shrink-0" />
            <span className="ml-2">Close All</span>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            title="Close sidebar"
            onClick={onMobileClose}
            className="flex-shrink-0 ml-auto"
          >
            <PanelLeftClose />
          </Button>
        </div>

        {/* Session list */}
        <div className="flex-1 overflow-y-auto py-2">
          {sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground px-4 py-6 text-center">
              No sessions yet
            </p>
          ) : (
            sessions.map((s) => {
              const isActive = s.id === activeSessionId
              const isEditing = editingId === s.id

              return (
                <div
                  key={s.id}
                  className={`flex items-center gap-3 px-4 py-3 mx-2 rounded-md cursor-pointer transition-colors ${
                    isActive
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                  }`}
                  onClick={() => {
                    if (!isEditing) {
                      onSelectSession(s.id)
                      onMobileClose?.()
                    }
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation()
                    startEditing(s)
                  }}
                  onPointerDown={() => handlePointerDown(s)}
                  onPointerUp={handlePointerUp}
                  onPointerLeave={handlePointerUp}
                >
                  <span className={`inline-flex h-2.5 w-2.5 rounded-full flex-shrink-0 bg-green-500 ${dataReceivedSessions.has(s.id) ? 'data-received' : ''}`} />

                  {/* Guest viewers indicator */}
                  {guestViewers[s.id]?.length > 0 && (
                    <span
                      title={`Viewing: ${guestViewers[s.id].join(', ')}`}
                      className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-blue-500/20 text-blue-400 text-xs flex-shrink-0"
                    >
                      👁
                    </span>
                  )}

                  {isEditing ? (
                    <input
                      ref={editRef}
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitEdit()
                        if (e.key === "Escape") setEditingId(null)
                      }}
                      onBlur={commitEdit}
                      onClick={(e) => e.stopPropagation()}
                      className="flex-1 bg-transparent text-sm outline-none border-b border-foreground/30 py-1"
                      autoFocus
                    />
                  ) : (
                    <span className="flex-1 truncate text-sm">{s.label}</span>
                  )}

                  {!isEditing && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {inputLocks[s.id] && inputLocks[s.id] !== clientId && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setLockedSessionDialog(s.id)
                          }}
                          className="p-2.5 rounded hover:bg-red-500/20"
                          title="Read-only: another client has control"
                        >
                          <Ban className="h-5 w-5 text-red-500 flex-shrink-0" />
                        </button>
                      )}
                      <div className="flex items-center gap-1">
                        <button
                          disabled={!hasControl(s.id)}
                          className="p-2.5 rounded hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
                          onClick={(e) => {
                            e.stopPropagation()
                            startEditing(s)
                          }}
                          title={hasControl(s.id) ? "Rename session" : "Only owner can rename"}
                      >
                        <Pencil className="h-5 w-5" />
                      </button>
                      <button
                        disabled={!hasControl(s.id)}
                        className="p-2.5 rounded hover:bg-destructive/20 hover:text-destructive disabled:opacity-50 disabled:cursor-not-allowed"
                        onClick={(e) => {
                          e.stopPropagation()
                          setCloseConfirmDialog(s.id)
                        }}
                        title={hasControl(s.id) ? "Close session" : "Only owner can close"}
                      >
                        <X className="h-5 w-5" />
                      </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>

        {/* Footer with browser session ID, new button, and close button */}
        <div className="border-t border-border px-4 py-3 text-muted-foreground flex items-end gap-2">
          <div className="text-sm space-y-1 flex-1">
            <div className="text-muted-foreground/70">Session ID:</div>
            <div className="font-mono text-sm text-foreground/80" title={clientId}>{clientId.split('-').pop()}</div>
          </div>
          <div className="flex-1 flex justify-center">
            <Button
              variant="outline"
              size="default"
              onClick={onNewSession}
              disabled={loading}
              title="New session"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin flex-shrink-0" />
              ) : (
                <Plus className="h-4 w-4 flex-shrink-0" />
              )}
              <span className="ml-2">New</span>
            </Button>
          </div>
          <Button
            variant="ghost"
            size="icon"
            title="Close sidebar"
            onClick={onMobileClose}
            className="flex-shrink-0"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
        </div>

        {/* Dialogs */}
        {/* Close Session Confirmation Dialog */}
        <ConfirmDialog
          open={closeConfirmDialog !== null}
          onOpenChange={(open) => !open && setCloseConfirmDialog(null)}
          title="Close Session?"
          description="Are you sure you want to close this session? This action cannot be undone."
          confirmLabel="Close Session"
          confirmVariant="destructive"
          onConfirm={() => {
            if (closeConfirmDialog) {
              onCloseSession(closeConfirmDialog)
            }
            setCloseConfirmDialog(null)
          }}
        />

        <ConfirmDialog
          open={lockedSessionDialog !== null}
          onOpenChange={(open) => !open && setLockedSessionDialog(null)}
          title="Session In Use"
          description={(() => {
            const lockClientId = inputLocks?.[lockedSessionDialog || '']
            const guestName = lockClientId
              ? guestLinks.find(l => l.sessionIds.includes(lockClientId))?.name
              : undefined
            return (
              <>
                This session is currently being used by {guestName ? `guest ${guestName}` : 'another client'} <span className="font-mono text-xs">({inputLocks?.[lockedSessionDialog || '']?.slice(-12)})</span>. Would you like to {isGuestMode ? 'request control' : 'take control'}?
              </>
            )
          })()}
          confirmLabel={isGuestMode ? 'Request Control' : 'Take Control'}
          onConfirm={() => {
            if (onTakeControl && lockedSessionDialog) {
              onTakeControl(lockedSessionDialog)
            }
            setLockedSessionDialog(null)
          }}
        />

        <ConfirmDialog
          open={closeAllConfirmDialog}
          onOpenChange={setCloseAllConfirmDialog}
          title="Close All Sessions?"
          description={`Are you sure you want to close all ${sessions.length} session${sessions.length !== 1 ? 's' : ''}? This action cannot be undone.`}
          confirmLabel="Close All"
          confirmVariant="destructive"
          onConfirm={() => {
            onCloseAllSessions()
            setCloseAllConfirmDialog(false)
          }}
        />
      </>
    )
  }

  /* ---- Collapsed ---- */
  if (collapsed) {
    return (
      <div className="flex flex-col items-center h-full w-11 min-w-[2.75rem] border-r border-border bg-sidebar py-2 gap-1">
        <Button
          variant="ghost"
          size="icon-sm"
          title="Expand sidebar"
          onClick={onToggleCollapse}
          className="[&_svg]:size-4 mb-1"
        >
          <PanelLeftOpen />
        </Button>

        <Button
          variant="ghost"
          size="icon-sm"
          title="New session"
          onClick={onNewSession}
          disabled={loading}
          className="[&_svg]:size-4"
        >
          {loading ? <Loader2 className="animate-spin" /> : <Plus />}
        </Button>

        <div className="w-6 border-t border-border my-1" />

        <div className="flex-1 overflow-y-auto flex flex-col items-center gap-1">
          {sessions.map((s) => {
            const isActive = s.id === activeSessionId
            // Extract first two letters from session name, uppercase
            const abbrev = s.label.slice(0, 2).toUpperCase()
            return (
              <button
                key={s.id}
                title={s.label}
                onClick={() => onSelectSession(s.id)}
                className={`relative flex items-center justify-center w-8 h-8 rounded-md text-xs font-mono font-medium transition-colors ${
                  isActive
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                }`}
              >
                <span>{abbrev}</span>
                <span className={`absolute bottom-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-green-500 ${dataReceivedSessions.has(s.id) ? 'data-received' : ''}`} />
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  /* ---- Expanded ---- */
  return (
    <div
      className="flex h-full bg-sidebar relative"
      style={{ width: `${width}px` }}
    >
      <div className="flex flex-col flex-1">
      {/* Header */}
      <div className="flex items-center gap-1 px-2 pt-2 pb-2 border-b border-border relative">
        <Button
          variant="outline"
          size="sm"
          onClick={onNewSession}
          disabled={loading}
          title="New session"
          className="px-2"
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin flex-shrink-0" />
          ) : (
            <Plus className="h-3.5 w-3.5 flex-shrink-0" />
          )}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setCloseAllConfirmDialog(true)}
          disabled={sessions.length === 0}
          title="Close all sessions"
          className="px-2"
        >
          <X className="h-3.5 w-3.5 flex-shrink-0" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          title="Collapse sidebar"
          onClick={onToggleCollapse}
          className="[&_svg]:size-4 flex-shrink-0 ml-auto"
        >
          <PanelLeftClose />
        </Button>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto py-1">
        {sessions.length === 0 ? (
          <p className="text-xs text-muted-foreground px-3 py-4 text-center">
            No sessions yet
          </p>
        ) : (
          sessions.map((s) => {
            const isActive = s.id === activeSessionId
            const isEditing = editingId === s.id

            return (
              <div
                key={s.id}
                className={`group flex items-center gap-2 px-2 py-1.5 mx-1 rounded-md cursor-pointer transition-colors ${
                  isActive
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                }`}
                onClick={() => {
                  if (!isEditing) onSelectSession(s.id)
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation()
                  startEditing(s)
                }}
              >
                <span className={`inline-flex h-2 w-2 rounded-full flex-shrink-0 bg-green-500 ${dataReceivedSessions.has(s.id) ? 'data-received' : ''}`} />

                {isEditing ? (
                  <input
                    ref={editRef}
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitEdit()
                      if (e.key === "Escape") setEditingId(null)
                    }}
                    onBlur={commitEdit}
                    onClick={(e) => e.stopPropagation()}
                    className="flex-1 bg-transparent text-xs outline-none border-b border-foreground/30 py-0"
                    autoFocus
                  />
                ) : (
                  <span className="flex-1 truncate text-xs">{s.label}</span>
                )}

                {!isEditing && (
                  <div className="flex items-center gap-0.5 flex-shrink-0">
                    {inputLocks[s.id] && inputLocks[s.id] !== clientId && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setLockedSessionDialog(s.id)
                        }}
                        className="p-0.5 rounded hover:bg-red-500/20"
                        title="Read-only: another client has control"
                      >
                        <Ban className="h-3 w-3 text-red-500 flex-shrink-0" />
                      </button>
                    )}
                    <div className="flex items-center gap-0.5">
                    <button
                      disabled={!hasControl(s.id)}
                      className="p-0.5 rounded hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
                      onClick={(e) => {
                        e.stopPropagation()
                        startEditing(s)
                      }}
                      title={hasControl(s.id) ? "Rename session" : "Only owner can rename"}
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button
                      disabled={!hasControl(s.id)}
                      className="p-0.5 rounded hover:bg-destructive/20 hover:text-destructive disabled:opacity-50 disabled:cursor-not-allowed"
                      onClick={(e) => {
                        e.stopPropagation()
                        setCloseConfirmDialog(s.id)
                      }}
                      title={hasControl(s.id) ? "Close session" : "Only owner can close"}
                    >
                      <X className="h-3 w-3" />
                    </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Footer with browser session ID */}
      <div className="border-t border-border px-3 py-2 text-muted-foreground">
        <div className="text-xs space-y-1">
          <div className="text-muted-foreground/70">Session ID:</div>
          <div className="font-mono text-xs text-foreground/80" title={clientId}>{clientId.split('-').pop()}</div>
        </div>
      </div>

      {/* Dialogs */}
      <ConfirmDialog
        open={closeConfirmDialog !== null}
        onOpenChange={(open) => !open && setCloseConfirmDialog(null)}
        title="Close Session?"
        description="Are you sure you want to close this session? This action cannot be undone."
        confirmLabel="Close Session"
        confirmVariant="destructive"
        onConfirm={() => {
          if (closeConfirmDialog) {
            onCloseSession(closeConfirmDialog)
          }
          setCloseConfirmDialog(null)
        }}
      />

      <ConfirmDialog
        open={lockedSessionDialog !== null}
        onOpenChange={(open) => !open && setLockedSessionDialog(null)}
        title="Session In Use"
        description={(() => {
          const lockClientId = inputLocks?.[lockedSessionDialog || '']
          const guestName = lockClientId
            ? guestLinks.find(l => l.sessionIds.includes(lockClientId))?.name
            : undefined
          return (
            <>
              This session is currently being used by {guestName ? `guest ${guestName}` : 'another client'} <span className="font-mono text-xs">({inputLocks?.[lockedSessionDialog || '']?.slice(-12)})</span>. Would you like to {isGuestMode ? 'request control' : 'take control'}?
            </>
          )
        })()}
        confirmLabel={isGuestMode ? 'Request Control' : 'Take Control'}
        onConfirm={() => {
          if (onTakeControl && lockedSessionDialog) {
            onTakeControl(lockedSessionDialog)
          }
          setLockedSessionDialog(null)
        }}
      />

      <ConfirmDialog
        open={closeAllConfirmDialog}
        onOpenChange={setCloseAllConfirmDialog}
        title="Close All Sessions?"
        description={`Are you sure you want to close all ${sessions.length} session${sessions.length !== 1 ? 's' : ''}? This action cannot be undone.`}
        confirmLabel="Close All"
        confirmVariant="destructive"
        onConfirm={() => {
          onCloseAllSessions()
          setCloseAllConfirmDialog(false)
        }}
      />
      </div>

      {/* Guest Lock Request Dialogs */}
      {Object.values(lockRequests).map((request) => {
        const session = sessions.find(s => s.id === request.sessionId)
        return (
          <Dialog key={request.requestId} open={true} onOpenChange={() => {}}>
            <DialogContent className="sm:max-w-sm px-4">
              <DialogHeader className="px-0">
                <DialogTitle>Guest Requests Control</DialogTitle>
              </DialogHeader>
              <DialogBody className="px-0">
                <p className="text-sm text-muted-foreground">
                  Guest {request.guestName} wants to take control of terminal session {session?.label || 'Unknown'}.
                </p>
              </DialogBody>
              <DialogFooter className="px-0">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    const res = await fetch(`/api/guest/lock-requests/${request.requestId}/deny`, { method: 'POST', credentials: 'include' })
                    if (res.ok) {
                      // Dialog will auto-dismiss via sync event
                    }
                  }}
                >
                  Deny
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={async () => {
                    const res = await fetch(`/api/guest/lock-requests/${request.requestId}/approve`, { method: 'POST', credentials: 'include' })
                    if (res.ok) {
                      // Dialog will auto-dismiss via sync event
                    }
                  }}
                >
                  Approve
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )
      })}

      {/* Resize handle */}
      <div
        onMouseDown={handleMouseDown}
        className="absolute right-0 top-1/2 -translate-y-1/2 w-1 cursor-col-resize bg-border hover:bg-primary/50 transition-colors"
        style={{ height: '40px' }}
        title="Drag to resize sidebar"
      />
    </div>
  )
}
