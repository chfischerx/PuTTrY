import { useState, useEffect } from 'react'

interface UseMobileLayoutReturn {
  isMobile: boolean
  viewportHeight: number | null
  isShiftPressed: boolean
  searchOpen: boolean
  sidebarCollapsed: boolean
  sidebarWidth: number
  sidebarMobileOpen: boolean
  mobileMenuOpen: boolean
  setIsMobile: (value: boolean) => void
  setViewportHeight: (value: number | null) => void
  setIsShiftPressed: (value: boolean) => void
  setSearchOpen: (value: boolean) => void
  setSidebarCollapsed: (value: boolean) => void
  setSidebarWidth: (value: number) => void
  setSidebarMobileOpen: (value: boolean) => void
  setMobileMenuOpen: (value: boolean) => void
}

export function useMobileLayout(params: {
  activeSessionId: string | null
  terminalRefs: React.MutableRefObject<Map<string, React.RefObject<any | null>>>
  hiddenInputRef: React.MutableRefObject<HTMLInputElement | null>
  isGuestMode: boolean
}): UseMobileLayoutReturn {
  const { activeSessionId, hiddenInputRef } = params

  // Mobile layout state
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [sidebarWidth, setSidebarWidth] = useState(192)
  const [sidebarMobileOpen, setSidebarMobileOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [viewportHeight, setViewportHeight] = useState<number | null>(null)
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768)
  const [isShiftPressed, setIsShiftPressed] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)

  // Track visualViewport for soft keyboard handling
  useEffect(() => {
    const vvp = window.visualViewport
    if (!vvp) return
    const handler = () => setViewportHeight(vvp.height)

    // Listen to multiple events for faster keyboard detection
    vvp.addEventListener('resize', handler)
    vvp.addEventListener('scroll', handler)

    // Hide toolbar immediately when user taps away from keyboard
    const handleTouchEnd = () => {
      // Use a very short delay to let current touch action complete
      requestAnimationFrame(() => {
        handler()
      })
    }
    window.addEventListener('touchend', handleTouchEnd)

    return () => {
      vvp.removeEventListener('resize', handler)
      vvp.removeEventListener('scroll', handler)
      window.removeEventListener('touchend', handleTouchEnd)
    }
  }, [])

  // Keep a hidden input focused on mobile to prevent iOS from dismissing keyboard
  useEffect(() => {
    if (!isMobile || !activeSessionId) return

    const input = hiddenInputRef.current
    if (!input) return

    // Focus the hidden input
    input.focus()

    // Refocus if it loses focus, but not when clicking terminal or toolbar
    const handleBlur = (e: FocusEvent) => {
      const relatedTarget = e.relatedTarget as HTMLElement | null
      // Don't refocus if moving to terminal or toolbar
      if (relatedTarget?.closest('[data-terminal-active]') || relatedTarget?.closest('button[type="button"]')) {
        return
      }
      setTimeout(() => input.focus(), 0)
    }

    input.addEventListener('blur', handleBlur as EventListener)
    return () => input.removeEventListener('blur', handleBlur as EventListener)
  }, [isMobile, activeSessionId, hiddenInputRef])

  // Track shift key at document level so it works even when focus is on toolbar buttons
  useEffect(() => {
    if (!isMobile) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setIsShiftPressed(true)
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setIsShiftPressed(false)
    }

    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('keyup', handleKeyUp)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('keyup', handleKeyUp)
    }
  }, [isMobile])

  // Global Ctrl+F handler for search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'f' && !e.shiftKey && !e.altKey && !e.metaKey) {
        e.preventDefault()
        setSearchOpen(true)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  // Detect mobile with matchMedia
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  return {
    isMobile,
    viewportHeight,
    isShiftPressed,
    searchOpen,
    sidebarCollapsed,
    sidebarWidth,
    sidebarMobileOpen,
    mobileMenuOpen,
    setIsMobile,
    setViewportHeight,
    setIsShiftPressed,
    setSearchOpen,
    setSidebarCollapsed,
    setSidebarWidth,
    setSidebarMobileOpen,
    setMobileMenuOpen,
  }
}
