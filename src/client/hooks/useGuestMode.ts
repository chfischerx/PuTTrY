import { useState, useEffect } from 'react'
import type { GuestLink } from '@shared/types/guest'

interface UseGuestModeReturn {
  guestLinks: GuestLink[]
  setGuestLinks: (links: GuestLink[]) => void
}

export function useGuestMode(params: {
  authStatus: 'loading' | 'unauthenticated' | 'authenticated' | 'totp-setup' | 'totp-verify' | 'passkey-verify'
  isGuestMode: boolean
}): UseGuestModeReturn {
  const { authStatus, isGuestMode } = params

  const [guestLinks, setGuestLinks] = useState<GuestLink[]>([])

  // Poll guest links when authenticated and not in guest mode
  useEffect(() => {
    if (authStatus !== 'authenticated' || isGuestMode) {
      return
    }

    async function loadGuestLinks() {
      try {
        const response = await fetch('/api/guest-links', {
          credentials: 'include',
        })
        if (response.ok) {
          const data: GuestLink[] = await response.json()
          setGuestLinks(data)
        }
      } catch (err) {
        // Guest links fetch is optional; failure is not critical
      }
    }

    loadGuestLinks()
    const interval = setInterval(loadGuestLinks, 5000)
    return () => clearInterval(interval)
  }, [authStatus, isGuestMode])

  return {
    guestLinks,
    setGuestLinks,
  }
}
