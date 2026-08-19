import { describe, it, expect } from 'vitest'
import { cleanTitle, cleanCourseTitle, cleanModuleTitle } from '../src/main/utils/title-cleaner'

describe('Title Cleaner Utility', () => {
  it('strips numbering prefixes and extensions', () => {
    expect(cleanTitle('001 - Introducao ao Python.mp4')).toBe('Introducao ao Python')
    expect(cleanTitle('01. Primeiros Passos.mkv')).toBe('Primeiros Passos')
    expect(cleanTitle('Aula 05 - Estruturas de Dados.ts')).toBe('Estruturas de Dados')
    expect(cleanTitle('Lesson 12: Advanced Functions.mp4')).toBe('Advanced Functions')
  })

  it('strips platform tags and metadata', () => {
    expect(cleanTitle('[Udemy] Python Masterclass 2024.mp4')).toBe('Python Masterclass')
    expect(cleanTitle('Alura - JavaScript Avancado [1080p].mp4')).toBe('JavaScript Avancado')
    expect(cleanTitle('[Rocketseat] React Native (720p).mp4')).toBe('React Native')
  })

  it('strips quality and codec tags', () => {
    expect(cleanTitle('01 - Docker Fundamentals_1080p_x264.mp4')).toBe('Docker Fundamentals')
    expect(cleanTitle('Aula 02 - Linux Server (HEVC AAC).mkv')).toBe('Linux Server')
    expect(cleanTitle('03 - Kubernetes [FHD] (Complete).mp4')).toBe('Kubernetes')
  })

  it('replaces underscores and excessive whitespace', () => {
    expect(cleanTitle('01_introducao_ao_desenvolvimento_web.mp4')).toBe('introducao ao desenvolvimento web')
    expect(cleanTitle('02---configurando_o_ambiente.mp4')).toBe('configurando o ambiente')
  })

  it('preserves numbers when file is only a number', () => {
    expect(cleanTitle('001.mp4')).toBe('001')
    expect(cleanTitle('02.mp4')).toBe('02')
    expect(cleanTitle('1.mp4')).toBe('1')
  })

  it('cleans course titles specifically', () => {
    expect(cleanCourseTitle('01. Complete Web Development Bootcamp [2024]')).toBe('Complete Web Development Bootcamp')
    expect(cleanCourseTitle('[Udemy] Master React & TypeScript (1080p)')).toBe('Master React & TypeScript')
  })

  it('cleans module titles specifically', () => {
    expect(cleanModuleTitle('Modulo 01 - Fundamentos', 1)).toBe('Fundamentos')
    expect(cleanModuleTitle('01', 1)).toBe('Module 01')
    expect(cleanModuleTitle('', 2)).toBe('Module 02')
  })
})
