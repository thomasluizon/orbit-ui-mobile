import { useCallback, useMemo, useState } from 'react'
import type { PendingAgentOperation, PendingOperationItem } from '@orbit/shared/types/ai'
import {
  pendingOperationEdits, pendingOperationRevisionRequest,
  createPendingOperationRevisionState, reconcilePendingOperationRevisionState,
  selectPendingOperationRevisionItem, changePendingOperationRevisionDraft,
  applyPendingOperationRevisionPreview,
  type RevisePendingOperation,
} from '@orbit/shared/hooks'

export function usePendingOperationRevision(
  initialOperation: PendingAgentOperation,
  onRevise: RevisePendingOperation | undefined,
) {
  const [revision, setRevision] = useState(() => createPendingOperationRevisionState(initialOperation))
  const synchronized = reconcilePendingOperationRevisionState(revision, initialOperation)
  if (synchronized !== revision) setRevision(synchronized)
  const { operation, editingItemId, editedItemIds } = synchronized
  const draft = useMemo(() => editingItemId ? synchronized.drafts[editingItemId] ?? {} : {},
    [editingItemId, synchronized.drafts])
  const [busy, setBusy] = useState(false)
  const [staleFingerprint, setStaleFingerprint] = useState<string>()
  const [rejectedFingerprint, setRejectedFingerprint] = useState<string>()
  const [revisionError, setRevisionError] = useState<{ fingerprint: string; message: string }>()
  const stale = Boolean(staleFingerprint && staleFingerprint === operation.previewFingerprint)
  const rejected = Boolean(rejectedFingerprint && rejectedFingerprint === operation.previewFingerprint)
  const error = revisionError && revisionError.fingerprint === operation.previewFingerprint ? revisionError.message : undefined
  const items = useMemo(() => operation.items ?? [], [operation.items])
  const editingItem = items.find((item) => item.itemId === editingItemId)
  const canRevise = Boolean(onRevise && operation.previewFingerprint && operation.items)

  const revise = useCallback(async (selected: readonly PendingOperationItem[], edits?: { itemId: string; values: Record<string, unknown> }): Promise<boolean> => {
    if (!onRevise || !operation.previewFingerprint || busy) return false
    const requestFingerprint = operation.previewFingerprint
    setBusy(true)
    setRevisionError(undefined)
    try {
      const response = await onRevise(operation.id, pendingOperationRevisionRequest(requestFingerprint, selected, edits))
      if (!response.ok) {
        setStaleFingerprint(response.stale ? requestFingerprint : undefined)
        setRevisionError({ fingerprint: requestFingerprint, message: response.error })
        return false
      } else if (response.result.cancelled) {
        setRejectedFingerprint(requestFingerprint)
        return true
      } else if (response.result.preview) {
        const preview = response.result.preview
        setRevision((current) => current.operation.previewFingerprint === requestFingerprint
          ? applyPendingOperationRevisionPreview(current, preview, edits?.itemId) : current)
        setStaleFingerprint(undefined)
        return true
      }
      setRevisionError({ fingerprint: requestFingerprint, message: 'invalid' })
      return false
    } catch {
      setRevisionError({ fingerprint: requestFingerprint, message: 'invalid' })
      return false
    } finally {
      setBusy(false)
    }
  }, [busy, onRevise, operation])

  const startEdit = useCallback((itemId: string) => {
    setRevision((current) => selectPendingOperationRevisionItem(current, itemId))
    setRevisionError(undefined)
  }, [])

  const saveEdit = useCallback(async (): Promise<boolean> => {
    if (!editingItem) return false
    try {
      const values = pendingOperationEdits(editingItem, draft)
      if (Object.keys(values).length === 0) {
        return true
      }
      return await revise(items, { itemId: editingItem.itemId, values })
    } catch {
      if (operation.previewFingerprint) setRevisionError({ fingerprint: operation.previewFingerprint, message: 'invalid' })
      return false
    }
  }, [draft, editingItem, items, operation.previewFingerprint, revise])

  return {
    operation, items, canRevise, editingItem, draft, editedItemIds, busy, stale, rejected, error,
    setDraftField: (field: string, value: string) => setRevision((current) => changePendingOperationRevisionDraft(current, field, value)),
    closeEdit: () => setRevision((current) => ({ ...current, editingItemId: undefined })),
    startEdit,
    saveEdit,
    rejectItem: (itemId: string) => revise(items.filter((item) => item.itemId !== itemId)),
    rejectAll: () => revise([]),
  }
}
