import { describe, expect, it } from 'vitest'
import {
  getRelatedSurfaces,
  RELATED_SURFACE_ROUTES,
} from '../chat/related-surfaces'

const FEATURE_FILE_SURFACE_IDS = [
  'today',
  'gamification',
  'notifications',
  'subscriptions',
  'ai-settings',
] as const

describe('getRelatedSurfaces', () => {
  it('resolves known surface IDs to their mapped entries in order', () => {
    const result = getRelatedSurfaces(['gamification', 'today'])
    expect(result.map((surface) => surface.id)).toEqual(['gamification', 'today'])
    expect(result[0]?.webRoute).toBe('/progress')
    expect(result[1]?.mobileRoute).toBe('/')
  })

  it('drops unknown surface IDs', () => {
    const result = getRelatedSurfaces(['today', 'mystery-surface'])
    expect(result.map((surface) => surface.id)).toEqual(['today'])
  })

  it('drops duplicate surface IDs, keeping first occurrence', () => {
    const result = getRelatedSurfaces(['today', 'today'])
    expect(result).toHaveLength(1)
  })

  it('returns an empty array for null, undefined, or empty input', () => {
    expect(getRelatedSurfaces(null)).toEqual([])
    expect(getRelatedSurfaces(undefined)).toEqual([])
    expect(getRelatedSurfaces([])).toEqual([])
  })

  it('maps every surface ID the feature bundle can emit', () => {
    for (const id of FEATURE_FILE_SURFACE_IDS) {
      expect(RELATED_SURFACE_ROUTES[id]).toBeDefined()
      expect(RELATED_SURFACE_ROUTES[id]?.labelKey).toMatch(/^chat\.related\.surface\./)
    }
  })

  it('keeps subscription help on Profile without opening an upgrade pitch', () => {
    expect(RELATED_SURFACE_ROUTES.subscriptions).toMatchObject({
      webRoute: '/profile',
      mobileRoute: '/profile',
    })
    expect(Object.values(RELATED_SURFACE_ROUTES).some((surface) =>
      surface.webRoute === '/upgrade' || surface.mobileRoute === '/upgrade'
    )).toBe(false)
  })
})
