import React, { useEffect, useState } from 'react'
import { Sparkles } from 'lucide-react'
import type { DiscoveryItem } from '../../../../types/discovery'
import { CourseCard } from '../library/CourseCard'

interface SimilarCoursesRailProps {
  courseId: string
}

export function SimilarCoursesRail({ courseId }: SimilarCoursesRailProps): React.JSX.Element | null {
  const [similarItems, setSimilarItems] = useState<DiscoveryItem[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)

  useEffect(() => {
    let isMounted = true
    if (window.api?.discovery?.getSimilarCourses) {
      window.api.discovery.getSimilarCourses(courseId, 6).then((items) => {
        if (isMounted) {
          setSimilarItems(items)
          setIsLoading(false)
        }
      }).catch(() => {
        if (isMounted) setIsLoading(false)
      })
    }
    return () => {
      isMounted = false
    }
  }, [courseId])

  if (isLoading || similarItems.length === 0) return null

  return (
    <div className="mt-12 space-y-4">
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
          <Sparkles className="w-4 h-4" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-foreground">Cursos Semelhantes</h2>
          <p className="text-xs text-muted-foreground">Baseado em tópicos e afinidade pedagógica</p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {similarItems.map((it) => (
          <div key={it.course.id} className="relative group">
            <CourseCard
              course={it.course}
            />
            {it.reasons[0] && (
              <div className="mt-1 text-[11px] text-muted-foreground truncate">
                {it.reasons[0].type === 'shared_tags'
                  ? `Tags: ${it.reasons[0].params.tags}`
                  : 'Alta afinidade'}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
