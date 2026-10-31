import { act, create } from 'react-test-renderer'
import { expect, it, vi } from 'vitest'
import { usePendingOperationRevision } from '@/hooks/use-pending-operation-revision'
import { astraOfferFixture, makeOfferedPreview } from '@orbit/shared/test-support/astra-offer-fixtures'

it('clears the previous offer when refreshing a preview', async () => {
  const operation = { ...makeOfferedPreview(), nextAction: astraOfferFixture }
  const refresh = vi.fn().mockResolvedValue({ ok: true, result: { cancelled: false, preview: {
    changes: operation.changes, items: operation.items, changeTargetCount: 1, previewFingerprint: 'refreshed',
  } } })
  let current!: ReturnType<typeof usePendingOperationRevision>
  function Harness() { current = usePendingOperationRevision(operation, undefined, refresh); return null }
  let tree!: ReturnType<typeof create>
  await act(() => { tree = create(<Harness />) })
  try {
    await act(async () => { await current.refresh() })
    expect(current.operation.previewFingerprint).toBe('refreshed')
    expect(current.operation.nextAction).toBeNull()
  } finally { await act(() => tree.unmount()) }
})
