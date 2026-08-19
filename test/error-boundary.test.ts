import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { ErrorBoundary } from '../src/renderer/src/components/ErrorBoundary'

describe('ErrorBoundary Resilience', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('initializes with no error in default state', () => {
    const boundary = new ErrorBoundary({ children: React.createElement('div') })
    expect(boundary.state.hasError).toBe(false)
    expect(boundary.state.error).toBeNull()
  })

  it('updates state upon catching error via getDerivedStateFromError', () => {
    const error = new Error('Test crash in child component')
    const state = ErrorBoundary.getDerivedStateFromError(error)

    expect(state.hasError).toBe(true)
    expect(state.error).toBe(error)
  })

  it('renders custom fallback prop when state has error', () => {
    const boundary = new ErrorBoundary({
      children: React.createElement('div', null, 'Normal Content'),
      fallback: React.createElement('div', { id: 'custom-fallback' }, 'Custom Error Screen')
    })

    boundary.state = {
      hasError: true,
      error: new Error('Render failed')
    }

    const rendered = boundary.render() as React.ReactElement
    expect(rendered.props.id).toBe('custom-fallback')
  })

  it('renders children normally when state has no error', () => {
    const childElement = React.createElement('div', { id: 'normal-child' }, 'Everything OK')
    const boundary = new ErrorBoundary({ children: childElement })

    const rendered = boundary.render() as React.ReactElement
    expect(rendered.props.id).toBe('normal-child')
  })
})
