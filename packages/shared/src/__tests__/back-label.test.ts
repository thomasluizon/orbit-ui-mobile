import { describe, expect, it } from 'vitest'
import en from '../i18n/en.json'
import ptBR from '../i18n/pt-BR.json'
import { getBackLabel } from '../utils/back-label'

function translate(messages: typeof en, key: string, values?: { destination: string }): string {
  const message: unknown = key.split('.').reduce<unknown>((current, part) => (current as Record<string, unknown>)[part], messages)
  if (typeof message !== 'string') throw new Error(`Missing translation: ${key}`)
  return values ? message.replace('{destination}', values.destination) : message
}

describe.each([en, ptBR])('back label', (messages) => {
  it.each([
    ['/', messages.common.backToToday],
    ['/profile', messages.common.backToProfile],
    ['/login', messages.auth.backToLogin],
    ['/calendar?view=month', messages.common.backToDestination.replace('{destination}', messages.nav.calendar)],
    ['/habits/new?draft=retained', messages.common.backToDestination.replace('{destination}', messages.habits.form.newHabit)],
    ['/habits/habit-id', messages.common.backToDestination.replace('{destination}', messages.habits.detail.screenTitle)],
    ['/(tabs)', messages.common.backToToday],
    ['/profile/notifications', messages.common.backToDestination.replace('{destination}', messages.profile.groups.notifications)],
    ['/profile/account', messages.common.backToDestination.replace('{destination}', messages.profile.submenus.account)],
    ['/profile/preferences', messages.common.backToDestination.replace('{destination}', messages.profile.submenus.preferences)],
    ['/progress', messages.common.backToDestination.replace('{destination}', messages.nav.progress)],
    ['/wrapped', messages.common.backToDestination.replace('{destination}', messages.wrapped.title)],
    ['/notifications', messages.common.backToDestination.replace('{destination}', messages.notifications.title)],
    ['/search', messages.common.backToDestination.replace('{destination}', messages.habits.search.title)],
    ['/privacy', messages.common.backToDestination.replace('{destination}', messages.privacy.title)],
    ['/terms', messages.common.backToDestination.replace('{destination}', messages.terms.title)],
    ['/upgrade', messages.common.backToDestination.replace('{destination}', messages.upgrade.pitchTitle)],
    ['/chat', messages.common.backToDestination.replace('{destination}', messages.chat.title)],
    ['/profile/astra', messages.common.backToDestination.replace('{destination}', messages.profile.groups.astra)],
    ['/about#links', messages.common.backToDestination.replace('{destination}', messages.about.title)],
    ['/support', messages.common.backToDestination.replace('{destination}', messages.profile.support.title)],
  ])('names %s', (route, expected) => {
    expect(getBackLabel(route, (key, values) => translate(messages, key, values))).toBe(expected)
  })

  it.each([undefined, '/unrecognized'])('does not claim a destination for %s', (route) => {
    expect(getBackLabel(route, (key, values) => translate(messages, key, values))).toBe(messages.common.back)
  })
})
