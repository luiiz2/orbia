import { create } from 'zustand'
import type {
  FindInLibraryRequest,
  FindInLibraryResponse,
  LibrarySearchFilters,
  LibrarySearchMode,
  LibrarySearchNavigationResult,
  LibrarySearchResult,
  RelatedContentRequest,
  RelatedContentResponse
} from '@shared'

export interface LibrarySearchApi {
  findInLibrary: (
    request: FindInLibraryRequest
  ) => Promise<FindInLibraryResponse>
  related: (request: RelatedContentRequest) => Promise<RelatedContentResponse>
  resolveResult: (input: {
    chunkId: string
  }) => Promise<LibrarySearchNavigationResult>
}

interface SearchApiShape {
  findInLibrary?: LibrarySearchApi['findInLibrary']
  related?: LibrarySearchApi['related']
  resolveResult?: LibrarySearchApi['resolveResult']
}

function getSearchApi(): SearchApiShape | null {
  if (typeof window === 'undefined' || !window.api) return null

  return (window.api as unknown as { search?: SearchApiShape }).search || null
}

function copyFilters(filters: LibrarySearchFilters): LibrarySearchFilters {
  return {
    ...filters,
    contentTypes: filters.contentTypes ? [...filters.contentTypes] : undefined
  }
}

let requestSequence = 0

export interface LibrarySearchState {
  isOpen: boolean
  query: string
  mode: LibrarySearchMode
  filters: LibrarySearchFilters
  response: FindInLibraryResponse | null
  relatedResponse: RelatedContentResponse | null
  relatedAnchor: LibrarySearchResult | null
  isLoading: boolean
  isLoadingRelated: boolean
  error: string | null
  relatedError: string | null

  open: (query?: string, submit?: boolean) => void
  close: () => void
  setQuery: (query: string) => void
  setMode: (mode: LibrarySearchMode) => void
  setFilters: (filters: LibrarySearchFilters) => void
  updateFilters: (filters: Partial<LibrarySearchFilters>) => void
  clearFilters: () => void
  clearResults: () => void
  submit: (query?: string) => Promise<void>
  loadRelated: (anchor: LibrarySearchResult) => Promise<void>
  clearRelated: () => void
  resolveResult: (
    result: LibrarySearchResult
  ) => Promise<LibrarySearchNavigationResult>
}

export const useLibrarySearchStore = create<LibrarySearchState>((set, get) => ({
  isOpen: false,
  query: '',
  mode: 'normal',
  filters: {},
  response: null,
  relatedResponse: null,
  relatedAnchor: null,
  isLoading: false,
  isLoadingRelated: false,
  error: null,
  relatedError: null,

  open: (query, submit = false) => {
    const nextQuery = query ?? get().query
    set({
      isOpen: true,
      query: nextQuery,
      response: null,
      relatedResponse: null,
      relatedAnchor: null,
      error: null,
      relatedError: null
    })

    if (submit && nextQuery.trim()) {
      void get().submit(nextQuery)
    }
  },

  close: () => {
    set({
      isOpen: false,
      relatedResponse: null,
      relatedAnchor: null,
      relatedError: null
    })
  },

  setQuery: (query) => {
    set({ query })
  },

  setMode: (mode) => {
    set({
      mode,
      response: null,
      relatedResponse: null,
      relatedAnchor: null,
      error: null
    })
  },

  setFilters: (filters) => {
    set({
      filters: copyFilters(filters),
      response: null,
      relatedResponse: null,
      relatedAnchor: null,
      error: null
    })
  },

  updateFilters: (filters) => {
    set((state) => ({
      filters: copyFilters({ ...state.filters, ...filters }),
      response: null,
      relatedResponse: null,
      relatedAnchor: null,
      error: null
    }))
  },

  clearFilters: () => {
    set({
      filters: {},
      response: null,
      relatedResponse: null,
      relatedAnchor: null,
      error: null
    })
  },

  clearResults: () => {
    set({
      response: null,
      error: null,
      relatedResponse: null,
      relatedAnchor: null,
      relatedError: null
    })
  },

  submit: async (query) => {
    const state = get()
    const nextQuery = (query ?? state.query).trim()
    if (!nextQuery) {
      set({
        response: null,
        error: null,
        relatedResponse: null,
        relatedAnchor: null
      })
      return
    }

    const api = getSearchApi()
    if (!api?.findInLibrary) {
      set({
        response: null,
        error: 'A busca da biblioteca não está disponível nesta sessão.',
        isLoading: false
      })
      return
    }

    const requestId = ++requestSequence
    set({
      query: nextQuery,
      isLoading: true,
      error: null,
      relatedResponse: null,
      relatedAnchor: null
    })

    const request: FindInLibraryRequest = {
      query: nextQuery,
      mode: state.mode,
      filters: copyFilters(state.filters),
      limit: 50,
      cloudConsent: false
    }

    try {
      const response = await api.findInLibrary(request)
      if (requestId !== requestSequence) return
      set({ response, isLoading: false })
    } catch (error: unknown) {
      if (requestId !== requestSequence) return
      set({
        response: null,
        isLoading: false,
        error:
          error instanceof Error
            ? error.message
            : 'Não foi possível buscar na biblioteca.'
      })
    }
  },

  loadRelated: async (anchor) => {
    const api = getSearchApi()
    if (!api?.related) {
      set({
        relatedResponse: null,
        relatedAnchor: anchor,
        relatedError: 'Conteúdo relacionado não está disponível nesta sessão.',
        isLoadingRelated: false
      })
      return
    }

    const requestId = ++requestSequence
    set({
      relatedAnchor: anchor,
      relatedResponse: null,
      relatedError: null,
      isLoadingRelated: true
    })

    const request: RelatedContentRequest = {
      anchor: {
        chunkId: anchor.chunkId,
        courseId: anchor.courseId,
        moduleId: anchor.moduleId,
        lessonId: anchor.lessonId,
        resourceId: anchor.resourceId
      },
      filters: copyFilters(get().filters),
      limit: 12,
      cloudConsent: false
    }

    try {
      const response = await api.related(request)
      if (requestId !== requestSequence) return
      set({ relatedResponse: response, isLoadingRelated: false })
    } catch (error: unknown) {
      if (requestId !== requestSequence) return
      set({
        relatedResponse: null,
        isLoadingRelated: false,
        relatedError:
          error instanceof Error
            ? error.message
            : 'Não foi possível carregar conteúdo relacionado.'
      })
    }
  },

  clearRelated: () => {
    set({
      relatedResponse: null,
      relatedAnchor: null,
      relatedError: null,
      isLoadingRelated: false
    })
  },

  resolveResult: async (result) => {
    const api = getSearchApi()
    if (!api?.resolveResult) {
      return {
        status: 'unavailable',
        reason: 'A navegação do resultado não está disponível nesta sessão.'
      }
    }

    try {
      return await api.resolveResult({ chunkId: result.chunkId })
    } catch (error: unknown) {
      return {
        status: 'unavailable',
        reason:
          error instanceof Error
            ? error.message
            : 'Não foi possível abrir este resultado.'
      }
    }
  }
}))
