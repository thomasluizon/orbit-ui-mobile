import { describe, expect, it } from 'vitest'
import {
  accountabilityKeys,
  aiKeys,
  challengeKeys,
  checklistTemplateKeys,
  cheerKeys,
  calendarKeys,
  friendKeys,
  gamificationKeys,
  goalKeys,
  habitKeys,
  subscriptionKeys,
  uploadMutationKeys,
  versionCheckKeys,
} from '../query/keys'

describe('habit query keys', () => {
  it('builds full-detail and suggestion keys', () => {
    expect(habitKeys.fullDetails()).toEqual(['habits', 'fullDetail'])
    expect(habitKeys.fullDetail('h-1')).toEqual(['habits', 'fullDetail', 'h-1'])
    expect(habitKeys.summaryPrefix()).toEqual(['habits', 'summary'])
    expect(habitKeys.rescheduleSuggestion('h-1')).toEqual(['habits', 'reschedule-suggestion', 'h-1'])
    expect(habitKeys.trends('30d')).toEqual(['habits', 'trends', '30d'])
  })

  it('nests full-detail under the fullDetails prefix', () => {
    const detail = habitKeys.fullDetail('h-9')
    expect(detail.slice(0, habitKeys.fullDetails().length)).toEqual(habitKeys.fullDetails())
  })
})

describe('goal and gamification keys', () => {
  it('builds progress history and recap keys', () => {
    expect(goalKeys.progressHistory('g-1')).toEqual(['goals', 'progress-history', 'g-1'])
    expect(gamificationKeys.recap('week')).toEqual(['gamification', 'recap', 'week'])
    expect(gamificationKeys.streakHistory()).toEqual(['gamification', 'streak-history'])
    expect(gamificationKeys.xpHistory('90d')).toEqual(['gamification', 'xp-history', '90d'])
  })
})

describe('social and subscription keys', () => {
  it('builds friend, cheer, challenge and accountability keys', () => {
    expect(friendKeys.list()).toEqual(['friends', 'list'])
    expect(friendKeys.feed()).toEqual(['friends', 'feed'])
    expect(friendKeys.profile('u-1')).toEqual(['friends', 'profile', 'u-1'])
    expect(friendKeys.invitePreview('code-1')).toEqual(['friends', 'invitePreview', 'code-1'])
    expect(cheerKeys.list('received')).toEqual(['cheers', 'list', 'received'])
    expect(cheerKeys.list('sent')).toEqual(['cheers', 'list', 'sent'])
    expect(challengeKeys.detail('c-1')).toEqual(['challenges', 'detail', 'c-1'])
    expect(accountabilityKeys.pairs()).toEqual(['accountability', 'pairs'])
    expect(accountabilityKeys.checkIns('p-1')).toEqual(['accountability', 'check-ins', 'p-1'])
  })

  it('builds subscription billing keys', () => {
    expect(subscriptionKeys.billing()).toEqual(['subscriptions', 'billing'])
  })
})

describe('config-adjacent keys', () => {
  it('builds checklist, calendar, ai, version and upload keys', () => {
    expect(checklistTemplateKeys.lists()).toEqual(['checklistTemplates', 'list'])
    expect(calendarKeys.autoSyncState()).toEqual(['calendar', 'auto-sync-state'])
    expect(calendarKeys.syncSuggestions()).toEqual(['calendar', 'sync-suggestions'])
    expect(calendarKeys.calendars()).toEqual(['calendar', 'calendars'])
    expect(aiKeys.capabilities()).toEqual(['ai', 'capabilities'])
    expect(versionCheckKeys.latest('mobile')).toEqual(['version-check', 'mobile'])
    expect(uploadMutationKeys.sign()).toEqual(['uploads', 'sign'])
  })
})
