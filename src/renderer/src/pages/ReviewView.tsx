import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Sparkles,
  Bookmark,
  ListOrdered,
  Flame,
  Play,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  CheckCircle2,
  Layers,
  Search,
  Download,
  X,
  ExternalLink
} from 'lucide-react'
import { useReviewStore } from '../stores/useReviewStore'
import { useNavigationStore } from '../stores/useNavigationStore'
import { usePlayerStore } from '../stores/usePlayerStore'
import { useLibraryStore } from '../stores/useLibraryStore'
import { Button } from '../components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '../components/ui/dialog'
import { formatTime } from '../lib/formatters'
import type { FlashcardReviewGrade, StudyQueueItem } from '@shared'

export function ReviewView(): React.JSX.Element {
  const { t } = useTranslation()
  const {
    dashboardStats,
    dueFlashcards,
    allFlashcards,
    recentBookmarks,
    studyQueue,
    isReviewSessionActive,
    activeCardIndex,
    fetchDashboardStats,
    fetchDueFlashcards,
    fetchAllFlashcards,
    fetchRecentBookmarks,
    fetchStudyQueue,
    reviewCard,
    startReviewSession,
    endReviewSession,
    createFlashcard,
    deleteFlashcard,
    removeFromStudyQueue,
    reorderStudyQueue,
    deleteBookmark
  } = useReviewStore()

  const { navigateToCourse, navigateToPlayer } = useNavigationStore()
  const { loadLesson } = usePlayerStore()
  const { courses } = useLibraryStore()

  const [activeTab, setActiveTab] = useState<'today' | 'flashcards' | 'bookmarks' | 'queue'>('today')
  const [searchQuery, setSearchQuery] = useState('')
  const [isAnswerRevealed, setIsAnswerRevealed] = useState(false)
  const [isCreateCardModalOpen, setIsCreateCardModalOpen] = useState(false)
  const [newQuestion, setNewQuestion] = useState('')
  const [newAnswer, setNewAnswer] = useState('')
  const [selectedCourseId, setSelectedCourseId] = useState<string>('')
  const [flashcardFilter, setFlashcardFilter] = useState<'ALL' | 'DUE' | 'LEARNING' | 'REVIEW'>('ALL')
  const [exportMessage, setExportMessage] = useState<string | null>(null)

  useEffect(() => {
    fetchDashboardStats()
    fetchDueFlashcards()
    fetchAllFlashcards()
    fetchRecentBookmarks()
    fetchStudyQueue()
  }, [fetchDashboardStats, fetchDueFlashcards, fetchAllFlashcards, fetchRecentBookmarks, fetchStudyQueue])

  // Reset answer reveal when active card changes
  useEffect(() => {
    setIsAnswerRevealed(false)
  }, [activeCardIndex, isReviewSessionActive])

  const handleReviewGrade = async (grade: FlashcardReviewGrade) => {
    const currentCard = dueFlashcards[activeCardIndex]
    if (!currentCard) return
    await reviewCard(currentCard.id, grade)
    setIsAnswerRevealed(false)
  }

  const handleCreateFlashcard = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newQuestion.trim() || !newAnswer.trim()) return

    await createFlashcard({
      courseId: selectedCourseId || undefined,
      question: newQuestion.trim(),
      answer: newAnswer.trim()
    })

    setNewQuestion('')
    setNewAnswer('')
    setSelectedCourseId('')
    setIsCreateCardModalOpen(false)
  }

  const handlePlayQueueItem = async (item: StudyQueueItem) => {
    if (item.entityType === 'course') {
      navigateToCourse(item.entityId)
    } else if (item.entityType === 'lesson') {
      if (item.courseId) {
        navigateToPlayer(item.courseId)
        await loadLesson(item.entityId)
      }
    } else if (item.entityType === 'module') {
      if (item.courseId) {
        navigateToCourse(item.courseId)
      }
    }
  }

  const handleExportFlashcardsCsv = async () => {
    try {
      const csv = await window.api.exports.flashcardsCsv()
      const res = await window.api.exports.saveExportToFile(`Orbia-Flashcards-${new Date().toISOString().split('T')[0]}.csv`, csv)
      if (res.success) {
        setExportMessage('Flashcards exportados com sucesso em CSV (compatível com Anki)!')
        setTimeout(() => setExportMessage(null), 4000)
      }
    } catch (err) {
      console.error('Export failed:', err)
    }
  }

  const handleExportBookmarks = async () => {
    try {
      const md = await window.api.exports.bookmarksMarkdown()
      const res = await window.api.exports.saveExportToFile(`Orbia-Marcadores-${new Date().toISOString().split('T')[0]}.md`, md)
      if (res.success) {
        setExportMessage('Marcadores exportados com sucesso em Markdown!')
        setTimeout(() => setExportMessage(null), 4000)
      }
    } catch (err) {
      console.error('Export failed:', err)
    }
  }

  const currentReviewCard = dueFlashcards[activeCardIndex]

  const filteredFlashcards = allFlashcards.filter((card) => {
    const matchesSearch =
      card.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      card.answer.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (card.courseTitle && card.courseTitle.toLowerCase().includes(searchQuery.toLowerCase()))

    if (!matchesSearch) return false

    if (flashcardFilter === 'ALL') return true
    if (flashcardFilter === 'DUE') return card.dueAt <= Date.now()
    return card.state === flashcardFilter
  })

  const filteredBookmarks = recentBookmarks.filter((bm) => {
    return (
      bm.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (bm.courseTitle && bm.courseTitle.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (bm.lessonTitle && bm.lessonTitle.toLowerCase().includes(searchQuery.toLowerCase()))
    )
  })

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-background text-foreground select-none">
      {/* Top Header */}
      <div className="flex items-center justify-between px-8 py-5 border-b border-border/70 bg-card/40 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-500/20 via-primary/15 to-orange-500/10 border border-purple-500/30 text-purple-400 shadow-md">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground tracking-tight">
              {t('review.centerTitle', 'Central de Revisão')}
            </h1>
            <p className="text-xs text-muted-foreground">
              {t('review.centerSubtitle', 'Revisão ativa, flashcards espaçados, marcadores e fila de estudos')}
            </p>
          </div>
        </div>

        {/* Global Action Buttons */}
        <div className="flex items-center gap-2">
          {dueFlashcards.length > 0 && !isReviewSessionActive && (
            <Button
              onClick={startReviewSession}
              className="gap-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-lg shadow-purple-600/20 font-semibold"
            >
              <Play className="h-4 w-4 fill-current" />
              {t('review.startSession', 'Revisar Agora')} ({dueFlashcards.length})
            </Button>
          )}

          <Button
            variant="outline"
            onClick={() => setIsCreateCardModalOpen(true)}
            className="gap-1.5 border-purple-500/30 hover:border-purple-500 text-purple-400 hover:text-purple-300"
          >
            <Plus className="h-4 w-4" />
            {t('review.newCard', 'Novo Flashcard')}
          </Button>
        </div>
      </div>

      {/* Export Notification Banner */}
      {exportMessage && (
        <div className="mx-8 mt-4 p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-medium flex items-center justify-between animate-in fade-in-0 slide-in-from-top-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            <span>{exportMessage}</span>
          </div>
          <button type="button" onClick={() => setExportMessage(null)} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Dashboard Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5 px-8 pt-6 pb-4">
        {/* Due Cards */}
        <div
          onClick={() => {
            setActiveTab('flashcards')
            setFlashcardFilter('DUE')
          }}
          className="p-3.5 rounded-2xl border border-purple-500/30 bg-gradient-to-br from-purple-500/10 via-card to-card hover:border-purple-500/60 transition-all cursor-pointer shadow-sm group"
        >
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
            <span className="font-medium">{t('review.dueCards', 'Cards Pendentes')}</span>
            <Sparkles className="h-4 w-4 text-purple-400 group-hover:scale-110 transition-transform" />
          </div>
          <div className="text-2xl font-black text-purple-400">
            {dashboardStats?.dueFlashcardsCount ?? dueFlashcards.length}
          </div>
        </div>

        {/* Total Flashcards */}
        <div
          onClick={() => {
            setActiveTab('flashcards')
            setFlashcardFilter('ALL')
          }}
          className="p-3.5 rounded-2xl border border-border/80 bg-card hover:border-border transition-all cursor-pointer shadow-sm group"
        >
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
            <span className="font-medium">{t('review.totalCards', 'Total de Cards')}</span>
            <Layers className="h-4 w-4 text-indigo-400 group-hover:scale-110 transition-transform" />
          </div>
          <div className="text-2xl font-black text-foreground">
            {dashboardStats?.totalFlashcardsCount ?? allFlashcards.length}
          </div>
        </div>

        {/* Bookmarks */}
        <div
          onClick={() => setActiveTab('bookmarks')}
          className="p-3.5 rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 via-card to-card hover:border-amber-500/60 transition-all cursor-pointer shadow-sm group"
        >
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
            <span className="font-medium">{t('review.savedBookmarks', 'Marcadores')}</span>
            <Bookmark className="h-4 w-4 text-amber-400 group-hover:scale-110 transition-transform" />
          </div>
          <div className="text-2xl font-black text-amber-400">
            {dashboardStats?.bookmarksCount ?? recentBookmarks.length}
          </div>
        </div>

        {/* Study Queue */}
        <div
          onClick={() => setActiveTab('queue')}
          className="p-3.5 rounded-2xl border border-blue-500/30 bg-gradient-to-br from-blue-500/10 via-card to-card hover:border-blue-500/60 transition-all cursor-pointer shadow-sm group"
        >
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
            <span className="font-medium">{t('review.studyQueue', 'Fila de Estudos')}</span>
            <ListOrdered className="h-4 w-4 text-blue-400 group-hover:scale-110 transition-transform" />
          </div>
          <div className="text-2xl font-black text-blue-400">
            {dashboardStats?.studyQueueCount ?? studyQueue.length}
          </div>
        </div>

        {/* Active Streak */}
        <div className="p-3.5 rounded-2xl border border-orange-500/30 bg-gradient-to-br from-orange-500/10 via-card to-card shadow-sm">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
            <span className="font-medium">{t('review.streak', 'Sequência')}</span>
            <Flame className="h-4 w-4 text-orange-500" />
          </div>
          <div className="text-2xl font-black text-orange-500">
            {dashboardStats?.activeStreakDays ?? 0} <span className="text-xs font-normal text-muted-foreground">dias</span>
          </div>
        </div>
      </div>

      {/* Main Tabs Navigation */}
      <div className="flex items-center justify-between px-8 border-b border-border/70 mt-2">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('today')}
            className={`pb-3 px-3 text-xs font-bold border-b-2 transition-colors ${
              activeTab === 'today'
                ? 'border-purple-500 text-purple-400'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t('review.tabToday', 'Hoje & Visão Geral')}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('flashcards')}
            className={`pb-3 px-3 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'flashcards'
                ? 'border-purple-500 text-purple-400'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <span>{t('review.tabFlashcards', 'Flashcards')}</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-purple-500/20 text-purple-400 font-mono">
              {allFlashcards.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('bookmarks')}
            className={`pb-3 px-3 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'bookmarks'
                ? 'border-amber-500 text-amber-400'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <span>{t('review.tabBookmarks', 'Marcadores')}</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-400 font-mono">
              {recentBookmarks.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('queue')}
            className={`pb-3 px-3 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'queue'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <span>{t('review.tabQueue', 'Estudar Depois')}</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-blue-500/20 text-blue-400 font-mono">
              {studyQueue.length}
            </span>
          </button>
        </div>

        {/* Search & Export Buttons */}
        {activeTab !== 'today' && (
          <div className="flex items-center gap-2 pb-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder={t('common.search', 'Filtrar...')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1 text-xs bg-secondary/50 border border-border/80 rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary w-44"
              />
            </div>

            {activeTab === 'flashcards' && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportFlashcardsCsv}
                className="h-7 text-xs gap-1 border-border/80 hover:border-purple-500"
                title="Exportar Flashcards para Anki (CSV)"
              >
                <Download className="h-3.5 w-3.5" />
                <span>CSV</span>
              </Button>
            )}

            {activeTab === 'bookmarks' && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportBookmarks}
                className="h-7 text-xs gap-1 border-border/80 hover:border-amber-500"
                title="Exportar Marcadores para Markdown"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Markdown</span>
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Tab Contents */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {/* TODAY / OVERVIEW TAB */}
        {activeTab === 'today' && (
          <div className="space-y-8 max-w-5xl mx-auto">
            {/* Flashcard Due Hero Card */}
            <div className="relative overflow-hidden rounded-3xl border border-purple-500/40 bg-gradient-to-br from-purple-900/30 via-card to-card p-6 shadow-xl">
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-purple-500/20 text-purple-400 border border-purple-500/30">
                      {t('review.dailySpacedReview', 'Revisão Espaçada Diária')}
                    </span>
                  </div>
                  <h2 className="text-lg font-bold text-foreground">
                    {dueFlashcards.length > 0
                      ? t('review.cardsDueMessage', { count: dueFlashcards.length })
                      : t('review.noCardsDueMessage', 'Tudo em dia! Nenhum flashcard pendente para hoje.')}
                  </h2>
                  <p className="text-xs text-muted-foreground max-w-xl">
                    {t('review.spacedHint', 'O Orbia calcula automaticamente os intervalos ideais (10m, 1d, 3d, 7d, 14d, 30d) para fixação de longo prazo.')}
                  </p>
                </div>

                {dueFlashcards.length > 0 && (
                  <Button
                    size="lg"
                    onClick={startReviewSession}
                    className="gap-2 bg-purple-600 hover:bg-purple-500 text-white font-bold shadow-lg shadow-purple-600/30 shrink-0"
                  >
                    <Play className="h-4 w-4 fill-current" />
                    {t('review.startSession', 'Revisar Agora')} ({dueFlashcards.length})
                  </Button>
                )}
              </div>
            </div>

            {/* Study Queue Preview */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                  <ListOrdered className="h-4 w-4 text-blue-400" />
                  <span>{t('review.studyQueueSection', 'Continuar da Fila ("Estudar Depois")')}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('queue')}
                  className="text-xs text-blue-400 hover:underline font-medium"
                >
                  {t('common.viewAll', 'Ver todos')} ({studyQueue.length})
                </button>
              </div>

              {studyQueue.length === 0 ? (
                <div className="p-6 rounded-2xl border border-border/70 bg-card text-center text-xs text-muted-foreground">
                  {t('review.emptyQueue', 'Sua fila está vazia. Adicione cursos, módulos ou aulas para estudar depois.')}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {studyQueue.slice(0, 4).map((item, idx) => (
                    <div
                      key={item.id}
                      onClick={() => handlePlayQueueItem(item)}
                      className="flex items-center justify-between p-3.5 rounded-2xl border border-border/80 bg-card hover:border-primary/50 hover:bg-accent/40 transition-all cursor-pointer group shadow-sm"
                    >
                      <div className="flex items-center gap-3 overflow-hidden">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400 font-mono font-bold text-xs">
                          {idx + 1}
                        </span>
                        <div className="truncate">
                          <p className="text-xs font-bold text-foreground truncate group-hover:text-primary transition-colors">
                            {item.title}
                          </p>
                          <p className="text-[11px] text-muted-foreground truncate">
                            {item.entityType.toUpperCase()} {item.courseTitle ? `• ${item.courseTitle}` : ''}
                          </p>
                        </div>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-primary opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                      >
                        <Play className="h-4 w-4 fill-current" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recent Bookmarks Preview */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                  <Bookmark className="h-4 w-4 text-amber-500" />
                  <span>{t('review.recentBookmarksSection', 'Marcadores Recentes')}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('bookmarks')}
                  className="text-xs text-amber-500 hover:underline font-medium"
                >
                  {t('common.viewAll', 'Ver todos')} ({recentBookmarks.length})
                </button>
              </div>

              {recentBookmarks.length === 0 ? (
                <div className="p-6 rounded-2xl border border-border/70 bg-card text-center text-xs text-muted-foreground">
                  {t('review.emptyBookmarks', 'Nenhum marcador criado. Salve trechos importantes no player com o botão 🔖.')}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {recentBookmarks.slice(0, 6).map((bm) => (
                    <div
                      key={bm.id}
                      onClick={async () => {
                        if (bm.courseId) {
                          navigateToPlayer(bm.courseId)
                          await loadLesson(bm.lessonId)
                        }
                      }}
                      className="p-3.5 rounded-2xl border border-border/80 bg-card hover:border-amber-500/50 hover:bg-accent/40 transition-all cursor-pointer group shadow-sm flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[10px] font-mono font-bold text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded">
                            {formatTime(bm.timestamp)}
                          </span>
                          <span className="text-[10px] text-muted-foreground truncate max-w-[120px]">
                            {bm.courseTitle}
                          </span>
                        </div>
                        <p className="text-xs font-semibold text-foreground line-clamp-2 group-hover:text-amber-400 transition-colors">
                          {bm.title}
                        </p>
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-2 truncate">
                        🎬 {bm.lessonTitle}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* FLASHCARDS TAB */}
        {activeTab === 'flashcards' && (
          <div className="space-y-4 max-w-5xl mx-auto">
            {/* Filter pills */}
            <div className="flex items-center gap-1.5">
              {(['ALL', 'DUE', 'LEARNING', 'REVIEW'] as const).map((filter) => (
                <button
                  key={filter}
                  type="button"
                  onClick={() => setFlashcardFilter(filter)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                    flashcardFilter === filter
                      ? 'bg-purple-600 text-white shadow-sm'
                      : 'bg-secondary/60 hover:bg-secondary text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {filter === 'ALL' && `Todos (${allFlashcards.length})`}
                  {filter === 'DUE' && `Pendentes (${dueFlashcards.length})`}
                  {filter === 'LEARNING' && 'Em Aprendizado'}
                  {filter === 'REVIEW' && 'Em Revisão'}
                </button>
              ))}
            </div>

            {filteredFlashcards.length === 0 ? (
              <div className="p-12 text-center border border-border/70 rounded-3xl bg-card">
                <Layers className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">
                  {t('review.noFlashcardsFound', 'Nenhum flashcard encontrado com este filtro.')}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {filteredFlashcards.map((card) => (
                  <div
                    key={card.id}
                    className="p-4 rounded-2xl border border-border/80 bg-card hover:border-purple-500/40 transition-all flex flex-col justify-between gap-3 shadow-sm group"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-secondary text-muted-foreground uppercase tracking-wider">
                          {card.state} · {card.successCount} {card.successCount === 1 ? 'acerto' : 'acertos'}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground/50 hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => deleteFlashcard(card.id)}
                          title="Excluir"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>

                      <h3 className="text-xs font-bold text-foreground leading-snug mb-2">
                        {card.question}
                      </h3>

                      <div className="p-2.5 rounded-xl bg-background/60 border border-border/40 text-xs text-muted-foreground">
                        {card.answer}
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t border-border/40">
                      <span className="truncate max-w-[200px]">
                        {card.courseTitle || 'Curso Geral'}
                      </span>
                      {card.timestamp !== undefined && card.timestamp !== null && (
                        <span className="font-mono text-purple-400">
                          {formatTime(card.timestamp)}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* BOOKMARKS TAB */}
        {activeTab === 'bookmarks' && (
          <div className="space-y-3 max-w-5xl mx-auto">
            {filteredBookmarks.length === 0 ? (
              <div className="p-12 text-center border border-border/70 rounded-3xl bg-card">
                <Bookmark className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">
                  {t('review.noBookmarksFound', 'Nenhum marcador encontrado.')}
                </p>
              </div>
            ) : (
              filteredBookmarks.map((bm) => (
                <div
                  key={bm.id}
                  onClick={async () => {
                    if (bm.courseId) {
                      navigateToPlayer(bm.courseId)
                      await loadLesson(bm.lessonId)
                    }
                  }}
                  className="p-3.5 rounded-2xl border border-border/80 bg-card hover:border-amber-500/50 hover:bg-accent/30 transition-all cursor-pointer flex items-center justify-between gap-4 shadow-sm group"
                >
                  <div className="flex items-center gap-3 overflow-hidden">
                    <div
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: bm.color || '#f59e0b' }}
                    />
                    <span className="font-mono text-xs font-bold text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-lg shrink-0">
                      {formatTime(bm.timestamp)}
                    </span>
                    <div className="truncate">
                      <p className="text-xs font-bold text-foreground truncate group-hover:text-amber-400 transition-colors">
                        {bm.title}
                      </p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {bm.courseTitle} • {bm.lessonTitle}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => {
                        e.stopPropagation()
                        deleteBookmark(bm.id)
                      }}
                      title="Excluir"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    <ExternalLink className="h-4 w-4 text-muted-foreground/40 group-hover:text-amber-500 transition-colors" />
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* STUDY QUEUE TAB */}
        {activeTab === 'queue' && (
          <div className="space-y-3 max-w-4xl mx-auto">
            {studyQueue.length === 0 ? (
              <div className="p-12 text-center border border-border/70 rounded-3xl bg-card">
                <ListOrdered className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">
                  {t('review.emptyQueueMessage', 'Nenhum item na fila. Navegue pelos seus cursos e clique em "+ Estudar Depois".')}
                </p>
              </div>
            ) : (
              studyQueue.map((item, idx) => (
                <div
                  key={item.id}
                  className="p-3.5 rounded-2xl border border-border/80 bg-card hover:border-blue-500/50 transition-all flex items-center justify-between gap-3 shadow-sm group"
                >
                  <div className="flex items-center gap-3 overflow-hidden flex-1">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-400 font-mono font-bold text-xs">
                      {idx + 1}
                    </span>
                    <div className="truncate flex-1">
                      <p className="text-xs font-bold text-foreground truncate">
                        {item.title}
                      </p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {item.entityType.toUpperCase()} {item.courseTitle ? `• ${item.courseTitle}` : ''}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {/* Reorder Up */}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-foreground disabled:opacity-30"
                      disabled={idx === 0}
                      onClick={() => reorderStudyQueue(item.id, 'up')}
                      title="Mover para cima"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </Button>

                    {/* Reorder Down */}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-foreground disabled:opacity-30"
                      disabled={idx === studyQueue.length - 1}
                      onClick={() => reorderStudyQueue(item.id, 'down')}
                      title="Mover para baixo"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </Button>

                    {/* Play */}
                    <Button
                      size="sm"
                      onClick={() => handlePlayQueueItem(item)}
                      className="h-7 px-2.5 text-xs bg-blue-600 hover:bg-blue-500 text-white gap-1"
                    >
                      <Play className="h-3 w-3 fill-current" />
                      <span>{t('common.play', 'Abrir')}</span>
                    </Button>

                    {/* Remove */}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => removeFromStudyQueue(item.id)}
                      title="Remover da fila"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* FLASHCARD REVIEW SESSION MODAL */}
      <Dialog open={isReviewSessionActive} onOpenChange={(open) => !open && endReviewSession()}>
        <DialogContent className="max-w-xl bg-card/95 backdrop-blur-2xl border border-purple-500/30 p-0 overflow-hidden shadow-2xl">
          <div className="p-6">
            {/* Header progress */}
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-border/70 text-xs">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-400 font-bold text-[10px] uppercase">
                  {currentReviewCard?.state || 'CARD'}
                </span>
                <span className="text-muted-foreground font-mono">
                  {activeCardIndex + 1} de {dueFlashcards.length}
                </span>
              </div>
              <span className="text-muted-foreground truncate max-w-[200px]">
                {currentReviewCard?.courseTitle || 'Curso'}
              </span>
            </div>

            {/* Question Card */}
            <div className="min-h-[160px] flex flex-col justify-center text-center p-6 rounded-2xl bg-secondary/30 border border-border/60">
              <span className="text-[11px] font-bold text-purple-400 uppercase tracking-widest mb-2">
                {t('review.question', 'Pergunta')}
              </span>
              <h2 className="text-base font-bold text-foreground leading-relaxed">
                {currentReviewCard?.question}
              </h2>
            </div>

            {/* Answer Section */}
            {isAnswerRevealed ? (
              <div className="mt-4 p-5 rounded-2xl bg-purple-950/20 border border-purple-500/30 animate-in fade-in zoom-in-95 duration-200">
                <span className="text-[11px] font-bold text-purple-400 uppercase tracking-widest block mb-1.5">
                  {t('review.answer', 'Resposta')}
                </span>
                <p className="text-xs text-foreground leading-relaxed">
                  {currentReviewCard?.answer}
                </p>
              </div>
            ) : (
              <div className="mt-4 flex justify-center">
                <Button
                  onClick={() => setIsAnswerRevealed(true)}
                  className="bg-purple-600 hover:bg-purple-500 text-white font-semibold px-6"
                >
                  {t('review.revealAnswer', 'Mostrar Resposta')}
                </Button>
              </div>
            )}
          </div>

          {/* Grade Buttons Footer (shown when answer revealed) */}
          {isAnswerRevealed && (
            <div className="p-4 bg-secondary/40 border-t border-border/70 flex items-center justify-between gap-2">
              <Button
                variant="outline"
                onClick={() => handleReviewGrade('AGAIN')}
                className="flex-1 border-red-500/40 hover:bg-red-500/10 text-red-400 text-xs font-semibold py-5 flex flex-col gap-0.5"
              >
                <span>{t('review.again', 'Não lembrei')}</span>
                <span className="text-[10px] opacity-75 font-normal">10 min</span>
              </Button>

              <Button
                variant="outline"
                onClick={() => handleReviewGrade('HARD')}
                className="flex-1 border-amber-500/40 hover:bg-amber-500/10 text-amber-400 text-xs font-semibold py-5 flex flex-col gap-0.5"
              >
                <span>{t('review.hard', 'Difícil')}</span>
                <span className="text-[10px] opacity-75 font-normal">1 dia</span>
              </Button>

              <Button
                variant="outline"
                onClick={() => handleReviewGrade('GOOD')}
                className="flex-1 border-emerald-500/40 hover:bg-emerald-500/10 text-emerald-400 text-xs font-semibold py-5 flex flex-col gap-0.5"
              >
                <span>{t('review.good', 'Lembrei')}</span>
                <span className="text-[10px] opacity-75 font-normal">
                  {currentReviewCard ? `${currentReviewCard.successCount === 0 ? '3' : currentReviewCard.successCount === 1 ? '7' : currentReviewCard.successCount === 2 ? '14' : '30'} dias` : ''}
                </span>
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* CREATE FLASHCARD MODAL */}
      <Dialog open={isCreateCardModalOpen} onOpenChange={setIsCreateCardModalOpen}>
        <DialogContent className="max-w-md bg-card/95 backdrop-blur-xl border border-border/80">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-purple-400" />
              <span>{t('review.createCardTitle', 'Criar Novo Flashcard')}</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {t('review.createCardDesc', 'Adicione uma pergunta e resposta para seu deck de revisão espaçada.')}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateFlashcard} className="space-y-3 pt-2">
            {courses.length > 0 && (
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-muted-foreground">
                  {t('review.linkCourse', 'Vincular ao Curso (Opcional)')}
                </label>
                <select
                  value={selectedCourseId}
                  onChange={(e) => setSelectedCourseId(e.target.value)}
                  className="w-full text-xs bg-secondary/50 border border-border/80 rounded-lg p-2 text-foreground focus:outline-none focus:ring-1 focus:ring-purple-500"
                >
                  <option value="">{t('review.generalCourse', 'Sem vínculo específico')}</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>{c.title}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-muted-foreground">
                {t('player.flashcardQuestion', 'Pergunta')}
              </label>
              <input
                type="text"
                placeholder={t('player.questionPlaceholder', 'Ex: O que é memoization?')}
                value={newQuestion}
                onChange={(e) => setNewQuestion(e.target.value)}
                className="w-full text-xs bg-background border border-border/80 rounded-lg p-2 text-foreground focus:outline-none focus:ring-1 focus:ring-purple-500"
                autoFocus
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-muted-foreground">
                {t('player.flashcardAnswer', 'Resposta')}
              </label>
              <textarea
                rows={3}
                placeholder={t('player.answerPlaceholder', 'Ex: Técnica de otimização que armazena resultados...')}
                value={newAnswer}
                onChange={(e) => setNewAnswer(e.target.value)}
                className="w-full text-xs bg-background border border-border/80 rounded-lg p-2 text-foreground focus:outline-none focus:ring-1 focus:ring-purple-500 resize-none"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setIsCreateCardModalOpen(false)}
              >
                {t('common.cancel', 'Cancelar')}
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={!newQuestion.trim() || !newAnswer.trim()}
                className="bg-purple-600 hover:bg-purple-500 text-white font-medium"
              >
                {t('common.save', 'Salvar Flashcard')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
