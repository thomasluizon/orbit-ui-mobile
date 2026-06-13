import { describe, expect, it } from 'vitest'
import { resolveDismissGuardAction } from '../hooks/dismiss-guard-core'

describe('resolveDismissGuardAction', () => {
  it('opens the discard dialog instead of dismissing a dirty form', () => {
    expect(resolveDismissGuardAction('request', true)).toEqual({
      showDiscardDialog: true,
      shouldDismiss: false,
    })
  })

  it('dismisses a clean form immediately', () => {
    expect(resolveDismissGuardAction('request', false)).toEqual({
      showDiscardDialog: false,
      shouldDismiss: true,
    })
  })

  it('confirm closes the dialog and dismisses regardless of dirtiness', () => {
    expect(resolveDismissGuardAction('confirm', true)).toEqual({
      showDiscardDialog: false,
      shouldDismiss: true,
    })
  })

  it('cancel closes the dialog without dismissing', () => {
    expect(resolveDismissGuardAction('cancel', true)).toEqual({
      showDiscardDialog: false,
      shouldDismiss: false,
    })
  })
})
