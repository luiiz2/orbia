import { describe, expect, it } from 'vitest'
import {
  selectPlayerViewState,
  usePlayerStore
} from '../src/renderer/src/stores/usePlayerStore'

describe('Player render performance', () => {
  it('keeps the curriculum snapshot stable during playback time updates', () => {
    const originalTime = usePlayerStore.getState().currentTime
    const before = selectPlayerViewState(usePlayerStore.getState())

    try {
      usePlayerStore.setState({ currentTime: originalTime + 1 })

      const after = selectPlayerViewState(usePlayerStore.getState())
      expect(after).toEqual(before)
    } finally {
      usePlayerStore.setState({ currentTime: originalTime })
    }
  })
})
