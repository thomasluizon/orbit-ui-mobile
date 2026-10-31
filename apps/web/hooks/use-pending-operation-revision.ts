import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { PendingAgentOperation, PendingOperationItem } from '@orbit/shared/types/ai'
import type { PendingOperationMessageState } from '@orbit/shared/chat'
import {
  pendingOperationEdits, pendingOperationRevisionRequest,
  createUsePendingOperationPlacement, type PendingOperationPlacementEdit,
  createPendingOperationRevisionState, reconcilePendingOperationRevisionState,
  selectPendingOperationRevisionItem, changePendingOperationRevisionDraft,
  applyPendingOperationRevisionPreview,
  type RevisePendingOperation,
  type RefreshPendingOperation,
} from '@orbit/shared/hooks'

const usePendingOperationPlacement = createUsePendingOperationPlacement(useCallback)

export function usePendingOperationRevision(
  initialOperation: PendingAgentOperation,
  onRevise: RevisePendingOperation | undefined,
  onRefresh?: RefreshPendingOperation,
  onSettled?: (patch: PendingOperationMessageState) => void,
  savedState?: PendingOperationMessageState,
) {
  const [revision, setRevision] = useState<ReturnType<typeof createPendingOperationRevisionState>>(() => ({
    ...createPendingOperationRevisionState(initialOperation),
    editedItemIds: savedState?.editedItemIds ?? [],
    originalItemIds: savedState?.originalItemIds ?? initialOperation.items?.map(item => item.itemId) ?? [],
  }))
  const synchronized = reconcilePendingOperationRevisionState(revision, initialOperation)
  if (synchronized !== revision) setRevision(synchronized)
  const { operation, editingItemId, editedItemIds } = synchronized
  const draft = useMemo(() => editingItemId ? synchronized.drafts[editingItemId] ?? {} : {},
    [editingItemId, synchronized.drafts])
  const [busy, setBusy] = useState(false)
  const [titleDrafts, setTitleDrafts] = useState<Record<string, string | undefined>>({})
  const [staleFingerprint, setStaleFingerprint] = useState<string | undefined>(savedState?.stale ? initialOperation.previewFingerprint ?? undefined : undefined)
  const [refreshUnavailableFingerprint, setRefreshUnavailableFingerprint] = useState<string | undefined>(savedState?.refreshUnavailable ? initialOperation.previewFingerprint ?? undefined : undefined)
  const [rejectedFingerprint, setRejectedFingerprint] = useState<string | undefined>(savedState?.rejected ? initialOperation.previewFingerprint ?? undefined : undefined)
  const [revisionError, setRevisionError] = useState<{ fingerprint: string; message: string; source: 'revision' | 'refresh' }>()
  const stale = Boolean(staleFingerprint && staleFingerprint === operation.previewFingerprint)
  const refreshUnavailable = refreshUnavailableFingerprint === operation.previewFingerprint
  const rejected = Boolean(rejectedFingerprint && rejectedFingerprint === operation.previewFingerprint)
  const currentError = revisionError && revisionError.fingerprint === operation.previewFingerprint ? revisionError : undefined
  const error = currentError?.message
  const items = useMemo(() => operation.items ?? [], [operation.items])
  const editingItem = items.find((item) => item.itemId === editingItemId)
  const canRevise = Boolean(onRevise && operation.previewFingerprint && operation.items)
  const inFlight = useRef(false)
  const operationRef = useRef(operation)
  useLayoutEffect(() => { operationRef.current = operation }, [operation])

  const revise = useCallback(async (selected: readonly PendingOperationItem[], edits?: { itemId: string; values: Record<string, unknown> }, placement?: PendingOperationPlacementEdit, removal?: { itemId: string; fields: readonly string[] }): Promise<boolean> => {
    if (!onRevise || !operation.previewFingerprint || busy || inFlight.current) return false
    inFlight.current = true
    const requestFingerprint = operation.previewFingerprint
    setBusy(true)
    setRevisionError(undefined)
    try {
      const response = await onRevise(operation.id, pendingOperationRevisionRequest(requestFingerprint, selected, edits, placement, removal))
      if (operationRef.current.id !== operation.id || operationRef.current.previewFingerprint !== requestFingerprint) return false
      if (!response.ok) {
        setStaleFingerprint(response.stale ? requestFingerprint : undefined)
        if (response.stale) onSettled?.({ stale: true })
        setRevisionError(response.stale ? undefined : { fingerprint: requestFingerprint, message: response.error, source: 'revision' })
        return false
      } else if (response.result.cancelled) {
        setRejectedFingerprint(requestFingerprint)
        onSettled?.({ rejected: true })
        return true
      } else if (response.result.preview) {
        const preview = response.result.preview
        const next = applyPendingOperationRevisionPreview(synchronized, preview, edits?.itemId, selected)
        setRevision((current) => current.operation.previewFingerprint === requestFingerprint
          ? applyPendingOperationRevisionPreview(current, preview, edits?.itemId, selected) : current)
        setStaleFingerprint(undefined)
        setRefreshUnavailableFingerprint(undefined)
        onSettled?.({ operation: next.operation, editedItemIds: [...next.editedItemIds], originalItemIds: [...next.originalItemIds], stale: false, refreshUnavailable: false, status: undefined, completedOperation: undefined, canRetry: false })
        return true
      }
      setRevisionError({ fingerprint: requestFingerprint, message: 'invalid', source: 'revision' })
      return false
    } catch {
      setRevisionError({ fingerprint: requestFingerprint, message: 'invalid', source: 'revision' })
      return false
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }, [busy, onRevise, onSettled, operation, synchronized])

  const refresh = useCallback(async (): Promise<void> => {
    if (!onRefresh || busy || !operation.previewFingerprint || refreshUnavailable || inFlight.current) return
    inFlight.current = true
    const requestFingerprint = operation.previewFingerprint
    setBusy(true)
    setRevisionError(undefined)
    try {
      const response = await onRefresh(operation.id)
      if (operationRef.current.id !== operation.id || operationRef.current.previewFingerprint !== requestFingerprint) return
      if (!response.ok) {
        if (response.stale) { setRefreshUnavailableFingerprint(requestFingerprint); onSettled?.({ refreshUnavailable: true }) }
        else setRevisionError({ fingerprint: requestFingerprint, message: response.error, source: 'refresh' })
      } else if (response.result.preview) {
        const preview = response.result.preview
        setRevision((current) => current.operation.previewFingerprint === requestFingerprint
          ? { ...createPendingOperationRevisionState({ ...current.operation, ...preview }),
              sourceFingerprint: current.sourceFingerprint,
              originalItemIds: current.originalItemIds,
              authorizationVersion: current.authorizationVersion + 1 } : current)
        setTitleDrafts({})
        setStaleFingerprint(undefined)
        setRefreshUnavailableFingerprint(undefined)
        onSettled?.({ operation: { ...operation, ...preview }, editedItemIds: [], originalItemIds: [...synchronized.originalItemIds], stale: false, refreshUnavailable: false, status: undefined, completedOperation: undefined, canRetry: false })
      }
    } catch {
      setRevisionError({ fingerprint: requestFingerprint, message: 'invalid', source: 'refresh' })
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }, [busy, onRefresh, onSettled, operation, refreshUnavailable, synchronized.originalItemIds])

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
      if (operation.previewFingerprint) setRevisionError({ fingerprint: operation.previewFingerprint, message: 'invalid', source: 'revision' })
      return false
    }
  }, [draft, editingItem, items, operation.previewFingerprint, revise])

  const hasTitleDrafts = items.some((item) => titleDrafts[item.itemId] !== undefined
    && titleDrafts[item.itemId] !== item.fields.find((field) => field.field === 'title')?.newValue)
  const switchPlacement = usePendingOperationPlacement(items, revise, busy || stale || rejected || hasTitleDrafts || Boolean(editingItem))

  return {
    switchPlacement,
    operation, items, canRevise, editingItem, draft, editedItemIds, authorizationVersion: synchronized.authorizationVersion,
    busy, stale, rejected, error, errorSource: currentError?.source,
    hasTitleDrafts,
    setTitleDraft: (itemId: string, title: string | undefined) => setTitleDrafts((current) => ({ ...current, [itemId]: title })),
    canRefresh: Boolean(onRefresh && !refreshUnavailable), refresh,
    markStale: () => {
      setRevisionError(undefined)
      if (operation.previewFingerprint) setStaleFingerprint(operation.previewFingerprint)
    },
    setDraftField: (field: string, value: string) => setRevision((current) => changePendingOperationRevisionDraft(current, field, value)),
    closeEdit: () => setRevision((current) => ({ ...current, editingItemId: undefined })),
    startEdit,
    saveEdit,
    hasRequiredChoices: items.some((item) => item.fieldOptions?.some((field) => field.required)),
    chooseParent: (itemId: string, value: unknown) => {
      const field = items.find((item) => item.itemId === itemId)?.fieldOptions?.find((entry) => entry.field === 'parent_habit_id')
      if (!field?.options.some((option) => option.value === value)) return Promise.resolve(false)
      return revise(items, { itemId, values: { parent_habit_id: value } })
    },
    renameItem: (itemId: string, title: string) => revise(items, { itemId, values: { title } }),
    rejectSubHabit: (itemId: string, index: number) => {
      const field = items.find((item) => item.itemId === itemId)?.fields.find((entry) => entry.field === 'sub_habits')
      if (field?.isEditable !== true || !Array.isArray(field.proposedValue) || index < 0 || index >= field.proposedValue.length) return Promise.resolve(false)
      return revise(items, { itemId, values: { sub_habits: field.proposedValue.filter((_, childIndex) => childIndex !== index) } })
    },
    removeField: (itemId: string, field: PendingOperationItem['fields'][number]) => {
      if (field.provenance !== 'suggested' || !field.removal) return Promise.resolve(false)
      return revise(items, undefined, undefined, { itemId, fields: field.removal.fields?.length ? field.removal.fields : [field.removal.field] })
    },
    rejectItem: (itemId: string) => revise(items.filter((item) => item.itemId !== itemId)),
    rejectAll: () => revise([]),
  }
}
