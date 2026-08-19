/**
 * Lesson Notes Interface
 */
export interface LessonNote {
  id: string
  lessonId: string
  courseId: string
  timestampSeconds: number
  content: string
  createdAt: number
  updatedAt: number
}
