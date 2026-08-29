import { describe, it, expect } from 'vitest'
import {
  formatTime,
  formatDurationHuman,
  formatFileSize
} from '../src/renderer/src/lib/formatters'
import {
  normalizeSearchString,
  matchesSearchQuery,
  matchesAnyField
} from '../src/renderer/src/lib/search-utils'

describe('Renderer Utilities & Formatters Test Suite', () => {
  describe('Formatters', () => {
    it('formats time to MM:SS and HH:MM:SS properly', () => {
      expect(formatTime(0)).toBe('00:00')
      expect(formatTime(59)).toBe('00:59')
      expect(formatTime(60)).toBe('01:00')
      expect(formatTime(3599)).toBe('59:59')
      expect(formatTime(3600)).toBe('1:00:00')
      expect(formatTime(3665)).toBe('1:01:05')
      expect(formatTime(-10)).toBe('00:00')
      expect(formatTime(NaN)).toBe('00:00')
      expect(formatTime(Infinity)).toBe('00:00')
    })

    it('formats duration in human readable format', () => {
      expect(formatDurationHuman(0)).toBe('0m')
      expect(formatDurationHuman(120)).toBe('2m')
      expect(formatDurationHuman(3600)).toBe('1h')
      expect(formatDurationHuman(5400)).toBe('1h 30m')
      expect(formatDurationHuman(-50)).toBe('0m')
      expect(formatDurationHuman(NaN)).toBe('0m')
    })

    it('formats file sizes safely with unit scaling', () => {
      expect(formatFileSize(0)).toBe('0 B')
      expect(formatFileSize(1024)).toBe('1 KB')
      expect(formatFileSize(1048576)).toBe('1 MB')
      expect(formatFileSize(1073741824 * 2.5)).toBe('2.5 GB')
      expect(formatFileSize(-10)).toBe('0 B')
      expect(formatFileSize(NaN)).toBe('0 B')
    })
  })

  describe('Search Utils in Renderer', () => {
    it('strips accents and normalizes search strings', () => {
      expect(normalizeSearchString('ÁÉÍÓÚ âêîôû ãõ ç')).toBe('aeiou aeiou ao c')
      expect(normalizeSearchString('   MÓDULO DE PROGRAMAÇÃO   ')).toBe(
        'modulo de programacao'
      )
      expect(normalizeSearchString('')).toBe('')
      expect(normalizeSearchString(null)).toBe('')
    })

    it('matches accent-insensitive search queries', () => {
      expect(matchesSearchQuery('Introdução ao React', 'introducao')).toBe(true)
      expect(
        matchesSearchQuery('Configuração de Ambiente', 'configuracao')
      ).toBe(true)
      expect(
        matchesSearchQuery('Banco de Dados Relacional', 'banco relacional')
      ).toBe(true)
      expect(matchesSearchQuery('Node.js & Express', 'node express')).toBe(true)
      expect(matchesSearchQuery('Rust para Iniciantes', 'python')).toBe(false)
    })

    it('matches across multiple candidate fields in courses', () => {
      const course = {
        title: 'Formação Frontend Completa',
        description:
          'Aprenda HTML, CSS, JavaScript, React e TypeScript com projetos práticos.'
      }

      expect(
        matchesAnyField([course.title, course.description], 'formacao frontend')
      ).toBe(true)
      expect(
        matchesAnyField([course.title, course.description], 'typescript')
      ).toBe(true)
      expect(
        matchesAnyField([course.title, course.description], 'projetos')
      ).toBe(true)
      expect(
        matchesAnyField([course.title, course.description], 'angular')
      ).toBe(false)
    })
  })
})
