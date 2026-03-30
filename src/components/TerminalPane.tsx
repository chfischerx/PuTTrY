import { useEffect, useRef, useState, forwardRef, useImperativeHandle, useCallback } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { SearchAddon } from '@xterm/addon-search'
import { TerminalSearchBar, type SearchOptions } from './TerminalSearchBar'
import '@xterm/xterm/css/xterm.css'

// Minimal scrollbar styling
const style = document.createElement('style')
style.textContent = `
  .xterm-viewport::-webkit-scrollbar {
    width: 0 !important;
  }
`
document.head.appendChild(style)


interface TerminalPaneProps {
  sessionId: string
  isActive: boolean
  clientId: string
  lockHeldBy: string | null
  scrollbackLines?: number
  fontSize?: number
  onReadOnlyInput?: (lockHeldBy: string | null) => void
  searchOpen?: boolean
  onSearchClose?: () => void
  onSearchOpen?: () => void
}

export interface TerminalPaneHandle {
  sendData: (data: string) => void
  copy: () => void
  selectAll: () => void
  clearSelection: () => void
  hasSelection: () => boolean
  acquireLock: () => void
}

// Global terminal cache to preserve instances across session switches
const terminalCache = new Map<string, { terminal: Terminal; fitAddon: FitAddon; searchAddon: SearchAddon }>()

const TerminalPane = forwardRef<TerminalPaneHandle, TerminalPaneProps>(({ sessionId, isActive, clientId, lockHeldBy, scrollbackLines = 10000, fontSize = 14, onReadOnlyInput, searchOpen = false, onSearchClose, onSearchOpen }, ref) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const searchAddonRef = useRef<SearchAddon | null>(null)
  const searchResultDisposableRef = useRef<{ dispose: () => void } | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const observerRef = useRef<ResizeObserver | null>(null)
  const dataDisposableRef = useRef<{ dispose: () => void } | null>(null)
  const [optimisticLock, setOptimisticLock] = useState(false)
  const [reconnectKey, setReconnectKey] = useState(0)
  const [searchResult, setSearchResult] = useState<{ resultIndex: number; resultCount: number } | null>(null)
  const isActiveRef = useRef(isActive)
  isActiveRef.current = isActive
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Derive whether this client holds the lock
  // Use optimistic state while waiting for server confirmation
  const hasLock = optimisticLock || lockHeldBy === clientId
  const hasLockRef = useRef(hasLock)
  hasLockRef.current = hasLock

  // Expose sendData and clipboard methods to parent component via ref
  useImperativeHandle(ref, () => ({
    sendData: (data: string) => {
      const ws = wsRef.current
      if (hasLockRef.current && ws?.readyState === WebSocket.OPEN) {
        ws.send(data)
      }
    },
    copy: () => {
      const selection = terminalRef.current?.getSelection()
      if (selection) navigator.clipboard.writeText(selection)
    },
    selectAll: () => {
      const term = terminalRef.current
      if (!term) return
      term.selectAll()
    },
    clearSelection: () => {
      const term = terminalRef.current
      if (term) {
        try {
          // Select zero-length range at cursor to clear visual selection
          ;(term as any).select(0, 0, 0)
          term.clearSelection?.()
        } catch (e) {
          // Ignore errors
        }
      }
    },
    hasSelection: () => {
      return !!terminalRef.current?.getSelection()
    },
    acquireLock: () => {
      const ws = wsRef.current
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'acquire-lock' }))
      }
    }
  }))

  // Initialize terminal once per session
  useEffect(() => {
    if (!containerRef.current) return

    // Check if terminal already exists in cache
    let cached = terminalCache.get(sessionId)
    let term = cached?.terminal
    let fitAddon = cached?.fitAddon
    let searchAddon = cached?.searchAddon

    if (!term || !fitAddon || !searchAddon) {
      // Create terminal
      term = new Terminal({
        cursorBlink: true,
        fontSize: fontSize,
        theme: {
          background: '#1a1a1a',
          foreground: '#d4d4d4',
        },
        scrollback: scrollbackLines,
        allowProposedApi: true,
      })

      // Install FitAddon
      fitAddon = new FitAddon()
      term.loadAddon(fitAddon)

      // Install SearchAddon
      searchAddon = new SearchAddon()
      term.loadAddon(searchAddon)

      // Cache the terminal
      terminalCache.set(sessionId, { terminal: term, fitAddon, searchAddon })
    }

    terminalRef.current = term
    fitAddonRef.current = fitAddon
    searchAddonRef.current = searchAddon

    // Subscribe to search result changes (only once per terminal)
    if (!searchResultDisposableRef.current) {
      searchResultDisposableRef.current = searchAddon.onDidChangeResults((e) => {
        setSearchResult({ resultIndex: e.resultIndex, resultCount: e.resultCount })
      })
    }

    // Terminal opening is deferred to when it becomes active (see visibility effect)
    // This ensures proper dimension calculations for fit()

    // Return cleanup only when component unmounts (not on sessionId change)
    return () => {
      // Don't dispose terminal, just mark as inactive
    }
  }, [sessionId, scrollbackLines, fontSize])

  // Handle WebSocket connection and visibility when session becomes active/inactive
  useEffect(() => {
    const term = terminalRef.current
    const fitAddon = fitAddonRef.current
    if (!term || !fitAddon) return

    // Update visibility
    if (containerRef.current) {
      containerRef.current.style.display = isActive ? 'block' : 'none'
    }

    // Clear any selection when terminal becomes active by clicking it
    if (isActive && term.element) {
      setTimeout(() => {
        try {
          // Simulate a click to clear selection
          const mouseEvent = new MouseEvent('click', { bubbles: true })
          term.element?.dispatchEvent(mouseEvent)
        } catch (e) {
          // Ignore errors
        }
      }, 50)
    }

    // Open terminal on first activation and fit it
    if (isActive && !term.element && containerRef.current) {
      term.open(containerRef.current)

      // Add padding to the terminal to create gap from borders
      if (term.element) {
        const element = term.element as HTMLElement
        element.style.padding = '8px'
        element.style.boxSizing = 'border-box'
      }

      // Fit after opening, with delay for layout to settle
      requestAnimationFrame(() => {
        setTimeout(() => {
          try {
            fitAddon.fit()
          } catch (err) {
            console.error('Fit error on activation:', err)
          }
        }, 0)
      })
    } else if (isActive && term.element) {
      // Terminal already open, just refit
      requestAnimationFrame(() => {
        setTimeout(() => {
          try {
            fitAddon.fit()
          } catch (err) {
            console.error('Refit error:', err)
          }
        }, 0)
      })
    }

    const container = containerRef.current

    // Prevent iOS page scroll while allowing terminal viewport to scroll natively
    const handleTouchMove = (e: TouchEvent) => {
      if (container && container.contains(e.target as Node)) {
        e.preventDefault()
      }
    }

    if (isActive && container) {
      document.addEventListener('touchmove', handleTouchMove, { passive: false })
    }

    if (!isActive) {
      // Close WebSocket when inactive
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.close()
      }
      return
    }

    // Connect WebSocket when active
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const wsUrl = `${protocol}://${window.location.host}/terminal/${sessionId}?clientId=${encodeURIComponent(clientId)}`
    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.binaryType = 'arraybuffer'

    ws.onopen = () => {
      // Send initial resize
      ws.send(JSON.stringify({
        type: 'resize',
        cols: term.cols,
        rows: term.rows,
      }))
      // Immediately acquire lock if it's free or already ours (pre-assigned lock)
      if (!lockHeldBy || lockHeldBy === clientId) {
        setOptimisticLock(true)
        ws.send(JSON.stringify({ type: 'acquire-lock' }))
      }
    }

    ws.onmessage = (event) => {
      if (typeof event.data === 'string') {
        try {
          const msg = JSON.parse(event.data)
          if (msg.type === 'exit') {
            term.write('\r\n[Process exited]')
          }
        } catch {
          // Not JSON, treat as output
          term.write(event.data)
        }
      } else {
        // Binary data
        const view = new Uint8Array(event.data)
        term.write(new TextDecoder().decode(view))
      }
    }

    ws.onclose = () => {
      // Clear optimistic lock when connection closes
      setOptimisticLock(false)
      if (isActiveRef.current) {
        if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = setTimeout(() => {
          reconnectTimerRef.current = null
          setReconnectKey(k => k + 1)
        }, 1_500)
      }
    }

    ws.onerror = (err) => {
      console.error('WebSocket error:', err)
      term.write('\r\n[Connection error]')
    }

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
      try {
        if (containerRef.current && containerRef.current.offsetWidth > 0 && containerRef.current.offsetHeight > 0) {
          fitAddon.fit()
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: 'resize',
              cols: term.cols,
              rows: term.rows,
            }))
          }
        }
      } catch (err) {
        console.error('Resize error:', err)
      }
    })

    observerRef.current = resizeObserver
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current)
    }

    // Cleanup WebSocket and observer when becoming inactive or switching sessions
    return () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }
      if (dataDisposableRef.current) {
        dataDisposableRef.current.dispose()
        dataDisposableRef.current = null
      }
      if (observerRef.current) {
        observerRef.current.disconnect()
      }
      document.removeEventListener('touchmove', handleTouchMove)
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.close()
      }
    }
  }, [sessionId, isActive, clientId, reconnectKey])

  // Update input handler and cursor when lock state changes
  useEffect(() => {
    const term = terminalRef.current
    if (!term) return

    // Update cursor blink state
    term.options.cursorBlink = hasLock

    // Dispose old handler and create new one that captures current hasLock
    if (dataDisposableRef.current) {
      dataDisposableRef.current.dispose()
    }
    const ws = wsRef.current
    dataDisposableRef.current = term.onData((data) => {
      if (hasLock && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(data)
      } else if (!hasLock && lockHeldBy && onReadOnlyInput) {
        onReadOnlyInput(lockHeldBy)
      }
    })

    return () => {
      // Cleanup is handled by the main WebSocket effect
    }
  }, [hasLock, optimisticLock, lockHeldBy, onReadOnlyInput])

  // Clear optimistic lock when server confirms another client holds the lock
  useEffect(() => {
    if (lockHeldBy !== null && lockHeldBy !== clientId) {
      setOptimisticLock(false)
    }
  }, [lockHeldBy, clientId])

  // Live-update font size for already-open terminals
  useEffect(() => {
    const cached = terminalCache.get(sessionId)
    if (!cached) return
    cached.terminal.options.fontSize = fontSize
    cached.fitAddon.fit()
  }, [fontSize, sessionId])

  // Auto-acquire lock when it's released and this pane is active
  useEffect(() => {
    if (isActive && !hasLock && !lockHeldBy && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'acquire-lock' }))
    }
  }, [lockHeldBy, isActive, hasLock])

  // Handle Ctrl+F for search
  useEffect(() => {
    const term = terminalRef.current
    if (!term || !isActive) return

    term.attachCustomKeyEventHandler((e) => {
      if (e.ctrlKey && e.key === 'f' && !e.shiftKey && !e.altKey && !e.metaKey) {
        e.preventDefault()
        onSearchOpen?.()
        return false
      }
      return true
    })
  }, [isActive, onSearchOpen])

  // Reset search result when search bar is closed
  useEffect(() => {
    if (!searchOpen) {
      setSearchResult(null)
    }
  }, [searchOpen])

  // Cleanup terminal when component unmounts (session is removed)
  useEffect(() => {
    return () => {
      if (searchResultDisposableRef.current) {
        searchResultDisposableRef.current.dispose()
        searchResultDisposableRef.current = null
      }
      const cached = terminalCache.get(sessionId)
      if (cached) {
        cached.terminal.dispose()
        terminalCache.delete(sessionId)
      }
    }
  }, [sessionId])

  const handleFindNext = useCallback((term: string, opts: SearchOptions) => {
    const searchAddon = searchAddonRef.current
    if (!searchAddon || !term) return
    searchAddon.findNext(term, {
      ...opts,
      decorations: {
        matchBackground: 'transparent',
        matchBorder: '#ff8800',
        activeMatchBackground: '#ffff00',
        activeMatchBorder: '#ffff00',
        matchOverviewRuler: '#ffff00',
        activeMatchColorOverviewRuler: '#ffff00',
      },
    })
  }, [])

  const handleFindPrevious = useCallback((term: string, opts: SearchOptions) => {
    const searchAddon = searchAddonRef.current
    if (!searchAddon || !term) return
    searchAddon.findPrevious(term, {
      ...opts,
      decorations: {
        matchBackground: 'transparent',
        matchBorder: '#ff8800',
        activeMatchBackground: '#ffff00',
        activeMatchBorder: '#ffff00',
        matchOverviewRuler: '#ffff00',
        activeMatchColorOverviewRuler: '#ffff00',
      },
    })
  }, [])

  return (
    <div
      ref={containerRef}
      style={{
        display: isActive ? 'block' : 'none',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {searchOpen && (
        <TerminalSearchBar
          onFindNext={handleFindNext}
          onFindPrevious={handleFindPrevious}
          onClose={onSearchClose || (() => {})}
          searchResult={searchResult}
        />
      )}
    </div>
  )
})

TerminalPane.displayName = 'TerminalPane'

export default TerminalPane
