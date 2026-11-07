import { describe, expect, it } from 'vitest'
import { chatClientContextSchema, chatResponseSchema } from '../types/chat'
import { conversationPageSchema, conversationPreviewOutcomeSchema } from '../types/conversation'

const conversationId = '00000000-0000-4000-8000-000000000001'
const turnId = '00000000-0000-4000-8000-000000000002'

describe('server conversation contract', () => {
  it('accepts the complete producer page and preserves a lossless order cursor', () => {
    const page = {
      conversationId, beforeOrder: '9223372036854775806', turns: [{
        turnId, order: '9223372036854775806', role: 'user', createdAtUtc: '2026-01-01T00:00:00Z',
        content: 'Review this image', responseJson: null, previewOutcomesJson: '[]',
        image: { fileName: `${turnId}.png`, contentType: 'image/png', sha256: 'hash',
          url: `/api/chat/conversations/${conversationId}/images/${turnId}` },
      }],
    }
    expect(conversationPageSchema.parse(page)).toEqual(page)
    expect(conversationPageSchema.safeParse({ ...page, beforeOrder: 1.5 }).success).toBe(false)
  })

  it('accepts every producer outcome with its default serializer casing', () => {
    for (const Outcome of ['approved', 'edited', 'rejected', 'expired', 'pending']) {
      expect(conversationPreviewOutcomeSchema.parse({ PendingOperationId: turnId, Outcome, Arguments: {}, Revision: 2 }).Outcome).toBe(Outcome)
    }
  })

  it('keeps the approved preview words of a revised outcome and still reads an older outcome without them', () => {
    const stored = JSON.parse('{"PendingOperationId":"ae2641d6-5fb1-4500-85ca-0e55c6d0b3ec","Outcome":"approved","Arguments":{"title":"Ler 30 paginas 2048","frequency_unit":"Day","frequency_quantity":1},"Revision":3,"Execution":{"operationId":"create_habit","sourceName":"create_habit","riskClass":"Low","confirmationRequirement":"FreshConfirmation","status":"Succeeded","summary":"Create Habit requested via Chat","targetId":"42169ec6-3d2a-474b-b844-f2156ae548e9","targetName":"Ler 30 paginas 2048","policyReason":null,"pendingOperationId":null,"payload":null,"access":"write"},"RevisedPreview":{"changes":[{"entityId":"00000000-0000-0000-0000-000000000000","entityName":"Ler 30 paginas 2048","field":"title","oldValue":null,"newValue":"Ler 30 paginas 2048","valueType":"text","proposedValue":"Ler 30 paginas 2048","isEditable":true},{"entityId":"00000000-0000-0000-0000-000000000000","entityName":"Ler 30 paginas 2048","field":"frequency_quantity","oldValue":null,"newValue":"1","valueType":"number","proposedValue":1,"isEditable":true},{"entityId":"00000000-0000-0000-0000-000000000000","entityName":"Ler 30 paginas 2048","field":"frequency_unit","oldValue":null,"newValue":"Day","valueType":"text","proposedValue":"Day","isEditable":true}],"changeTargetCount":1,"items":[{"itemId":"0","entityId":null,"entityName":"Ler 30 paginas 2048","fields":[{"entityId":"00000000-0000-0000-0000-000000000000","entityName":"Ler 30 paginas 2048","field":"title","oldValue":null,"newValue":"Ler 30 paginas 2048","valueType":"text","proposedValue":"Ler 30 paginas 2048","isEditable":true},{"entityId":"00000000-0000-0000-0000-000000000000","entityName":"Ler 30 paginas 2048","field":"frequency_quantity","oldValue":null,"newValue":"1","valueType":"number","proposedValue":1,"isEditable":true},{"entityId":"00000000-0000-0000-0000-000000000000","entityName":"Ler 30 paginas 2048","field":"frequency_unit","oldValue":null,"newValue":"Day","valueType":"text","proposedValue":"Day","isEditable":true}],"stateFingerprint":"F48DBF5E8204DA0782519F579B6248BC1F0614256F8A2C92B46C93C11AD2466E","removesData":false}],"previewFingerprint":"F8B5A0B62489C24048A0EE1EADDD42A2588779C8277CC0D4AD36C632965325D2"}}')
    const outcome = conversationPreviewOutcomeSchema.parse(stored)
    expect(outcome.RevisedPreview?.items?.[0]?.fields.find(field => field.field === 'title')?.newValue).toBe('Ler 30 paginas 2048')
    expect(outcome.RevisedPreview?.previewFingerprint).toBe('F8B5A0B62489C24048A0EE1EADDD42A2588779C8277CC0D4AD36C632965325D2')
    const { RevisedPreview: _revised, ...older } = stored
    expect(conversationPreviewOutcomeSchema.parse(older).RevisedPreview).toBeUndefined()
  })

  it('retains the optional server id without changing older responses', () => {
    expect(chatResponseSchema.parse({ aiMessage: 'Ready', actions: [], conversationId }).conversationId).toBe(conversationId)
    expect(chatResponseSchema.parse({ aiMessage: 'Ready', actions: [] }).conversationId).toBeUndefined()
    expect(chatClientContextSchema.shape.conversationId.parse(conversationId)).toBe(conversationId)
  })
})
