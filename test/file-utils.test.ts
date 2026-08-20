import { describe, it, expect } from 'vitest'
import {
  getMediaType,
  isMediaFile,
  isImportableFile,
  isPreservableContentFile,
  isSubtitleFile,
  isVideoFile,
  isAudioFile,
  isCoverImage,
  isIgnoredPath,
  formatDuration,
  formatBytes
} from '../src/main/utils/file-utils'

describe('File Utils', () => {
  it('correctly categorizes media types', () => {
    expect(getMediaType('video.mp4')).toBe('video')
    expect(getMediaType('movie.mkv')).toBe('video')
    expect(getMediaType('track.mp3')).toBe('audio')
    expect(getMediaType('audio.wav')).toBe('audio')
    expect(getMediaType('slide.pdf')).toBe('pdf')
    expect(getMediaType('notes.md')).toBe('document')
    expect(getMediaType('readme.txt')).toBe('document')
    expect(getMediaType('UPPERCASE.MP4')).toBe('video')
    expect(getMediaType('photo.jpg')).toBe('image')
    expect(getMediaType('diagram.webp')).toBe('image')
    expect(getMediaType('shortcut.url')).toBe('link')
    expect(getMediaType('page.html')).toBe('link')
    expect(getMediaType('app.lnk')).toBe('link')
    expect(getMediaType('bundle.zip')).toBe('archive')
    expect(getMediaType('weird.xyz')).toBe('other')
  })

  it('detects playable media files', () => {
    expect(isMediaFile('video.mp4')).toBe(true)
    expect(isMediaFile('video.webm')).toBe(true)
    expect(isMediaFile('podcast.mp3')).toBe(true)
    expect(isMediaFile('document.pdf')).toBe(false)
    expect(isMediaFile('archive.zip')).toBe(false)
  })

  it('keeps every meaningful file as importable', () => {
    expect(isImportableFile('video.mp4')).toBe(true)
    expect(isImportableFile('podcast.mp3')).toBe(true)
    expect(isImportableFile('apostila.pdf')).toBe(true)
    expect(isImportableFile('readme.txt')).toBe(true)
    expect(isImportableFile('diagram.png')).toBe(true)
    expect(isImportableFile('link.url')).toBe(true)
    expect(isImportableFile('extra.zip')).toBe(true)
    expect(isImportableFile('movie.srt')).toBe(false)
    expect(isImportableFile('weird.xyz')).toBe(false)
  })

  it('preserves every scanned content file without broadening the safe-open allowlist', () => {
    expect(isPreservableContentFile('movie.srt')).toBe(true)
    expect(isPreservableContentFile('slides.pptx')).toBe(true)
    expect(isPreservableContentFile('weird.xyz')).toBe(true)
    expect(isPreservableContentFile('LICENSE')).toBe(true)
    expect(isPreservableContentFile('.DS_Store')).toBe(false)
    expect(isPreservableContentFile('Thumbs.db')).toBe(false)

    expect(isImportableFile('weird.xyz')).toBe(false)
  })

  it('detects subtitle companions', () => {
    expect(isSubtitleFile('aula.srt')).toBe(true)
    expect(isSubtitleFile('aula.vtt')).toBe(true)
    expect(isSubtitleFile('aula.ass')).toBe(true)
    expect(isSubtitleFile('aula.mp4')).toBe(false)
  })

  it('detects video and audio specifically', () => {
    expect(isVideoFile('aula.mp4')).toBe(true)
    expect(isVideoFile('aula.mp3')).toBe(false)
    expect(isAudioFile('aula.mp3')).toBe(true)
    expect(isAudioFile('aula.mp4')).toBe(false)
  })

  it('detects cover images correctly', () => {
    expect(isCoverImage('cover.jpg')).toBe(true)
    expect(isCoverImage('Cover.PNG')).toBe(true)
    expect(isCoverImage('thumb.webp')).toBe(true)
    expect(isCoverImage('poster.jpeg')).toBe(true)
    expect(isCoverImage('capa.jpg')).toBe(true)
    expect(isCoverImage('diagram.png')).toBe(false)
    expect(isCoverImage('cover.pdf')).toBe(false)
  })

  it('filters ignored files and directories', () => {
    expect(isIgnoredPath('.git')).toBe(true)
    expect(isIgnoredPath('node_modules')).toBe(true)
    expect(isIgnoredPath('.DS_Store')).toBe(true)
    expect(isIgnoredPath('Thumbs.db')).toBe(true)
    expect(isIgnoredPath('.orbia')).toBe(true)
    expect(isIgnoredPath('._video.mp4')).toBe(true)
    expect(isIgnoredPath('01 - Lesson.mp4')).toBe(false)
  })

  it('formats duration properly with standard and edge values', () => {
    expect(formatDuration(0)).toBe('00:00')
    expect(formatDuration(45)).toBe('00:45')
    expect(formatDuration(125)).toBe('02:05')
    expect(formatDuration(3665)).toBe('1:01:05')
    expect(formatDuration(-10)).toBe('00:00')
    expect(formatDuration(NaN)).toBe('00:00')
    expect(formatDuration(Infinity)).toBe('00:00')
  })

  it('formats bytes properly with standard and edge values', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(1024)).toBe('1 KB')
    expect(formatBytes(1024 * 1024 * 50)).toBe('50 MB')
    expect(formatBytes(1024 * 1024 * 1024 * 1.5)).toBe('1.5 GB')
    expect(formatBytes(-100)).toBe('0 B')
    expect(formatBytes(NaN)).toBe('0 B')
    expect(formatBytes(Infinity)).toBe('0 B')
    expect(formatBytes(Math.pow(1024, 4))).toBe('1 TB')
  })
})
