/**
 * WCAG 2.1 Relative Luminance & Contrast Safety Validator
 */

function hexToRgb(hex: string): [number, number, number] {
  let clean = hex.replace('#', '')
  if (clean.length === 3) {
    clean = clean
      .split('')
      .map((c) => c + c)
      .join('')
  }
  const num = parseInt(clean, 16)
  if (isNaN(num)) return [0, 0, 0]
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255]
}

function getRelativeLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const val = c / 255
    return val <= 0.03928 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs
}

/**
 * Computes contrast ratio between two hex colors (e.g. 4.5:1).
 */
export function getContrastRatio(hex1: string, hex2: string): number {
  const [r1, g1, b1] = hexToRgb(hex1)
  const [r2, g2, b2] = hexToRgb(hex2)

  const lum1 = getRelativeLuminance(r1, g1, b1)
  const lum2 = getRelativeLuminance(r2, g2, b2)

  const brightest = Math.max(lum1, lum2)
  const darkest = Math.min(lum1, lum2)

  return (brightest + 0.05) / (darkest + 0.05)
}

export interface ContrastEvaluation {
  ratio: number
  isAA: boolean
  isAAA: boolean
  warning?: string
  suggestedColor?: string
}

export function evaluateContrast(
  textColor: string,
  bgColor: string
): ContrastEvaluation {
  const ratio = Math.round(getContrastRatio(textColor, bgColor) * 100) / 100
  const isAA = ratio >= 4.5
  const isAAA = ratio >= 7.0

  let suggestedColor: string | undefined
  let warning: string | undefined

  if (!isAA) {
    const [, , bgL] = hexToRgb(bgColor)
    // If background is dark, suggest bright text; otherwise dark text
    suggestedColor = bgL < 128 ? '#f3eee5' : '#202723'
    warning = `Baixo contraste detectado (${ratio}:1). O padrão WCAG AA recomenda no mínimo 4.5:1 para garantir a legibilidade.`
  }

  return {
    ratio,
    isAA,
    isAAA,
    warning,
    suggestedColor
  }
}
