import { describe, expect, it } from 'vitest'
import en from '../i18n/en.json'
import ptBR from '../i18n/pt-BR.json'

describe('reload notice copy', () => {
  it.each([
    { locale: 'en', words: en, update: 'Orbit was updated. Reload to continue.', account: 'Your account changed. Reload to continue.', reload: 'Reload' },
    { locale: 'pt-BR', words: ptBR, update: 'O Orbit foi atualizado. Recarregue para continuar.', account: 'Sua conta mudou. Recarregue para continuar.', reload: 'Recarregar' },
  ])('keeps the update and action guidance concise in $locale', ({ words, update, account, reload }) => {
    expect(words.errors.api.appUpdated).toBe(update)
    expect(words.errors.api.accountChanged).toBe(account)
    expect(words.errors.api.reload).toBe(reload)
  })
})
