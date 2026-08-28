import type {
  BulkRenameOptions,
  BulkRenamePreviewItem,
  StudioEntityType
} from '../../../types/studio'

export function applyTitleTransformations(
  title: string,
  options: BulkRenameOptions,
  index: number
): string {
  let result = title

  // 1. Remove Prefix / Suffix
  if (options.removePrefix && result.startsWith(options.removePrefix)) {
    result = result.slice(options.removePrefix.length)
  }
  if (options.removeSuffix && result.endsWith(options.removeSuffix)) {
    result = result.slice(0, -options.removeSuffix.length)
  }

  // 2. Find and Replace
  if (options.findText) {
    if (options.useRegex) {
      try {
        const regex = new RegExp(options.findText, 'g')
        result = result.replace(regex, options.replaceText || '')
      } catch {
        // Fallback to literal replace
        result = result.replaceAll(options.findText, options.replaceText || '')
      }
    } else {
      result = result.replaceAll(options.findText, options.replaceText || '')
    }
  }

  // 3. Clean Codecs / Tags
  if (options.cleanTags) {
    result = result
      .replace(/\[.*?\]|\(.*?\)/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }
  if (options.cleanCodecs) {
    result = result
      .replace(/\b(1080p|720p|4k|2160p|x264|x265|hevc|aac|mp4|mkv)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim()
  }
  if (options.replaceUnderscores) {
    result = result.replace(/_/g, ' ')
  }

  // 4. Case Formatting
  if (options.caseTransform === 'lowercase') {
    result = result.toLowerCase()
  } else if (options.caseTransform === 'uppercase') {
    result = result.toUpperCase()
  } else if (options.caseTransform === 'titlecase') {
    result = result.replace(
      /\w\S*/g,
      (w) => w.charAt(0).toUpperCase() + w.substring(1).toLowerCase()
    )
  } else if (options.caseTransform === 'sentencecase') {
    result = result.charAt(0).toUpperCase() + result.slice(1).toLowerCase()
  }

  // 5. Add Prefix / Suffix
  if (options.addPrefix) {
    result = `${options.addPrefix}${result}`
  }
  if (options.addSuffix) {
    result = `${result}${options.addSuffix}`
  }

  // 6. Pattern Template (e.g. "{number:02} — {title}")
  if (options.pattern) {
    const seqNum = (options.startNumber || 1) + index
    const padding = options.zeroPadding || 2
    const paddedNum = String(seqNum).padStart(padding, '0')

    result = options.pattern
      .replace(/\{number:\d+\}/g, paddedNum)
      .replace(/\{number\}/g, String(seqNum))
      .replace(/\{title\}/g, result)
  }

  return result.trim()
}

export function generateRenamePreview(
  items: Array<{
    id: string
    appearanceId: string
    type: StudioEntityType
    title: string
  }>,
  options: BulkRenameOptions
): BulkRenamePreviewItem[] {
  return items.map((item, idx) => {
    const newTitle = applyTitleTransformations(item.title, options, idx)
    return {
      id: item.id,
      appearanceId: item.appearanceId,
      type: item.type,
      originalTitle: item.title,
      newTitle,
      isChanged: newTitle !== item.title
    }
  })
}
