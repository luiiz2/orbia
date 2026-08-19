import { describe, it, expect } from 'vitest'
import { naturalCompare, naturalSort, naturalSortBy, extractLeadingNumber } from '../src/main/utils/natural-sort'

describe('Natural Sort Utility', () => {
  it('correctly compares strings with numbers so 2 precedes 10', () => {
    expect(naturalCompare('Lesson 2', 'Lesson 10')).toBeLessThan(0)
    expect(naturalCompare('Aula 10', 'Aula 9')).toBeGreaterThan(0)
    expect(naturalCompare('Module 01', 'Module 1')).toBe(0)
  })

  it('sorts an array of filenames in natural order', () => {
    const input = [
      '10.mp4',
      '1.mp4',
      '02.mp4',
      '20.mp4',
      '9.mp4',
      '3.mp4',
      '100.mp4'
    ]

    const expected = [
      '1.mp4',
      '02.mp4',
      '3.mp4',
      '9.mp4',
      '10.mp4',
      '20.mp4',
      '100.mp4'
    ]

    expect(naturalSort(input)).toEqual(expected)
  })

  it('sorts objects by key naturally', () => {
    const items = [
      { name: 'Modulo 10' },
      { name: 'Modulo 01' },
      { name: 'Modulo 2' },
      { name: 'Modulo 20' }
    ]

    const sorted = naturalSortBy(items, (i) => i.name)
    expect(sorted.map((i) => i.name)).toEqual([
      'Modulo 01',
      'Modulo 2',
      'Modulo 10',
      'Modulo 20'
    ])
  })

  it('extracts leading numbers correctly', () => {
    expect(extractLeadingNumber('01 - Intro')).toBe(1)
    expect(extractLeadingNumber('007. GoldenEye')).toBe(7)
    expect(extractLeadingNumber('123_test')).toBe(123)
    expect(extractLeadingNumber('Intro without numbers')).toBeNull()
  })
})
