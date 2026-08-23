import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect, vi } from 'vitest'
import { BackupPreviewModal } from '../src/renderer/src/components/vault/BackupPreviewModal'
import type { BackupPreview } from '@shared'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, defaultVal?: string) => defaultVal || key
  })
}))

vi.mock('../src/renderer/src/components/ui/dialog', async () => {
  const ReactModule = await import('react')
  const passthrough = ({ children }: { children?: React.ReactNode }) =>
    ReactModule.createElement(ReactModule.Fragment, null, children)

  return {
    Dialog: passthrough,
    DialogContent: passthrough,
    DialogDescription: passthrough,
    DialogFooter: passthrough,
    DialogHeader: passthrough,
    DialogTitle: passthrough
  }
})

describe('BackupPreviewModal', () => {
  it('renders backup metadata and manifest summary numbers correctly', () => {
    const preview: BackupPreview = {
      valid: true,
      filePath: 'C:/Users/Dell/Documents/backup.orbia',
      fileSizeBytes: 1024 * 1024 * 5,
      manifest: {
        format: 'orbia-backup',
        version: 1,
        appVersion: '0.3.0',
        createdAt: 1787490000000,
        vaultName: 'Engenharia de Software',
        courseCount: 15,
        notesCount: 48,
        flashcardsCount: 92,
        bookmarksCount: 34,
        includesCourseFiles: false
      }
    }

    const html = renderToStaticMarkup(
      <BackupPreviewModal
        open={true}
        onClose={vi.fn()}
        preview={preview}
        onConfirmRestore={vi.fn()}
        isRestoring={false}
      />
    )

    expect(html).toContain('Engenharia de Software')
    expect(html).toContain('15')
    expect(html).toContain('48')
    expect(html).toContain('92')
    expect(html).toContain('34')
    expect(html).toContain('Cursos')
    expect(html).toContain('Anotações')
    expect(html).toContain('Flashcards')
    expect(html).toContain('Marcadores')
  })
})
