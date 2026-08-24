import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { DatabaseService } from '../../src/main/services/database.service'
import { discoveryEngineService } from '../../src/main/services/discovery/discovery-engine.service'
import { recommendationFeedbackService } from '../../src/main/services/discovery/feedback.service'

describe('Discovery Engine & Deterministic Scoring', () => {
  let dbService: DatabaseService
  let db: Database.Database
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbia-discovery-test-'))
    dbService = new DatabaseService()
    dbService.connect(tmpDir)
    db = (dbService as unknown as { db: Database.Database }).db
    discoveryEngineService.invalidateCache()
  })

  afterEach(() => {
    dbService.close()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('generates personalized rails and calculates similarity with tag overlap', () => {
    const now = Date.now()
    // Course 1: Rust Básico
    db.prepare(`
      INSERT INTO courses (id, title, slug, source_type, root_path, total_duration, module_count, lesson_count, is_favorite, created_at, updated_at)
      VALUES ('c_rust1', 'Rust Básico', 'rust-basico', 'local-vault', '/rust1', 3600, 1, 2, 1, ?, ?)
    `).run(now, now)
    db.prepare(`
      INSERT INTO library_appearances (id, entity_type, entity_id, root_course_id, display_order, is_reference, is_hidden, tags, custom_metadata, created_at, updated_at)
      VALUES ('app_rust1', 'course', 'c_rust1', 'c_rust1', 1, 0, 0, '["Rust", "Programação"]', '{}', ?, ?)
    `).run(now, now)
    db.prepare(`
      INSERT INTO modules (id, course_id, title, order_index, folder_path, duration, lesson_count, created_at)
      VALUES ('m_rust1', 'c_rust1', 'Módulo 1', 1, '/rust1/m1', 3600, 2, ?)
    `).run(now)
    db.prepare(`
      INSERT INTO lessons (id, module_id, course_id, title, order_index, file_path, file_name, file_extension, media_type, duration, file_size, availability, created_at)
      VALUES ('l_r1', 'm_rust1', 'c_rust1', 'Aula 1', 1, '/r1.mp4', 'r1.mp4', '.mp4', 'video', 1800, 1000, 'available', ?),
             ('l_r2', 'm_rust1', 'c_rust1', 'Aula 2', 2, '/r2.mp4', 'r2.mp4', '.mp4', 'video', 1800, 1000, 'available', ?)
    `).run(now, now)

    // Course 2: Rust Avançado (shares tag 'Rust')
    db.prepare(`
      INSERT INTO courses (id, title, slug, source_type, root_path, total_duration, module_count, lesson_count, is_favorite, created_at, updated_at)
      VALUES ('c_rust2', 'Rust Avançado', 'rust-avancado', 'local-vault', '/rust2', 3600, 1, 2, 0, ?, ?)
    `).run(now, now)
    db.prepare(`
      INSERT INTO library_appearances (id, entity_type, entity_id, root_course_id, display_order, is_reference, is_hidden, tags, custom_metadata, created_at, updated_at)
      VALUES ('app_rust2', 'course', 'c_rust2', 'c_rust2', 2, 0, 0, '["Rust", "Sistemas"]', '{}', ?, ?)
    `).run(now, now)
    db.prepare(`
      INSERT INTO modules (id, course_id, title, order_index, folder_path, duration, lesson_count, created_at)
      VALUES ('m_rust2', 'c_rust2', 'Módulo 1', 1, '/rust2/m1', 3600, 2, ?)
    `).run(now)
    db.prepare(`
      INSERT INTO lessons (id, module_id, course_id, title, order_index, file_path, file_name, file_extension, media_type, duration, file_size, availability, created_at)
      VALUES ('l_r21', 'm_rust2', 'c_rust2', 'Aula 1', 1, '/r21.mp4', 'r21.mp4', '.mp4', 'video', 1800, 1000, 'available', ?),
             ('l_r22', 'm_rust2', 'c_rust2', 'Aula 2', 2, '/r22.mp4', 'r22.mp4', '.mp4', 'video', 1800, 1000, 'available', ?)
    `).run(now, now)

    // Similar courses query
    const similar = discoveryEngineService.getSimilarCourses(db, 'c_rust1', 5)
    expect(similar.length).toBeGreaterThan(0)
    expect(similar[0].course.id).toBe('c_rust2')

    // Discovery rails query
    const rails = discoveryEngineService.getDiscoveryRails(db, 'default_profile')
    expect(rails.length).toBeGreaterThan(0)
    const forYou = rails.find((r) => r.railType === 'for_you')
    expect(forYou).toBeDefined()
  })

  it('respects feedback penalties like not_interested', () => {
    const now = Date.now()
    db.prepare(`
      INSERT INTO courses (id, title, slug, source_type, root_path, total_duration, module_count, lesson_count, is_favorite, created_at, updated_at)
      VALUES ('c_bad', 'Curso Irrelevante', 'curso-irrelevante', 'local-vault', '/bad', 1000, 1, 1, 0, ?, ?)
    `).run(now, now)
    db.prepare(`
      INSERT INTO library_appearances (id, entity_type, entity_id, root_course_id, display_order, is_reference, is_hidden, tags, custom_metadata, created_at, updated_at)
      VALUES ('app_bad', 'course', 'c_bad', 'c_bad', 1, 0, 0, '["Outros"]', '{}', ?, ?)
    `).run(now, now)

    recommendationFeedbackService.submitFeedback(db, 'default_profile', 'c_bad', 'not_interested')
    discoveryEngineService.invalidateCache()

    const rails = discoveryEngineService.getDiscoveryRails(db, 'default_profile')
    const forYou = rails.find((r) => r.railType === 'for_you')
    const hasBad = forYou?.items.some((it) => it.course.id === 'c_bad')
    expect(hasBad).toBeFalsy()
  })
})
