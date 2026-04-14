import { describe, it, expect } from 'vitest'
import { API } from '../api/endpoints'

// ===========================================================================
// API endpoint constants
// ===========================================================================

describe('API endpoints', () => {
  describe('auth', () => {
    it('has correct static paths', () => {
      expect(API.auth.sendCode).toBe('/api/auth/send-code')
      expect(API.auth.verifyCode).toBe('/api/auth/verify-code')
      expect(API.auth.google).toBe('/api/auth/google')
      expect(API.auth.logout).toBe('/api/auth/logout')
      expect(API.auth.requestDeletion).toBe('/api/auth/request-deletion')
      expect(API.auth.confirmDeletion).toBe('/api/auth/confirm-deletion')
    })
  })

  describe('profile', () => {
    it('has correct static paths', () => {
      expect(API.profile.get).toBe('/api/profile')
      expect(API.profile.timezone).toBe('/api/profile/timezone')
      expect(API.profile.weekStartDay).toBe('/api/profile/week-start-day')
      expect(API.profile.aiMemory).toBe('/api/profile/ai-memory')
      expect(API.profile.aiSummary).toBe('/api/profile/ai-summary')
      expect(API.profile.onboarding).toBe('/api/profile/onboarding')
      expect(API.profile.language).toBe('/api/profile/language')
      expect(API.profile.themePreference).toBe('/api/profile/theme-preference')
      expect(API.profile.colorScheme).toBe('/api/profile/color-scheme')
      expect(API.profile.reset).toBe('/api/profile/reset')
    })
  })

  describe('habits', () => {
    it('has correct static paths', () => {
      expect(API.habits.list).toBe('/api/habits')
      expect(API.habits.create).toBe('/api/habits')
      expect(API.habits.bulk).toBe('/api/habits/bulk')
      expect(API.habits.bulkLog).toBe('/api/habits/bulk/log')
      expect(API.habits.bulkSkip).toBe('/api/habits/bulk/skip')
      expect(API.habits.reorder).toBe('/api/habits/reorder')
      expect(API.habits.summary).toBe('/api/habits/summary')
      expect(API.habits.calendarMonth).toBe('/api/habits/calendar-month')
      expect(API.habits.retrospective).toBe('/api/habits/retrospective')
    })

    it('has correct parameterized paths', () => {
      expect(API.habits.get('h-1')).toBe('/api/habits/h-1')
      expect(API.habits.update('h-2')).toBe('/api/habits/h-2')
      expect(API.habits.delete('h-3')).toBe('/api/habits/h-3')
      expect(API.habits.detail('h-1')).toBe('/api/habits/h-1/detail')
      expect(API.habits.log('h-1')).toBe('/api/habits/h-1/log')
      expect(API.habits.skip('h-1')).toBe('/api/habits/h-1/skip')
      expect(API.habits.duplicate('h-1')).toBe('/api/habits/h-1/duplicate')
      expect(API.habits.checklist('h-1')).toBe('/api/habits/h-1/checklist')
      expect(API.habits.parent('h-1')).toBe('/api/habits/h-1/parent')
      expect(API.habits.subHabits('h-1')).toBe('/api/habits/h-1/sub-habits')
      expect(API.habits.goals('h-1')).toBe('/api/habits/h-1/goals')
      expect(API.habits.metrics('h-1')).toBe('/api/habits/h-1/metrics')
    })

    it('parameterized paths handle special characters in id', () => {
      expect(API.habits.get('abc-123-def')).toBe('/api/habits/abc-123-def')
    })
  })

  describe('goals', () => {
    it('has correct static paths', () => {
      expect(API.goals.list).toBe('/api/goals')
      expect(API.goals.create).toBe('/api/goals')
      expect(API.goals.reorder).toBe('/api/goals/reorder')
      expect(API.goals.review).toBe('/api/goals/review')
    })

    it('has correct parameterized paths', () => {
      expect(API.goals.get('g-1')).toBe('/api/goals/g-1')
      expect(API.goals.update('g-1')).toBe('/api/goals/g-1')
      expect(API.goals.delete('g-1')).toBe('/api/goals/g-1')
      expect(API.goals.detail('g-1')).toBe('/api/goals/g-1/detail')
      expect(API.goals.progress('g-1')).toBe('/api/goals/g-1/progress')
      expect(API.goals.status('g-1')).toBe('/api/goals/g-1/status')
      expect(API.goals.habits('g-1')).toBe('/api/goals/g-1/habits')
      expect(API.goals.metrics('g-1')).toBe('/api/goals/g-1/metrics')
    })
  })

  describe('tags', () => {
    it('has correct static paths', () => {
      expect(API.tags.list).toBe('/api/tags')
      expect(API.tags.create).toBe('/api/tags')
    })

    it('has correct parameterized paths', () => {
      expect(API.tags.update('t-1')).toBe('/api/tags/t-1')
      expect(API.tags.delete('t-1')).toBe('/api/tags/t-1')
      expect(API.tags.assign('h-1')).toBe('/api/tags/h-1/assign')
    })
  })

  describe('notifications', () => {
    it('has correct static paths', () => {
      expect(API.notifications.list).toBe('/api/notifications')
      expect(API.notifications.markAllRead).toBe('/api/notifications/read-all')
      expect(API.notifications.deleteAll).toBe('/api/notifications/all')
      expect(API.notifications.subscribe).toBe('/api/notifications/subscribe')
      expect(API.notifications.unsubscribe).toBe('/api/notifications/unsubscribe')
      expect(API.notifications.testPush).toBe('/api/notifications/test-push')
    })

    it('has correct parameterized paths', () => {
      expect(API.notifications.markRead('n-1')).toBe('/api/notifications/n-1/read')
      expect(API.notifications.delete('n-1')).toBe('/api/notifications/n-1')
    })
  })

  describe('subscription', () => {
    it('has correct static paths', () => {
      expect(API.subscription.checkout).toBe('/api/subscriptions/checkout')
      expect(API.subscription.portal).toBe('/api/subscriptions/portal')
      expect(API.subscription.status).toBe('/api/subscriptions/status')
      expect(API.subscription.plans).toBe('/api/subscriptions/plans')
      expect(API.subscription.billing).toBe('/api/subscriptions/billing')
      expect(API.subscription.adReward).toBe('/api/subscriptions/ad-reward')
    })
  })

  describe('gamification', () => {
    it('has correct static paths', () => {
      expect(API.gamification.profile).toBe('/api/gamification/profile')
      expect(API.gamification.achievements).toBe('/api/gamification/achievements')
      expect(API.gamification.streak).toBe('/api/gamification/streak')
      expect(API.gamification.streakFreeze).toBe('/api/gamification/streak/freeze')
    })
  })

  describe('chat', () => {
    it('has correct static path', () => {
      expect(API.chat.send).toBe('/api/chat')
    })
  })

  describe('ai', () => {
    it('has correct static paths', () => {
      expect(API.ai.capabilities).toBe('/api/ai/capabilities')
      expect(API.ai.operations).toBe('/api/ai/operations')
      expect(API.ai.dataCatalog).toBe('/api/ai/data-catalog')
      expect(API.ai.surfaces).toBe('/api/ai/surfaces')
    })

    it('has correct parameterized pending-operation paths', () => {
      expect(API.ai.pendingOperationConfirm('op-1')).toBe('/api/ai/pending-operations/op-1/confirm')
      expect(API.ai.pendingOperationStepUp('op-1')).toBe('/api/ai/pending-operations/op-1/step-up')
      expect(API.ai.pendingOperationVerifyStepUp('op-1')).toBe('/api/ai/pending-operations/op-1/step-up/verify')
      expect(API.ai.pendingOperationExecute('op-1')).toBe('/api/ai/pending-operations/op-1/execute')
    })
  })

  describe('userFacts', () => {
    it('has correct static paths', () => {
      expect(API.userFacts.list).toBe('/api/user-facts')
      expect(API.userFacts.bulk).toBe('/api/user-facts/bulk')
    })

    it('has correct parameterized paths', () => {
      expect(API.userFacts.delete('f-1')).toBe('/api/user-facts/f-1')
    })
  })

  describe('calendar', () => {
    it('has correct static paths', () => {
      expect(API.calendar.events).toBe('/api/calendar/events')
      expect(API.calendar.dismiss).toBe('/api/calendar/dismiss')
    })
  })

  describe('support', () => {
    it('has correct static path', () => {
      expect(API.support.send).toBe('/api/support')
    })
  })

  describe('referral', () => {
    it('has correct static path', () => {
      expect(API.referral.dashboard).toBe('/api/referrals/dashboard')
    })
  })

  describe('apiKeys', () => {
    it('has correct static paths', () => {
      expect(API.apiKeys.list).toBe('/api/api-keys')
      expect(API.apiKeys.create).toBe('/api/api-keys')
    })

    it('has correct parameterized paths', () => {
      expect(API.apiKeys.delete('k-1')).toBe('/api/api-keys/k-1')
    })
  })

  describe('config', () => {
    it('has correct static path', () => {
      expect(API.config.get).toBe('/api/config')
    })
  })

  describe('sync', () => {
    it('has correct static paths', () => {
      expect(API.sync.batch).toBe('/api/sync/batch')
      expect(API.sync.changes).toBe('/api/sync/changes')
      expect(API.sync.changesV2).toBe('/api/sync/v2/changes')
    })
  })

  describe('checklistTemplates', () => {
    it('has correct static paths', () => {
      expect(API.checklistTemplates.list).toBe('/api/checklist-templates')
      expect(API.checklistTemplates.create).toBe('/api/checklist-templates')
    })

    it('has correct parameterized paths', () => {
      expect(API.checklistTemplates.delete('tpl-1')).toBe('/api/checklist-templates/tpl-1')
    })
  })

  describe('all paths start with /api/', () => {
    function collectPaths(obj: Record<string, unknown>, prefix = ''): string[] {
      const paths: string[] = []
      for (const [key, value] of Object.entries(obj)) {
        const fullKey = prefix ? `${prefix}.${key}` : key
        if (typeof value === 'string') {
          paths.push(value)
        } else if (typeof value === 'function') {
          paths.push((value as (id: string) => string)('test-id'))
        } else if (typeof value === 'object' && value !== null) {
          paths.push(...collectPaths(value as Record<string, unknown>, fullKey))
        }
      }
      return paths
    }

    it('every endpoint starts with /api/', () => {
      const paths = collectPaths(API as unknown as Record<string, unknown>)
      for (const path of paths) {
        expect(path).toMatch(/^\/api\//)
      }
    })
  })
})
