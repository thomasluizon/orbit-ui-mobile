import { describe, expect, it, vi } from 'vitest'
import type { z } from 'zod'
import { buildChatClientContext } from '../chat/client-context'
import { astraOfferDestination, canShowAstraOffer } from '../chat/astra-offer'
import { readBlockMetadataSchema } from '../types/chat'
import { pendingAgentOperationSchema, revisePendingOperationRequestSchema } from '../types/ai'
import { astraOfferFixture, makeOfferedPreview, offeredReadFixture, offerConversationId } from '../test-support/astra-offer-fixtures'
import { pendingOperationDraft, pendingOperationEdits, pendingOperationRevisionRequest } from '../hooks/pending-operation-revision-core'
import { changePreviewFieldInput, previewFieldInputs } from '../hooks/preview-field-core'
const { PostApiChatOffersDismissBody } = await vi.importActual<{ PostApiChatOffersDismissBody: z.ZodObject }>('../types/__generated__/api.generated')
import { dismissConversationOffersRequestSchema } from '../types/astra-offer'

describe('negotiated Astra offers', () => {
  it.each(['web', 'mobile'] as const)('requires the capability and a conversation on %s', platform => {
    const legacy = buildChatClientContext({ platform, locale: 'en' })
    expect(legacy.supportsProactiveOffers).toBeUndefined()
    expect(canShowAstraOffer(astraOfferFixture, legacy, [])).toBe(false)
    const enabled = buildChatClientContext({ platform, locale: 'pt-BR', conversationId: offerConversationId })
    expect(enabled.supportsProactiveOffers).toBe(true)
    expect(canShowAstraOffer(astraOfferFixture, enabled, [])).toBe(true)
    expect(canShowAstraOffer(astraOfferFixture, { ...enabled, supportsProactiveOffers: false }, [])).toBe(false)
    expect(canShowAstraOffer(astraOfferFixture, enabled, [astraOfferFixture.offerKey])).toBe(false)
  })
  it('retains legacy reads and ignores a malformed optional action', () => {
    const { nextAction: _action, ...legacy } = offeredReadFixture.read
    expect(readBlockMetadataSchema.parse(legacy).nextAction).toBeUndefined()
    expect(readBlockMetadataSchema.parse({ ...legacy, nextAction: { kind: 'invented' } }).nextAction).toBeNull()
  })
  it('uses only known surface routes', () => {
    expect(astraOfferDestination({ ...astraOfferFixture, kind: 'openSurface', surface: 'calendar-sync' })).toBe('/calendar?import=1')
    expect(astraOfferDestination({ ...astraOfferFixture, kind: 'openSurface', surface: 'https://outside.invalid' })).toBeUndefined()
  })
  it('matches the pinned dismissal producer without reading a response body', () => {
    const request = { conversationId: offerConversationId, offerKeys: [astraOfferFixture.offerKey] }
    expect(dismissConversationOffersRequestSchema.parse(PostApiChatOffersDismissBody.parse(request))).toEqual(request)
  })
  it('keeps exact nested paths and grouped removal in a preview revision', () => {
    const operation = makeOfferedPreview()
    const item = operation.items![0]!
    const removal = item.fields[2]!.removal!
    const request = pendingOperationRevisionRequest(operation.previewFingerprint!, [item], undefined, undefined, { itemId: item.itemId, fields: removal.fields! })
    expect(revisePendingOperationRequestSchema.parse(request).items).toEqual([{ itemId: '0', removeSuggestedFields: ['reminder_enabled', 'repeat_reminder'] }])
    expect(pendingAgentOperationSchema.parse(operation).items![0]!.fields[2]!.provenance).toBe('suggested')
  })
  it('edits repeat reminder controls as an object and retains the other settings', () => {
    const item = makeOfferedPreview().items![0]!
    const draft = pendingOperationDraft(item)
    const input = previewFieldInputs(draft.repeat_reminder!, 'repeat_reminder').find(entry => entry.name === 'interval_minutes')!
    const next = changePreviewFieldInput(draft.repeat_reminder!, input, '180')
    expect(pendingOperationEdits(item, { ...draft, repeat_reminder: next })).toEqual({ repeat_reminder: { interval_minutes: 180, active_start: '08:00', active_end: '22:00' } })
  })
  it('retains the exact slash path when editing a nested offered reminder', () => {
    const item = makeOfferedPreview().items![0]!
    const field = { ...item.fields[2]!, field: 'sub_habits/0/repeat_reminder' }
    const nested = { ...item, fields: [field] }
    const draft = pendingOperationDraft(nested)
    const inputs = previewFieldInputs(draft[field.field]!, field.field)
    const interval = inputs.find(input => input.name === 'interval_minutes')!
    const changed = changePreviewFieldInput(draft[field.field]!, interval, '180')
    expect(pendingOperationEdits(nested, { [field.field]: changed })).toEqual({
      'sub_habits/0/repeat_reminder': { interval_minutes: 180, active_start: '08:00', active_end: '22:00' },
    })
  })
  it('preserves the boolean type of an offered slip alert', () => {
    const item = makeOfferedPreview().items![0]!
    const alert = { ...item, fields: [{ ...item.fields[1]!, field: 'slip_alert_enabled' }] }
    expect(pendingOperationEdits(alert, { slip_alert_enabled: 'false' })).toEqual({ slip_alert_enabled: false })
  })
})
