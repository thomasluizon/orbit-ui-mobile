import { useCallback, useMemo, useState } from 'react'
import type { PendingAgentOperation, PendingOperationItem } from '@orbit/shared/types/ai'
import {
  pendingOperationEdits, pendingOperationRevisionRequest,
  createPendingOperationRevisionState, reconcilePendingOperationRevisionState,
  selectPendingOperationRevisionItem, changePendingOperationRevisionDraft,
  applyPendingOperationRevisionPreview,
  type RevisePendingOperation,
  type RefreshPendingOperation,
} from '@orbit/shared/hooks'

export function usePendingOperationRevision(
  initialOperation: PendingAgentOperation,
  onRevise: RevisePendingOperation | undefined,
  onRefresh?: RefreshPendingOperation,
) {
  const [revision, setRevision] = useState(() => createPendingOperationRevisionState(initialOperation))
  const synchronized = reconcilePendingOperationRevisionState(revision, initialOperation)
  if (synchronized !== revision) setRevision(synchronized)
  const { operation, editingItemId, editedItemIds } = synchronized
  const draft = useMemo(() => editingItemId ? synchronized.drafts[editingItemId] ?? {} : {},
    [editingItemId, synchronized.drafts])
  const [busy, setBusy] = useState(false)
  const [staleFingerprint, setStaleFingerprint] = useState<string>()
  const [refreshUnavailableFingerprint, setRefreshUnavailableFingerprint] = useState<string>()
  const [rejectedFingerprint, setRejectedFingerprint] = useState<string>()
  const [revisionError, setRevisionError] = useState<{ fingerprint: string; message: string }>()
  const stale = Boolean(staleFingerprint && staleFingerprint === operation.previewFingerprint)
  const refreshUnavailable = refreshUnavailableFingerprint === operation.previewFingerprint
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
        setRevisionError(response.stale ? undefined : { fingerprint: requestFingerprint, message: response.error })
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

  const refresh = useCallback(async (): Promise<void> => {
    if (!onRefresh || busy || !operation.previewFingerprint || refreshUnavailable) return
    const requestFingerprint = operation.previewFingerprint
    setBusy(true)
    setRevisionError(undefined)
    try {
      const response = await onRefresh(operation.id)
      if (!response.ok) {
        if (response.stale) setRefreshUnavailableFingerprint(requestFingerprint)
        else setRevisionError({ fingerprint: requestFingerprint, message: response.error })
      } else if (response.result.preview) {
        const preview = response.result.preview
        setRevision((current) => current.operation.previewFingerprint === requestFingerprint
          ? { ...createPendingOperationRevisionState({ ...current.operation, ...preview }),
              sourceFingerprint: current.sourceFingerprint,
              authorizationVersion: current.authorizationVersion + 1 } : current)
        setStaleFingerprint(undefined)
      }
    } catch {
      setRevisionError({ fingerprint: requestFingerprint, message: 'invalid' })
    } finally {
      setBusy(false)
    }
  }, [busy, onRefresh, operation, refreshUnavailable])

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
    operation, items, canRevise, editingItem, draft, editedItemIds, authorizationVersion: synchronized.authorizationVersion,
    busy, stale, rejected, error,
    canRefresh: Boolean(onRefresh && !refreshUnavailable), refresh,
    markStale: () => { if (operation.previewFingerprint) setStaleFingerprint(operation.previewFingerprint) },
    setDraftField: (field: string, value: string) => setRevision((current) => changePendingOperationRevisionDraft(current, field, value)),
    closeEdit: () => setRevision((current) => ({ ...current, editingItemId: undefined })),
    startEdit,
    saveEdit,
    rejectItem: (itemId: string) => revise(items.filter((item) => item.itemId !== itemId)),
    rejectAll: () => revise([]),
  }
}
