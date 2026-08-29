import fs from 'node:fs'
import path from 'node:path'

/** Returns true when candidate is inside parent, optionally including parent itself. */
export function isPathWithin(
  parentPath: string,
  candidatePath: string,
  allowEqual = true
): boolean {
  const parent = comparablePath(parentPath)
  const candidate = comparablePath(candidatePath)
  const relative = path.relative(parent, candidate)

  if (relative === '') return allowEqual
  return (
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  )
}

/** Compares absolute paths using the platform's case-sensitivity rules. */
export function samePath(firstPath: string, secondPath: string): boolean {
  return comparablePath(firstPath) === comparablePath(secondPath)
}

/** Checks whether a path is one of the exact Main-owned paths in a registry. */
export function isRegisteredPath(
  candidatePath: string,
  registeredPaths: readonly string[]
): boolean {
  return registeredPaths.some((registeredPath) =>
    samePath(candidatePath, registeredPath)
  )
}

/**
 * Verifies containment after resolving an existing path, closing symlink
 * escapes for operations that act on an already-created filesystem entry.
 */
export function isExistingPathWithin(
  parentPath: string,
  candidatePath: string,
  allowEqual = false
): boolean {
  try {
    return isPathWithin(
      fs.realpathSync(parentPath),
      fs.realpathSync(candidatePath),
      allowEqual
    )
  } catch {
    return false
  }
}

/**
 * Verifies an existing path, or the closest existing ancestor when the final
 * path has not been created yet. This prevents a symlinked destination
 * directory from redirecting a write outside the trusted parent.
 */
export function isExistingPathOrAncestorWithin(
  parentPath: string,
  candidatePath: string,
  allowEqual = false
): boolean {
  try {
    const resolvedParent = fs.realpathSync(parentPath)
    let currentPath = path.resolve(candidatePath)

    while (true) {
      try {
        fs.lstatSync(currentPath)
        return isPathWithin(
          resolvedParent,
          fs.realpathSync(currentPath),
          allowEqual
        )
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code
        if (code !== 'ENOENT' && code !== 'ENOTDIR') return false
      }
      const parentOfCurrent = path.dirname(currentPath)
      if (parentOfCurrent === currentPath) return false
      currentPath = parentOfCurrent
    }
  } catch {
    return false
  }
}

function comparablePath(value: string): string {
  const resolved = path.resolve(value)
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}
