import { useState } from "react"
import { Copy, Trash2, Plus, Users, X } from "lucide-react"
import toast from "react-hot-toast"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ConfirmDialog"
import type { GuestLink } from "@shared/types/guest"

interface GuestPanelProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  hideTrigger?: boolean
  guestLinks: GuestLink[]
  setGuestLinks: (links: GuestLink[]) => void
}

export function GuestPanel({ open, onOpenChange, hideTrigger, guestLinks, setGuestLinks }: GuestPanelProps = {} as any) {
  const [showDialog, setShowDialog] = useState(false)

  const isOpen = open !== undefined ? open : showDialog
  const setIsOpen = onOpenChange !== undefined ? onOpenChange : setShowDialog
  const [showRemoveAllDialog, setShowRemoveAllDialog] = useState(false)
  const [revokeLinkId, setRevokeLinkId] = useState<string | null>(null)
  const [newLinkName, setNewLinkName] = useState("")
  const guestCount = guestLinks.reduce((sum, link) => sum + link.activeSessions, 0)

  function isNameUnique(name: string): boolean {
    return !guestLinks.some(link => link.name.toLowerCase() === name.toLowerCase())
  }

  async function createLink() {
    if (!newLinkName.trim()) {
      toast.error("Name is required")
      return
    }

    if (!isNameUnique(newLinkName.trim())) {
      toast.error("A guest link with this name already exists")
      return
    }

    try {
      const response = await fetch("/api/guest-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newLinkName.trim() }),
        credentials: "include",
      })

      if (!response.ok) {
        const error = await response.json()
        toast.error(error.error || "Failed to create guest link")
        return
      }

      const newLink = await response.json()
      setGuestLinks([...guestLinks, newLink])
      setNewLinkName("")
      toast.success(`Created guest link: ${newLink.name}`)
    } catch (err) {
      toast.error("Failed to create guest link")
    }
  }

  async function revokeLink(id: string) {
    try {
      const response = await fetch(`/api/guest-links/${id}`, {
        method: "DELETE",
        credentials: "include",
      })

      if (!response.ok) {
        toast.error("Failed to revoke guest link")
        return
      }

      setGuestLinks(guestLinks.filter((link) => link.id !== id))
      toast.success("Guest link revoked")
    } catch (err) {
      toast.error("Failed to revoke guest link")
    }
  }

  async function confirmRevokeAllLinks() {
    try {
      await Promise.all(
        guestLinks.map((link) =>
          fetch(`/api/guest-links/${link.id}`, {
            method: "DELETE",
            credentials: "include",
          })
        )
      )
      setGuestLinks([])
      setShowRemoveAllDialog(false)
      toast.success("All guest links revoked")
    } catch (err) {
      toast.error("Failed to revoke guest links")
    }
  }

  function copyLink(url: string) {
    navigator.clipboard.writeText(url)
    toast.success("Link copied to clipboard")
  }

  function getFullUrl(linkId: string): string {
    const baseUrl = window.location.origin
    return `${baseUrl}/guest/${linkId}`
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      {!hideTrigger && (
        <DialogTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="relative [&_svg]:size-4"
            title="Guest sessions"
          >
            <Users className="h-4 w-4" />
            {guestCount > 0 && (
              <span className="absolute -top-1 -right-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-xs text-destructive-foreground font-bold">
                {guestCount}
              </span>
            )}
          </Button>
        </DialogTrigger>
      )}

      <DialogContent className="w-[95vw] max-w-lg sm:max-w-lg">
        <div className="flex flex-row items-center justify-between -mx-6 px-6 pb-0 border-b border-border">
          <DialogHeader className="mb-0 border-0">
            <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
              <Users className="h-5 w-5" />
              Guest Links
            </DialogTitle>
          </DialogHeader>
          <button
            onClick={() => setIsOpen(false)}
            className="rounded-md opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none ml-2 mr-4 min-h-10 min-w-10 flex items-center justify-center flex-shrink-0"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-5 mt-3 mb-4 max-h-[70vh] overflow-y-auto px-6 sm:px-4">
          {/* Create new guest link section */}
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-foreground">Add New Guest Link</h3>
            <p className="text-xs text-muted-foreground">
              Give this invite link a descriptive name to remember who it's for
            </p>
            <div className="flex items-center gap-2">
              <input
                id="link-name"
                type="text"
                placeholder="e.g., Team review, Support access"
                value={newLinkName}
                onChange={(e) => setNewLinkName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && createLink()}
                className="flex-1 px-4 py-2 rounded-md border border-input bg-background text-base sm:text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:ring-ring/50 focus:ring-[3px] outline-none"
              />
              <Button
                onClick={createLink}
                disabled={!newLinkName.trim() || !isNameUnique(newLinkName.trim())}
                size="sm"
                className="flex-shrink-0"
              >
                <Plus className="h-4 w-4 mr-2" />
                Create
              </Button>
            </div>
          </div>
          {/* Guest links list section */}
          <div className="space-y-2 pt-3 sm:pt-3 border-t border-border">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-medium text-foreground">Active Links</h3>
              {guestLinks.length > 0 && (
                <Button
                  onClick={() => setShowRemoveAllDialog(true)}
                  variant="destructive"
                  size="sm"
                  className="text-xs sm:text-sm"
                >
                  Remove All
                </Button>
              )}
            </div>
            {guestLinks.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-6">No guest links yet</div>
            ) : (
              <div className="border border-border rounded-md p-2 sm:p-3 bg-gray-100 space-y-2">
                {guestLinks.map((link) => (
                  <div
                    key={link.id}
                    className="flex flex-row items-start sm:items-center gap-1 sm:gap-2 justify-between p-3 sm:p-2 rounded-md border border-border bg-white hover:bg-gray-50 transition-colors text-sm"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-foreground truncate">{link.name}</div>
                      <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                        {link.sessionIds.length > 0 ? (
                          <div className="font-mono text-primary space-y-0.5">
                            {link.sessionIds.map(id => (
                              <div key={id} className="truncate">{id.slice(-12)}</div>
                            ))}
                          </div>
                        ) : link.status === "used" ? (
                          <span className="text-destructive">Used</span>
                        ) : (
                          <span>Unused</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 sm:gap-2 flex-shrink-0">
                      <Button
                        variant="ghost"
                        onClick={() => copyLink(getFullUrl(link.id))}
                        title="Copy link"
                        className="h-10 w-10 sm:h-8 sm:w-8 p-0 flex-shrink-0"
                      >
                        <Copy className="h-6 w-6 sm:h-5 sm:w-5" />
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => setRevokeLinkId(link.id)}
                        title="Revoke"
                        className="h-10 w-10 sm:h-8 sm:w-8 p-0 flex-shrink-0 hover:text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-6 w-6 sm:h-5 sm:w-5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>

      {/* Remove single link confirmation dialog */}
      <ConfirmDialog
        open={revokeLinkId !== null}
        onOpenChange={(open) => !open && setRevokeLinkId(null)}
        title="Remove Guest Link"
        description="Remove this guest link? Active sessions using this link will be disconnected."
        confirmLabel="Remove"
        confirmVariant="destructive"
        onConfirm={() => {
          if (revokeLinkId) {
            revokeLink(revokeLinkId)
            setRevokeLinkId(null)
          }
        }}
      />

      {/* Remove all confirmation dialog */}
      <ConfirmDialog
        open={showRemoveAllDialog}
        onOpenChange={setShowRemoveAllDialog}
        title="Remove All Guest Links"
        description="This will revoke all guest links and disconnect all active sessions. This action cannot be undone."
        confirmLabel="Remove All"
        confirmVariant="destructive"
        onConfirm={confirmRevokeAllLinks}
      />
    </Dialog>
  )
}
