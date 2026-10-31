import { act, renderHook } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { usePendingOperationRevision } from '@/hooks/use-pending-operation-revision'
import { astraOfferFixture, makeOfferedPreview } from '@orbit/shared/test-support/astra-offer-fixtures'

it('clears the previous offer when refreshing a preview', async () => {
  const operation = { ...makeOfferedPreview(), nextAction: astraOfferFixture }
  const refresh = vi.fn().mockResolvedValue({ ok: true, result: { cancelled: false, preview: {
    changes: operation.changes, items: operation.items, changeTargetCount: 1, previewFingerprint: 'refreshed',
  } } })
  const { result } = renderHook(() => usePendingOperationRevision(operation, undefined, refresh))
  await act(async () => { await result.current.refresh() })
  expect(result.current.operation.previewFingerprint).toBe('refreshed')
  expect(result.current.operation.nextAction).toBeNull()
})
