import { useRef, useState, useCallback, useEffect } from 'react'
import toast from 'react-hot-toast'
import type { GuestLink } from '@shared/types/guest'

interface UseInputLocksReturn {
  showLockedDialog: string | null
  setShowLockedDialog: (sessionId: string | null) => void
  handleTakeControl: (sessionId: string) => void
  showNotification: (message: string) => void
}

export function useInputLocks(params: {
  inputLocks: Record<string, string | null>
  clientId: string
  isGuestMode: boolean
  guestLinks: GuestLink[]
}): UseInputLocksReturn {
  const { inputLocks, clientId, isGuestMode } = params

  const [showLockedDialog, setShowLockedDialog] = useState<string | null>(null)
  const lastToastTimeRef = useRef<number>(0)
  const prevLocksRef = useRef<Record<string, string | null>>({})

  // Notification helper using react-hot-toast (debounced)
  const showNotification = useCallback((message: string) => {
    const now = Date.now()
    const toastDuration = 3000

    // Only show if enough time has passed since the last toast
    if (now - lastToastTimeRef.current < toastDuration) {
      return
    }

    toast.error(message, {
      position: 'bottom-right',
      duration: toastDuration,
    })
    lastToastTimeRef.current = now
  }, [])

  // Handle take control request
  const handleTakeControl = useCallback(
    (sessionId: string) => {
      const ws = new WebSocket(
        `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/terminal/${sessionId}?clientId=${encodeURIComponent(clientId)}`
      )
      ws.onopen = () => {
        if (isGuestMode) {
          // Guests send a request-lock message
          ws.send(JSON.stringify({ type: 'request-lock' }))
          toast.loading('Requesting control. Waiting for owner approval...', {
            duration: 3000,
          })
        } else {
          // Owners force-acquire the lock
          ws.send(JSON.stringify({ type: 'acquire-lock', force: true }))
        }
      }
      // Keep connection open for 500ms to ensure message is processed, then close
      setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.close()
        }
      }, 500)
    },
    [clientId, isGuestMode]
  )

  // Detect when current client loses control of a session
  useEffect(() => {
    for (const [sessionId, currentLock] of Object.entries(inputLocks)) {
      const prevLock = prevLocksRef.current[sessionId]
      // If we had the lock and now we don't (someone else took it)
      if (prevLock === clientId && currentLock !== clientId && currentLock !== null) {
        showNotification(`Session control lost to another browser with Session ID: ${currentLock.split('-').pop()}`)
      }
    }
    prevLocksRef.current = { ...inputLocks }
  }, [inputLocks, clientId, showNotification])

  return {
    showLockedDialog,
    setShowLockedDialog,
    handleTakeControl,
    showNotification,
  }
}
