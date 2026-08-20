import { describe, it, expect } from 'vitest'
import { cleanTitle, cleanCourseTitle, cleanModuleTitle } from '../src/main/utils/title-cleaner'

describe('Title Cleaner Utility', () => {
  it('preserves sequence numbering, strips keyword prefixes only', () => {
    expect(cleanTitle('001 - Introducao ao Python.mp4')).toBe('001 - Introducao ao Python')
    expect(cleanTitle('01. Primeiros Passos.mkv')).toBe('01. Primeiros Passos')
    expect(cleanTitle('Aula 05 - Estruturas de Dados.ts')).toBe('05 - Estruturas de Dados')
    expect(cleanTitle('Lesson 12: Advanced Functions.mp4')).toBe('12 - Advanced Functions')
    expect(cleanTitle('Modulo 03 - Banco de Dados.mp4')).toBe('03 - Banco de Dados')
  })

  it('strips platform tags and metadata', () => {
    expect(cleanTitle('[Udemy] Python Masterclass 2024.mp4')).toBe('Python Masterclass')
    expect(cleanTitle('Alura - JavaScript Avancado [1080p].mp4')).toBe('JavaScript Avancado')
    expect(cleanTitle('[Rocketseat] React Native (720p).mp4')).toBe('React Native')
    expect(cleanTitle('[Hotmart] - Estruturas de Dados.mp4')).toBe('Estruturas de Dados')
    expect(cleanTitle('Frontend Masters - Advanced TypeScript (2024).mp4')).toBe('Advanced TypeScript')
  })

  it('strips quality and codec tags, keeping sequence numbers', () => {
    expect(cleanTitle('01 - Docker Fundamentals_1080p_x264.mp4')).toBe('01 - Docker Fundamentals')
    expect(cleanTitle('Aula 02 - Linux Server (HEVC AAC).mkv')).toBe('02 - Linux Server')
    expect(cleanTitle('03 - Kubernetes [FHD] (Complete).mp4')).toBe('03 - Kubernetes')
    expect(cleanTitle('04 - Microservices [4K] [10bit] [x265].mp4')).toBe('04 - Microservices')
  })

  it('strips telegram handles, keeps descriptive catalog content', () => {
    expect(cleanTitle('1. Aula - Catálogo Telegram @Listagemcursos.mp4')).toBe('1. Aula - Catálogo')
    expect(cleanTitle('3 - Como é a estrutura de uma tabela - Telegram @mestredoscursoss.mp4')).toBe(
      '3 - Como é a estrutura de uma tabela'
    )
    expect(cleanTitle('Aula 01 - Introdução @canal.mp4')).toBe('01 - Introdução')
  })

  it('preserves years inside dates, strips standalone years', () => {
    expect(cleanTitle('Aula 03. Live #001 - Q&A (07-07-2025).mp4')).toBe(
      '03. Live #001 - Q&A (07-07-2025)'
    )
    expect(cleanTitle('[Udemy] Python Masterclass 2024.mp4')).toBe('Python Masterclass')
  })

  it('inserts dash after bare leading lesson numbers', () => {
    expect(cleanTitle('2.9 Conectando com o Supabase.mp4')).toBe('2.9 - Conectando com o Supabase')
    expect(cleanTitle('01.5 - Setup Adicional.mp4')).toBe('01.5 - Setup Adicional')
  })

  it('replaces underscores and excessive whitespace, keeping numbers', () => {
    expect(cleanTitle('01_introducao_ao_desenvolvimento_web.mp4')).toBe('01 - introducao ao desenvolvimento web')
    expect(cleanTitle('02---configurando_o_ambiente.mp4')).toBe('02 - configurando o ambiente')
    expect(cleanTitle('03___variaveis___e___tipos.mp4')).toBe('03 - variaveis e tipos')
  })

  it('preserves numbers when file is only a number', () => {
    expect(cleanTitle('001.mp4')).toBe('001')
    expect(cleanTitle('02.mp4')).toBe('02')
    expect(cleanTitle('1.mp4')).toBe('1')
    expect(cleanTitle('01.5.mp4')).toBe('01.5')
  })

  it('handles decimals and suffixes in lesson numbering', () => {
    expect(cleanTitle('01.5 - Setup Adicional.mp4')).toBe('01.5 - Setup Adicional')
    expect(cleanTitle('Aula 10a - Refatoração.mp4')).toBe('10a - Refatoração')
    expect(cleanTitle('Lesson 02b: Alternative Method.mp4')).toBe('02b - Alternative Method')
  })

  it('handles emojis and special characters cleanly', () => {
    expect(cleanTitle('🚀 01 - Getting Started.mp4')).toBe('🚀 01 - Getting Started')
    expect(cleanTitle('01 - Python 🐍 & Rust 🦀 [1080p].mp4')).toBe('01 - Python 🐍 & Rust 🦀')
    expect(cleanTitle('02 - C++ / C# Integration.mp4')).toBe('02 - C++ / C# Integration')
  })

  it('cleans course titles specifically', () => {
    expect(cleanCourseTitle('01. Complete Web Development Bootcamp [2024]')).toBe('Complete Web Development Bootcamp')
    expect(cleanCourseTitle('[Udemy] Master React & TypeScript (1080p)')).toBe('Master React & TypeScript')
    expect(cleanCourseTitle('01 - Next.js Full Course')).toBe('Next.js Full Course')
    expect(cleanCourseTitle('')).toBe('Untitled Course')
  })

  it('cleans module titles specifically, keeping sequence numbers', () => {
    expect(cleanModuleTitle('Modulo 01 - Fundamentos', 1)).toBe('01 - Fundamentos')
    expect(cleanModuleTitle('01', 1)).toBe('01')
    expect(cleanModuleTitle('01.5', 2)).toBe('01.5')
    expect(cleanModuleTitle('', 2)).toBe('Module 02')
    expect(cleanModuleTitle('Advanced State Management', 3)).toBe('Advanced State Management')
  })
})
