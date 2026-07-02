import { useState } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Check, RotateCcw, X } from 'lucide-react-native'
import { API } from '@orbit/shared/api'
import {
  buildFreshStartDeletedItems,
  buildFreshStartPreservedItems,
  getFriendlyErrorMessage,
} from '@orbit/shared/utils'
import { apiClient } from '@/lib/api-client'
import { clearChecklistTemplates } from '@/lib/checklist-template-storage'
import {
  buildQueuedMutation,
  createQueuedAck,
  isQueuedResult,
  queueOrExecute,
} from '@/lib/offline-mutations'
import * as offlineQueue from '@/lib/offline-queue'
import { clearPersistedQueryCache } from '@/lib/query-client'
import { BottomSheetModal } from '@/components/bottom-sheet-modal'
import { AppTextInput } from '@/components/ui/app-text-input'
import { PillButton } from '@/components/ui/pill-button'
import { FreshStartAnimation } from '@/components/ui/fresh-start-animation'
import { useAppTheme } from '@/lib/use-app-theme'
import { createTokensV2 } from '@/lib/theme'

function AmberPillButton({
  label,
  onPress,
  disabled = false,
}: Readonly<{
  label: string
  onPress: () => void
  disabled?: boolean
}>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        dangerPillStyles.base,
        { backgroundColor: tokens.statusOverdue },
        disabled ? dangerPillStyles.disabled : null,
        pressed && !disabled ? dangerPillStyles.pressed : null,
      ]}
    >
      <Text style={[dangerPillStyles.label, { color: tokens.fgOnOverdue }]}>
        {label}
      </Text>
    </Pressable>
  )
}

const dangerPillStyles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    borderRadius: 999,
    paddingVertical: 15,
    paddingHorizontal: 26,
    width: '100%',
  },
  disabled: {
    opacity: 0.4,
  },
  pressed: {
    opacity: 0.85,
  },
  label: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 16,
  },
})

interface FreshStartModalProps {
  open: boolean
  onClose: () => void
}

export function FreshStartModal({ open, onClose }: Readonly<FreshStartModalProps>) {
  const { t } = useTranslation()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)

  const [showFreshStartAnim, setShowFreshStartAnim] = useState(false)
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
    if (!isResetConfirmed) return
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
        execute: async (mutation) => {
          await apiClient(mutation.endpoint, { method: mutation.method })
          return {
            queued: false,
            queuedMutationId: queuedResetMutation.id,
          }
        },
        queuedResult: createQueuedAck(queuedResetMutation.id),
      })

      offlineQueue.clear()
      if (isQueuedResult(result)) {
        offlineQueue.enqueue(queuedResetMutation)
      }

      await Promise.all([
        clearChecklistTemplates(),
        AsyncStorage.removeItem('orbit_trial_expired_seen'),
      ])
      queryClient.clear()
      await clearPersistedQueryCache()
      onClose()
      setShowFreshStartAnim(true)
    } catch (err: unknown) {
      const msg = getFriendlyErrorMessage(err, t, 'profile.freshStart.errorGeneric', 'generic')
      setResetError(msg)
    } finally {
      setResetLoading(false)
    }
  }

  function handleFreshStartComplete() {
    setShowFreshStartAnim(false)
    queryClient.clear()
    router.replace('/')
  }

  const deletedItems = buildFreshStartDeletedItems(t)
  const preservedItems = buildFreshStartPreservedItems(t)

  return (
    <>
      <BottomSheetModal
        open={open}
        onClose={onClose}
        title={
          resetStep === 'info'
            ? t('profile.freshStart.heading')
            : t('profile.freshStart.confirmHeading')
        }
        snapPoints={['85%']}
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
                <RotateCcw size={34} color={tokens.statusOverdue} strokeWidth={1.8} />
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
                    <X size={14} color={tokens.statusBad} strokeWidth={1.8} />
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
                    <Check size={14} color={tokens.statusDone} strokeWidth={1.8} />
                    <Text style={[styles.boxItemText, { color: tokens.fg2 }]}>
                      {item}
                    </Text>
                  </View>
                ))}
              </View>
            </View>

            <View style={styles.modalActions}>
              <AmberPillButton
                label={t('common.continue')}
                onPress={() => setResetStep('confirm')}
              />
              <PillButton variant="ghost" fullWidth onPress={onClose}>
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
            <AppTextInput
              style={styles.confirmInput}
              value={resetConfirmText}
              onChangeText={setResetConfirmText}
              placeholder={t('profile.freshStart.confirmPlaceholder')}
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
              <AmberPillButton
                label={
                  resetLoading
                    ? t('profile.freshStart.processing')
                    : t('profile.freshStart.confirmButton')
                }
                disabled={!isResetConfirmed || resetLoading}
                onPress={() => {
                  void handleResetAccount()
                }}
              />
              <PillButton
                variant="ghost"
                fullWidth
                disabled={resetLoading}
                onPress={onClose}
              >
                {t('common.cancel')}
              </PillButton>
            </View>
          </View>
        )}
      </BottomSheetModal>

      {showFreshStartAnim && (
        <FreshStartAnimation onComplete={handleFreshStartComplete} />
      )}
    </>
  )
}

const styles = StyleSheet.create({
  body: {
    paddingHorizontal: 22,
    paddingBottom: 8,
    gap: 16,
  },
  modalDescription: {
    fontFamily: 'Rubik_400Regular',
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
    fontFamily: 'Rubik_500Medium',
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
    fontFamily: 'Rubik_400Regular',
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
    fontFamily: 'Roboto_500Medium',
    fontSize: 16,
  },
  errorTextSmall: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 12,
    textAlign: 'center',
  },
})
