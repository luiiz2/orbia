import path from 'node:path'

const BACKUP_FOLDER_PATTERNS = [
  /^(?:backup|backups|old|antigo|antigos|copy|copia|cópia|copies|copias|cópias|temp|temporary|tmp|duplicates|duplicados|archive|arquivos\s+antigos|lixeira|trash)$/i,
  /[-_\s](?:backup|old|antigo|copy|copia|cópia|temp|tmp|duplicates)$/i
]

const AUXILIARY_SECTION_PATTERNS = [
  /^(?:bonus|bônus|extra|extras|material|materiais|materials|pdf|pdfs|download|downloads|attachment|attachments|anexo|anexos|resource|resources|recurso|recursos|slides|apostilas|complementar|complementares)$/i,
  /[-_\s](?:bonus|bônus|extras|materiais|materials|downloads|anexos|recursos)$/i
]

export type FolderClassification =
  'standard' | 'backup_temp' | 'auxiliary_section'

/**
 * Classifies a folder name based on domain heuristics.
 * - 'backup_temp': Backup/temp folder (e.g. "Backup", "Old", "Temp", "Cópia")
 * - 'auxiliary_section': Bonus/resources section (e.g. "Bonus", "Materiais", "PDFs", "Downloads")
 * - 'standard': Normal content/module folder
 */
export function classifyFolderName(folderName: string): FolderClassification {
  if (!folderName || typeof folderName !== 'string') return 'standard'
  const trimmed = folderName.trim()

  for (const pattern of BACKUP_FOLDER_PATTERNS) {
    if (pattern.test(trimmed)) {
      return 'backup_temp'
    }
  }

  for (const pattern of AUXILIARY_SECTION_PATTERNS) {
    if (pattern.test(trimmed)) {
      return 'auxiliary_section'
    }
  }

  return 'standard'
}

/**
 * Checks if a path is inside a known backup/temp directory.
 */
export function isInsideBackupFolder(
  filePath: string,
  rootPath: string
): boolean {
  const rel = path.relative(path.resolve(rootPath), path.resolve(filePath))
  const segments = rel.split(/[\\/]/)

  for (const segment of segments) {
    if (classifyFolderName(segment) === 'backup_temp') {
      return true
    }
  }

  return false
}

/**
 * Checks if a directory represents an auxiliary section (e.g. Bonus, Materials).
 */
export function isAuxiliarySectionFolder(folderName: string): boolean {
  return classifyFolderName(folderName) === 'auxiliary_section'
}
