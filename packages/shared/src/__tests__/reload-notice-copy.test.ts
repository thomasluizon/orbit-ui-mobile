import { describe, expect, it } from 'vitest'
import en from '../i18n/en.json'
import ptBR from '../i18n/pt-BR.json'

describe('reload notice copy', () => {
  it.each([
    { locale: 'en', words: en, update: 'Orbit updated. Reload to continue. Unsaved changes will be lost.', account: 'Your account changed. Reload to continue.', reload: 'Reload' },
    { locale: 'pt-BR', words: ptBR, update: 'Orbit atualizado. Recarregue para continuar. Você perde o que não salvou.', account: 'Sua conta mudou. Recarregue para continuar.', reload: 'Recarregar' },
  ])('keeps the update, action and unsaved changes warning concise in $locale', ({ words, update, account, reload }) => {
    expect(words.errors.api.appUpdated).toBe(update)
    expect(words.errors.api.accountChanged).toBe(account)
    expect(words.errors.api.reload).toBe(reload)
  })
})
