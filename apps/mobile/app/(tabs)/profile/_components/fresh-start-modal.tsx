
import { useRef, useState } from 'react'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { API } from '@orbit/shared/api'
import { resetAccountQueries } from '@orbit/shared/query'
import {
  buildAccountScopedStorageKey,
  buildFreshStartDeletedItems,
  buildFreshStartPreservedItems,
  getFriendlyErrorMessage,
  isFreshStartConfirmed,
} from '@orbit/shared/utils'
import { apiClient } from '@/lib/api-client'
import { clearChecklistTemplates } from '@/lib/checklist-template-storage'
import { useAuthStore } from '@/stores/auth-store'
import { getAccountGeneration } from '@/lib/session-epoch'
import {
  buildQueuedMutation,
  createQueuedAck,
  isQueuedResult,
  queueOrExecute,
} from '@/lib/offline-mutations'
import * as offlineQueue from '@/lib/offline-queue'
import { useOfflineSyncStore } from '@/stores/offline-sync-store'
import { clearPersistedQueryCache } from '@/lib/query-client'
import { captureGuidedFlowCompleted } from '@/lib/posthog'
import { FreshStartGuided } from './fresh-start-flow'

const TRIAL_EXPIRED_SEEN_STORAGE_KEY = 'orbit_trial_expired_seen'

async function removeScopedTrialExpiredFlag(accountId: string | null): Promise<void> {
  const keys = [TRIAL_EXPIRED_SEEN_STORAGE_KEY]
  if (accountId !== null) {
    keys.push(buildAccountScopedStorageKey(TRIAL_EXPIRED_SEEN_STORAGE_KEY, accountId))
  }
  await AsyncStorage.multiRemove(keys)
}

function accountStillCurrent(accountGeneration: number, accountId: string | null): boolean {
  const auth = useAuthStore.getState()
  return getAccountGeneration() === accountGeneration &&
    auth.sessionPhase === 'signed-in' && (auth.user?.userId ?? null) === accountId
}

interface FreshStartModalProps {
  open: boolean
  onClose: () => void
}

export function FreshStartModal({ open, onClose }: Readonly<FreshStartModalProps>) {
  const { t } = useTranslation()
  const router = useRouter()
  const queryClient = useQueryClient()

  const [resetStep, setResetStep] = useState<'info' | 'confirm'>('info')
  const [resetConfirmText, setResetConfirmText] = useState('')
  const [resetLoading, setResetLoading] = useState(false)
  const requestPending = useRef(false)
  const [resetError, setResetError] = useState('')
  const [resetOutcome, setResetOutcome] = useState<'done' | 'queued' | null>(null)
  const [prevOpen, setPrevOpen] = useState(open)

  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) {
      setResetStep('info')
      setResetConfirmText('')
      setResetError('')
      setResetLoading(false)
      setResetOutcome(null)
    }
  }

  const isResetConfirmed = isFreshStartConfirmed(resetConfirmText)

  function completeReset(queued: boolean) {
    captureGuidedFlowCompleted('fresh_start', 2, false)
    setResetOutcome(queued ? 'queued' : 'done')
  }

  async function handleResetAccount() {
    if (resetLoading || requestPending.current) return
    const resetAccount = getAccountGeneration()
    const accountId = useAuthStore.getState().user?.userId ?? null
    const isCurrentAccount = () => accountStillCurrent(resetAccount, accountId)
    if (!isResetConfirmed || accountId === null || !isCurrentAccount()) return
    requestPending.current = true
    setResetLoading(true)
    setResetError('')
    try {
      type ResetMutationResult =
        | { queued: true; queuedMutationId: string }
        | { queued: false; queuedMutationId: string }

      const queuedResetMutation = buildQueuedMutation({
        type: 'resetProfile',
        scope: 'profile',
        endpoint: API.profile.reset,
        method: 'POST',
        payload: undefined,
        dedupeKey: 'profile-reset',
      })

      const result = await queueOrExecute<ResetMutationResult, ResetMutationResult>({
        mutation: queuedResetMutation,
        isCurrent: isCurrentAccount,
        execute: async (mutation) => {
          await apiClient(mutation.endpoint, {
            method: mutation.method,
            isCurrent: isCurrentAccount,
          })
          return {
            queued: false,
            queuedMutationId: queuedResetMutation.id,
          }
        },
        queuedResult: createQueuedAck(queuedResetMutation.id),
      })
      if (!isCurrentAccount()) return

      offlineQueue.clear()
      await useOfflineSyncStore.getState().clearDrops()
      if (!isCurrentAccount()) return
      if (isQueuedResult(result)) {
        offlineQueue.enqueue(queuedResetMutation)
      }
      await useOfflineSyncStore.getState().clearDrops()
      if (!isCurrentAccount()) return

      await Promise.all([
        clearChecklistTemplates(),
        removeScopedTrialExpiredFlag(accountId),
      ])
      if (!isCurrentAccount()) return
      void resetAccountQueries(queryClient, 'signed-in')
      await clearPersistedQueryCache()
      if (!isCurrentAccount()) return
      completeReset(isQueuedResult(result))
    } catch (err: unknown) {
      if (!isCurrentAccount()) return
      const msg = getFriendlyErrorMessage(err, t, 'profile.freshStart.errorGeneric', 'generic')
      setResetError(msg)
    } finally {
      requestPending.current = false
      setResetLoading(false)
    }
  }

  const deletedItems = buildFreshStartDeletedItems(t)
  const preservedItems = buildFreshStartPreservedItems(t)

  if (open) {
    return (
      <FreshStartGuided
        outcome={resetOutcome}
        onOpenToday={() => { onClose(); router.replace('/(tabs)') }}
        step={resetStep}
        deletedItems={deletedItems}
        preservedItems={preservedItems}
        confirmText={resetConfirmText}
        onConfirmTextChange={setResetConfirmText}
        loading={resetLoading}
        error={resetError}
        onContinue={() => setResetStep('confirm')}
        onBack={() => setResetStep('info')}
        onClose={onClose}
        onReset={() => { void handleResetAccount() }}
      />
    )
  }

  return null
}
