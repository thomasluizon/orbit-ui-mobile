import { describe, it, expect } from 'vitest'
import {
  habitKeys,
  goalKeys,
  profileKeys,
  tagKeys,
  notificationKeys,
  gamificationKeys,
  subscriptionKeys,
  referralKeys,
  apiKeyKeys,
  configKeys,
  calendarKeys,
  userFactKeys,
  checklistTemplateKeys,
} from '../query/keys'
import { QUERY_STALE_TIMES } from '../query/options'

// ===========================================================================
// Query key factories
// ===========================================================================

describe('habitKeys', () => {
  it('all returns base key', () => {
    expect(habitKeys.all).toEqual(['habits'])
  })

  it('lists returns list key', () => {
    expect(habitKeys.lists()).toEqual(['habits', 'list'])
  })

  it('list appends filters', () => {
    const filters = { dateFrom: '2025-01-01', dateTo: '2025-01-31' }
    expect(habitKeys.list(filters)).toEqual(['habits', 'list', filters])
  })

  it('count returns count key', () => {
    expect(habitKeys.count()).toEqual(['habits', 'count'])
  })

  it('details returns details key', () => {
    expect(habitKeys.details()).toEqual(['habits', 'detail'])
  })

  it('detail appends id', () => {
    expect(habitKeys.detail('h-1')).toEqual(['habits', 'detail', 'h-1'])
  })

  it('metrics appends id', () => {
    expect(habitKeys.metrics('h-1')).toEqual(['habits', 'metrics', 'h-1'])
  })

  it('logs appends id', () => {
    expect(habitKeys.logs('h-1')).toEqual(['habits', 'logs', 'h-1'])
  })

  it('calendar appends date range', () => {
    expect(habitKeys.calendar('2025-01-01', '2025-01-31')).toEqual(
      ['habits', 'calendar', '2025-01-01', '2025-01-31'],
    )
  })

  it('summary appends date range and locale', () => {
    expect(habitKeys.summary('2025-01-01', '2025-01-31')).toEqual(
      ['habits', 'summary', '2025-01-01', '2025-01-31', 'en'],
    )
    expect(habitKeys.summary('2025-01-01', '2025-01-31', 'pt-BR')).toEqual(
      ['habits', 'summary', '2025-01-01', '2025-01-31', 'pt-BR'],
    )
  })

  it('summary produces distinct keys per locale', () => {
    const en = habitKeys.summary('2025-01-01', '2025-01-01', 'en')
    const pt = habitKeys.summary('2025-01-01', '2025-01-01', 'pt-BR')
    expect(en).not.toEqual(pt)
  })

  it('retrospective appends period', () => {
    expect(habitKeys.retrospective('week')).toEqual(['habits', 'retrospective', 'week'])
  })
})

describe('goalKeys', () => {
  it('all returns base key', () => {
    expect(goalKeys.all).toEqual(['goals'])
  })

  it('lists returns list key', () => {
    expect(goalKeys.lists()).toEqual(['goals', 'list'])
  })

  it('list appends filters', () => {
    const filters = { status: 'Active' }
    expect(goalKeys.list(filters)).toEqual(['goals', 'list', filters])
  })

  it('details returns details key', () => {
    expect(goalKeys.details()).toEqual(['goals', 'detail'])
  })

  it('detail appends id', () => {
    expect(goalKeys.detail('g-1')).toEqual(['goals', 'detail', 'g-1'])
  })

  it('metrics appends id', () => {
    expect(goalKeys.metrics('g-1')).toEqual(['goals', 'metrics', 'g-1'])
  })

  it('review appends id', () => {
    expect(goalKeys.review('g-1')).toEqual(['goals', 'review', 'g-1'])
  })
})

describe('profileKeys', () => {
  it('all returns base key', () => {
    expect(profileKeys.all).toEqual(['profile'])
  })

  it('detail returns detail key', () => {
    expect(profileKeys.detail()).toEqual(['profile', 'detail'])
  })
})

describe('tagKeys', () => {
  it('all returns base key', () => {
    expect(tagKeys.all).toEqual(['tags'])
  })

  it('lists returns list key', () => {
    expect(tagKeys.lists()).toEqual(['tags', 'list'])
  })

  it('list appends filters', () => {
    expect(tagKeys.list({})).toEqual(['tags', 'list', {}])
  })
})

describe('notificationKeys', () => {
  it('all returns base key', () => {
    expect(notificationKeys.all).toEqual(['notifications'])
  })

  it('lists returns list key', () => {
    expect(notificationKeys.lists()).toEqual(['notifications', 'list'])
  })

  it('list appends filters', () => {
    expect(notificationKeys.list({ page: 1 })).toEqual(['notifications', 'list', { page: 1 }])
  })
})

describe('gamificationKeys', () => {
  it('all returns base key', () => {
    expect(gamificationKeys.all).toEqual(['gamification'])
  })

  it('profile returns profile key', () => {
    expect(gamificationKeys.profile()).toEqual(['gamification', 'profile'])
  })

  it('achievements returns achievements key', () => {
    expect(gamificationKeys.achievements()).toEqual(['gamification', 'achievements'])
  })

  it('streak returns streak key', () => {
    expect(gamificationKeys.streak()).toEqual(['gamification', 'streak'])
  })
})

describe('subscriptionKeys', () => {
  it('all returns base key', () => {
    expect(subscriptionKeys.all).toEqual(['subscriptions'])
  })

  it('status returns status key', () => {
    expect(subscriptionKeys.status()).toEqual(['subscriptions', 'status'])
  })

  it('plans returns plans key', () => {
    expect(subscriptionKeys.plans()).toEqual(['subscriptions', 'plans'])
  })
})

describe('referralKeys', () => {
  it('all returns base key', () => {
    expect(referralKeys.all).toEqual(['referral'])
  })

  it('code returns code key', () => {
    expect(referralKeys.code()).toEqual(['referral', 'code'])
  })

  it('stats returns stats key', () => {
    expect(referralKeys.stats()).toEqual(['referral', 'stats'])
  })
})

describe('apiKeyKeys', () => {
  it('all returns base key', () => {
    expect(apiKeyKeys.all).toEqual(['apiKeys'])
  })

  it('lists returns list key', () => {
    expect(apiKeyKeys.lists()).toEqual(['apiKeys', 'list'])
  })
})

describe('configKeys', () => {
  it('all returns base key', () => {
    expect(configKeys.all).toEqual(['config'])
  })

  it('detail returns detail key', () => {
    expect(configKeys.detail()).toEqual(['config', 'detail'])
  })
})

describe('calendarKeys', () => {
  it('all returns base key', () => {
    expect(calendarKeys.all).toEqual(['calendar'])
  })

  it('events appends date range', () => {
    expect(calendarKeys.events('2025-01-01', '2025-01-31')).toEqual(
      ['calendar', 'events', '2025-01-01', '2025-01-31'],
    )
  })
})

describe('userFactKeys', () => {
  it('all returns base key', () => {
    expect(userFactKeys.all).toEqual(['userFacts'])
  })

  it('lists returns list key', () => {
    expect(userFactKeys.lists()).toEqual(['userFacts', 'list'])
  })
})

describe('checklistTemplateKeys', () => {
  it('all returns base key', () => {
    expect(checklistTemplateKeys.all).toEqual(['checklistTemplates'])
  })

  it('lists returns list key', () => {
    expect(checklistTemplateKeys.lists()).toEqual(['checklistTemplates', 'list'])
  })

  it('details returns details key', () => {
    expect(checklistTemplateKeys.details()).toEqual(['checklistTemplates', 'detail'])
  })

  it('detail appends id', () => {
    expect(checklistTemplateKeys.detail('tpl-1')).toEqual(['checklistTemplates', 'detail', 'tpl-1'])
  })
})

// ===========================================================================
// Query stale times
// ===========================================================================

describe('QUERY_STALE_TIMES', () => {
  it('profile is 5 minutes', () => {
    expect(QUERY_STALE_TIMES.profile).toBe(5 * 60 * 1000)
  })

  it('habits is 30 seconds', () => {
    expect(QUERY_STALE_TIMES.habits).toBe(30 * 1000)
  })

  it('goals is 1 minute', () => {
    expect(QUERY_STALE_TIMES.goals).toBe(60 * 1000)
  })

  it('gamification is 5 minutes', () => {
    expect(QUERY_STALE_TIMES.gamification).toBe(5 * 60 * 1000)
  })

  it('subscriptionPlans is 1 hour', () => {
    expect(QUERY_STALE_TIMES.subscriptionPlans).toBe(60 * 60 * 1000)
  })

  it('config is 1 hour', () => {
    expect(QUERY_STALE_TIMES.config).toBe(60 * 60 * 1000)
  })

  it('tags is 2 minutes', () => {
    expect(QUERY_STALE_TIMES.tags).toBe(2 * 60 * 1000)
  })

  it('notifications is 1 minute', () => {
    expect(QUERY_STALE_TIMES.notifications).toBe(60 * 1000)
  })

  it('has all expected keys', () => {
    const keys = Object.keys(QUERY_STALE_TIMES)
    expect(keys).toContain('profile')
    expect(keys).toContain('habits')
    expect(keys).toContain('goals')
    expect(keys).toContain('gamification')
    expect(keys).toContain('subscriptionPlans')
    expect(keys).toContain('config')
    expect(keys).toContain('tags')
    expect(keys).toContain('notifications')
    expect(keys.length).toBe(8)
  })

  it('all values are positive numbers', () => {
    for (const value of Object.values(QUERY_STALE_TIMES)) {
      expect(typeof value).toBe('number')
      expect(value).toBeGreaterThan(0)
    }
  })
})
