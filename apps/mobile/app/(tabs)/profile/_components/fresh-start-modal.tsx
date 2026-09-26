import { useState } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Check, RotateCcw, X } from '@/components/ui/icons'
import { API } from '@orbit/shared/api'
import {
  buildAccountScopedStorageKey,
  buildFreshStartDeletedItems,
  buildFreshStartPreservedItems,
  getFriendlyErrorMessage,
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
import { Sheet, useSheetHost } from '@/components/ui/sheet'
import { AppTextInput } from '@/components/ui/app-text-input'
import { PillButton } from '@/components/ui/pill-button'
import { useAppTheme } from '@/lib/use-app-theme'
import { createTokensV2 } from '@/lib/theme'

const TRIAL_EXPIRED_SEEN_STORAGE_KEY = 'orbit_trial_expired_seen'

/**
 * Lets the trial notice appear again for this account. The pre-rename key goes with it, because
 * left behind it answers for every account and keeps suppressing the notice this reset restores.
 */
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
  const { sheetRef, closeSheet } = useSheetHost()
  const { t } = useTranslation()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)

  const [resetStep, setResetStep] = useState<'info' | 'confirm'>('info')
  const [resetConfirmText, setResetConfirmText] = useState('')
  const [resetLoading, setResetLoading] = useState(false)
  const [resetError, setResetError] = useState('')
  const [prevOpen, setPrevOpen] = useState(open)

  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) {
      setResetStep('info')
      setResetConfirmText('')
      setResetError('')
      setResetLoading(false)
    }
  }

  const isResetConfirmed = resetConfirmText.trim().toUpperCase() === 'ORBIT'

  async function handleResetAccount() {
    const resetAccount = getAccountGeneration()
    const accountId = useAuthStore.getState().user?.userId ?? null
    const isCurrentAccount = () => accountStillCurrent(resetAccount, accountId)
    if (!isResetConfirmed || accountId === null || !isCurrentAccount()) return
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
      queryClient.clear()
      await clearPersistedQueryCache()
      if (!isCurrentAccount()) return
      closeSheet(() => {
        if (!isCurrentAccount()) return
        onClose()
        queryClient.clear()
        router.replace('/')
      })
    } catch (err: unknown) {
      if (!isCurrentAccount()) return
      const msg = getFriendlyErrorMessage(err, t, 'profile.freshStart.errorGeneric', 'generic')
      setResetError(msg)
    } finally {
      if (isCurrentAccount()) setResetLoading(false)
    }
  }

  const deletedItems = buildFreshStartDeletedItems(t)
  const preservedItems = buildFreshStartPreservedItems(t)
  const confirmButtonLabel = resetLoading
    ? t('profile.freshStart.processing')
    : t('profile.freshStart.button')

  return (
    <>
      {open ? (<Sheet
        ref={sheetRef}
        open
        onClose={onClose}
        title={
          resetStep === 'info'
            ? t('profile.freshStart.heading')
            : t('profile.freshStart.confirmHeading')
        }
      >
        {resetStep === 'info' ? (
          <View style={styles.body}>
            <View style={styles.destructiveHero}>
              <View
                style={[
                  styles.destructiveHeroCircle,
                  { backgroundColor: `${tokens.statusOverdue}24` },
                ]}
              >
                <RotateCcw size={24} color={tokens.statusOverdue} strokeWidth={1.8} />
              </View>
              <Text
                style={[
                  styles.modalDescription,
                  { color: tokens.fg2, textAlign: 'center' },
                ]}
              >
                {t('profile.freshStart.description')}
              </Text>
            </View>

            <View style={styles.listRow}>
              <View
                style={[
                  styles.freshStartBox,
                  { backgroundColor: tokens.bgCard, borderColor: tokens.hairline },
                ]}
              >
                <Text style={[styles.boxLabel, { color: tokens.fg3 }]}>
                  {t('profile.freshStart.willDelete')}
                </Text>
                {deletedItems.map((item) => (
                  <View key={item} style={styles.boxItem}>
                    <X size={16} color={tokens.statusBad} strokeWidth={1.8} />
                    <Text style={[styles.boxItemText, { color: tokens.fg2 }]}>
                      {item}
                    </Text>
                  </View>
                ))}
              </View>

              <View
                style={[
                  styles.freshStartBox,
                  { backgroundColor: tokens.bgCard, borderColor: tokens.hairline },
                ]}
              >
                <Text style={[styles.boxLabel, { color: tokens.fg3 }]}>
                  {t('profile.freshStart.willKeep')}
                </Text>
                {preservedItems.map((item) => (
                  <View key={item} style={styles.boxItem}>
                    <Check size={16} color={tokens.statusDone} strokeWidth={1.8} />
                    <Text style={[styles.boxItemText, { color: tokens.fg2 }]}>
                      {item}
                    </Text>
                  </View>
                ))}
              </View>
            </View>

            <View style={styles.modalActions}>
              <PillButton
                variant="caution"
                accessibleName={t('common.continue')}
                onClick={() => setResetStep('confirm')}
              >
                {t('common.continue')}
              </PillButton>
              <PillButton variant="ghost" onClick={() => closeSheet()}>
                {t('common.cancel')}
              </PillButton>
            </View>
          </View>
        ) : (
          <View style={styles.body}>
            <Text
              style={[
                styles.modalDescription,
                { color: tokens.fg2, textAlign: 'center' },
              ]}
            >
              {t('profile.freshStart.confirmInstruction')}
            </Text>
            <Text style={[styles.confirmLabel, { color: tokens.fg2 }]}>
              {t('profile.freshStart.confirmLabel')}
            </Text>
            <AppTextInput
              style={styles.confirmInput}
              value={resetConfirmText}
              onChangeText={setResetConfirmText}
              placeholder={t('profile.freshStart.confirmPlaceholder')}
              accessibilityLabel={t('profile.freshStart.confirmLabel')}
              placeholderTextColor={tokens.fg3}
              autoCapitalize="characters"
              autoCorrect={false}
              textAlign="center"
              returnKeyType="done"
              onSubmitEditing={() => {
                if (isResetConfirmed && !resetLoading) {
                  void handleResetAccount()
                }
              }}
            />
            {resetError ? (
              <Text style={[styles.errorTextSmall, { color: tokens.statusBadText }]}>
                {resetError}
              </Text>
            ) : null}
            <View style={styles.modalActions}>
              <PillButton
                variant="caution"
                accessibleName={confirmButtonLabel}
                disabled={!isResetConfirmed || resetLoading}
                onClick={() => {
                  void handleResetAccount()
                }}
              >
                {confirmButtonLabel}
              </PillButton>
              <PillButton variant="ghost" disabled={resetLoading} onClick={() => closeSheet()}>
                {t('common.cancel')}
              </PillButton>
            </View>
          </View>
        )}
      </Sheet>) : null}
    </>
  )
}

const styles = StyleSheet.create({
  body: {
    paddingHorizontal: 24,
    paddingBottom: 8,
    gap: 16,
  },
  modalDescription: {
    fontFamily: 'Geist_400Regular',
    fontSize: 15,
    lineHeight: 23,
  },
  modalActions: {
    gap: 12,
    paddingTop: 8,
  },

  listRow: {
    flexDirection: 'row',
    gap: 12,
  },
  freshStartBox: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 8,
  },
  boxLabel: {
    fontFamily: 'GeistMono_500Medium',
    fontSize: 12,
    letterSpacing: 0.96,
    textTransform: 'uppercase',
  },
  boxItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  boxItemText: {
    fontFamily: 'Geist_400Regular',
    fontSize: 13,
    lineHeight: 18,
    flex: 1,
  },

  destructiveHero: {
    alignItems: 'center',
    gap: 16,
    paddingTop: 4,
  },
  destructiveHeroCircle: {
    width: 80,
    height: 80,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },

  confirmInput: {
    fontFamily: 'GeistMono_500Medium',
    fontSize: 16,
  },
  confirmLabel: {
    fontFamily: 'Geist_500Medium',
    fontSize: 14,
  },
  errorTextSmall: {
    fontFamily: 'Geist_400Regular',
    fontSize: 12,
    textAlign: 'center',
  },
})
