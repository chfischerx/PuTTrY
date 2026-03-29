
'use client'

import { useState, useRef, useEffect } from 'react'
import { Copy, SquareCheckBig, ClipboardPaste } from 'lucide-react'

const TOOLBAR_HEIGHT = 44

interface MobileKeyToolbarProps {
  onKey: (seq: string) => void
  keyboardHeight: number
  isShiftPressed: boolean
  onCopy?: () => void
  onSelectAll?: () => void
  onPaste?: () => void
}

interface PressedKey {
  label: string
  x: number // center x of the button (in px from left)
  y: number // top y of the button (in px from top of viewport)
  width: number
}

const REGULAR_KEYS = [
  { label: '←', seq: '\x1b[D' },
  { label: '↑', seq: '\x1b[A' },
  { label: '↓', seq: '\x1b[B' },
  { label: '→', seq: '\x1b[C' },
]

const CTRL_DIRECT_KEYS = [
  { label: '^C', seq: '\x03' },  // Ctrl-C
  { label: '^A', seq: '\x01' },  // Ctrl-A
  { label: '^E', seq: '\x05' },  // Ctrl-E
  { label: '^Z', seq: '\x1a' },  // Ctrl-Z
]

const CMD_KEYS = [
  { action: 'copy'      as const, icon: Copy, ariaLabel: 'Copy' },
  { action: 'selectAll' as const, icon: SquareCheckBig, ariaLabel: 'Select All' },
  { action: 'paste'     as const, icon: ClipboardPaste, ariaLabel: 'Paste' },
]

export default function MobileKeyToolbar({ onKey, keyboardHeight, isShiftPressed, onCopy, onSelectAll, onPaste }: MobileKeyToolbarProps) {
  const [pressedKey, setPressedKey] = useState<PressedKey | null>(null)
  const repeatTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const repeatIntervalRef = useRef<NodeJS.Timeout | null>(null)

  const handleKeyPress = (seq: string) => {
    onKey(seq)
  }

  const startKeyRepeat = (seq: string) => {
    // Clear any existing repeat timers
    if (repeatTimeoutRef.current) clearTimeout(repeatTimeoutRef.current)
    if (repeatIntervalRef.current) clearInterval(repeatIntervalRef.current)

    // Start repeating after 500ms initial delay, then every 80ms
    repeatTimeoutRef.current = setTimeout(() => {
      repeatIntervalRef.current = setInterval(() => {
        onKey(seq)
      }, 80)
    }, 500)
  }

  const stopKeyRepeat = () => {
    if (repeatTimeoutRef.current) {
      clearTimeout(repeatTimeoutRef.current)
      repeatTimeoutRef.current = null
    }
    if (repeatIntervalRef.current) {
      clearInterval(repeatIntervalRef.current)
      repeatIntervalRef.current = null
    }
  }

  useEffect(() => {
    return () => {
      if (repeatTimeoutRef.current) clearTimeout(repeatTimeoutRef.current)
      if (repeatIntervalRef.current) clearInterval(repeatIntervalRef.current)
    }
  }, [])

  const showBubble = (e: React.PointerEvent<HTMLButtonElement>, label: string, seq: string) => {
    e.preventDefault()
    const rect = e.currentTarget.getBoundingClientRect()
    setPressedKey({
      label,
      x: rect.left + rect.width / 2,
      y: rect.top,
      width: rect.width,
    })
    handleKeyPress(seq)
    startKeyRepeat(seq)
  }

  const clearBubble = () => {
    setPressedKey(null)
    stopKeyRepeat()
  }

  return (
    <div
      className="fixed left-0 right-0 z-40 bg-card border-t border-border flex items-center gap-1 px-2 py-1"
      style={{
        height: `${TOOLBAR_HEIGHT}px`,
        bottom: `${keyboardHeight}px`,
      }}
    >
      {/* ESC */}
      <button
        onPointerDown={(e) => showBubble(e, 'Esc', '\x1b')}
        onPointerUp={clearBubble}
        onPointerCancel={clearBubble}
        className="flex-1 px-2 py-1.5 rounded bg-accent/90 hover:bg-accent active:bg-accent/70 border border-accent/40 shadow-sm text-sm font-medium text-foreground transition-colors duration-75"
        type="button"
        tabIndex={-1}
      >
        Esc
      </button>

      {/* TAB / SHIFT+TAB */}
      <button
        onPointerDown={(e) => {
          if (isShiftPressed) {
            showBubble(e, '⇧Tab', '\x1b[Z')
          } else {
            showBubble(e, 'Tab', '\t')
          }
        }}
        onPointerUp={clearBubble}
        onPointerCancel={clearBubble}
        className="flex-1 px-2 py-1.5 rounded bg-accent/90 hover:bg-accent active:bg-accent/70 border border-accent/40 shadow-sm text-sm font-medium text-foreground transition-colors duration-75"
        type="button"
        tabIndex={-1}
      >
        {isShiftPressed ? '⇧Tab' : 'Tab'}
      </button>

      {/* CTRL / CMD KEYS — toggle based on shift */}
      {isShiftPressed ? (
        CMD_KEYS.map((key) => {
          const Icon = key.icon
          return (
            <button
              key={key.ariaLabel}
              onPointerDown={(e) => {
                e.preventDefault()
                if (key.action === 'copy') onCopy?.()
                else if (key.action === 'selectAll') onSelectAll?.()
                else if (key.action === 'paste') onPaste?.()
              }}
              className="flex-1 px-2 py-1.5 rounded bg-blue-500 hover:bg-blue-600 active:bg-blue-700 border border-blue-600 shadow-sm text-white transition-colors duration-75 flex items-center justify-center"
              type="button"
              tabIndex={-1}
              aria-label={key.ariaLabel}
            >
              <Icon size={20} />
            </button>
          )
        })
      ) : (
        CTRL_DIRECT_KEYS.map((key) => (
          <button
            key={key.label}
            onPointerDown={(e) => showBubble(e, key.label, key.seq)}
            onPointerUp={clearBubble}
            onPointerCancel={clearBubble}
            className="flex-1 px-2 py-1.5 rounded bg-blue-500 hover:bg-blue-600 active:bg-blue-700 border border-blue-600 shadow-sm text-sm font-medium text-white transition-colors duration-75"
            type="button"
            tabIndex={-1}
          >
            {key.label}
          </button>
        ))
      )}

      {/* CURSOR KEYS */}
      {REGULAR_KEYS.map((key) => (
        <button
          key={key.label}
          onPointerDown={(e) => showBubble(e, key.label, key.seq)}
          onPointerUp={clearBubble}
          onPointerCancel={clearBubble}
          className="flex-1 px-2 py-1.5 rounded bg-accent/90 hover:bg-accent active:bg-accent/70 border border-accent/40 shadow-sm text-sm font-medium text-foreground transition-colors duration-75"
          type="button"
          tabIndex={-1}
        >
          {key.label}
        </button>
      ))}

      {pressedKey && (
        <div
          style={{
            position: 'fixed',
            left: `${pressedKey.x}px`,
            top: `${pressedKey.y - 64}px`,
            transform: 'translateX(-50%)',
            zIndex: 100,
            width: Math.max(pressedKey.width, 44),
            height: 56,
            pointerEvents: 'none',
            clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 8px), calc(50% + 8px) calc(100% - 8px), 50% 100%, calc(50% - 8px) calc(100% - 8px), 0 calc(100% - 8px))',
          }}
          className="flex items-center justify-center bg-card border border-border rounded-lg shadow-xl text-foreground font-medium"
        >
          <div
            style={{
              fontSize: 28,
              lineHeight: 1,
            }}
          >
            {pressedKey.label}
          </div>
        </div>
      )}
    </div>
  )
}
