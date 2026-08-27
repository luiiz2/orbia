import { beforeEach, describe, expect, it, vi } from 'vitest'

const handlers = new Map<string, (_event: unknown, payload?: unknown) => Promise<unknown> | unknown>()
const service = {
  getCurrent: vi.fn(),
  listVersions: vi.fn(),
  getSubtitleCandidate: vi.fn(),
  enqueueLesson: vi.fn(),
  enqueueModule: vi.fn(),
  enqueueCourse: vi.fn(),
  reuseSubtitle: vi.fn(),
  listQueue: vi.fn(),
  pauseJob: vi.fn(),
  resumeJob: vi.fn(),
  cancelJob: vi.fn(),
  retryJob: vi.fn(),
  getSettings: vi.fn(),
  setSettings: vi.fn(),
  getCourseAutoTranscribe: vi.fn(),
  setCourseAutoTranscribe: vi.fn(),
  subscribeProgress: vi.fn().mockReturnValue(() => undefined)
}

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (_event: unknown, payload?: unknown) => unknown) => {
      handlers.set(channel, handler)
    })
  },
  BrowserWindow: { getAllWindows: vi.fn().mockReturnValue([]) }
}))

vi.mock('../src/main/services/transcription/transcription.service', () => ({ transcriptionService: service }))

describe('Transcription IPC boundary', () => {
  beforeEach(async () => {
    handlers.clear()
    vi.clearAllMocks()
    service.getCurrent.mockReturnValue(null)
    const { registerTranscriptionIpc } = await import('../src/main/ipc/transcription.ipc')
    registerTranscriptionIpc()
  })

  it('registers the durable transcription and version-control handlers', () => {
    expect([...handlers.keys()]).toEqual(expect.arrayContaining([
      'transcription:get-current',
      'transcription:enqueue-lesson',
      'transcription:enqueue-module',
      'transcription:enqueue-course',
      'transcription:reuse-subtitle',
      'transcription:list-queue',
      'transcription:retry-job',
      'transcription:get-settings',
      'transcription:set-course-auto-transcribe'
    ]))
  })

  it('rejects malformed identifiers before reaching the service', async () => {
    const enqueue = handlers.get('transcription:enqueue-lesson')!

    await expect(Promise.resolve().then(() => enqueue({}, { lessonId: ' ', options: {} }))).rejects.toThrow('Invalid transcription lesson request')
    expect(service.enqueueLesson).not.toHaveBeenCalled()
  })

  it('sanitizes valid lesson options and forwards the request', async () => {
    const enqueue = handlers.get('transcription:enqueue-lesson')!
    service.enqueueLesson.mockReturnValue({ lessonId: 'lesson-1', skipped: false, jobId: 'job-1' })

    await expect(Promise.resolve(enqueue({}, {
      lessonId: ' lesson-1 ',
      options: { language: ' pt-BR ', autoDetect: false, reuseExistingSubtitle: true, cloudConsent: true }
    }))).resolves.toEqual({ lessonId: 'lesson-1', skipped: false, jobId: 'job-1' })
    expect(service.enqueueLesson).toHaveBeenCalledWith('lesson-1', {
      language: 'pt-BR',
      autoDetect: false,
      reuseExistingSubtitle: true,
      cloudConsent: true
    })
  })
})
