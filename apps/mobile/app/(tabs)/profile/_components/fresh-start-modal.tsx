import { useState } from 'react'
import { View, Text, Pressable, StyleSheet, Modal } from 'react-native'
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
import { AppTextInput } from '@/components/ui/app-text-input'
import { KeyboardAwareScrollView } from '@/components/ui/keyboard-aware-scroll-view'
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
      <Text style={[dangerPillStyles.label, { color: tokens.fgOnPrimary }]}>
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
      <Modal
        visible={open}
        transparent
        animationType="slide"
        onRequestClose={onClose}
      >
        <KeyboardAwareScrollView
          containerStyle={styles.modalOverlay}
          contentContainerStyle={styles.modalScrollContent}
          keyboardVerticalOffset={12}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.modalContent, { backgroundColor: tokens.bgSheet }]}>
            <View style={[styles.grabber, { backgroundColor: tokens.hairlineStrong }]} />
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: tokens.fg1 }]}>
                {t('profile.freshStart.title')}
              </Text>
              <Pressable
                onPress={onClose}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={t('common.close')}
              >
                <X size={24} color={tokens.fg2} strokeWidth={1.8} />
              </Pressable>
            </View>

            {resetStep === 'info' ? (
              <View style={{ gap: 16 }}>
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

                <View
                  style={[
                    styles.freshStartBox,
                    { backgroundColor: tokens.bgCard, borderColor: tokens.hairline },
                  ]}
                >
                  <Text style={[styles.boxLabel, { color: tokens.fg3 }]}>
                    {t('profile.freshStart.whatDeleted')}
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
                    {t('profile.freshStart.whatPreserved')}
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

                <View style={styles.modalActions}>
                  <AmberPillButton
                    label={t('common.continue')}
                    onPress={() => setResetStep('confirm')}
                  />
                  <PillButton
                    variant="ghost"
                    fullWidth
                    onPress={onClose}
                  >
                    {t('common.cancel')}
                  </PillButton>
                </View>
              </View>
            ) : (
              <View style={{ gap: 16 }}>
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
                  <Text style={[styles.errorTextSmall, { color: tokens.statusBad }]}>
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
          </View>
        </KeyboardAwareScrollView>
      </Modal>

      {showFreshStartAnim && (
        <FreshStartAnimation onComplete={handleFreshStartComplete} />
      )}
    </>
  )
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  modalScrollContent: {
    flexGrow: 1,
    justifyContent: 'flex-end',
    paddingTop: 24,
  },
  modalContent: {
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: 40,
  },
  grabber: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 999,
    marginBottom: 14,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    marginBottom: 20,
  },
  modalTitle: {
    flex: 1,
    fontFamily: 'Rubik_500Medium',
    fontSize: 24,
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

  freshStartBox: {
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
