import { describe, expect, it } from 'vitest'
import { buildHabitQueryString, buildUrlWithQuery } from '../utils/habit-query'

describe('buildHabitQueryString', () => {
  it('builds repeated tag ids and scalar filters for the habits API', () => {
    const query = buildHabitQueryString({
      dateFrom: '2025-04-01',
      includeOverdue: true,
      isCompleted: false,
      frequencyUnit: 'Week',
      tagIds: ['tag-1', 'tag-2'],
      page: 2,
      pageSize: 50,
    })

    expect(query).toBe(
      'dateFrom=2025-04-01&includeOverdue=true&isCompleted=false&frequencyUnit=Week&tagIds=tag-1&tagIds=tag-2&page=2&pageSize=50',
    )
  })
})

describe('buildUrlWithQuery', () => {
  it('appends a query string when present', () => {
    expect(buildUrlWithQuery('/api/habits', 'page=2')).toBe('/api/habits?page=2')
  })

  it('returns the base url when the query string is empty', () => {
    expect(buildUrlWithQuery('/api/habits', '')).toBe('/api/habits')
  })
})
