import { describe, it, expect } from 'vitest'
import {
  getContrastRatio,
  evaluateContrast
} from '../../src/renderer/src/lib/contrast-safety'

describe('Contrast Safety & WCAG 2.1 Evaluator', () => {
  it('calculates 21:1 contrast for black on white', () => {
    const ratio = getContrastRatio('#000000', '#ffffff')
    expect(ratio).toBeCloseTo(21, 0)
  })

  it('calculates 1:1 contrast for identical colors', () => {
    const ratio = getContrastRatio('#d08a52', '#d08a52')
    expect(ratio).toBeCloseTo(1, 0)
  })

  it('correctly evaluates AA pass for high-contrast combinations', () => {
    const evalResult = evaluateContrast('#f3eee5', '#101312')
    expect(evalResult.isAA).toBe(true)
    expect(evalResult.ratio).toBeGreaterThanOrEqual(4.5)
    expect(evalResult.warning).toBeUndefined()
  })

  it('warns and suggests bright color for poor contrast on dark background', () => {
    const evalResult = evaluateContrast('#202723', '#101312')
    expect(evalResult.isAA).toBe(false)
    expect(evalResult.warning).toBeDefined()
    expect(evalResult.suggestedColor).toBe('#f3eee5')
  })
})
