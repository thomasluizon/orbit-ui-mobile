import { describe, expect, it } from 'vitest'
import en from '../i18n/en.json'
import ptBR from '../i18n/pt-BR.json'
import { getBackLabel } from '../utils/back-label'

function translate(messages: typeof en, key: string, values?: { destination: string }): string {
  const message: unknown = key.split('.').reduce<unknown>((current, part) => (current as Record<string, unknown>)[part], messages)
  if (typeof message !== 'string') throw new Error(`Missing translation: ${key}`)
  return values ? message.replace('{destination}', values.destination) : message
}

const approvedLabels = [
  ['/', 'Back to Today', 'Voltar para Hoje'],
  ['/profile', 'Back to Profile', 'Voltar para Perfil'],
  ['/login', 'Back to Sign in', 'Voltar para Entrar'],
  ['/search', 'Back to Search', 'Voltar para Busca'],
  ['/habits/habit-id', 'Back to the habit', 'Voltar para o hábito'],
  ['/calendar', 'Back to Calendar', 'Voltar para Calendário'],
  ['/calendar-sync', 'Back to Calendar', 'Voltar para Calendário'],
  ['/progress', 'Back to Progress', 'Voltar para Progresso'],
  ['/profile/astra', 'Back to Astra', 'Voltar para Astra'],
  ['/profile/account', 'Back to Account', 'Voltar para Conta'],
  ['/profile/preferences', 'Back to Preferences', 'Voltar para Preferências'],
  ['/profile/notifications', 'Back to Notifications', 'Voltar para Notificações'],
  ['/habits/new', 'Back to New habit', 'Voltar para Novo hábito'],
  ['/chat', 'Back to Astra', 'Voltar para Astra'],
  ['/about', 'Back to About', 'Voltar para Sobre'],
  ['/support', 'Back to Support', 'Voltar para Suporte'],
  ['/wrapped', 'Back to Orbit Wrapped', 'Voltar para Orbit Wrapped'],
  ['/notifications', 'Back to Alerts', 'Voltar para Avisos'],
  ['/privacy', 'Back to Privacy policy', 'Voltar para Política de privacidade'],
  ['/terms', 'Back to Terms of use', 'Voltar para Termos de uso'],
  ['/upgrade', 'Back to Orbit Pro', 'Voltar para Orbit Pro'],
  ['/unrecognized', 'Go back', 'Voltar'],
] as const

describe.each([
  { locale: 'en', messages: en, column: 1, parentLabel: 'Back to the parent habit' },
  { locale: 'pt-BR', messages: ptBR, column: 2, parentLabel: 'Voltar para o hábito principal' },
] as const)('approved back copy in $locale', ({ messages, column, parentLabel }) => {
  it.each(approvedLabels)('renders %s from the real catalog', (route, english, portuguese) => {
    expect(getBackLabel(route, (key, values) => translate(messages, key, values))).toBe(column === 1 ? english : portuguese)
  })

  it('renders the parent habit label from the real catalog', () => {
    expect(translate(messages, 'common.backToParentHabit')).toBe(parentLabel)
  })
})

describe.each([en, ptBR])('back label', (messages) => {
  it.each([
    ['/', messages.common.backToToday],
    ['/profile', messages.common.backToProfile],
    ['/login', messages.common.backToDestination.replace('{destination}', messages.auth.signIn)],
    ['/calendar?view=month', messages.common.backToDestination.replace('{destination}', messages.nav.calendar)],
    ['/habits/new?draft=retained', messages.common.backToDestination.replace('{destination}', messages.habits.form.newHabit)],
    ['/habits/habit-id', messages.common.backToHabit],
    ['/(tabs)', messages.common.backToToday],
    ['/profile/notifications', messages.common.backToDestination.replace('{destination}', messages.profile.groups.notifications)],
    ['/profile/account', messages.common.backToDestination.replace('{destination}', messages.profile.submenus.account)],
    ['/profile/preferences', messages.common.backToDestination.replace('{destination}', messages.profile.submenus.preferences)],
    ['/progress', messages.common.backToDestination.replace('{destination}', messages.nav.progress)],
    ['/wrapped', messages.common.backToDestination.replace('{destination}', messages.wrapped.title)],
    ['/notifications', messages.common.backToDestination.replace('{destination}', messages.notifications.title)],
    ['/search', messages.common.backToDestination.replace('{destination}', messages.habits.search.screenTitle)],
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
