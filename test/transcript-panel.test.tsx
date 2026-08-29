import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import {
  TranscriptPanel,
  highlightTranscriptText
} from '../src/renderer/src/components/player/TranscriptPanel'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key
  })
}))

describe('TranscriptPanel', () => {
  it('renders timestamped segments as keyboard-accessible seek controls', () => {
    const markup = renderToStaticMarkup(
      React.createElement(TranscriptPanel, {
        transcript: {
          id: 'transcript-1',
          lessonId: 'lesson-1',
          version: 1,
          language: 'pt',
          provider: 'subtitle',
          createdAt: 1,
          sourceRevision: 'revision-1',
          settings: {},
          status: 'completed',
          isCurrent: true,
          segments: [{ sequence: 0, start: 0, end: 3, text: 'Olá mundo' }]
        },
        subtitleCandidate: null,
        currentTime: 1,
        isLoading: false,
        errorMessage: null,
        onSeek: vi.fn(),
        onTranscribe: vi.fn(),
        onReuseSubtitle: vi.fn(),
        onRetranscribe: vi.fn()
      })
    )

    expect(markup).toContain('aria-current="true"')
    expect(markup).toContain('aria-label="00:00 Olá mundo"')
    expect(markup).toContain('Olá mundo')
  })

  it('highlights all case-insensitive search matches without changing the source text', () => {
    const parts = highlightTranscriptText('Olá mundo, olá!', 'olá')
    expect(parts.filter((part) => part.match).map((part) => part.text)).toEqual(
      ['Olá', 'olá']
    )
    expect(parts.map((part) => part.text).join('')).toBe('Olá mundo, olá!')
  })
})
