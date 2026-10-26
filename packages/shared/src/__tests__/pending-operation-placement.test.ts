import { describe, expect, it, vi } from 'vitest'
import { pendingOperationItemSchema, revisePendingOperationRequestSchema } from '../types/ai'
import { buildChatClientContext } from '../chat/client-context'
import { createUsePendingOperationPlacement } from '../hooks/pending-operation-placement-core'
import { pendingOperationRevisionRequest } from '../hooks/pending-operation-revision-core'
import { makePlacementPreview } from '../test-support/pending-operation-preview-fixtures'

const placement = {
  selected: 'checklist_item', recommended: 'checklist_item',
  reasonKey: 'chat.placement.destinationChecklist',
  reason: { en: 'You already keep 4 checklist items here.', 'pt-BR': 'Você já tem 4 itens no checklist aqui.' },
  alternatives: ['sub_habit', 'new_parent'],
  destinationId: '11111111-1111-4111-8111-111111111111', destinationName: 'Morning routine',
}

describe('pending placement contract', () => {
  it('retains the producer placement metadata at the response boundary', () => {
    const item = pendingOperationItemSchema.parse({
      itemId: '0', entityId: null, entityName: 'Water', fields: [], stateFingerprint: 'state', placement,
    })
    expect(item).toHaveProperty('placement', placement)
  })

  it.each(['sub_habit', 'checklist_item', 'new_parent'])('retains a %s switch with client capabilities', (selected) => {
    const request = { previewFingerprint: 'preview', items: [{ itemId: '0', placement: selected }],
      clientContext: buildChatClientContext({ platform: 'web', locale: 'en' }) }
    expect(revisePendingOperationRequestSchema.parse(request)).toEqual(request)
    expect(request.clientContext).toHaveProperty('supportsPendingOperationPlacement', true)
  })

  it('accepts legacy items and rejects unrecognized placement values', () => {
    const legacy = { itemId: '0', entityId: null, entityName: 'Water', fields: [], stateFingerprint: 'state' }
    expect(pendingOperationItemSchema.parse(legacy)).toEqual(legacy)
    expect(pendingOperationItemSchema.safeParse({ ...legacy, placement: { ...placement, selected: 'unknown' } }).success).toBe(false)
  })

  it('sends only a placement patch and retains every sibling id', () => {
    const items = makePlacementPreview().items!
    const before = structuredClone(items)
    expect(pendingOperationRevisionRequest('current', items, undefined, { itemId: '0', value: 'new_parent' })).toEqual({
      previewFingerprint: 'current', items: [{ itemId: '0', placement: 'new_parent' }, { itemId: '1' }],
    })
    expect(items).toEqual(before)
  })

  it('switches offered alternatives only when the preview can revise', async () => {
    const useSwitch = createUsePendingOperationPlacement((callback) => callback)
    const items = makePlacementPreview().items!
    const revise = vi.fn().mockResolvedValue(true)
    await expect(useSwitch(items, revise, true)('0', 'new_parent')).resolves.toBe(false)
    await expect(useSwitch(items, revise, false)('0', 'checklist_item')).resolves.toBe(false)
    await expect(useSwitch(items, revise, false)('1', 'new_parent')).resolves.toBe(false)
    expect(revise).not.toHaveBeenCalled()
    await expect(useSwitch(items, revise, false)('0', 'sub_habit')).resolves.toBe(true)
    expect(revise).toHaveBeenCalledExactlyOnceWith(items, undefined, { itemId: '0', value: 'sub_habit' })
  })
})
