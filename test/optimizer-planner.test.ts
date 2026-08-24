import { describe, it, expect } from 'vitest'
import { optimizationPlannerService } from '../src/main/services/optimizer/optimization-planner.service'
import type { MediaMetadata } from '../src/types/optimizer'

describe('OptimizationPlannerService', () => {
  it('identifies already efficient AV1 video and marks skip', () => {
    const metadata: MediaMetadata = {
      filePath: 'C:/Vault/Course/Lesson.mp4',
      fileSizeBytes: 50 * 1024 * 1024,
      containerFormat: 'mov,mp4,m4a,3gp,3g2,mj2',
      durationSeconds: 600,
      overallBitrate: 1200000,
      videoStream: {
        index: 0,
        codecName: 'av1',
        profile: 'Main',
        width: 1920,
        height: 1080,
        bitRate: 1000000,
        pixelFormat: 'yuv420p'
      },
      audioStreams: [{ index: 1, codecName: 'aac', channels: 2, sampleRate: 48000, bitRate: 128000 }],
      subtitleStreams: [],
      chapters: [],
      hasAudio: true,
      hasVideo: true,
      mtimeMs: Date.now()
    }

    const plan = optimizationPlannerService.createPlan(metadata, {
      lessonId: 'les_1',
      courseId: 'crs_1',
      courseTitle: 'Advanced Rust',
      lessonTitle: '01 - Introdução',
      profile: 'balanced'
    })

    expect(plan.isAlreadyEfficient).toBe(true)
    expect(plan.estimatedSavingsPercent).toBe(0)
    expect(plan.reason).toContain('AV1')
  })

  it('generates high savings plan for bloated 1080p H.264 video', () => {
    const metadata: MediaMetadata = {
      filePath: 'C:/Vault/Course/HugeLesson.mp4',
      fileSizeBytes: 900 * 1024 * 1024, // 900 MB for 10 min
      containerFormat: 'mp4',
      durationSeconds: 600,
      overallBitrate: 12000000, // 12 Mbps
      videoStream: {
        index: 0,
        codecName: 'h264',
        profile: 'High',
        width: 1920,
        height: 1080,
        bitRate: 11800000,
        pixelFormat: 'yuv420p'
      },
      audioStreams: [{ index: 1, codecName: 'aac', channels: 2, sampleRate: 48000, bitRate: 192000 }],
      subtitleStreams: [],
      chapters: [],
      hasAudio: true,
      hasVideo: true,
      mtimeMs: Date.now()
    }

    const plan = optimizationPlannerService.createPlan(metadata, {
      lessonId: 'les_2',
      courseId: 'crs_1',
      courseTitle: 'Fullstack Course',
      lessonTitle: '02 - Backend Setup',
      profile: 'balanced'
    })

    expect(plan.isAlreadyEfficient).toBe(false)
    expect(plan.targetCodec).toBe('hevc')
    expect(plan.targetResolution).toBe('1920x1080')
    expect(plan.targetCrf).toBe(23)
    expect(plan.estimatedSavingsPercent).toBeGreaterThan(60)
    expect(plan.estimatedSavingsBytes).toBeGreaterThan(500 * 1024 * 1024)
  })

  it('proposes resolution downscale to 1080p for 4K tutorials in space_saving profile with warnings', () => {
    const metadata: MediaMetadata = {
      filePath: 'C:/Vault/Course/4KTutorial.mkv',
      fileSizeBytes: 2500 * 1024 * 1024, // 2.5 GB for 15 min
      containerFormat: 'matroska,webm',
      durationSeconds: 900,
      overallBitrate: 23000000, // 23 Mbps
      videoStream: {
        index: 0,
        codecName: 'h264',
        profile: 'High',
        width: 3840,
        height: 2160,
        bitRate: 22800000,
        pixelFormat: 'yuv420p'
      },
      audioStreams: [{ index: 1, codecName: 'aac', channels: 2, sampleRate: 48000, bitRate: 192000 }],
      subtitleStreams: [],
      chapters: [],
      hasAudio: true,
      hasVideo: true,
      mtimeMs: Date.now()
    }

    const plan = optimizationPlannerService.createPlan(metadata, {
      lessonId: 'les_3',
      courseId: 'crs_1',
      courseTitle: '4K Masterclass',
      lessonTitle: '03 - 4K Video Editing',
      profile: 'space_saving'
    })

    expect(plan.isResolutionReduced).toBe(true)
    expect(plan.targetHeight).toBe(1080)
    expect(plan.targetWidth).toBe(1920)
    expect(plan.warnings.length).toBeGreaterThan(0)
    expect(plan.warnings[0]).toContain('Resolução reduzida')
  })

  it('selects MKV container when complex subtitles are present', () => {
    const metadata: MediaMetadata = {
      filePath: 'C:/Vault/Course/SubtitledVideo.mkv',
      fileSizeBytes: 400 * 1024 * 1024,
      containerFormat: 'matroska',
      durationSeconds: 600,
      overallBitrate: 5333333,
      videoStream: {
        index: 0,
        codecName: 'h264',
        profile: 'High',
        width: 1920,
        height: 1080,
        bitRate: 5000000,
        pixelFormat: 'yuv420p'
      },
      audioStreams: [{ index: 1, codecName: 'aac', channels: 2, sampleRate: 48000, bitRate: 128000 }],
      subtitleStreams: [{ index: 2, codecName: 'ass', language: 'por' }],
      chapters: [],
      hasAudio: true,
      hasVideo: true,
      mtimeMs: Date.now()
    }

    const plan = optimizationPlannerService.createPlan(metadata, {
      lessonId: 'les_4',
      courseId: 'crs_1',
      courseTitle: 'Japanese Course',
      lessonTitle: '04 - Subtitles',
      profile: 'balanced'
    })

    expect(plan.targetContainer).toBe('mkv')
  })

  it('adds clear warning when physical file is shared across multiple vaults', () => {
    const metadata: MediaMetadata = {
      filePath: 'C:/SharedVaults/CommonLesson.mp4',
      fileSizeBytes: 500 * 1024 * 1024,
      containerFormat: 'mp4',
      durationSeconds: 600,
      overallBitrate: 6666666,
      videoStream: {
        index: 0,
        codecName: 'h264',
        width: 1920,
        height: 1080,
        bitRate: 6500000
      },
      audioStreams: [],
      subtitleStreams: [],
      chapters: [],
      hasAudio: false,
      hasVideo: true,
      mtimeMs: Date.now()
    }

    const plan = optimizationPlannerService.createPlan(metadata, {
      lessonId: 'les_5',
      courseId: 'crs_1',
      courseTitle: 'Shared Course',
      lessonTitle: '05 - Shared Lesson',
      isSharedFile: true,
      sharedVaultNames: ['Vault A', 'Vault B']
    })

    expect(plan.isSharedFile).toBe(true)
    expect(plan.sharedVaultNames).toEqual(['Vault A', 'Vault B'])
    expect(plan.warnings.some((w) => w.includes('múltiplos Vaults'))).toBe(true)
  })
})
