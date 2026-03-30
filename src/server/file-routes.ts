import { Router, type Request, type Response } from 'express'
import * as fs from 'node:fs'
import * as fsp from 'node:fs/promises'
import * as zlib from 'node:zlib'
import { pipeline } from 'node:stream/promises'
import { Transform } from 'node:stream'
import { resolve, join, basename } from 'node:path'
import { homedir } from 'node:os'
import archiver from 'archiver'
import logger from './logger'

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

const HOME = homedir()
const MAX_DOWNLOAD_SIZE = 2 * 1024 ** 3 // 2 GB
const MAX_UPLOAD_SIZE = 512 * 1024 ** 1024 // 512 MB

// M-2: Sanitize filename for safe use in Content-Disposition header
function sanitizeContentDispositionFilename(filename: string): string {
  // Remove or escape characters that could break out of the filename="..." value
  // Specifically: ", ;, newlines, carriage returns
  return filename.replace(/["\n\r;]/g, '_')
}

/**
 * Safely resolve a path to ensure it stays within HOME directory.
 * Returns null if the path escapes HOME.
 */
function resolveSafePath(raw: string): string | null {
  let decoded: string
  try {
    decoded = decodeURIComponent(raw)
  } catch {
    return null
  }

  const abs = resolve(decoded.startsWith('/') ? decoded : join(HOME, decoded))

  // Must be HOME or under HOME
  if (abs !== HOME && !abs.startsWith(HOME + '/')) {
    return null
  }

  return abs
}

/**
 * Recursively calculate the total size of a file or directory
 */
async function calcSize(abs: string): Promise<number> {
  const stat = await fsp.stat(abs)
  if (stat.isFile()) return stat.size
  if (!stat.isDirectory()) return 0

  let total = 0
  const children = await fsp.readdir(abs)

  await Promise.all(
    children.map(async (name) => {
      try {
        const safe = resolveSafePath(join(abs, name))
        if (!safe) return
        total += await calcSize(safe)
      } catch {
        // Skip unreadable items
      }
    })
  )

  return total
}

/**
 * GET /api/files/size?paths=...
 * Calculate total size of selected files/folders
 * Expects: paths parameter containing JSON array of paths
 */
async function handleSize(req: Request, res: Response) {
  try {
    const pathsParam = req.query.paths
    let rawPaths: string[] = []

    if (!pathsParam) {
      res.status(400).json({ error: 'No paths provided' })
      return
    }

    // Parse paths from JSON array parameter
    try {
      const parsed = JSON.parse(decodeURIComponent(pathsParam as string))
      if (Array.isArray(parsed)) {
        rawPaths = parsed
      }
    } catch {
      res.status(400).json({ error: 'Invalid paths parameter' })
      return
    }

    if (!rawPaths.length) {
      res.status(400).json({ error: 'No paths provided' })
      return
    }

    let bytes = 0
    for (const r of rawPaths) {
      const abs = resolveSafePath(r)
      if (!abs) {
        res.status(403).json({ error: 'Access denied' })
        return
      }
      try {
        bytes += await calcSize(abs)
      } catch {
        // Skip items that fail to calculate
      }
    }

    res.json({ bytes })
  } catch (err) {
    logger.error(`[file-routes] Failed to calculate size: ${err instanceof Error ? err.message : err}`)
    res.status(500).json({ error: 'Failed to calculate size' })
  }
}

/**
 * GET /api/files/download-zip?paths=...
 * Download selected files/folders as a ZIP
 * Expects: paths parameter containing JSON array of paths
 */
async function handleDownloadZip(req: Request, res: Response) {
  try {
    const pathsParam = req.query.paths
    let rawPaths: string[] = []

    if (!pathsParam) {
      res.status(400).json({ error: 'No paths provided' })
      return
    }

    // Parse paths from JSON array parameter
    try {
      const parsed = JSON.parse(decodeURIComponent(pathsParam as string))
      if (Array.isArray(parsed)) {
        rawPaths = parsed
      }
    } catch {
      res.status(400).json({ error: 'Invalid paths parameter' })
      return
    }

    if (!rawPaths.length) {
      res.status(400).json({ error: 'No paths provided' })
      return
    }

    // Validate all paths and collect items
    const items: { abs: string; basename: string }[] = []
    for (const r of rawPaths) {
      const abs = resolveSafePath(r)
      if (!abs) {
        res.status(403).json({ error: 'Access denied' })
        return
      }
      items.push({ abs, basename: basename(abs) })
    }

    // Determine ZIP filename
    const zipName = items.length === 1 ? `${items[0].basename}.zip` : 'download.zip'

    res.setHeader('Content-Type', 'application/zip')
    res.setHeader('Content-Disposition', `attachment; filename="${sanitizeContentDispositionFilename(zipName)}"`)

    const archive = archiver('zip', { zlib: { level: 6 } })

    archive.on('error', (err: Error) => {
      if (!res.headersSent) {
        logger.error(`[file-routes] Archive error: ${err.message}`)
        res.status(500).json({ error: 'Failed to create archive' })
      }
    })

    archive.pipe(res)

    // Add each item to the archive
    for (const item of items) {
      const stat = await fsp.stat(item.abs)
      if (stat.isFile()) {
        archive.file(item.abs, { name: item.basename })
      } else if (stat.isDirectory()) {
        archive.directory(item.abs, item.basename)
      }
    }

    await archive.finalize()
  } catch (err) {
    if (!res.headersSent) {
      logger.error(`[file-routes] Failed to download ZIP: ${err instanceof Error ? err.message : err}`)
      res.status(500).json({ error: 'Failed to download ZIP' })
    }
  }
}

/**
 * GET /api/files/list?path=<encoded>
 * List directory contents
 */
async function handleList(req: Request, res: Response) {
  try {
    const rawPath = typeof req.query.path === 'string' ? req.query.path : ''
    const abs = resolveSafePath(rawPath)

    if (!abs) {
      res.status(403).json({ error: 'Access denied' })
      return
    }

    const stat = await fsp.stat(abs)
    if (!stat.isDirectory()) {
      res.status(400).json({ error: 'Not a directory' })
      return
    }

    const entries: DirEntry[] = []
    const dirEntries = await fsp.readdir(abs, { withFileTypes: true })

    for (const entry of dirEntries) {
      const joined = join(abs, entry.name)
      let type: 'file' | 'dir' | 'symlink' = 'file'
      let readable = true
      let writable = true
      let size = 0
      let mtime = 0

      try {
        if (entry.isSymbolicLink()) {
          type = 'symlink'
          // Check if symlink target is readable and within HOME
          try {
            const realpath = await fsp.realpath(joined)
            if (realpath !== HOME && !realpath.startsWith(HOME + '/')) {
              readable = false
              writable = false
            } else {
              const targetStat = await fsp.stat(joined)
              mtime = targetStat.mtime.getTime()
              size = targetStat.size
            }
          } catch {
            readable = false
            writable = false
          }
        } else if (entry.isDirectory()) {
          type = 'dir'
          const dirStat = await fsp.stat(joined)
          mtime = dirStat.mtime.getTime()
        } else {
          type = 'file'
          const fileStat = await fsp.stat(joined)
          mtime = fileStat.mtime.getTime()
          size = fileStat.size
        }
      } catch {
        readable = false
        writable = false
      }

      entries.push({
        name: entry.name,
        type,
        size,
        mtime,
        readable,
        writable,
      })
    }

    // Sort: directories first, then files, both alphabetically
    entries.sort((a, b) => {
      if (a.type === 'dir' && b.type !== 'dir') return -1
      if (a.type !== 'dir' && b.type === 'dir') return 1
      return a.name.localeCompare(b.name)
    })

    const response: ListResponse = {
      path: abs,
      entries,
    }

    res.json(response)
  } catch (err) {
    logger.error(`[file-routes] Failed to list directory: ${err instanceof Error ? err.message : err}`)
    res.status(500).json({ error: 'Failed to list directory' })
  }
}

/**
 * GET /api/files/download?path=<encoded>
 * Download a file (gzipped)
 */
async function handleDownload(req: Request, res: Response) {
  try {
    const rawPath = typeof req.query.path === 'string' ? req.query.path : ''
    const abs = resolveSafePath(rawPath)

    if (!abs) {
      res.status(403).json({ error: 'Access denied' })
      return
    }

    const stat = await fsp.stat(abs)
    if (!stat.isFile()) {
      res.status(400).json({ error: 'Not a file' })
      return
    }

    if (stat.size > MAX_DOWNLOAD_SIZE) {
      res.status(400).json({ error: 'File too large' })
      return
    }

    res.setHeader('Content-Type', 'application/octet-stream')
    res.setHeader('Content-Encoding', 'gzip')
    res.setHeader('Content-Disposition', `attachment; filename="${sanitizeContentDispositionFilename(basename(abs))}"`)

    await pipeline(fs.createReadStream(abs), zlib.createGzip(), res)
  } catch (err) {
    if (!res.headersSent) {
      logger.error(`[file-routes] Failed to download file: ${err instanceof Error ? err.message : err}`)
      res.status(500).json({ error: 'Failed to download file' })
    }
  }
}

/**
 * POST /api/files/upload?path=<encoded>&filename=<encoded>
 * Upload a file (gzipped input or raw)
 */
async function handleUpload(req: Request, res: Response) {
  try {
    const rawPath = typeof req.query.path === 'string' ? req.query.path : ''
    const rawFilename = typeof req.query.filename === 'string' ? req.query.filename : ''

    const abs = resolveSafePath(rawPath)
    if (!abs) {
      res.status(403).json({ error: 'Access denied' })
      return
    }

    // Verify destination is a directory
    const stat = await fsp.stat(abs)
    if (!stat.isDirectory()) {
      res.status(400).json({ error: 'Destination is not a directory' })
      return
    }

    // Sanitize filename
    let decoded: string
    try {
      decoded = decodeURIComponent(rawFilename)
    } catch {
      res.status(400).json({ error: 'Invalid filename' })
      return
    }

    const safeName = basename(decoded).replace(/\0/g, '')
    if (!safeName || safeName.length > 255) {
      res.status(400).json({ error: 'Invalid filename' })
      return
    }

    const destPath = join(abs, safeName)

    // Re-check with resolveSafePath as belt-and-suspenders
    const checkedPath = resolveSafePath(destPath)
    if (!checkedPath) {
      res.status(403).json({ error: 'Access denied' })
      return
    }

    // Check if gzip compressed
    const isCompressed = req.headers['x-compressed'] === 'gzip'

    // M-1: Prevent zip bombs by checking raw request body size before decompression
    if (isCompressed) {
      const contentLength = parseInt(req.headers['content-length'] || '0', 10)
      const MAX_COMPRESSED_SIZE = 100 * 1024 * 1024 // 100 MB limit for compressed data
      if (contentLength > MAX_COMPRESSED_SIZE) {
        res.status(413).json({ error: 'Compressed upload too large' })
        return
      }
    }

    const inputStream = isCompressed ? req.pipe(zlib.createGunzip()) : req

    // Track bytes and enforce limit
    let uploadedBytes = 0
    const byteCounter = new Transform({
      transform(chunk: Buffer, _encoding: string, callback: Function) {
        uploadedBytes += chunk.length
        if (uploadedBytes > MAX_UPLOAD_SIZE) {
          callback(new Error('Upload too large'))
          return
        }
        callback(null, chunk)
      },
    })

    // Create write stream and upload
    const writeStream = fs.createWriteStream(destPath)

    inputStream.pipe(byteCounter).pipe(writeStream)

    await new Promise<void>((resolve, reject) => {
      writeStream.on('finish', () => resolve())
      writeStream.on('error', reject)
      inputStream.on('error', reject)
      byteCounter.on('error', reject)
    })

    res.json({ uploaded: safeName })
  } catch (err) {
    if (!res.headersSent) {
      logger.error(`[file-routes] Failed to upload file: ${err instanceof Error ? err.message : err}`)
      res.status(500).json({ error: 'Failed to upload file' })
    }
  }
}

export function createFileRouter(): Router {
  const router = Router()

  router.get('/list', handleList)
  router.get('/download', handleDownload)
  router.get('/size', handleSize)
  router.get('/download-zip', handleDownloadZip)
  router.post('/upload', handleUpload)

  return router
}
