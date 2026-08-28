import type Database from 'better-sqlite3'
import type { Course, ContentSourceType } from '../../../types/course'
import type {
  DiscoveryRail,
  DiscoveryItem,
  SurpriseRecommendation,
  CategoryDiscoveryData,
  ProfileDiscoveryPreferences
} from '../../../types/discovery'
import { DEFAULT_DISCOVERY_WEIGHTS } from './weights.config'
import { ReasonGenerator } from './reason-generator'
import { recommendationFeedbackService } from './feedback.service'
import { courseRelationshipsService } from './relationships.service'

interface CourseEntityMeta {
  course: Course
  tags: string[]
  progressPercent: number
  isCompleted: boolean
  lastPlayedAt: number
  remainingDurationMinutes: number
  nextLessonTitle?: string
  nextLessonId?: string
}

export class DiscoveryEngineService {
  private cache = new Map<
    string,
    { timestamp: number; rails: DiscoveryRail[] }
  >()
  private cacheTtlMs = 60 * 1000 // 1 minute in-memory cache

  public invalidateCache(): void {
    this.cache.clear()
  }

  public getDiscoveryRails(
    db: Database.Database,
    profileId: string = 'default_profile',
    preferences?: ProfileDiscoveryPreferences
  ): DiscoveryRail[] {
    const cacheKey = `${profileId}_${preferences?.discoveryMode || 'balanced'}`
    const cached = this.cache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < this.cacheTtlMs) {
      return cached.rails
    }

    const allCoursesMeta = this.fetchCoursesMetadata(db)
    if (allCoursesMeta.length === 0) {
      return []
    }

    const feedbackMap = recommendationFeedbackService.getFeedbackForProfile(
      db,
      profileId
    )
    const recentExposures = recommendationFeedbackService.getRecentExposures(
      db,
      profileId,
      Date.now() - 24 * 3600 * 1000
    )

    const rails: DiscoveryRail[] = []
    const usedCourseIds = new Set<string>()

    // 1. Continue Your Journey (Explicit Relationships)
    const journeyRail = this.buildJourneyRail(db, allCoursesMeta, usedCourseIds)
    if (journeyRail && journeyRail.items.length > 0) {
      rails.push(journeyRail)
      for (const item of journeyRail.items) usedCourseIds.add(item.course.id)
    }

    // 2. Because You Watched...
    const becauseWatchedRail = this.buildBecauseWatchedRail(
      db,
      allCoursesMeta,
      usedCourseIds,
      feedbackMap
    )
    if (becauseWatchedRail && becauseWatchedRail.items.length > 0) {
      rails.push(becauseWatchedRail)
      for (const item of becauseWatchedRail.items)
        usedCourseIds.add(item.course.id)
    }

    // 3. For You (Personalized scored rail)
    const forYouRail = this.buildForYouRail(
      allCoursesMeta,
      usedCourseIds,
      preferences,
      feedbackMap,
      recentExposures
    )
    if (forYouRail && forYouRail.items.length > 0) {
      rails.push(forYouRail)
      for (const item of forYouRail.items) usedCourseIds.add(item.course.id)
    }

    // 4. Almost Finished (Progress >= 70% and not completed)
    const almostFinishedRail = this.buildAlmostFinishedRail(
      allCoursesMeta,
      usedCourseIds
    )
    if (almostFinishedRail && almostFinishedRail.items.length > 0) {
      rails.push(almostFinishedRail)
      for (const item of almostFinishedRail.items)
        usedCourseIds.add(item.course.id)
    }

    // 5. Quick Wins (Remaining <= 3 hours)
    const quickWinsRail = this.buildQuickWinsRail(allCoursesMeta, usedCourseIds)
    if (quickWinsRail && quickWinsRail.items.length > 0) {
      rails.push(quickWinsRail)
      for (const item of quickWinsRail.items) usedCourseIds.add(item.course.id)
    }

    // 6. Rediscover (Added > 45 days ago or started long ago)
    const rediscoverRail = this.buildRediscoverRail(
      allCoursesMeta,
      usedCourseIds
    )
    if (rediscoverRail && rediscoverRail.items.length > 0) {
      rails.push(rediscoverRail)
      for (const item of rediscoverRail.items) usedCourseIds.add(item.course.id)
    }

    // 7. Recently Added
    const recentRail = this.buildRecentlyAddedRail(
      allCoursesMeta,
      usedCourseIds
    )
    if (recentRail && recentRail.items.length > 0) {
      rails.push(recentRail)
    }

    // Record exposures for top items across rails
    const exposedIds: string[] = []
    for (const r of rails) {
      for (const it of r.items.slice(0, 4)) {
        exposedIds.push(it.course.id)
      }
    }
    recommendationFeedbackService.recordExposures(db, profileId, exposedIds)

    this.cache.set(cacheKey, { timestamp: Date.now(), rails })
    return rails
  }

  public getSimilarCourses(
    db: Database.Database,
    targetCourseId: string,
    limit: number = 6
  ): DiscoveryItem[] {
    const allCoursesMeta = this.fetchCoursesMetadata(db)
    const targetMeta = allCoursesMeta.find(
      (c) => c.course.id === targetCourseId
    )
    if (!targetMeta) return []

    const candidates = allCoursesMeta.filter(
      (c) => c.course.id !== targetCourseId
    )
    const scored: DiscoveryItem[] = []

    for (const cand of candidates) {
      let score = 0
      const reasons: DiscoveryItem['reasons'] = []

      // Shared tags
      const sharedTags = cand.tags.filter((t) => targetMeta.tags.includes(t))
      if (sharedTags.length > 0) {
        const overlapRatio =
          sharedTags.length / Math.max(1, targetMeta.tags.length)
        score += Math.round(
          overlapRatio * DEFAULT_DISCOVERY_WEIGHTS.tagOverlapMax
        )
        reasons.push(ReasonGenerator.sharedTags(sharedTags))
      }

      // Title keyword overlap
      const targetWords = new Set(
        targetMeta.course.title
          .toLowerCase()
          .split(/\s+/)
          .filter((w) => w.length > 3)
      )
      const candWords = cand.course.title
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 3)
      const matchingWords = candWords.filter((w) => targetWords.has(w))
      if (matchingWords.length > 0) {
        score += matchingWords.length * 8
      }

      if (cand.course.isFavorite) {
        score += DEFAULT_DISCOVERY_WEIGHTS.favoriteSignal
      }

      if (score > 5) {
        scored.push({
          course: cand.course,
          score,
          reasons:
            reasons.length > 0
              ? reasons
              : [ReasonGenerator.becauseWatched(targetMeta.course.title)],
          progressPercent: cand.progressPercent,
          remainingDurationMinutes: cand.remainingDurationMinutes,
          nextLessonTitle: cand.nextLessonTitle,
          nextLessonId: cand.nextLessonId
        })
      }
    }

    scored.sort((a, b) => b.score - a.score)
    return scored.slice(0, limit)
  }

  public getSurpriseMe(
    db: Database.Database,
    profileId: string = 'default_profile',
    mode: 'continue' | 'start_new' | 'quick_lesson' | 'random' = 'continue'
  ): SurpriseRecommendation | null {
    const rawCoursesMeta = this.fetchCoursesMetadata(db)
    if (rawCoursesMeta.length === 0) return null

    const feedbackMap = recommendationFeedbackService.getFeedbackForProfile(
      db,
      profileId
    )
    const allCoursesMeta = rawCoursesMeta.filter((c) => {
      const fb = feedbackMap.get(c.course.id)
      return fb !== 'dislike' && fb !== 'not_interested'
    })
    if (allCoursesMeta.length === 0) return null

    let pool: CourseEntityMeta[] = []
    let headline = 'Que tal continuar seus estudos?'

    if (mode === 'continue') {
      pool = allCoursesMeta.filter(
        (c) => c.progressPercent > 0 && !c.isCompleted
      )
      headline = 'Continue de onde você parou!'
    } else if (mode === 'start_new') {
      pool = allCoursesMeta.filter((c) => c.progressPercent === 0)
      headline = 'Comece algo totalmente novo hoje!'
    } else if (mode === 'quick_lesson') {
      pool = allCoursesMeta.filter(
        (c) => c.remainingDurationMinutes <= 45 && !c.isCompleted
      )
      headline = 'Uma aula rápida para o seu momento!'
    }

    if (pool.length === 0) {
      pool = allCoursesMeta.filter((c) => !c.isCompleted)
      if (pool.length === 0) pool = allCoursesMeta
      headline = 'Destaque especial da sua biblioteca!'
    }

    // Weighted random selection: give higher weight to favorites and recent items
    const weights = pool.map((c) => {
      let w = 10
      if (c.course.isFavorite) w += 15
      if (c.progressPercent > 0 && c.progressPercent < 90) w += 20
      return w
    })

    const totalWeight = weights.reduce((a, b) => a + b, 0)
    let randomNum = Math.random() * totalWeight

    let selectedIndex = 0
    for (let i = 0; i < pool.length; i++) {
      randomNum -= weights[i]
      if (randomNum <= 0) {
        selectedIndex = i
        break
      }
    }

    const chosen = pool[selectedIndex]
    return {
      mode,
      headline,
      item: {
        course: chosen.course,
        score: 100,
        reasons:
          chosen.progressPercent > 0
            ? [ReasonGenerator.almostFinished(chosen.progressPercent)]
            : [ReasonGenerator.freshAddition()],
        progressPercent: chosen.progressPercent,
        remainingDurationMinutes: chosen.remainingDurationMinutes,
        nextLessonTitle: chosen.nextLessonTitle,
        nextLessonId: chosen.nextLessonId
      }
    }
  }

  public getCategoryDiscovery(db: Database.Database): CategoryDiscoveryData[] {
    const allCoursesMeta = this.fetchCoursesMetadata(db)
    const categoryMap = new Map<string, Course[]>()

    for (const meta of allCoursesMeta) {
      const tags = meta.tags.length > 0 ? meta.tags : ['Geral']
      for (const t of tags) {
        const catName = t.trim()
        if (!categoryMap.has(catName)) {
          categoryMap.set(catName, [])
        }
        categoryMap.get(catName)!.push(meta.course)
      }
    }

    const result: CategoryDiscoveryData[] = []
    for (const [category, courses] of categoryMap.entries()) {
      if (courses.length > 0) {
        const totalDuration = courses.reduce(
          (acc, c) => acc + c.totalDuration,
          0
        )
        result.push({
          category,
          courseCount: courses.length,
          totalDurationHours: Math.round((totalDuration / 3600) * 10) / 10,
          courses
        })
      }
    }

    result.sort((a, b) => b.courseCount - a.courseCount)
    return result
  }

  private fetchCoursesMetadata(db: Database.Database): CourseEntityMeta[] {
    const courses = db
      .prepare(
        `
      SELECT * FROM courses WHERE is_hidden = 0 ORDER BY created_at DESC
    `
      )
      .all() as Array<{
      id: string
      title: string
      slug: string
      source_type: string
      root_path: string
      is_external: number
      cover_path: string | null
      description: string | null
      total_duration: number
      module_count: number
      lesson_count: number
      is_favorite: number
      created_at: number
      updated_at: number
    }>

    const appearances = db
      .prepare(
        `
      SELECT entity_id, tags FROM library_appearances WHERE entity_type = 'course' AND is_hidden = 0
    `
      )
      .all() as Array<{ entity_id: string; tags: string }>

    const tagsMap = new Map<string, string[]>()
    for (const app of appearances) {
      try {
        tagsMap.set(app.entity_id, JSON.parse(app.tags))
      } catch {
        tagsMap.set(app.entity_id, [])
      }
    }

    // Get progress summaries
    const progressRows = db
      .prepare(
        `
      SELECT
        c.id as course_id,
        COUNT(l.id) as total_lessons,
        COUNT(CASE WHEN lp.completed = 1 THEN 1 END) as completed_lessons,
        SUM(COALESCE(lp.current_time, 0)) as watched_seconds,
        SUM(l.duration) as total_seconds,
        MAX(lp.updated_at) as last_played
      FROM courses c
      JOIN lessons l ON l.course_id = c.id AND l.is_hidden = 0
      LEFT JOIN lesson_progress lp ON lp.lesson_id = l.id
      WHERE c.is_hidden = 0
      GROUP BY c.id
    `
      )
      .all() as Array<{
      course_id: string
      total_lessons: number
      completed_lessons: number
      watched_seconds: number
      total_seconds: number
      last_played: number | null
    }>

    const progressMap = new Map<
      string,
      {
        percent: number
        isCompleted: boolean
        lastPlayed: number
        remainingMinutes: number
      }
    >()
    for (const pr of progressRows) {
      const percent =
        pr.total_lessons > 0
          ? (pr.completed_lessons / pr.total_lessons) * 100
          : 0
      const isCompleted =
        pr.total_lessons > 0 && pr.completed_lessons === pr.total_lessons
      const remainingSeconds = Math.max(
        0,
        (pr.total_seconds || 0) - (pr.watched_seconds || 0)
      )
      progressMap.set(pr.course_id, {
        percent: Math.round(percent),
        isCompleted,
        lastPlayed: pr.last_played || 0,
        remainingMinutes: Math.round(remainingSeconds / 60)
      })
    }

    return courses.map((c) => {
      const prog = progressMap.get(c.id) || {
        percent: 0,
        isCompleted: false,
        lastPlayed: 0,
        remainingMinutes: Math.round(c.total_duration / 60)
      }
      const courseObj: Course = {
        id: c.id,
        title: c.title,
        slug: c.slug,
        sourceType: (c.source_type as ContentSourceType) || 'local-vault',
        rootPath: c.root_path,
        coverPath: c.cover_path || undefined,
        description: c.description || undefined,
        totalDuration: c.total_duration,
        moduleCount: c.module_count,
        lessonCount: c.lesson_count,
        isFavorite: c.is_favorite === 1,
        createdAt: c.created_at,
        updatedAt: c.updated_at
      }

      return {
        course: courseObj,
        tags: tagsMap.get(c.id) || [],
        progressPercent: prog.percent,
        isCompleted: prog.isCompleted,
        lastPlayedAt: prog.lastPlayed,
        remainingDurationMinutes: prog.remainingMinutes
      }
    })
  }

  private buildJourneyRail(
    db: Database.Database,
    allMeta: CourseEntityMeta[],
    usedIds: Set<string>
  ): DiscoveryRail | null {
    const relationships = courseRelationshipsService.listRelationships(db)
    if (relationships.length === 0) return null

    const metaMap = new Map(allMeta.map((m) => [m.course.id, m]))
    const items: DiscoveryItem[] = []

    for (const rel of relationships) {
      if (usedIds.has(rel.targetCourseId)) continue
      const sourceMeta = metaMap.get(rel.sourceCourseId)
      const targetMeta = metaMap.get(rel.targetCourseId)

      if (
        sourceMeta &&
        targetMeta &&
        (sourceMeta.isCompleted || sourceMeta.progressPercent >= 50)
      ) {
        if (!targetMeta.isCompleted) {
          items.push({
            course: targetMeta.course,
            score: 95,
            reasons: [ReasonGenerator.journeyNext(sourceMeta.course.title)],
            progressPercent: targetMeta.progressPercent,
            remainingDurationMinutes: targetMeta.remainingDurationMinutes,
            nextLessonTitle: targetMeta.nextLessonTitle,
            nextLessonId: targetMeta.nextLessonId
          })
        }
      }
    }

    if (items.length === 0) return null
    return {
      id: 'rail_continue_journey',
      title: 'Continue Sua Jornada',
      subtitle: 'Próximas etapas recomendadas a partir do seu progresso',
      railType: 'continue_journey',
      badge: 'Jornada',
      items: items.slice(0, 6)
    }
  }

  private buildBecauseWatchedRail(
    db: Database.Database,
    allMeta: CourseEntityMeta[],
    usedIds: Set<string>,
    feedbackMap: Map<string, string>
  ): DiscoveryRail | null {
    // Find the most recently watched course
    const recentMeta = allMeta
      .filter((m) => m.lastPlayedAt > 0)
      .sort((a, b) => b.lastPlayedAt - a.lastPlayedAt)[0]

    if (!recentMeta) return null

    const similar = this.getSimilarCourses(db, recentMeta.course.id, 8).filter(
      (it) =>
        !usedIds.has(it.course.id) &&
        feedbackMap.get(it.course.id) !== 'not_interested'
    )

    if (similar.length === 0) return null

    return {
      id: 'rail_because_watched',
      title: `Porque Você Assistiu ${recentMeta.course.title}`,
      subtitle: 'Tópicos e conteúdos com alta afinidade pedagógica',
      railType: 'because_watched',
      badge: 'Afinidade',
      items: similar.slice(0, 6)
    }
  }

  private buildForYouRail(
    allMeta: CourseEntityMeta[],
    usedIds: Set<string>,
    preferences?: ProfileDiscoveryPreferences,
    feedbackMap?: Map<string, string>,
    recentExposures?: Set<string>
  ): DiscoveryRail | null {
    const scored: DiscoveryItem[] = []

    for (const meta of allMeta) {
      if (usedIds.has(meta.course.id)) continue
      const feedback = feedbackMap?.get(meta.course.id)
      if (feedback === 'not_interested') continue

      let score = 50
      const reasons: DiscoveryItem['reasons'] = []

      // In progress boost
      if (meta.progressPercent > 0 && !meta.isCompleted) {
        score += DEFAULT_DISCOVERY_WEIGHTS.inProgressBoost
        if (meta.progressPercent >= 70) {
          score += DEFAULT_DISCOVERY_WEIGHTS.almostFinishedBoost
          reasons.push(ReasonGenerator.almostFinished(meta.progressPercent))
        }
      }

      // Favorite boost
      if (meta.course.isFavorite) {
        score += DEFAULT_DISCOVERY_WEIGHTS.favoriteSignal
        reasons.push(ReasonGenerator.favoriteInterest())
      }

      // Feedback adjustments
      if (feedback === 'like' || feedback === 'show_more') {
        score += DEFAULT_DISCOVERY_WEIGHTS.feedbackLikeBoost
      } else if (feedback === 'dislike' || feedback === 'show_less') {
        score += DEFAULT_DISCOVERY_WEIGHTS.feedbackDislikePenalty
      }

      // Recent exposure penalty (for diversity)
      if (recentExposures?.has(meta.course.id)) {
        score += DEFAULT_DISCOVERY_WEIGHTS.recentExposurePenalty
      }

      // Completed penalty
      if (meta.isCompleted) {
        score += DEFAULT_DISCOVERY_WEIGHTS.completedPenalty
      }

      // Category / Tag preferences from Profile
      if (preferences) {
        const hasExcluded = meta.tags.some((t) =>
          preferences.excludedCategories.includes(t)
        )
        if (hasExcluded) continue

        const hasPreferred = meta.tags.some((t) =>
          preferences.preferredCategories.includes(t)
        )
        if (hasPreferred) {
          score += DEFAULT_DISCOVERY_WEIGHTS.categoryMatch
          reasons.push(ReasonGenerator.sharedCategory(meta.tags[0]))
        }
      }

      if (reasons.length === 0) {
        if (meta.tags.length > 0)
          reasons.push(ReasonGenerator.sharedCategory(meta.tags[0]))
        else reasons.push(ReasonGenerator.freshAddition())
      }

      scored.push({
        course: meta.course,
        score,
        reasons,
        progressPercent: meta.progressPercent,
        remainingDurationMinutes: meta.remainingDurationMinutes,
        nextLessonTitle: meta.nextLessonTitle,
        nextLessonId: meta.nextLessonId
      })
    }

    scored.sort((a, b) => b.score - a.score)
    const items = scored.slice(0, 8)
    if (items.length === 0) return null

    return {
      id: 'rail_for_you',
      title: 'Para Você',
      subtitle: 'Seleção personalizada baseada no seu ritmo e interesses',
      railType: 'for_you',
      badge: 'Recomendado',
      items
    }
  }

  private buildAlmostFinishedRail(
    allMeta: CourseEntityMeta[],
    usedIds: Set<string>
  ): DiscoveryRail | null {
    const candidates = allMeta
      .filter(
        (m) =>
          !usedIds.has(m.course.id) && m.progressPercent >= 70 && !m.isCompleted
      )
      .sort((a, b) => b.progressPercent - a.progressPercent)

    if (candidates.length === 0) return null

    const items: DiscoveryItem[] = candidates.map((m) => ({
      course: m.course,
      score: 85,
      reasons: [ReasonGenerator.almostFinished(m.progressPercent)],
      progressPercent: m.progressPercent,
      remainingDurationMinutes: m.remainingDurationMinutes,
      nextLessonTitle: m.nextLessonTitle,
      nextLessonId: m.nextLessonId
    }))

    return {
      id: 'rail_almost_finished',
      title: 'Quase Lá',
      subtitle: 'Cursos pertinho da linha de chegada para você concluir',
      railType: 'almost_finished',
      badge: 'Foco',
      items: items.slice(0, 6)
    }
  }

  private buildQuickWinsRail(
    allMeta: CourseEntityMeta[],
    usedIds: Set<string>
  ): DiscoveryRail | null {
    const candidates = allMeta
      .filter(
        (m) =>
          !usedIds.has(m.course.id) &&
          m.remainingDurationMinutes <= 180 &&
          !m.isCompleted &&
          m.remainingDurationMinutes > 0
      )
      .sort((a, b) => a.remainingDurationMinutes - b.remainingDurationMinutes)

    if (candidates.length === 0) return null

    const items: DiscoveryItem[] = candidates.map((m) => ({
      course: m.course,
      score: 80,
      reasons: [ReasonGenerator.quickWin(m.remainingDurationMinutes)],
      progressPercent: m.progressPercent,
      remainingDurationMinutes: m.remainingDurationMinutes,
      nextLessonTitle: m.nextLessonTitle,
      nextLessonId: m.nextLessonId
    }))

    return {
      id: 'rail_quick_wins',
      title: 'Vitórias Rápidas',
      subtitle: 'Menos de 3 horas restantes para concluir',
      railType: 'quick_wins',
      badge: 'Rápido',
      items: items.slice(0, 6)
    }
  }

  private buildRediscoverRail(
    allMeta: CourseEntityMeta[],
    usedIds: Set<string>
  ): DiscoveryRail | null {
    const now = Date.now()
    const fortyFiveDaysMs = 45 * 24 * 3600 * 1000

    const candidates = allMeta
      .filter(
        (m) =>
          !usedIds.has(m.course.id) &&
          now - m.course.createdAt >= fortyFiveDaysMs &&
          (m.lastPlayedAt === 0 || now - m.lastPlayedAt >= fortyFiveDaysMs)
      )
      .sort((a, b) => a.course.createdAt - b.course.createdAt)

    if (candidates.length === 0) return null

    const items: DiscoveryItem[] = candidates.map((m) => {
      const days = Math.round((now - m.course.createdAt) / (24 * 3600 * 1000))
      return {
        course: m.course,
        score: 65,
        reasons: [ReasonGenerator.rediscover(days)],
        progressPercent: m.progressPercent,
        remainingDurationMinutes: m.remainingDurationMinutes,
        nextLessonTitle: m.nextLessonTitle,
        nextLessonId: m.nextLessonId
      }
    })

    return {
      id: 'rail_rediscover',
      title: 'Redescobrir na Biblioteca',
      subtitle: 'Materiais valiosos que esperam pelo seu retorno',
      railType: 'rediscover',
      badge: 'Acervo',
      items: items.slice(0, 6)
    }
  }

  private buildRecentlyAddedRail(
    allMeta: CourseEntityMeta[],
    usedIds: Set<string>
  ): DiscoveryRail | null {
    const candidates = allMeta
      .filter((m) => !usedIds.has(m.course.id))
      .sort((a, b) => b.course.createdAt - a.course.createdAt)

    if (candidates.length === 0) return null

    const items: DiscoveryItem[] = candidates.map((m) => ({
      course: m.course,
      score: 60,
      reasons: [ReasonGenerator.freshAddition()],
      progressPercent: m.progressPercent,
      remainingDurationMinutes: m.remainingDurationMinutes,
      nextLessonTitle: m.nextLessonTitle,
      nextLessonId: m.nextLessonId
    }))

    return {
      id: 'rail_recent',
      title: 'Adicionados Recentemente',
      subtitle: 'Novidades no seu acervo pessoal de estudos',
      railType: 'recent',
      badge: 'Novidade',
      items: items.slice(0, 6)
    }
  }
}

export const discoveryEngineService = new DiscoveryEngineService()
