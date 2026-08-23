import { naturalCompare } from './natural-sort'

/**
 * Normalizes a module title into a stable identity key so that folders such
 * as "Dia 12", "DIA_12" and "dia 12 -" are recognized as the same module.
 * Keeps digits intact: "Dia 2" and "Dia 10" remain distinct modules.
 */
export function normalizeModuleIdentity(title: string): string {
  return title
    .normalize('NFKC')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_\-\s\u2013\u2014]+/g, ' ')
    .trim()
}

/**
 * Picks the display title for a group of equivalent modules using natural
 * ordering, so "Dia 12" wins over "DIA 12" instead of an arbitrary folder.
 */
export function pickModuleDisplayTitle(titles: string[]): string {
  if (titles.length === 0) return ''
  return [...titles].sort((a, b) => naturalCompare(a, b))[0]
}