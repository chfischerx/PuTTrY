import { useState, useRef, useEffect } from 'react'
import { ChevronUp, ChevronDown, X } from 'lucide-react'

interface TerminalSearchBarProps {
  onFindNext: (term: string, opts: SearchOptions) => void
  onFindPrevious: (term: string, opts: SearchOptions) => void
  onClose: () => void
  searchResult?: { resultIndex: number; resultCount: number } | null
}

export interface SearchOptions {
  regex?: boolean
  caseSensitive?: boolean
  wholeWord?: boolean
  incremental?: boolean
  decorations?: {
    matchBackground?: string
    matchBorder?: string
    activeMatchBackground?: string
    activeMatchBorder?: string
    matchOverviewRuler?: string
    activeMatchColorOverviewRuler?: string
  }
}

export function TerminalSearchBar({
  onFindNext,
  onFindPrevious,
  onClose,
  searchResult,
}: TerminalSearchBarProps) {
  const [query, setQuery] = useState('')
  const [regex, setRegex] = useState(false)
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [wholeWord, setWholeWord] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Auto-focus input when opened
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle if search bar is focused or visible
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      } else if (e.key === 'Enter') {
        e.preventDefault()
        onFindNext(query, {
          regex,
          caseSensitive,
          wholeWord,
          incremental: false,
          decorations: {
            matchBackground: '#ffff00',
            matchBorder: '#ffff00',
            activeMatchBackground: '#ff8800',
            activeMatchBorder: '#ff8800',
          },
        })
      }
    }

    inputRef.current?.addEventListener('keydown', handleKeyDown)
    return () => {
      inputRef.current?.removeEventListener('keydown', handleKeyDown)
    }
  }, [query, regex, caseSensitive, wholeWord, onFindNext, onClose])

  // Live search as user types (incremental)
  useEffect(() => {
    if (query) {
      onFindNext(query, {
        regex,
        caseSensitive,
        wholeWord,
        incremental: true,
        decorations: {
          matchBackground: '#ffff00',
          matchBorder: '#ffff00',
          activeMatchBackground: '#ff8800',
          activeMatchBorder: '#ff8800',
          matchOverviewRuler: '#ffff00',
          activeMatchColorOverviewRuler: '#ff8800',
        },
      })
    }
  }, [query, regex, caseSensitive, wholeWord, onFindNext])

  return (
    <div className="absolute top-0 right-0 z-50 m-2 bg-slate-900 border border-slate-700 rounded-lg shadow-lg p-2 flex items-center gap-1 max-w-md">
      {/* Search input */}
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Find in terminal..."
        className="px-2 py-1 text-sm rounded border border-slate-700 bg-slate-800 text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 w-40"
      />

      {/* Match count */}
      {searchResult && query && (
        <span className="text-xs text-slate-400 whitespace-nowrap px-1 min-w-[4rem] text-center">
          {searchResult.resultIndex === -1
            ? '> 1000'
            : `${searchResult.resultIndex + 1} / ${searchResult.resultCount}`}
        </span>
      )}

      {/* Previous match button */}
      <button
        onClick={() =>
          onFindPrevious(query, {
            regex,
            caseSensitive,
            wholeWord,
            incremental: false,
            decorations: {
              matchBackground: '#ffff00',
              matchBorder: '#ffff00',
              activeMatchBackground: '#ffff00',
              activeMatchBorder: '#ffff00',
              matchOverviewRuler: '#ffff00',
              activeMatchColorOverviewRuler: '#ffff00',
            },
          })
        }
        disabled={!query}
        className="text-slate-400 hover:text-slate-100 disabled:text-slate-600 transition-colors"
        title="Find previous (Shift+Enter)"
      >
        <ChevronUp className="h-4 w-4" />
      </button>

      {/* Next match button */}
      <button
        onClick={() =>
          onFindNext(query, {
            regex,
            caseSensitive,
            wholeWord,
            incremental: false,
            decorations: {
              matchBackground: '#ffff00',
              matchBorder: '#ffff00',
              activeMatchBackground: '#ffff00',
              activeMatchBorder: '#ffff00',
              matchOverviewRuler: '#ffff00',
              activeMatchColorOverviewRuler: '#ffff00',
            },
          })
        }
        disabled={!query}
        className="text-slate-400 hover:text-slate-100 disabled:text-slate-600 transition-colors"
        title="Find next (Enter)"
      >
        <ChevronDown className="h-4 w-4" />
      </button>

      {/* Separator */}
      <div className="w-px h-6 bg-slate-700" />

      {/* Regex toggle */}
      <button
        onClick={() => setRegex(!regex)}
        className={`text-xs transition-colors ${regex ? 'text-blue-400 hover:text-blue-300' : 'text-slate-400 hover:text-slate-100'}`}
        title="Toggle regex mode"
      >
        .*
      </button>

      {/* Case sensitive toggle */}
      <button
        onClick={() => setCaseSensitive(!caseSensitive)}
        className={`text-xs transition-colors ${caseSensitive ? 'text-blue-400 hover:text-blue-300' : 'text-slate-400 hover:text-slate-100'}`}
        title="Toggle case sensitive"
      >
        Aa
      </button>

      {/* Whole word toggle */}
      <button
        onClick={() => setWholeWord(!wholeWord)}
        className={`text-xs transition-colors ${wholeWord ? 'text-blue-400 hover:text-blue-300' : 'text-slate-400 hover:text-slate-100'}`}
        title="Toggle whole word"
      >
        [W]
      </button>

      {/* Separator */}
      <div className="w-px h-6 bg-slate-700" />

      {/* Close button */}
      <button
        onClick={onClose}
        className="text-slate-400 hover:text-slate-100 transition-colors"
        title="Close search (Esc)"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
