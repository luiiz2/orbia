import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import ffmpeg from 'fluent-ffmpeg'
import ffmpegStatic from 'ffmpeg-static'
import { isVideoFile, isPdfFile } from './file-utils'

/**
 * Directory where generated covers are written during scan/preview.
 * App-owned cache in OS temp — never touches user course files.
 */
export const TEMP_COVERS_DIR = path.join(os.tmpdir(), 'orbia-covers')

/** Cover patterns searched inside a course/module root in prioritized order. */
const COURSE_COVER_NAMES = [
  'backdrop', 'fanart', 'poster', 'cover', 'capa', 'banner', 'folder', 'front', 'thumb', 'thumbnail', 'landscape', 'background'
]
const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp']

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

function uniqueName(prefix: string, ext: string): string {
  return `${prefix}_${crypto.randomUUID().substring(0, 8)}${ext}`
}

export interface PersistCoverCopyOperation {
  sourcePath: string
  destinationPath: string
}

export interface PersistCoverOptions {
  beforeCopy?: (operation: PersistCoverCopyOperation) => void | Promise<void>
}

function xmlEscape(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * Writes an SVG placeholder cover (course/lesson title) as a real .svg file.
 * .svg is whitelisted by the media:// protocol.
 */
export async function generateTextCover(
  title: string,
  outputDir: string = TEMP_COVERS_DIR,
  opts: { width?: number; height?: number } = {}
): Promise<string> {
  const { width = 640, height = 360 } = opts
  ensureDir(outputDir)

  const escaped = xmlEscape(title || 'Course')
  const maxChars = Math.max(16, Math.floor(width / 14))
  const display =
    escaped.length > maxChars ? escaped.substring(0, maxChars - 1) + '&#8230;' : escaped
  const fontSize = Math.min(width, height) * 0.085

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#14100c"/>
      <stop offset="55%" stop-color="#0a0a0c"/>
      <stop offset="100%" stop-color="#1a130b"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.85" cy="0.12" r="0.55">
      <stop offset="0%" stop-color="#f97316" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="#f97316" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)"/>
  <rect width="100%" height="100%" fill="url(#glow)"/>
  <rect x="0" y="0" width="100%" height="6" fill="#f97316"/>
  <text x="50%" y="46%" dominant-baseline="middle" text-anchor="middle"
    fill="#f5f5f4" font-family="system-ui, sans-serif" font-size="${fontSize}" font-weight="700">${display}</text>
  <rect x="${width / 2 - 24}" y="58%" width="48" height="3" rx="1.5" fill="#f97316"/>
  <text x="50%" y="66%" dominant-baseline="middle" text-anchor="middle"
    fill="#a8a29e" font-family="system-ui, sans-serif" font-size="${fontSize * 0.38}" font-weight="600" letter-spacing="4">ORBIA · CURSO</text>
</svg>`

  const filePath = path.join(outputDir, uniqueName('cover', '.svg'))
  await fs.promises.writeFile(filePath, svg, 'utf-8')
  return filePath
}

/**
 * Extracts a video frame and saves it as a .jpg cover.
 * Uses the bundled ffmpeg-static binary — no system ffmpeg required.
 */
export async function generateVideoFrameCover(
  videoPath: string,
  outputDir: string = TEMP_COVERS_DIR,
  timestampSeconds: number = 3
): Promise<string | null> {
  if (!fs.existsSync(videoPath)) {
    console.warn(`[CoverGenerator] Video not found: ${videoPath}`)
    return null
  }
  if (!ffmpegStatic) {
    console.warn('[CoverGenerator] ffmpeg-static binary unavailable, skipping frame extraction')
    return null
  }

  ensureDir(outputDir)
  ffmpeg.setFfmpegPath(ffmpegStatic)

  const outputPath = path.join(outputDir, uniqueName('cover', '.jpg'))

  return new Promise((resolve) => {
    ffmpeg(videoPath)
      .screenshots({
        timestamps: [timestampSeconds],
        filename: path.basename(outputPath),
        folder: outputDir,
        size: '640x360'
      })
      .on('end', () => {
        if (fs.existsSync(outputPath)) {
          resolve(outputPath)
        } else {
          resolve(null)
        }
      })
      .on('error', (err) => {
        if (timestampSeconds > 0) {
          ffmpeg(videoPath)
            .screenshots({
              timestamps: [0],
              filename: path.basename(outputPath),
              folder: outputDir,
              size: '640x360'
            })
            .on('end', () => {
              resolve(fs.existsSync(outputPath) ? outputPath : null)
            })
            .on('error', () => {
              resolve(null)
            })
        } else {
          console.warn(`[CoverGenerator] Frame extraction failed for ${videoPath}: ${err.message}`)
          resolve(null)
        }
      })
  })
}

/**
 * Renders the first PDF page and saves it as a .png cover.
 * Uses mupdf WASM — pure JS/WASM, no native compilation.
 */
export async function generatePdfCover(
  pdfPath: string,
  outputDir: string = TEMP_COVERS_DIR
): Promise<string | null> {
  if (!fs.existsSync(pdfPath)) {
    console.warn(`[CoverGenerator] PDF not found: ${pdfPath}`)
    return null
  }

  try {
    const mupdf = await import('mupdf')
    ensureDir(outputDir)

    const bytes = new Uint8Array(await fs.promises.readFile(pdfPath))
    const doc = mupdf.Document.openDocument(bytes, 'application/pdf')
    try {
      const page = doc.loadPage(0)
      const pageRect = page.getBounds()
      const pageWidth = pageRect[2] - pageRect[0]
      const pageHeight = pageRect[3] - pageRect[1]
      const scale = Math.min(640 / pageWidth, 360 / pageHeight, 2)
      const pixmap = page.toPixmap(
        mupdf.Matrix.scale(scale, scale),
        mupdf.ColorSpace.DeviceRGB
      )
      const png = pixmap.asPNG()
      const outputPath = path.join(outputDir, uniqueName('cover', '.png'))
      await fs.promises.writeFile(outputPath, png)
      return outputPath
    } finally {
      doc.destroy()
    }
  } catch (err) {
    console.warn(
      `[CoverGenerator] PDF first page extraction failed for ${pdfPath}:`,
      err instanceof Error ? err.message : String(err)
    )
    return null
  }
}

/**
 * Finds an existing cover image inside a directory (root level only).
 * Only cover-named images qualify — a stray lesson thumbnail in the root must
 * never become the course cover (that was the "video frame as cover" bug).
 */
export function findExistingCoverInDir(dirPath: string): string | null {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true })
    // First priority: explicit cover named image (e.g. cover.jpg, poster.png, capa.png, folder.jpg)
    for (const entry of entries) {
      if (!entry.isFile()) continue
      const ext = path.extname(entry.name).toLowerCase()
      if (!IMAGE_EXTS.includes(ext)) continue
      const name = path.basename(entry.name, ext).toLowerCase()
      if (COURSE_COVER_NAMES.includes(name)) {
        return path.join(dirPath, entry.name)
      }
    }

    // Second priority: any root image file
    for (const entry of entries) {
      if (!entry.isFile()) continue
      const ext = path.extname(entry.name).toLowerCase()
      if (IMAGE_EXTS.includes(ext)) {
        return path.join(dirPath, entry.name)
      }
    }
  } catch {
    return null
  }
  return null
}

/**
 * Ensures a course has a cover image. Priority:
 * 1. Existing cover image in course root (user-provided)
 * 2. Real video frame from first video lesson (if media exists)
 * 3. Branded SVG placeholder with the course title
 * Returns the cover file path. Never returns undefined.
 */
export async function ensureCourseCover(
  courseRootPath: string,
  courseTitle: string,
  firstVideoPath?: string,
  outputDir: string = TEMP_COVERS_DIR
): Promise<string> {
  const existing = findExistingCoverInDir(courseRootPath)
  if (existing) return existing

  if (firstVideoPath && isVideoFile(firstVideoPath)) {
    const videoFrame = await generateVideoFrameCover(firstVideoPath, outputDir, 3)
    if (videoFrame) return videoFrame
  }

  return generateTextCover(courseTitle, outputDir)
}

/**
 * Ensures a lesson has a cover. Priority:
 * 1. Video frame (if media is video)
 * 2. First PDF page (if media is a PDF)
 * 3. SVG placeholder with the lesson title
 */
export async function ensureLessonCover(
  mediaPath: string,
  lessonTitle: string,
  outputDir: string = TEMP_COVERS_DIR
): Promise<string> {
  if (isVideoFile(mediaPath)) {
    const frame = await generateVideoFrameCover(mediaPath, outputDir, 3)
    if (frame) return frame
  }
  if (isPdfFile(mediaPath)) {
    const pdfCover = await generatePdfCover(mediaPath, outputDir)
    if (pdfCover) return pdfCover
  }
  return generateTextCover(lessonTitle, outputDir)
}

/** True when the cover lives in the app-owned temp covers dir (generated, not user file). */
export function isGeneratedCover(coverPath: string | undefined): boolean {
  if (!coverPath) return false
  const normalized = path.normalize(coverPath)
  if (normalized.startsWith(path.normalize(TEMP_COVERS_DIR))) return true
  // Generated covers use the "cover_<8 hex>.<ext>" naming pattern
  return /^cover_[0-9a-f]{8}\.(?:jpg|png|svg)$/i.test(path.basename(normalized))
}

/**
 * Copies generated (temp) covers into the vault's persistent covers dir:
 * {vaultPath}/.orbia/covers/
 * Returns the updated cover path. Real user-provided covers are left untouched.
 */
export async function persistCover(
  coverPath: string | undefined,
  courseId: string,
  vaultPath: string,
  kind: 'course' | 'lesson',
  options: PersistCoverOptions = {}
): Promise<string | undefined> {
  if (!coverPath || !isGeneratedCover(coverPath)) return coverPath

  const coversDir = path.join(vaultPath, '.orbia', 'covers')
  const ext = path.extname(coverPath) || '.svg'
  const fileName = `${kind}-${courseId}-${crypto.randomUUID().substring(0, 6)}${ext}`
  const dest = path.join(coversDir, fileName)

  await options.beforeCopy?.({ sourcePath: coverPath, destinationPath: dest })
  ensureDir(coversDir)
  await fs.promises.copyFile(coverPath, dest)
  return dest
}
