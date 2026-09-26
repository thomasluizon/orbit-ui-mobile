import { useCallback, useMemo, useState } from 'react'
import type { PendingAgentOperation, PendingOperationItem } from '@orbit/shared/types/ai'
import {
  pendingOperationDraft, pendingOperationEdits, pendingOperationRevisionRequest,
  isPendingOperationEditableField,
  type RevisePendingOperation,
} from '@orbit/shared/hooks'

export function usePendingOperationRevision(
  initialOperation: PendingAgentOperation,
  onRevise: RevisePendingOperation | undefined,
) {
  const [operation, setOperation] = useState(initialOperation)
  const [editingItemId, setEditingItemId] = useState<string>()
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [stale, setStale] = useState(false)
  const [rejected, setRejected] = useState(false)
  const [error, setError] = useState<string>()
  const items = useMemo(() => operation.items ?? [], [operation.items])
  const editingItem = items.find((item) => item.itemId === editingItemId)
  const canRevise = Boolean(onRevise && operation.previewFingerprint && operation.items)

  const revise = useCallback(async (selected: readonly PendingOperationItem[], edits?: { itemId: string; values: Record<string, unknown> }): Promise<boolean> => {
    if (!onRevise || !operation.previewFingerprint || busy) return false
    setBusy(true)
    setError(undefined)
    try {
      const response = await onRevise(operation.id, pendingOperationRevisionRequest(operation.previewFingerprint, selected, edits))
      if (!response.ok) {
        setStale(response.stale === true)
        setError(response.error)
        return false
      } else if (response.result.cancelled) {
        setRejected(true)
        return true
      } else if (response.result.preview) {
        setOperation((current) => ({ ...current, ...response.result.preview }))
        setStale(false)
        return true
      }
      setError('invalid')
      return false
    } catch {
      setError('invalid')
      return false
    } finally {
      setBusy(false)
    }
  }, [busy, onRevise, operation])

  const startEdit = useCallback((itemId: string) => {
    const item = items.find((entry) => entry.itemId === itemId)
    if (!item || !item.fields.some(isPendingOperationEditableField)) return
    setDraft(pendingOperationDraft(item))
    setEditingItemId(itemId)
    setError(undefined)
  }, [items])

  const saveEdit = useCallback(async (): Promise<boolean> => {
    if (!editingItem) return false
    try {
      const values = pendingOperationEdits(editingItem, draft)
      if (Object.keys(values).length === 0) {
        return true
      }
      return await revise(items, { itemId: editingItem.itemId, values })
    } catch {
      setError('invalid')
      return false
    }
  }, [draft, editingItem, items, revise])

  return {
    operation, items, canRevise, editingItem, draft, busy, stale, rejected, error,
    setDraftField: (field: string, value: string) => setDraft((current) => ({ ...current, [field]: value })),
    closeEdit: () => setEditingItemId(undefined),
    startEdit,
    saveEdit,
    rejectItem: (itemId: string) => revise(items.filter((item) => item.itemId !== itemId)),
    rejectAll: () => revise([]),
  }
}
