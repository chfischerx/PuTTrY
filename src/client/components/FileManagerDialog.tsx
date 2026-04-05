import { useState, useEffect, useRef, useCallback } from 'react'
import {
  FolderOpen,
  Folder,
  File,
  ChevronRight,
  ChevronLeft,
  CornerLeftUp,
  Download,
  Loader2,
  AlertCircle,
  CheckCircle2,
  XCircle,
  X,
  Upload as UploadIcon,
  Eye,
  EyeOff,
  Copy,
  Check,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog'

interface DirEntry {
  name: string
  type: 'file' | 'dir' | 'symlink'
  size: number
  mtime: number
  readable: boolean
  writable: boolean
}

interface ListResponse {
  path: string
  entries: DirEntry[]
}

interface UploadItem {
  id: string
  file: File
  status: 'pending' | 'uploading' | 'done' | 'error'
  progress: number
  error?: string
}

interface DialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface ServerFileBrowserProps {
  mode: 'file' | 'folder'        // 'file' = show files + dirs, select a file
                                  // 'folder' = show dirs only, navigate = select
  selectedPath?: string | null    // highlights the selected file (file mode only)
  onSelect: (path: string, name: string) => void
  showHidden?: boolean
  onShowHiddenChange?: (show: boolean) => void
  onFolderChange?: (path: string) => void
  selectedItems?: { path: string; name: string; type: 'file' | 'dir' }[]
  onMultiSelect?: (path: string, name: string, type: 'file' | 'dir', shiftKey: boolean, ctrlKey: boolean, currentPath: string, rangeEntries: DirEntry[]) => void
}

const STORAGE_KEY = 'puttry_file_manager_path'

function cleanPath(path: string): string {
  // Ensure absolute path
  if (path && !path.startsWith('/')) {
    return '/' + path
  }
  return path
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
}

async function compressToBlob(file: File): Promise<Blob | null> {
  if (typeof CompressionStream === 'undefined' || file.size > 100 * 1024 * 1024) return null

  try {
    const cs = new CompressionStream('gzip')
    const writer = cs.writable.getWriter()
    const reader = cs.readable.getReader()
    const chunks: BlobPart[] = []

    await Promise.all([
      (async () => {
        await writer.write(new Uint8Array(await file.arrayBuffer()))
        await writer.close()
      })(),
      (async () => {
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          chunks.push(value as BlobPart)
        }
      })(),
    ])

    return new Blob(chunks, { type: 'application/octet-stream' })
  } catch {
    return null
  }
}

function FileRow({
  entry,
  currentPath,
  onNavigate,
  onDownload,
  onSelect,
  isSelected,
  onMultiSelect,
}: {
  entry: DirEntry
  currentPath: string
  onNavigate: (path: string) => void
  onDownload?: (path: string, name: string) => void
  onSelect?: (path: string, name: string) => void
  isSelected?: boolean
  onMultiSelect?: (path: string, name: string, type: 'file' | 'dir', shiftKey: boolean, ctrlKey: boolean) => void
}) {
  const isDir = entry.type === 'dir'
  const isDisabled = !entry.readable
  const fullPath = cleanPath(currentPath) + '/' + entry.name

  return (
    <div
      className={`flex items-center justify-between px-4 py-2 border-b border-border/50 group transition-colors ${
        isDisabled ? 'opacity-50 pointer-events-none' : 'cursor-pointer'
      } ${isSelected ? 'bg-primary text-primary-foreground' : 'hover:bg-accent/50'}`}
      onClick={(e) => {
        if (isDisabled) return
        if (onMultiSelect && !isDir) {
          onMultiSelect(fullPath, entry.name, 'file', e.shiftKey, e.ctrlKey || e.metaKey)
        } else if (onMultiSelect && isDir) {
          // Allow directory selection with modifiers
          if (e.shiftKey || e.ctrlKey || e.metaKey) {
            e.preventDefault()
            onMultiSelect(fullPath, entry.name, 'dir', e.shiftKey, e.ctrlKey || e.metaKey)
          } else {
            onNavigate(fullPath)
          }
        } else if (isDir) {
          onNavigate(fullPath)
        } else if (onSelect) {
          onSelect(fullPath, entry.name)
        }
      }}
    >
      <div className="flex items-center gap-3 flex-1 min-w-0">
        {isDir ? (
          <Folder className="h-4 w-4 text-primary flex-shrink-0" />
        ) : (
          <File className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        )}
        <span className="text-sm truncate">{entry.name}</span>
      </div>

      {!isDir && (
        <div className="text-xs text-muted-foreground ml-2 flex-shrink-0">{formatBytes(entry.size)}</div>
      )}

      {!isDir && !isDisabled && onDownload && !onMultiSelect && (
        <Button
          size="sm"
          variant="ghost"
          className="opacity-0 group-hover:opacity-100 transition-opacity ml-2 flex-shrink-0 [&_svg]:size-3.5"
          onClick={(e) => {
            e.stopPropagation()
            onDownload(currentPath + '/' + entry.name, entry.name)
          }}
          title="Download"
        >
          <Download className="h-4 w-4" />
        </Button>
      )}
    </div>
  )
}

function UploadQueueItem({ item, onRetry }: { item: UploadItem; onRetry: (id: string) => void }) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b border-border/50">
      <div className="flex-1 min-w-0">
        <div className="text-sm truncate">{item.file.name}</div>
        {item.status === 'uploading' && (
          <div className="w-full bg-border rounded-full h-1 mt-1">
            <div className="bg-primary h-1 rounded-full transition-all" style={{ width: `${item.progress}%` }} />
          </div>
        )}
        {item.error && <div className="text-xs text-red-500 mt-1">{item.error}</div>}
      </div>

      <div className="flex-shrink-0">
        {item.status === 'uploading' && <Loader2 className="h-4 w-4 text-primary animate-spin" />}
        {item.status === 'done' && <CheckCircle2 className="h-4 w-4 text-green-500" />}
        {item.status === 'error' && (
          <Button
            size="sm"
            variant="ghost"
            className="[&_svg]:size-3.5 h-6 w-6 p-0"
            onClick={() => onRetry(item.id)}
            title="Retry"
          >
            <XCircle className="h-4 w-4 text-red-500" />
          </Button>
        )}
      </div>
    </div>
  )
}

// ServerFileBrowser Component
function ServerFileBrowser({
  mode,
  selectedPath,
  onSelect,
  showHidden = false,
  onShowHiddenChange,
  onFolderChange,
  selectedItems,
  onMultiSelect,
}: ServerFileBrowserProps) {
  const [currentPath, setCurrentPath] = useState('')
  const [entries, setEntries] = useState<DirEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const homeRef = useRef<string>('')
  const lastSelectedPathRef = useRef<string | null>(null)

  // Load path on mount
  useEffect(() => {
    const savedPath = cleanPath(localStorage.getItem(STORAGE_KEY) ?? '')
    navigate(savedPath)
  }, [])

  const navigate = useCallback(async (p: string) => {
    setLoading(true)
    setError(null)
    try {
      const r = await fetch(`/api/files/list?path=${encodeURIComponent(p)}`, { credentials: 'include' })
      if (!r.ok) {
        const data = await r.json()
        throw new Error(data.error ?? r.statusText)
      }
      const data: ListResponse = await r.json()
      const cleanedPath = cleanPath(data.path)
      setCurrentPath(cleanedPath)
      setEntries(data.entries)
      localStorage.setItem(STORAGE_KEY, cleanedPath)
      onFolderChange?.(cleanedPath)

      if (p === '') {
        homeRef.current = cleanedPath
      }

      // In folder mode, select the folder after navigation
      if (mode === 'folder') {
        const lastSegment = cleanedPath.split('/').filter(Boolean).pop() || '/'
        onSelect(cleanedPath, lastSegment)
      }
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [mode, onSelect, onFolderChange])

  const visibleEntries = showHidden ? entries : entries.filter((e) => !e.name.startsWith('.'))
  const filteredEntries = mode === 'folder' ? visibleEntries.filter((e) => e.type === 'dir') : visibleEntries

  const breadcrumbs = cleanPath(currentPath)
    .split('/')
    .reduce<{ label: string; path: string }[]>((acc, part, idx, arr) => {
      if (idx === 0) {
        acc.push({ label: '/', path: '/' })
      } else {
        const path = '/' + arr.slice(1, idx + 1).join('/')
        acc.push({ label: part, path })
      }
      return acc
    }, [])

  const canGoUp = !loading && currentPath !== '' && currentPath !== '/'

  return (
    <>
      {/* Breadcrumb bar */}
      <div className="px-6 py-2 border-b border-border/50 flex items-center justify-between gap-2">
        <div className="flex gap-1 overflow-x-auto flex-1 whitespace-nowrap">
          {breadcrumbs.map((crumb, idx) => (
            <div key={idx} className="flex items-center gap-1">
              {idx > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />}
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-sm"
                onClick={() => navigate(crumb.path)}
              >
                {crumb.label}
              </Button>
            </div>
          ))}
        </div>
        {onShowHiddenChange && (
          <Button
            variant="ghost"
            size="sm"
            className="[&_svg]:size-4 flex-shrink-0"
            title={showHidden ? 'Hide hidden files' : 'Show hidden files'}
            onClick={() => onShowHiddenChange(!showHidden)}
          >
            {showHidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
        )}
      </div>

      {/* Entry list */}
      <DialogBody className="flex-1 flex flex-col overflow-hidden p-0">
        <div className="flex-1 overflow-y-auto border-b border-border/50">
          {loading && (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          )}
          {error && (
            <div className="px-4 py-3 bg-red-50 border-b border-red-200 text-sm text-red-700 flex gap-2">
              <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              {error}
            </div>
          )}
          {canGoUp && (
            <div
              className="flex items-center gap-3 px-4 py-2 border-b border-border/50 hover:bg-accent/50 transition-colors cursor-pointer group"
              onClick={() => navigate(currentPath.slice(0, currentPath.lastIndexOf('/')))}
            >
              <CornerLeftUp className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <span className="text-sm text-muted-foreground">..</span>
            </div>
          )}
          {!loading &&
            filteredEntries.map((entry) => {
              const fullPath = cleanPath(currentPath + '/' + entry.name)
              const handleRowMultiSelect = onMultiSelect
                ? (path: string, name: string, type: 'file' | 'dir', shiftKey: boolean, ctrlKey: boolean) => {
                    if (shiftKey && lastSelectedPathRef.current) {
                      // Find indices of last selected and current item
                      const lastIndex = filteredEntries.findIndex((e) => cleanPath(currentPath) + '/' + e.name === lastSelectedPathRef.current)
                      const currentIndex = filteredEntries.findIndex((e) => e.type === type && cleanPath(currentPath) + '/' + e.name === path)

                      if (lastIndex !== -1 && currentIndex !== -1) {
                        // Select range between last and current
                        const start = Math.min(lastIndex, currentIndex)
                        const end = Math.max(lastIndex, currentIndex)
                        onMultiSelect(path, name, type, shiftKey, ctrlKey, currentPath, filteredEntries.slice(start, end + 1))
                        lastSelectedPathRef.current = path
                        return
                      }
                    }

                    // Single click or ctrl+click: select or toggle single item
                    onMultiSelect(path, name, type, shiftKey, ctrlKey, currentPath, [entry])
                    lastSelectedPathRef.current = path
                  }
                : undefined

              return (
                <FileRow
                  key={entry.name}
                  entry={entry}
                  currentPath={currentPath}
                  onNavigate={navigate}
                  onSelect={mode === 'file' && !onMultiSelect ? (path, name) => onSelect(cleanPath(path), name) : undefined}
                  isSelected={
                    mode === 'file' && !onMultiSelect && selectedPath === fullPath
                      ? true
                      : selectedItems?.some((i) => i.path === fullPath)
                      ? true
                      : false
                  }
                  onMultiSelect={handleRowMultiSelect}
                />
              )
            })}
          {!loading && filteredEntries.length === 0 && !error && (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <div className="text-center">
                <Folder className="h-12 w-12 mx-auto mb-2 opacity-20" />
                <p>{mode === 'folder' ? 'No subfolders' : 'Empty directory'}</p>
              </div>
            </div>
          )}
        </div>
      </DialogBody>
    </>
  )
}

// UploadDialog Component
export function UploadDialog({ open, onOpenChange }: DialogProps) {
  const [step, setStep] = useState<'select-files' | 'select-folder'>('select-files')
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [uploads, setUploads] = useState<UploadItem[]>([])
  const [isDragOver, setIsDragOver] = useState(false)
  const [destPath, setDestPath] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Load destination path on dialog open
  useEffect(() => {
    if (!open) return
    setStep('select-files')
    setSelectedFiles([])
    setUploads((prev) => prev.filter((u) => u.status === 'uploading' || u.status === 'pending'))
  }, [open])

  const uploadFiles = useCallback(async (files: File[], path: string) => {
    for (const file of files) {
      const uploadId = Math.random().toString(36)
      const uploadItem: UploadItem = {
        id: uploadId,
        file,
        status: 'pending',
        progress: 0,
      }

      setUploads((prev) => [...prev, uploadItem])

      try {
        let uploadData: Blob | File = file
        let isCompressed = false

        if (file.size > 0) {
          const compressed = await compressToBlob(file)
          if (compressed) {
            uploadData = compressed
            isCompressed = true
          }
        }

        const xhr = new XMLHttpRequest()
        const uploadUrl = `/api/files/upload?path=${encodeURIComponent(path)}&filename=${encodeURIComponent(file.name)}`

        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const progress = Math.round((e.loaded / e.total) * 100)
            setUploads((prev) =>
              prev.map((u) => (u.id === uploadId ? { ...u, progress, status: 'uploading' } : u))
            )
          }
        })

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            setUploads((prev) =>
              prev.map((u) => (u.id === uploadId ? { ...u, status: 'done', progress: 100 } : u))
            )
          } else {
            const errorMsg = xhr.responseText ? JSON.parse(xhr.responseText).error : 'Upload failed'
            setUploads((prev) =>
              prev.map((u) =>
                u.id === uploadId ? { ...u, status: 'error', error: errorMsg } : u
              )
            )
          }
        })

        xhr.addEventListener('error', () => {
          setUploads((prev) =>
            prev.map((u) =>
              u.id === uploadId ? { ...u, status: 'error', error: 'Network error' } : u
            )
          )
        })

        xhr.open('POST', uploadUrl)
        if (isCompressed) {
          xhr.setRequestHeader('X-Compressed', 'gzip')
        }
        xhr.withCredentials = true
        xhr.send(uploadData)
      } catch (err) {
        setUploads((prev) =>
          prev.map((u) =>
            u.id === uploadId ? { ...u, status: 'error', error: String(err) } : u
          )
        )
      }
    }
  }, [])

  const handleFilesSelected = useCallback((files: File[]) => {
    setSelectedFiles(files)
  }, [])

  const handleUpload = useCallback(() => {
    uploadFiles(selectedFiles, destPath)
  }, [selectedFiles, destPath, uploadFiles])

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false)
    }
  }

  const handleUploadClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleFilesSelected(Array.from(e.target.files))
    }
    e.target.value = ''
  }

  const handleRetryUpload = (id: string) => {
    const upload = uploads.find((u) => u.id === id)
    if (upload) {
      setUploads((prev) => prev.filter((u) => u.id !== id))
      uploadFiles([upload.file], destPath)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl sm:h-[65vh] flex flex-col">
        <DialogHeader>
          <UploadIcon className="h-5 w-5 mr-2 text-primary" />
          <DialogTitle>Upload Files</DialogTitle>
        </DialogHeader>

        <DialogBody className="flex flex-col gap-0 flex-1 overflow-hidden p-0">
          {/* Step 1: Select Files */}
          {step === 'select-files' && (
            <div className="p-6 flex flex-col gap-4 h-full overflow-hidden">
              <div
                className={`rounded-lg border-2 border-dashed transition-all py-12 flex flex-col items-center gap-3 ${
                  isDragOver ? 'ring-2 ring-primary border-primary bg-accent/20' : 'border-border'
                }`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={(e) => {
                  e.preventDefault()
                  setIsDragOver(false)
                  handleFilesSelected(Array.from(e.dataTransfer.files))
                }}
              >
                <UploadIcon
                  className={`h-10 w-10 transition-colors ${
                    isDragOver ? 'text-primary' : 'text-muted-foreground'
                  }`}
                />
                <p className="text-sm font-medium">Drop files here</p>
                <p className="text-xs text-muted-foreground">or</p>
                <Button variant="outline" size="sm" onClick={handleUploadClick}>
                  Choose files
                </Button>
              </div>

              {/* Selected files list */}
              {selectedFiles.length > 0 && (
                <div className="overflow-y-auto flex-1 min-h-0">
                  {selectedFiles.map((file, idx) => {
                    const dirEntry: DirEntry = {
                      name: file.name,
                      type: 'file',
                      size: file.size,
                      mtime: 0,
                      readable: true,
                      writable: true,
                    }
                    return (
                      <FileRow
                        key={idx}
                        entry={dirEntry}
                        currentPath=""
                        onNavigate={() => {}}
                      />
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Step 2: Select Folder */}
          {step === 'select-folder' && (
            <ServerFileBrowser mode="folder" onSelect={(path) => setDestPath(path)} />
          )}

          {/* Upload queue (shown during upload) */}
          {uploads.length > 0 && (
            <div className="border-t border-border/50 max-h-32 overflow-y-auto">
              {uploads.map((upload) => (
                <UploadQueueItem key={upload.id} item={upload} onRetry={handleRetryUpload} />
              ))}
            </div>
          )}
        </DialogBody>

        <DialogFooter className="px-6 py-4 border-t border-border/50 flex justify-between">
          {step === 'select-folder' && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setStep('select-files')
                setSelectedFiles([])
                setUploads([])
              }}
              title="Back"
            >
              <ChevronLeft className="h-4 w-4 md:mr-1" />
              <span className="hidden md:inline">Back</span>
            </Button>
          )}

          <div className="flex gap-2 ml-auto">
            {step === 'select-files' && selectedFiles.length > 0 && (
              <Button size="sm" onClick={() => setStep('select-folder')} title="Next">
                <span className="hidden md:inline">Next</span>
                <ChevronRight className="h-4 w-4 md:ml-1" />
              </Button>
            )}

            {step === 'select-folder' && uploads.length === 0 && (
              <Button size="sm" onClick={handleUpload} title="Upload files" className="px-2 md:px-3">
                <UploadIcon className="h-4 w-4 md:mr-1" />
                <span className="hidden md:inline">
                  Upload {selectedFiles.length} file{selectedFiles.length !== 1 ? 's' : ''}
                </span>
              </Button>
            )}

            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} title="Close">
              <span className="hidden md:inline">Close</span>
              <X className="h-4 w-4 md:hidden" />
            </Button>
          </div>
        </DialogFooter>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleFileInputChange}
          className="hidden"
          accept="*/*"
        />
      </DialogContent>
    </Dialog>
  )
}

// ExplorerDialog Component (exported as DownloadDialog to avoid breaking other files)
function ExplorerDialog({ open, onOpenChange }: DialogProps) {
  // Existing state
  const [showHidden, setShowHidden] = useState(false)
  const [selectedItems, setSelectedItems] = useState<{ path: string; name: string; type: 'file' | 'dir' }[]>([])
  const [downloading, setDownloading] = useState(false)
  const [downloadFolder, setDownloadFolder] = useState<FileSystemDirectoryHandle | null>(null)
  const [sizeWarning, setSizeWarning] = useState<{ bytes: number } | null>(null)
  const [checkingSize, setCheckingSize] = useState(false)

  // New state for upload view
  const [view, setView] = useState<'browse' | 'upload'>('browse')
  const [currentFolder, setCurrentFolder] = useState('')
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [uploads, setUploads] = useState<UploadItem[]>([])
  const [isDragOver, setIsDragOver] = useState(false)
  const [copiedPath, setCopiedPath] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Reset on dialog open
  useEffect(() => {
    if (!open) return
    setView('browse')
    setSelectedItems([])
    setSizeWarning(null)
    setSelectedFiles([])
    setUploads(prev => prev.filter(u => u.status === 'uploading' || u.status === 'pending'))
  }, [open])

  const selectDownloadFolder = useCallback(async () => {
    try {
      const picker = (window as any).showDirectoryPicker || (globalThis as any).showDirectoryPicker

      if (!picker) {
        alert('File System Access API not supported in this browser. Please use Chrome, Edge, or recent Safari.')
        return
      }

      const folder = await picker({ mode: 'readwrite' })
      setDownloadFolder(folder)
    } catch (e) {
      const error = e as Error
      if (error.name === 'AbortError') return
      alert(`Error: ${error.message}`)
    }
  }, [])

  const handleMultiSelect = useCallback(
    (path: string, name: string, type: 'file' | 'dir', shiftKey: boolean, ctrlKey: boolean, folderPath: string, rangeEntries: DirEntry[]) => {
      if (shiftKey && rangeEntries.length > 1) {
        // Shift+click: Select all items in the range
        const rangeItems = rangeEntries
          .filter((e) => e.type === 'file' || e.type === 'dir')
          .map((e) => ({
            path: cleanPath(folderPath) + '/' + e.name,
            name: e.name,
            type: e.type as 'file' | 'dir',
          }))

        setSelectedItems((prev) => {
          const rangePaths = new Set(rangeItems.map((i) => i.path))
          // Remove items that were in the old range, add items that are in the new range
          const newItems = prev.filter((i) => !rangePaths.has(i.path))
          return [...newItems, ...rangeItems]
        })
      } else if (ctrlKey) {
        // Ctrl+click: Toggle single item (keep other selections)
        setSelectedItems((prev) =>
          prev.some((i) => i.path === path) ? prev.filter((i) => i.path !== path) : [...prev, { path, name, type }]
        )
      } else {
        // Single click: Select only this item (deselect others)
        setSelectedItems([{ path, name, type }])
      }
    },
    []
  )

  const checkSizeThenDownload = useCallback(async () => {
    if (!selectedItems.length) return

    setCheckingSize(true)
    try {
      const pathsJson = encodeURIComponent(JSON.stringify(selectedItems.map(item => item.path)))
      const res = await fetch(`/api/files/size?paths=${pathsJson}`, { credentials: 'include' })
      if (!res.ok) throw new Error('Failed to check size')

      const data = await res.json()
      const MAX_WARNING_SIZE = 100 * 1024 * 1024 // 100 MB

      if (data.bytes > MAX_WARNING_SIZE) {
        setSizeWarning({ bytes: data.bytes })
      } else {
        await downloadSelected()
      }
    } catch (err) {
      console.error('Size check error:', err)
      alert(`Error checking size: ${(err as Error).message}`)
    } finally {
      setCheckingSize(false)
    }
  }, [selectedItems])

  const downloadSelected = useCallback(async () => {
    if (!selectedItems.length) return

    setDownloading(true)
    setSizeWarning(null)

    try {
      const zipName = selectedItems.length === 1 ? `${selectedItems[0].name}.zip` : 'download.zip'
      const pathsJson = encodeURIComponent(JSON.stringify(selectedItems.map(item => item.path)))

      if (downloadFolder) {
        // Use the remembered folder
        const response = await fetch(
          `/api/files/download-zip?paths=${pathsJson}`,
          { credentials: 'include' }
        )
        if (!response.ok) throw new Error('Download failed')

        const fileHandle = await downloadFolder.getFileHandle(zipName, { create: true })
        const writable = await fileHandle.createWritable({ keepExistingData: false })
        await response.body!.pipeTo(writable)
      } else {
        // Default: let the browser save to default Downloads folder
        const a = document.createElement('a')
        a.href = `/api/files/download-zip?paths=${pathsJson}`
        a.download = zipName
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
      }
    } catch (err) {
      console.error('Download error:', err)
      alert(`Download failed: ${(err as Error).message}`)
    } finally {
      setTimeout(() => {
        onOpenChange(false)
        setDownloading(false)
      }, 300)
    }
  }, [selectedItems, downloadFolder, onOpenChange])

  const downloadFile = useCallback(async (absPath: string, filename: string) => {
    setDownloading(true)
    try {
      if (downloadFolder) {
        // Use the remembered folder
        const response = await fetch(
          `/api/files/download?path=${encodeURIComponent(absPath)}`,
          { credentials: 'include' }
        )
        if (!response.ok) throw new Error('Download failed')

        const fileHandle = await downloadFolder.getFileHandle(filename, { create: true })
        const writable = await fileHandle.createWritable({ keepExistingData: false })
        await response.body!.pipeTo(writable)
        // pipeTo() closes the writable stream automatically
      } else {
        // Default: let the browser save to default Downloads folder
        const a = document.createElement('a')
        a.href = `/api/files/download?path=${encodeURIComponent(absPath)}`
        a.download = filename
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
      }
    } catch (err) {
      console.error('Download error:', err)
      alert(`Download failed: ${(err as Error).message}`)
    } finally {
      setTimeout(() => {
        onOpenChange(false)
        setDownloading(false)
      }, 300)
    }
  }, [downloadFolder, onOpenChange])

  const uploadFiles = useCallback(async (files: File[], path: string) => {
    for (const file of files) {
      const uploadId = Math.random().toString(36)
      const uploadItem: UploadItem = {
        id: uploadId,
        file,
        status: 'pending',
        progress: 0,
      }

      setUploads((prev) => [...prev, uploadItem])

      try {
        let uploadData: Blob | File = file
        let isCompressed = false

        if (file.size > 0) {
          const compressed = await compressToBlob(file)
          if (compressed) {
            uploadData = compressed
            isCompressed = true
          }
        }

        const xhr = new XMLHttpRequest()
        const uploadUrl = `/api/files/upload?path=${encodeURIComponent(path)}&filename=${encodeURIComponent(file.name)}`

        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const progress = Math.round((e.loaded / e.total) * 100)
            setUploads((prev) =>
              prev.map((u) => (u.id === uploadId ? { ...u, progress, status: 'uploading' } : u))
            )
          }
        })

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            setUploads((prev) =>
              prev.map((u) => (u.id === uploadId ? { ...u, status: 'done', progress: 100 } : u))
            )
          } else {
            const errorMsg = xhr.responseText ? JSON.parse(xhr.responseText).error : 'Upload failed'
            setUploads((prev) =>
              prev.map((u) =>
                u.id === uploadId ? { ...u, status: 'error', error: errorMsg } : u
              )
            )
          }
        })

        xhr.addEventListener('error', () => {
          setUploads((prev) =>
            prev.map((u) =>
              u.id === uploadId ? { ...u, status: 'error', error: 'Network error' } : u
            )
          )
        })

        xhr.open('POST', uploadUrl)
        if (isCompressed) {
          xhr.setRequestHeader('X-Compressed', 'gzip')
        }
        xhr.withCredentials = true
        xhr.send(uploadData)
      } catch (err) {
        setUploads((prev) =>
          prev.map((u) =>
            u.id === uploadId ? { ...u, status: 'error', error: String(err) } : u
          )
        )
      }
    }
  }, [])

  const handleRetryUpload = useCallback((id: string) => {
    const upload = uploads.find((u) => u.id === id)
    if (upload) {
      setUploads((prev) => prev.filter((u) => u.id !== id))
      uploadFiles([upload.file], currentFolder)
    }
  }, [uploads, currentFolder, uploadFiles])

  const handleCopyPath = useCallback(() => {
    const path = selectedItems.length === 1 ? selectedItems[0].path : currentFolder
    if (!path) return
    navigator.clipboard.writeText(path)
    setCopiedPath(true)
    setTimeout(() => setCopiedPath(false), 1500)
  }, [selectedItems, currentFolder])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl sm:h-[65vh] flex flex-col">
        <DialogHeader>
          <FolderOpen className="h-5 w-5 mr-2 text-primary" />
          <DialogTitle>Explorer</DialogTitle>
        </DialogHeader>

        {/* Browse view */}
        {view === 'browse' && (
          <ServerFileBrowser
            mode="file"
            selectedPath={null}
            onSelect={() => {}}
            onFolderChange={setCurrentFolder}
            showHidden={showHidden}
            onShowHiddenChange={setShowHidden}
            selectedItems={selectedItems}
            onMultiSelect={handleMultiSelect}
          />
        )}

        {/* Upload view */}
        {view === 'upload' && (
          <DialogBody className="flex flex-col gap-0 flex-1 overflow-hidden p-0">
            {/* Destination label */}
            <div className="px-6 py-2 border-b border-border/50 text-xs text-muted-foreground truncate">
              Uploading to: <span className="font-mono">{currentFolder}</span>
            </div>

            {/* File selection area */}
            <div className="p-6 flex flex-col gap-4 flex-1 overflow-hidden">
              <div
                className={`rounded-lg border-2 border-dashed transition-all py-12 flex flex-col items-center gap-3 ${
                  isDragOver ? 'ring-2 ring-primary border-primary bg-accent/20' : 'border-border'
                }`}
                onDragOver={(e) => { e.preventDefault(); setIsDragOver(true) }}
                onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragOver(false) }}
                onDrop={(e) => { e.preventDefault(); setIsDragOver(false); setSelectedFiles(Array.from(e.dataTransfer.files)) }}
              >
                <UploadIcon className={`h-10 w-10 transition-colors ${isDragOver ? 'text-primary' : 'text-muted-foreground'}`} />
                <p className="text-sm font-medium">Drop files here</p>
                <p className="text-xs text-muted-foreground">or</p>
                <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                  Choose files
                </Button>
              </div>

              {selectedFiles.length > 0 && (
                <div className="overflow-y-auto flex-1 min-h-0">
                  {selectedFiles.map((file, idx) => (
                    <FileRow
                      key={idx}
                      entry={{ name: file.name, type: 'file', size: file.size, mtime: 0, readable: true, writable: true }}
                      currentPath=""
                      onNavigate={() => {}}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Upload queue */}
            {uploads.length > 0 && (
              <div className="border-t border-border/50 max-h-32 overflow-y-auto">
                {uploads.map(upload => (
                  <UploadQueueItem key={upload.id} item={upload} onRetry={handleRetryUpload} />
                ))}
              </div>
            )}
          </DialogBody>
        )}

        {/* Size warning banner */}
        {view === 'browse' && sizeWarning && (
          <div className="px-6 py-2 bg-amber-50 border-t border-amber-200 text-sm text-amber-800 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span>Total size is {formatBytes(sizeWarning.bytes)} — this may take a while.</span>
            <Button size="sm" variant="outline" className="ml-auto" onClick={downloadSelected}>Download anyway</Button>
            <Button size="sm" variant="ghost" onClick={() => setSizeWarning(null)}>Cancel</Button>
          </div>
        )}

        {/* Footer - browse view */}
        {view === 'browse' && (
          <DialogFooter className="px-6 py-4 border-t border-border/50 flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="[&_svg]:size-4 h-8 w-8 p-0"
              onClick={handleCopyPath}
              disabled={selectedItems.length > 1}
              title={selectedItems.length > 1 ? 'Disabled: multiple items selected' : 'Copy path'}
            >
              {copiedPath ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
            {selectedItems.length > 0 && (
              <div className="text-sm text-muted-foreground">
                {selectedItems.length} item{selectedItems.length !== 1 ? 's' : ''} selected
              </div>
            )}
            <div className="ml-auto flex flex-wrap gap-2">
              <div className="inline-flex rounded-md border border-input shadow-sm">
                <Button
                  size="sm"
                  onClick={() => selectedItems.length > 0 ? checkSizeThenDownload() : downloadFile(selectedItems[0].path, selectedItems[0].name)}
                  disabled={selectedItems.length === 0 || downloading || checkingSize}
                  className="rounded-none rounded-l-md border-0 [&_svg]:size-4 px-2 md:px-3"
                  title={checkingSize ? 'Checking...' : downloading ? 'Downloading...' : selectedItems.length > 0 ? `Download (${selectedItems.length})` : 'Download'}
                >
                  {checkingSize ? (
                    <Loader2 className="h-4 w-4 md:mr-1 animate-spin" />
                  ) : downloading ? (
                    <Loader2 className="h-4 w-4 md:mr-1 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4 md:mr-1" />
                  )}
                  <span className="hidden md:inline">
                    {checkingSize ? 'Checking...' : downloading ? 'Downloading...' : selectedItems.length > 0 ? `Download (${selectedItems.length})` : 'Download'}
                  </span>
                </Button>
                <div className="w-px bg-border self-stretch" />
                <Button
                  size="sm"
                  onClick={() => selectDownloadFolder()}
                  disabled={selectedItems.length === 0 || downloading}
                  className="rounded-none rounded-r-md border-0 px-2 font-bold tracking-widest text-xs"
                  title={downloadFolder ? `Folder: ${downloadFolder.name} — click to change` : 'Select download folder'}
                >
                  {downloadFolder ? '✓' : '···'}
                </Button>
              </div>
              <Button variant="outline" size="sm" onClick={() => setView('upload')} title="Upload">
                <UploadIcon className="h-4 w-4 md:mr-1" />
                <span className="hidden md:inline">Upload</span>
              </Button>
              <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} title="Close">
                <span className="hidden md:inline">Close</span>
                <X className="h-4 w-4 md:hidden" />
              </Button>
            </div>
          </DialogFooter>
        )}

        {/* Footer - upload view */}
        {view === 'upload' && (
          <DialogFooter className="px-6 py-4 border-t border-border/50 flex justify-between">
            <Button
              variant="outline"
              size="sm"
              disabled={uploads.some(u => u.status === 'pending' || u.status === 'uploading')}
              onClick={() => { setView('browse'); setSelectedFiles([]); setUploads([]) }}
            >
              Back
            </Button>
            <div className="flex gap-2 ml-auto">
              {selectedFiles.length > 0 && uploads.length === 0 && (
                <Button size="sm" onClick={() => uploadFiles(selectedFiles, currentFolder)}>
                  Upload {selectedFiles.length} file{selectedFiles.length !== 1 ? 's' : ''}
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Close</Button>
            </div>
          </DialogFooter>
        )}

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={(e) => { if (e.target.files) setSelectedFiles(Array.from(e.target.files)); e.target.value = '' }}
          className="hidden"
          accept="*/*"
        />
      </DialogContent>
    </Dialog>
  )
}

export function DownloadDialog(props: DialogProps) {
  return <ExplorerDialog {...props} />
}
