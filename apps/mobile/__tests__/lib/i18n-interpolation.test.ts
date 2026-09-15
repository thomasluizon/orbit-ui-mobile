import { describe, expect, it } from 'vitest'

import { i18n } from '@/lib/i18n'

describe('i18n interpolation config', () => {
  it('resolves the dropped-sync toast placeholder with the app single-brace syntax', async () => {
    await i18n.changeLanguage('en')

    const message = i18n.t('common.syncDropped', {
      item: i18n.t('common.syncEntity.habits'),
    })

    expect(message).toBe('The log for habit did not go up and was dropped.')
  })

  it('resolves the dropped-sync placeholder in pt-BR too', async () => {
    await i18n.changeLanguage('pt-BR')

    const message = i18n.t('common.syncDropped', {
      item: i18n.t('common.syncEntity.goals'),
    })

    expect(message).toBe('O registro de meta não subiu e foi descartado.')
  })
})
