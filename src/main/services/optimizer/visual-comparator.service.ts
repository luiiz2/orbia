import { spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import ffmpegStatic from 'ffmpeg-static'
import type {
  OptimizationProfile,
  VisualComparisonResult,
  VisualComparisonSample
} from '../../../types/optimizer'
import { databaseService } from '../database.service'
import { mediaAnalyzerService } from './media-analyzer.service'
import { optimizationPlannerService } from './optimization-planner.service'
import { hardwareCapabilityService } from './hardware-capability.service'
import { formatTime } from '../../../renderer/src/lib/formatters'

export class VisualComparatorService {
  /**
   * Generates quality preview comparison samples (original vs planned encode)
   * at 3 representative timestamps for interactive side-by-side or split viewing.
   */
  public async generateComparison(
    lessonId: string,
    profile: OptimizationProfile = 'balanced'
  ): Promise<VisualComparisonResult> {
    const db = databaseService.getDatabase()
    if (!db) throw new Error('Database is not connected.')

    const lesson = db
      .prepare(
        `
      SELECT l.id, l.title as lessonTitle, l.course_id as courseId, l.file_path as filePath, c.title as courseTitle
      FROM lessons l
      JOIN courses c ON c.id = l.course_id
      WHERE l.id = ?
    `
      )
      .get(lessonId) as
      | {
          id: string
          lessonTitle: string
          courseId: string
          filePath: string
          courseTitle: string
        }
      | undefined

    if (!lesson || !fs.existsSync(lesson.filePath)) {
      throw new Error(`Lesson file not found on disk: ${lesson?.filePath}`)
    }

    const metadata = await mediaAnalyzerService.analyze(lesson.filePath)
    const plan = optimizationPlannerService.createPlan(metadata, {
      lessonId: lesson.id,
      courseId: lesson.courseId,
      courseTitle: lesson.courseTitle,
      lessonTitle: lesson.lessonTitle,
      profile
    })

    const vaultPath =
      databaseService.getCurrentVaultPath() || path.dirname(lesson.filePath)
    const previewDir = path.join(
      vaultPath,
      '.orbia',
      'temp',
      'preview',
      lesson.id
    )
    if (!fs.existsSync(previewDir)) {
      fs.mkdirSync(previewDir, { recursive: true })
    }

    const duration = Math.max(10, metadata.durationSeconds)
    // 3 representative timestamps (10%, 45%, 80%)
    const points = [
      Math.floor(duration * 0.1),
      Math.floor(duration * 0.45),
      Math.floor(duration * 0.8)
    ]

    const { encoder } = await hardwareCapabilityService.getBestEncoder(
      plan.targetCodec,
      false
    )

    const samples: VisualComparisonSample[] = []
    const sampleDurationSec = 4

    for (let i = 0; i < points.length; i++) {
      const timestampSec = points[i]
      const sampleId = `sample_${i + 1}_${timestampSec}`
      const origSamplePath = path.join(previewDir, `${sampleId}_orig.mp4`)
      const optSamplePath = path.join(previewDir, `${sampleId}_opt.mp4`)

      // Extract original 4s sample
      await this.extractClip(
        lesson.filePath,
        timestampSec,
        sampleDurationSec,
        origSamplePath,
        false
      )

      // Extract & transcode planned 4s sample
      await this.extractAndTranscodeClip(
        lesson.filePath,
        timestampSec,
        sampleDurationSec,
        optSamplePath,
        encoder,
        plan
      )

      const origStat = fs.existsSync(origSamplePath)
        ? fs.statSync(origSamplePath).size
        : 0
      const optStat = fs.existsSync(optSamplePath)
        ? fs.statSync(optSamplePath).size
        : 0

      samples.push({
        id: sampleId,
        timestampSeconds: timestampSec,
        timestampLabel: formatTime(timestampSec),
        originalSampleVideoPath: origSamplePath,
        optimizedSampleVideoPath: optSamplePath,
        originalSizeEst: origStat,
        optimizedSizeEst: optStat
      })
    }

    return {
      lessonId: lesson.id,
      sourcePath: lesson.filePath,
      profile,
      plan,
      samples
    }
  }

  private extractClip(
    inputPath: string,
    startSeconds: number,
    durationSeconds: number,
    outputPath: string,
    reencode: boolean
  ): Promise<void> {
    const executablePath = ffmpegStatic
    if (!executablePath) return Promise.reject(new Error('FFmpeg unavailable.'))

    return new Promise((resolve, reject) => {
      const args = [
        '-hide_banner',
        '-y',
        '-ss',
        String(startSeconds),
        '-i',
        inputPath,
        '-t',
        String(durationSeconds),
        '-c:v',
        reencode ? 'libx264' : 'copy',
        '-c:a',
        'aac',
        '-movflags',
        '+faststart',
        outputPath
      ]

      const child = spawn(executablePath, args, {
        windowsHide: true,
        stdio: ['ignore', 'ignore', 'pipe']
      }) as ChildProcess

      child.once('close', (code) => {
        if (code === 0 && fs.existsSync(outputPath)) {
          resolve()
        } else {
          // If copy failed due to keyframe, fallback with quick transcode
          if (!reencode) {
            this.extractClip(
              inputPath,
              startSeconds,
              durationSeconds,
              outputPath,
              true
            )
              .then(resolve)
              .catch(reject)
          } else {
            reject(
              new Error(`Failed to extract sample clip at ${startSeconds}s`)
            )
          }
        }
      })

      child.once('error', reject)
    })
  }

  private extractAndTranscodeClip(
    inputPath: string,
    startSeconds: number,
    durationSeconds: number,
    outputPath: string,
    encoder: string,
    plan: import('../../../types/optimizer').OptimizationPlan
  ): Promise<void> {
    const executablePath = ffmpegStatic
    if (!executablePath) return Promise.reject(new Error('FFmpeg unavailable.'))

    return new Promise((resolve, reject) => {
      const args = [
        '-hide_banner',
        '-y',
        '-ss',
        String(startSeconds),
        '-i',
        inputPath,
        '-t',
        String(durationSeconds),
        '-c:v',
        encoder === 'libx265' || encoder.includes('hevc') ? 'libx265' : encoder,
        '-preset',
        'ultrafast',
        '-crf',
        String(plan.targetCrf),
        '-c:a',
        'aac',
        '-movflags',
        '+faststart'
      ]

      if (
        plan.isResolutionReduced &&
        plan.targetWidth > 0 &&
        plan.targetHeight > 0
      ) {
        args.push('-vf', `scale=${plan.targetWidth}:${plan.targetHeight}`)
      }

      args.push(outputPath)

      const child = spawn(executablePath, args, {
        windowsHide: true,
        stdio: ['ignore', 'ignore', 'pipe']
      }) as ChildProcess

      child.once('close', (code) => {
        if (code === 0 && fs.existsSync(outputPath)) {
          resolve()
        } else {
          reject(
            new Error(`Failed to transcode sample clip at ${startSeconds}s`)
          )
        }
      })

      child.once('error', reject)
    })
  }
}

export const visualComparatorService = new VisualComparatorService()
