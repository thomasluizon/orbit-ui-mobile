import { describe, expect, it, vi } from 'vitest'
import { createUseAstraOffer, type AstraOfferProps } from '../chat/astra-offer'
import { astraOfferFixture, offerConversationId } from '../test-support/astra-offer-fixtures'
import { createHookStateHarness } from '../test-support/hook-state'

function setup(props: Partial<AstraOfferProps> = {}) {
  const harness = createHookStateHarness()
  const session = { conversationId: offerConversationId as string | null, dismissedOfferKeys: [] as string[], generation: 0 }
  const dismiss = vi.fn(async () => {})
  const send = vi.fn(async () => {})
  const navigate = vi.fn()
  const useOffer = createUseAstraOffer({
    useState: harness.useState, getSession: () => ({ ...session }), getAccountGeneration: () => session.generation,
    dismiss, rememberDismissal: key => { session.dismissedOfferKeys.push(key) },
  })
  const options: AstraOfferProps = { action: astraOfferFixture, onSendMessage: send, ...props }
  return { session, dismiss, send, navigate, options, render: (enabled = true) => harness.render(() => useOffer(options, enabled, navigate)) }
}

describe('offer session actions', () => {
  it('dismisses only the acknowledged offer and hides it in the same session', async () => {
    const context = setup()
    await context.render().dismiss()
    expect(context.dismiss).toHaveBeenCalledWith(offerConversationId, [astraOfferFixture.offerKey], expect.any(Function))
    expect(context.session.dismissedOfferKeys).toEqual([astraOfferFixture.offerKey])
    expect(context.render().visible).toBe(false)
    expect(context.send).not.toHaveBeenCalled()
  })
  it.each(['continueChat', 'preparePreview'] as const)('sends %s selections without preemptively consuming them', async kind => {
    const context = setup({ action: { ...astraOfferFixture, kind } })
    await context.render().act()
    expect(context.send).toHaveBeenCalledExactlyOnceWith(astraOfferFixture.prompt, { selectedOfferKey: astraOfferFixture.offerKey })
    expect(context.session.dismissedOfferKeys).toEqual([])
    expect(context.dismiss).not.toHaveBeenCalled()
  })
  it('navigates to a known destination only after acknowledgement', async () => {
    const context = setup({ action: { ...astraOfferFixture, kind: 'openSurface', surface: 'calendar-sync' } })
    await context.render().act()
    expect(context.navigate).toHaveBeenCalledExactlyOnceWith('/calendar?import=1')
    expect(context.session.dismissedOfferKeys).toEqual([astraOfferFixture.offerKey])
  })
  it('retains a failed dismissal and clears its status after a successful retry', async () => {
    const context = setup()
    context.dismiss.mockRejectedValueOnce(new Error('offline'))
    await context.render().dismiss()
    expect(context.render()).toMatchObject({ failed: true, pending: false, visible: true })
    await context.render().dismiss()
    expect(context.render()).toMatchObject({ failed: false, pending: false, visible: false })
  })
  it.each(['account', 'conversation'] as const)('ignores an acknowledgement for a replaced %s', async replacement => {
    const context = setup({ action: { ...astraOfferFixture, kind: 'openSurface', surface: 'referrals' } })
    let complete!: () => void
    context.dismiss.mockImplementationOnce(() => new Promise<void>(resolve => { complete = resolve }))
    const sending = context.render().act()
    expect(context.render().pending).toBe(true)
    if (replacement === 'account') context.session.generation += 1
    else context.session.conversationId = null
    complete()
    await sending
    expect(context.navigate).not.toHaveBeenCalled()
    expect(context.session.dismissedOfferKeys).toEqual([])
  })
  it('locks duplicate presses until the original request settles', async () => {
    const context = setup()
    let complete!: () => void
    context.dismiss.mockImplementationOnce(() => new Promise<void>(resolve => { complete = resolve }))
    const action = context.render()
    const first = action.dismiss()
    await action.dismiss()
    await action.act()
    expect(context.dismiss).toHaveBeenCalledTimes(1)
    expect(context.send).not.toHaveBeenCalled()
    complete()
    await first
  })
  it.each([
    { isOnline: false, reason: 'chat.offline.title', dismissDisabled: true },
    { isSending: true, reason: 'blockFrame.status.acting', dismissDisabled: false },
    { atMessageLimit: true, reason: 'shell.composer.limit.exhausted', dismissDisabled: false },
    { dailyBudgetReached: true, reason: 'chat.dailyBudgetReached', dismissDisabled: false },
  ])('keeps the correct action boundaries for $reason', async ({ reason, dismissDisabled, ...availability }) => {
    const interaction = { isOnline: true, isSending: false, atMessageLimit: false, dailyBudgetReached: false, ...availability }
    const context = setup({ interaction: { ...interaction, send: vi.fn(), allowance: 5, limitReason: '' } })
    expect(context.render()).toMatchObject({ disabled: true, reason, dismissDisabled })
    await context.render().act()
    expect(context.send).not.toHaveBeenCalled()
  })
  it('rejects absent, unsupported and non-negotiated offers', async () => {
    const context = setup({ action: null })
    expect(context.render().visible).toBe(false)
    await context.render().act()
    context.options.action = { ...astraOfferFixture, kind: 'openSurface', surface: '/invented' }
    expect(context.render().visible).toBe(false)
    context.options.action = astraOfferFixture
    expect(context.render(false).visible).toBe(false)
    context.session.conversationId = null
    expect(context.render().visible).toBe(false)
    expect(context.dismiss).not.toHaveBeenCalled()
    expect(context.send).not.toHaveBeenCalled()
  })
})
