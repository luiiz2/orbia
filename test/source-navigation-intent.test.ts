import { describe, expect, it, beforeEach } from 'vitest'
import {
  useNavigationStore,
  type SourceNavigationIntent
} from '../src/renderer/src/stores/useNavigationStore'

describe('useNavigationStore source navigation intent', () => {
  beforeEach(() => {
    useNavigationStore.setState({
      currentView: 'home',
      selectedCourseId: null,
      sourceNavigationTarget: null
    })
  })

  it('sets the pending target, switches to player view, and consumes it exactly once', () => {
    const target: SourceNavigationIntent = {
      courseId: 'course-1',
      lessonId: 'lesson-1',
      timestampSeconds: 42,
      resourceId: 'res-1',
      pdfPage: 3
    }

    useNavigationStore.getState().openSourceTarget(target)

    const state = useNavigationStore.getState()
    expect(state.currentView).toBe('player')
    expect(state.selectedCourseId).toBe('course-1')

    const consumed = useNavigationStore.getState().consumeSourceTarget()
    expect(consumed).toEqual(target)

    const consumedAgain = useNavigationStore.getState().consumeSourceTarget()
    expect(consumedAgain).toBeNull()
  })

  it('switches to course view if target has courseId but no lessonId', () => {
    const target: SourceNavigationIntent = {
      courseId: 'course-2'
    }

    useNavigationStore.getState().openSourceTarget(target)

    const state = useNavigationStore.getState()
    expect(state.currentView).toBe('course')
    expect(state.selectedCourseId).toBe('course-2')
    expect(useNavigationStore.getState().consumeSourceTarget()).toEqual(target)
  })
})
