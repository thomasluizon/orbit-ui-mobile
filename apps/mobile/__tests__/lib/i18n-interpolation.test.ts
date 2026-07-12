import { describe, expect, it } from 'vitest'

import { i18n } from '@/lib/i18n'

describe('i18n interpolation config', () => {
  it('resolves the dropped-sync toast placeholder with the app single-brace syntax', async () => {
    await i18n.changeLanguage('en')

    const message = i18n.t('common.syncDropped', {
      item: i18n.t('common.syncEntity.habits'),
    })

    expect(message).toBe("Couldn't sync your habit change")
  })

  it('resolves the dropped-sync placeholder in pt-BR too', async () => {
    await i18n.changeLanguage('pt-BR')

    const message = i18n.t('common.syncDropped', {
      item: i18n.t('common.syncEntity.goals'),
    })

    expect(message).toBe('Não foi possível sincronizar sua alteração de meta')
  })
})
