import { useRef, useState, useCallback, createRef } from 'react'
import toast from 'react-hot-toast'
import type { TerminalPaneHandle } from '@/components/TerminalPane'

interface UseTerminalReturn {
  terminalRefs: React.MutableRefObject<Map<string, React.RefObject<TerminalPaneHandle | null>>>
  hiddenInputRef: React.MutableRefObject<HTMLInputElement | null>
  fontSize: number
  getTerminalRef: (sessionId: string) => React.RefObject<TerminalPaneHandle | null>
  sendToActiveTerminal: (data: string) => void
  handleCopy: () => void
  handleSelectAll: () => void
  handlePaste: () => Promise<void>
  handleFontSizeChange: (size: number) => void
}

export function useTerminal(params: {
  activeSessionId: string | null
}): UseTerminalReturn {
  const { activeSessionId } = params

  // Terminal refs for mobile keyboard toolbar
  const terminalRefs = useRef<Map<string, React.RefObject<TerminalPaneHandle | null>>>(new Map())

  // Hidden input to keep keyboard alive on mobile
  const hiddenInputRef = useRef<HTMLInputElement | null>(null)

  // Font size state
  const [fontSize, setFontSize] = useState<number>(() => {
    const stored = localStorage.getItem('terminal-font-size')
    return stored ? Number(stored) : 14
  })

  // Get or create a ref for each session
  const getTerminalRef = useCallback((sessionId: string) => {
    if (!terminalRefs.current.has(sessionId)) {
      terminalRefs.current.set(sessionId, createRef<TerminalPaneHandle | null>())
    }
    return terminalRefs.current.get(sessionId)!
  }, [])

  // Helper to send data to the active terminal
  const sendToActiveTerminal = useCallback(
    (data: string) => {
      if (!activeSessionId) return
      terminalRefs.current.get(activeSessionId)?.current?.sendData(data)
      // Refocus terminal container on mobile to prevent keyboard dismissal
      if (window.innerWidth < 768) {
        setTimeout(() => {
          const terminalContainer = document.querySelector('[data-terminal-active]')
          if (terminalContainer) {
            (terminalContainer as HTMLElement).focus()
          }
        }, 0)
      }
    },
    [activeSessionId]
  )

  // Clipboard handlers
  const handleCopy = useCallback(() => {
    if (!activeSessionId) return
    try {
      const termRef = terminalRefs.current.get(activeSessionId)?.current
      termRef?.copy()
      toast.success('Copied to clipboard', { duration: 2000 })
    } catch (e) {
      toast.error('Failed to copy')
    }
  }, [activeSessionId])

  const handleSelectAll = useCallback(() => {
    if (!activeSessionId) return
    terminalRefs.current.get(activeSessionId)?.current?.selectAll()
  }, [activeSessionId])

  const handlePaste = useCallback(async () => {
    try {
      if (!navigator.clipboard) {
        toast.error('Clipboard API not available. Try on a real device or enable in simulator settings.')
        return
      }
      const text = await navigator.clipboard.readText()
      if (text) {
        sendToActiveTerminal(text)
        toast.success('Pasted', { duration: 1500 })
      } else {
        toast.error('Clipboard is empty')
      }
    } catch (e) {
      const error = e as Error
      const errorMsg = error.name === 'NotAllowedError'
        ? 'iOS: Grant clipboard permission in Settings → Privacy → Clipboard'
        : error.name === 'NotSupportedError'
        ? 'Clipboard not supported on this browser'
        : `Paste failed: ${error.message}`
      toast.error(errorMsg)
    }
  }, [sendToActiveTerminal])

  // Handle font size change
  const handleFontSizeChange = useCallback((size: number) => {
    setFontSize(size)
    localStorage.setItem('terminal-font-size', String(size))
  }, [])

  return {
    terminalRefs,
    hiddenInputRef,
    fontSize,
    getTerminalRef,
    sendToActiveTerminal,
    handleCopy,
    handleSelectAll,
    handlePaste,
    handleFontSizeChange,
  }
}
