import { describe, expect, it } from 'vitest'
import en from '../i18n/en.json'
import ptBR from '../i18n/pt-BR.json'
import { DESTINATION_ICONS, SHELL_DESTINATION_IDS, getDestinationForCommand, getDestinationForLabel } from '../utils/destination-icons'
import { searchCommands } from '../utils/search-commands'

describe('Destination icon identity', () => {
  it('keeps the four roots and uses a dashboard for progress', () => {
    expect(SHELL_DESTINATION_IDS).toEqual(['hoje', 'calendario', 'progresso', 'perfil'])
    expect(DESTINATION_ICONS.progresso).toMatchObject({ outline: 'LayoutDashboard', filled: 'LayoutDashboardFilled' })
  })

  it.each(SHELL_DESTINATION_IDS)('resolves navigation labels and search commands to %s', (id) => {
    const destination = DESTINATION_ICONS[id]
    expect(getDestinationForLabel(destination.labelKey)).toBe(id)
    expect(getDestinationForCommand(destination.commandId)).toBe(id)
    const command = searchCommands('', null, (key) => key).find((item) => item.id === destination.commandId)
    expect(command?.label).toBe(destination.labelKey)
    for (const messages of [en, ptBR]) {
      expect(messages.nav[destination.commandId]).not.toBe('')
    }
  })

  it.each(['', 'missing', 'create', 'log', 'skip', 'profile.wrappedTitle', 'notifications.habit'])(
    'leaves non-destination %s outside the destination map', (key) => {
      expect(getDestinationForLabel(key)).toBeUndefined()
      expect(getDestinationForCommand(key)).toBeUndefined()
    },
  )
})
