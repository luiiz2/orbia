import { describe, it, expect } from 'vitest'
import { SectionErrorBoundary } from '../src/renderer/src/components/ui/SectionErrorBoundary'
import { ErrorBoundary } from '../src/renderer/src/components/ErrorBoundary'

describe('UX Hardening & Error Boundary Resilience', () => {
  it('SectionErrorBoundary catches child exceptions and produces error state', () => {
    const error = new Error('Test component crash')
    const derivedState = SectionErrorBoundary.getDerivedStateFromError(error)

    expect(derivedState.hasError).toBe(true)
    expect(derivedState.error?.message).toBe('Test component crash')
  })

  it('Root ErrorBoundary derives error state accurately', () => {
    const criticalError = new TypeError('Cannot read property of undefined')
    const derivedState = ErrorBoundary.getDerivedStateFromError(criticalError)

    expect(derivedState.hasError).toBe(true)
    expect(derivedState.error?.message).toBe('Cannot read property of undefined')
  })

  it('ErrorBoundary preserves error and derived state', () => {
    const error = new Error('Crash with stack')
    const derived = ErrorBoundary.getDerivedStateFromError(error)

    expect(derived.hasError).toBe(true)
    expect(derived.error).toBe(error)
    expect(derived.error?.message).toBe('Crash with stack')
  })
})
