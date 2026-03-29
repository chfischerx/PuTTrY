import { useRef, useState, useEffect } from "react"
import { Loader2, Plus, X, PanelLeftClose, PanelLeftOpen, Pencil, Ban } from "lucide-react"
import { Button } from "@/components/ui/button"

export interface SessionInfo {
  id: string
  label: string
  createdAt: string
  cols: number
  rows: number
  inputLockClientId?: string | null
}

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
  clientId = '',
  onTakeControl,
  dataReceivedSessions = new Set(),
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
        {closeConfirmDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="fixed inset-0 bg-black/50" onClick={() => setCloseConfirmDialog(null)} />
            <div className="relative bg-card border border-border rounded-lg p-6 shadow-lg max-w-sm mx-4">
              <h2 className="text-lg font-semibold mb-2">Close Session?</h2>
              <p className="text-sm text-muted-foreground mb-6">
                Are you sure you want to close this session? This action cannot be undone.
              </p>
              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCloseConfirmDialog(null)}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    if (closeConfirmDialog) {
                      onCloseSession(closeConfirmDialog)
                    }
                    setCloseConfirmDialog(null)
                  }}
                >
                  Close Session
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Locked Session Dialog */}
        {lockedSessionDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="fixed inset-0 bg-black/50" onClick={() => setLockedSessionDialog(null)} />
            <div className="relative bg-card border border-border rounded-lg p-6 shadow-lg max-w-sm mx-4">
              <h2 className="text-lg font-semibold mb-2">Session In Use</h2>
              <p className="text-sm text-muted-foreground mb-6">
                This session is currently being used by another client. Would you like to take control?
              </p>
              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setLockedSessionDialog(null)}
                >
                  Cancel
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => {
                    if (onTakeControl && lockedSessionDialog) {
                      onTakeControl(lockedSessionDialog)
                    }
                    setLockedSessionDialog(null)
                  }}
                >
                  Take Control
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Close All Sessions Confirmation Dialog */}
        {closeAllConfirmDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="fixed inset-0 bg-black/50" onClick={() => setCloseAllConfirmDialog(false)} />
            <div className="relative bg-card border border-border rounded-lg p-6 shadow-lg max-w-sm mx-4">
              <h2 className="text-lg font-semibold mb-2">Close All Sessions?</h2>
              <p className="text-sm text-muted-foreground mb-6">
                Are you sure you want to close all {sessions.length} session{sessions.length !== 1 ? 's' : ''}? This action cannot be undone.
              </p>
              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCloseAllConfirmDialog(false)}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    onCloseAllSessions()
                    setCloseAllConfirmDialog(false)
                  }}
                >
                  Close All
                </Button>
              </div>
            </div>
          </div>
        )}
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
      {/* Close Session Confirmation Dialog */}
      {closeConfirmDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => setCloseConfirmDialog(null)} />
          <div className="relative bg-card border border-border rounded-lg p-6 shadow-lg max-w-sm mx-4">
            <h2 className="text-lg font-semibold mb-2">Close Session?</h2>
            <p className="text-sm text-muted-foreground mb-6">
              Are you sure you want to close this session? This action cannot be undone.
            </p>
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCloseConfirmDialog(null)}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  if (closeConfirmDialog) {
                    onCloseSession(closeConfirmDialog)
                  }
                  setCloseConfirmDialog(null)
                }}
              >
                Close Session
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Locked Session Dialog */}
      {lockedSessionDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => setLockedSessionDialog(null)} />
          <div className="relative bg-card border border-border rounded-lg p-6 shadow-lg max-w-sm mx-4">
            <h2 className="text-lg font-semibold mb-2">Session In Use</h2>
            <p className="text-sm text-muted-foreground mb-6">
              This session is currently being used by another client. Would you like to take control?
            </p>
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setLockedSessionDialog(null)}
              >
                Cancel
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={() => {
                  if (onTakeControl && lockedSessionDialog) {
                    onTakeControl(lockedSessionDialog)
                  }
                  setLockedSessionDialog(null)
                }}
              >
                Take Control
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Close All Sessions Confirmation Dialog */}
      {closeAllConfirmDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => setCloseAllConfirmDialog(false)} />
          <div className="relative bg-card border border-border rounded-lg p-6 shadow-lg max-w-sm mx-4">
            <h2 className="text-lg font-semibold mb-2">Close All Sessions?</h2>
            <p className="text-sm text-muted-foreground mb-6">
              Are you sure you want to close all {sessions.length} session{sessions.length !== 1 ? 's' : ''}? This action cannot be undone.
            </p>
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCloseAllConfirmDialog(false)}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  onCloseAllSessions()
                  setCloseAllConfirmDialog(false)
                }}
              >
                Close All
              </Button>
            </div>
          </div>
        </div>
      )}
      </div>

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
