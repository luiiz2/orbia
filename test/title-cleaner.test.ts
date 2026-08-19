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
    expect(cleanTitle('[Hotmart] - Estruturas de Dados.mp4')).toBe('Estruturas de Dados')
    expect(cleanTitle('Frontend Masters - Advanced TypeScript (2024).mp4')).toBe('Advanced TypeScript')
  })

  it('strips quality and codec tags', () => {
    expect(cleanTitle('01 - Docker Fundamentals_1080p_x264.mp4')).toBe('Docker Fundamentals')
    expect(cleanTitle('Aula 02 - Linux Server (HEVC AAC).mkv')).toBe('Linux Server')
    expect(cleanTitle('03 - Kubernetes [FHD] (Complete).mp4')).toBe('Kubernetes')
    expect(cleanTitle('04 - Microservices [4K] [10bit] [x265].mp4')).toBe('Microservices')
  })

  it('replaces underscores and excessive whitespace', () => {
    expect(cleanTitle('01_introducao_ao_desenvolvimento_web.mp4')).toBe('introducao ao desenvolvimento web')
    expect(cleanTitle('02---configurando_o_ambiente.mp4')).toBe('configurando o ambiente')
    expect(cleanTitle('03___variaveis___e___tipos.mp4')).toBe('variaveis e tipos')
  })

  it('preserves numbers when file is only a number', () => {
    expect(cleanTitle('001.mp4')).toBe('001')
    expect(cleanTitle('02.mp4')).toBe('02')
    expect(cleanTitle('1.mp4')).toBe('1')
    expect(cleanTitle('01.5.mp4')).toBe('01.5')
  })

  it('handles decimals and suffixes in lesson numbering', () => {
    expect(cleanTitle('01.5 - Setup Adicional.mp4')).toBe('Setup Adicional')
    expect(cleanTitle('Aula 10a - Refatoração.mp4')).toBe('Refatoração')
    expect(cleanTitle('Lesson 02b: Alternative Method.mp4')).toBe('Alternative Method')
  })

  it('handles emojis and special characters cleanly', () => {
    expect(cleanTitle('🚀 01 - Getting Started.mp4')).toBe('🚀 Getting Started')
    expect(cleanTitle('01 - Python 🐍 & Rust 🦀 [1080p].mp4')).toBe('Python 🐍 & Rust 🦀')
    expect(cleanTitle('02 - C++ / C# Integration.mp4')).toBe('C++ / C# Integration')
  })

  it('cleans course titles specifically', () => {
    expect(cleanCourseTitle('01. Complete Web Development Bootcamp [2024]')).toBe('Complete Web Development Bootcamp')
    expect(cleanCourseTitle('[Udemy] Master React & TypeScript (1080p)')).toBe('Master React & TypeScript')
    expect(cleanCourseTitle('01 - Next.js Full Course')).toBe('Next.js Full Course')
    expect(cleanCourseTitle('')).toBe('Untitled Course')
  })

  it('cleans module titles specifically', () => {
    expect(cleanModuleTitle('Modulo 01 - Fundamentos', 1)).toBe('Fundamentos')
    expect(cleanModuleTitle('01', 1)).toBe('Module 01')
    expect(cleanModuleTitle('01.5', 2)).toBe('Module 02')
    expect(cleanModuleTitle('', 2)).toBe('Module 02')
    expect(cleanModuleTitle('Advanced State Management', 3)).toBe('Advanced State Management')
  })
})
