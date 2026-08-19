import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Utility function to merge Tailwind CSS class names safely.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
