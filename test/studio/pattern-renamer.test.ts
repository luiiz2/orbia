import { describe, it, expect } from 'vitest'
import { applyTitleTransformations, generateRenamePreview } from '../../src/main/services/studio/pattern-renamer'
import type { BulkRenameOptions } from '../../src/types/studio'

describe('Pattern Renamer Engine', () => {
  it('applies basic prefix and suffix', () => {
    const options: BulkRenameOptions = {
      addPrefix: 'Aula - ',
      addSuffix: ' [HD]'
    }
    const res = applyTitleTransformations('Introdução', options, 0)
    expect(res).toBe('Aula - Introdução [HD]')
  })

  it('removes prefixes, suffixes, and replaces underscores', () => {
    const options: BulkRenameOptions = {
      removePrefix: '01_',
      replaceUnderscores: true
    }
    const res = applyTitleTransformations('01_variaveis_e_tipos', options, 0)
    expect(res).toBe('variaveis e tipos')
  })

  it('cleans codecs and resolution tags', () => {
    const options: BulkRenameOptions = {
      cleanCodecs: true,
      cleanTags: true
    }
    const res = applyTitleTransformations('01. Fundamentos [SiteCurso] 1080p x264', options, 0)
    expect(res).toBe('01. Fundamentos')
  })

  it('formats case to Title Case', () => {
    const options: BulkRenameOptions = {
      caseTransform: 'titlecase'
    }
    const res = applyTitleTransformations('curso COMPLETO de typescript', options, 0)
    expect(res).toBe('Curso Completo De Typescript')
  })

  it('formats pattern with sequence number and zero padding', () => {
    const options: BulkRenameOptions = {
      pattern: '{number:02} — {title}',
      startNumber: 1,
      zeroPadding: 2
    }
    const res = applyTitleTransformations('Introdução ao React', options, 3)
    expect(res).toBe('04 — Introdução ao React')
  })

  it('generates multi-item preview accurately', () => {
    const items = [
      { id: '1', appearanceId: 'app1', type: 'lesson' as const, title: 'intro' },
      { id: '2', appearanceId: 'app2', type: 'lesson' as const, title: 'setup' }
    ]
    const options: BulkRenameOptions = {
      pattern: 'Aula {number:02}: {title}',
      caseTransform: 'titlecase',
      startNumber: 1,
      zeroPadding: 2
    }
    const preview = generateRenamePreview(items, options)
    expect(preview).toHaveLength(2)
    expect(preview[0].newTitle).toBe('Aula 01: Intro')
    expect(preview[1].newTitle).toBe('Aula 02: Setup')
    expect(preview[0].isChanged).toBe(true)
  })
})
