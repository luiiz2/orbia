import { describe, it, expect } from 'vitest'
import {
  cleanTitle,
  cleanCourseTitle,
  cleanModuleTitle
} from '../src/main/utils/title-cleaner'
import {
  naturalCompare,
  naturalSort,
  naturalSortBy,
  extractLeadingNumber
} from '../src/main/utils/natural-sort'
import { convertSrtToVtt } from '../src/main/utils/subtitle-utils'
import {
  formatDuration,
  formatBytes,
  isCoverImage,
  isIgnoredPath,
  getMediaType
} from '../src/main/utils/file-utils'
import {
  normalizeSearchString,
  matchesSearchQuery,
  matchesAnyField
} from '../src/main/utils/search-utils'

describe('Edge Cases & Resiliency Test Suite', () => {
  describe('Title Cleaner Edge Cases', () => {
    it('handles special characters, accents, and diacritics in titles', () => {
      expect(
        cleanTitle('01 - Módulo Básico: Introdução à Álgebra e Estatística [1080p].mp4')
      ).toBe('01 - Módulo Básico - Introdução à Álgebra e Estatística')
      expect(cleanTitle('Aula 05 - Programação Funcional & Concorrência.mkv')).toBe(
        '05 - Programação Funcional & Concorrência'
      )
      expect(cleanTitle('Lição 03 - Fundamentos de Eletricidade & Magnetismo.mp4')).toBe(
        '03 - Fundamentos de Eletricidade & Magnetismo'
      )
    })

    it('preserves emojis in course and lesson titles', () => {
      expect(cleanTitle('🚀 01 - Rocket Launch & Setup.mp4')).toBe('🚀 01 - Rocket Launch & Setup')
      expect(cleanTitle('01 - Python 🐍 Masterclass [2024].mp4')).toBe('01 - Python 🐍 Masterclass')
      expect(cleanTitle('🔥 Aula 02 - Dicas Rápidas de CSS ✨.mkv')).toBe(
        '🔥 02 - Dicas Rápidas de CSS ✨'
      )
    })

    it('handles nested, adjacent, and varied brackets (round, square, curly)', () => {
      expect(
        cleanTitle('[[Udemy]] {Curso Completo} (2024) [1080p] - 01. TypeScript Deep Dive {Extra}.mp4')
      ).toBe('01. TypeScript Deep Dive {Extra}')
      expect(cleanTitle('[Rocketseat] [NLW] (Full Course) 01 - Iniciando com Node.mp4')).toBe(
        '01 - Iniciando com Node'
      )
    })

    it('handles programming symbols, technology names with pluses/hashes/slashes', () => {
      expect(cleanTitle('01 - Complete C++ & C# Guide.mp4')).toBe('01 - Complete C++ & C# Guide')
      expect(cleanTitle('Aula 02 - Protocolos TCP/IP e DNS.mp4')).toBe('02 - Protocolos TCP/IP e DNS')
      expect(cleanTitle('Lesson 03: What is CI/CD Pipeline?.mp4')).toBe(
        '03 - What is CI/CD Pipeline?'
      )
      expect(cleanTitle('04 - 100% Rust Performance.mp4')).toBe('04 - 100% Rust Performance')
    })

    it('handles decimal and fractional lesson numbers', () => {
      expect(cleanTitle('01.5 - Bonus Lecture: Architecture Overview.mp4')).toBe(
        '01.5 - Bonus Lecture - Architecture Overview'
      )
      expect(cleanTitle('Aula 1.5 - Setup Adicional do Docker.mp4')).toBe(
        '1.5 - Setup Adicional do Docker'
      )
    })

    it('handles alphanumeric lesson suffixes', () => {
      expect(cleanTitle('Aula 10a - Refatoração do Código Legado.mp4')).toBe(
        '10a - Refatoração do Código Legado'
      )
      expect(cleanTitle('01b - Alternate Solution.mp4')).toBe('01b - Alternate Solution')
      expect(cleanTitle('Lesson 03C: Edge Cases Analysis.mp4')).toBe('03C - Edge Cases Analysis')
    })

    it('preserves bare numerical and decimal names without stripping to empty', () => {
      expect(cleanTitle('001.mp4')).toBe('001')
      expect(cleanTitle('01.5.mp4')).toBe('01.5')
      expect(cleanTitle('100.mkv')).toBe('100')
      expect(cleanTitle('Aula 01.mp4')).toBe('01')
    })

    it('handles course titles with platform tags, years, and clean naming', () => {
      expect(
        cleanCourseTitle('01. Complete Web Development Bootcamp (2024)')
      ).toBe('Complete Web Development Bootcamp')
      expect(
        cleanCourseTitle('[Alura] 01 - Formação Front-end 2024 [Curso Completo]')
      ).toBe('Formação Front-end')
      expect(cleanCourseTitle('')).toBe('Untitled Course')
      expect(cleanCourseTitle('   ')).toBe('Untitled Course')
    })

    it('handles module titles with numeric, empty, or custom formats', () => {
      expect(cleanModuleTitle('01.5', 3)).toBe('01.5')
      expect(cleanModuleTitle('01', 1)).toBe('01')
      expect(cleanModuleTitle('Módulo 01 - Fundamentos', 1)).toBe('01 - Fundamentos')
      expect(cleanModuleTitle('', 5)).toBe('Module 05')
      expect(cleanModuleTitle('   ', 7)).toBe('Module 07')
      expect(cleanModuleTitle('Advanced Topics', 2)).toBe('Advanced Topics')
    })

    it('handles empty, undefined-like, or whitespace-only inputs gracefully', () => {
      expect(cleanTitle('')).toBe('')
      expect(cleanTitle('   ')).toBe('')
      // @ts-expect-error test invalid types
      expect(cleanTitle(null)).toBe('')
      // @ts-expect-error test invalid types
      expect(cleanTitle(undefined)).toBe('')
    })
  })

  describe('Natural Sort with Complex Patterns', () => {
    it('correctly sorts mixed alpha-numeric patterns and decimals', () => {
      const items = [
        'Aula 20',
        'Aula 1',
        'Aula 1.5',
        'Aula 10',
        'Aula 10a',
        'Aula 10b',
        'Aula 2',
        'Aula 11'
      ]

      const sorted = naturalSort(items)
      expect(sorted).toEqual([
        'Aula 1',
        'Aula 1.5',
        'Aula 2',
        'Aula 10',
        'Aula 10a',
        'Aula 10b',
        'Aula 11',
        'Aula 20'
      ])
    })

    it('sorts semver and multi-level version numbers naturally', () => {
      const versions = ['v1.10.0', 'v1.0.0', 'v2.0.0', 'v1.2.0', 'v1.1.1']
      expect(naturalSort(versions)).toEqual([
        'v1.0.0',
        'v1.1.1',
        'v1.2.0',
        'v1.10.0',
        'v2.0.0'
      ])
    })

    it('sorts objects with complex mixed names naturally', () => {
      const list = [
        { id: 1, title: 'Modulo 10 - Deploy' },
        { id: 2, title: 'Modulo 01 - Intro' },
        { id: 3, title: 'Modulo 1.5 - Setup' },
        { id: 4, title: 'Modulo 2 - Basics' }
      ]

      const sorted = naturalSortBy(list, (x) => x.title)
      expect(sorted.map((x) => x.id)).toEqual([2, 3, 4, 1])
    })

    it('extracts leading numbers with decimals, prefixes, and special patterns', () => {
      expect(extractLeadingNumber('Aula 01.5 - Setup')).toBe(1.5)
      expect(extractLeadingNumber('Lesson 12: Functions')).toBe(12)
      expect(extractLeadingNumber('Módulo 03 - React')).toBe(3)
      expect(extractLeadingNumber('007 - Agent')).toBe(7)
      expect(extractLeadingNumber('Section 4: Advanced')).toBe(4)
      expect(extractLeadingNumber('10a - Bonus')).toBe(10)
      expect(extractLeadingNumber('Non-numbered title')).toBeNull()
      expect(extractLeadingNumber('')).toBeNull()
    })
  })

  describe('Subtitle Converter (SRT to WebVTT) Edge Cases', () => {
    it('strips UTF-8 BOM if present at start of SRT', () => {
      const srtWithBom = '\uFEFF1\n00:00:01,000 --> 00:00:03,000\nHello World\n'
      const vtt = convertSrtToVtt(srtWithBom)
      expect(vtt.startsWith('WEBVTT\n\n')).toBe(true)
      expect(vtt).not.toContain('\uFEFF')
      expect(vtt).toContain('00:00:01.000 --> 00:00:03.000')
      expect(vtt).toContain('Hello World')
    })

    it('handles mixed line breaks (CRLF and classic CR)', () => {
      const srtMixed = '1\r\n00:00:01,000 --> 00:00:02,000\rLine 1\r\n\r2\n00:00:03,000 --> 00:00:04,000\nLine 2'
      const vtt = convertSrtToVtt(srtMixed)
      expect(vtt.startsWith('WEBVTT\n\n')).toBe(true)
      expect(vtt).not.toContain('\r')
      expect(vtt).toContain('Line 1')
      expect(vtt).toContain('Line 2')
    })

    it('normalizes single-digit hour timestamps', () => {
      const srt = '1\n1:05:30,123 --> 1:05:35,456\nSingle digit hour cue'
      const vtt = convertSrtToVtt(srt)
      expect(vtt).toContain('01:05:30.123 --> 01:05:35.456')
      expect(vtt).toContain('Single digit hour cue')
    })

    it('handles 2-segment timestamps (MM:SS,mmm)', () => {
      const srt = '1\n01:23,456 --> 01:25,789\nTwo segment timestamp'
      const vtt = convertSrtToVtt(srt)
      expect(vtt).toContain('01:23.456 --> 01:25.789')
      expect(vtt).toContain('Two segment timestamp')
    })

    it('handles dot-separated timestamps and pads single/double digit milliseconds', () => {
      const srt = '1\n00:01:05.5 --> 00:01:08.50\nDot separated with partial milliseconds'
      const vtt = convertSrtToVtt(srt)
      expect(vtt).toContain('00:01:05.500 --> 00:01:08.500')
    })

    it('strips legacy <font> tags while preserving <i>, <b>, <u> formatting', () => {
      const srt = '1\n00:00:01,000 --> 00:00:04,000\n<font color="#ffff00"><i>Yellow italic</i></font> and <b>Bold</b>'
      const vtt = convertSrtToVtt(srt)
      expect(vtt).not.toContain('<font')
      expect(vtt).not.toContain('</font>')
      expect(vtt).toContain('<i>Yellow italic</i> and <b>Bold</b>')
    })

    it('handles extra tabs and spacing around arrows and cue settings', () => {
      const srt = '1\n00:00:01,000 \t --> \t 00:00:04,000  align:start\nPositioned cue'
      const vtt = convertSrtToVtt(srt)
      expect(vtt).toContain('00:00:01.000 --> 00:00:04.000 align:start')
    })

    it('handles empty and whitespace-only subtitles gracefully', () => {
      expect(convertSrtToVtt('')).toBe('WEBVTT\n\n')
      expect(convertSrtToVtt('   \n\r\t  ')).toBe('WEBVTT\n\n')
      // @ts-expect-error test invalid types
      expect(convertSrtToVtt(null)).toBe('WEBVTT\n\n')
    })
  })

  describe('Accent-Insensitive & Diacritic Search Matching', () => {
    it('normalizes diacritics and accents properly', () => {
      expect(normalizeSearchString('Introdução ao Módulo')).toBe('introducao ao modulo')
      expect(normalizeSearchString('Álgebra & Lógica Matemática')).toBe(
        'algebra & logica matematica'
      )
      expect(normalizeSearchString('Crème Brûlée & Café')).toBe('creme brulee & cafe')
      expect(normalizeSearchString('Español y Comunicación')).toBe('espanol y comunicacion')
    })

    it('matches Portuguese accents without diacritics in search query', () => {
      expect(matchesSearchQuery('Introdução ao Python', 'introducao')).toBe(true)
      expect(matchesSearchQuery('Módulo de Redes', 'modulo')).toBe(true)
      expect(matchesSearchQuery('Lição 1 — Álgebra Linear', 'licao algebra')).toBe(true)
      expect(matchesSearchQuery('Lógica de Programação', 'LOGICA')).toBe(true)
    })

    it('matches multi-word queries in any order', () => {
      const target = 'Curso Completo de Python Avançado e Data Science'
      expect(matchesSearchQuery(target, 'data python')).toBe(true)
      expect(matchesSearchQuery(target, 'avancado python completo')).toBe(true)
      expect(matchesSearchQuery(target, 'python java')).toBe(false)
    })

    it('matches across multiple candidate fields (title and description)', () => {
      const title = 'Machine Learning Masterclass'
      const description = 'Curso completo com redes neurais artificiais e visão computacional'

      expect(matchesAnyField([title, description], 'visao computacional')).toBe(true)
      expect(matchesAnyField([title, description], 'machine learning')).toBe(true)
      expect(matchesAnyField([title, description], 'redes masterclass')).toBe(true)
      expect(matchesAnyField([title, description], 'unrelated topic')).toBe(false)
    })

    it('handles empty and whitespace queries safely', () => {
      expect(matchesSearchQuery('Any Title', '')).toBe(true)
      expect(matchesSearchQuery('Any Title', '   ')).toBe(true)
      expect(matchesSearchQuery('', 'search')).toBe(false)
      expect(matchesSearchQuery(null, 'search')).toBe(false)
      expect(matchesAnyField([], 'query')).toBe(false)
      expect(matchesAnyField([null, undefined], 'query')).toBe(false)
    })
  })

  describe('File Formatting & Classification Utilities', () => {
    it('safely formats duration with negative, NaN, and extreme values', () => {
      expect(formatDuration(0)).toBe('00:00')
      expect(formatDuration(-100)).toBe('00:00')
      expect(formatDuration(NaN)).toBe('00:00')
      expect(formatDuration(Infinity)).toBe('00:00')
      expect(formatDuration(3665)).toBe('1:01:05')
      expect(formatDuration(100000)).toBe('27:46:40')
    })

    it('safely formats bytes with zero, negative, NaN, and petabyte values', () => {
      expect(formatBytes(0)).toBe('0 B')
      expect(formatBytes(-500)).toBe('0 B')
      expect(formatBytes(NaN)).toBe('0 B')
      expect(formatBytes(Infinity)).toBe('0 B')
      expect(formatBytes(1024)).toBe('1 KB')
      expect(formatBytes(1024 * 1024 * 1024 * 1.5)).toBe('1.5 GB')
      expect(formatBytes(Math.pow(1024, 4))).toBe('1 TB')
      expect(formatBytes(Math.pow(1024, 5))).toBe('1 PB')
    })

    it('accurately identifies cover images regardless of case and extension', () => {
      expect(isCoverImage('capa.JPG')).toBe(true)
      expect(isCoverImage('Capa.PNG')).toBe(true)
      expect(isCoverImage('POSTER.jpeg')).toBe(true)
      expect(isCoverImage('Thumb.WEBP')).toBe(true)
      expect(isCoverImage('folder.png')).toBe(true)
      expect(isCoverImage('cover.pdf')).toBe(false)
      expect(isCoverImage('slide.jpg')).toBe(false)
    })

    it('accurately detects ignored paths and hidden files', () => {
      expect(isIgnoredPath('.git')).toBe(true)
      expect(isIgnoredPath('.orbia')).toBe(true)
      expect(isIgnoredPath('Thumbs.db')).toBe(true)
      expect(isIgnoredPath('node_modules')).toBe(true)
      expect(isIgnoredPath('._video.mp4')).toBe(true)
      expect(isIgnoredPath('.DS_Store')).toBe(true)
      expect(isIgnoredPath('valid-folder')).toBe(false)
      expect(isIgnoredPath('01 - Lecture.mp4')).toBe(false)
    })

    it('accurately detects media types', () => {
      expect(getMediaType('video.mp4')).toBe('video')
      expect(getMediaType('video.mkv')).toBe('video')
      expect(getMediaType('audio.mp3')).toBe('audio')
      expect(getMediaType('audio.wav')).toBe('audio')
      expect(getMediaType('document.pdf')).toBe('pdf')
      expect(getMediaType('readme.txt')).toBe('document')
      expect(getMediaType('notes.md')).toBe('document')
    })
  })
})
