import { useRef, useState } from 'react'
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  type TextInput,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import { parseISO } from 'date-fns'
import { TriangleAlert } from 'lucide-react-native'
import { getFriendlyErrorMessage } from '@orbit/shared/utils'
import type { Profile } from '@orbit/shared/types/profile'
import { API } from '@orbit/shared/api'
import { apiClient } from '@/lib/api-client'
import { useOffline } from '@/hooks/use-offline'
import { useDateFormat } from '@/hooks/use-date-format'
import { useAuthStore } from '@/stores/auth-store'
import { OfflineUnavailableState } from '@/components/ui/offline-unavailable-state'
import { BottomSheetModal } from '@/components/bottom-sheet-modal'
import { CodeInput } from '@/components/ui/code-input'
import { PillButton } from '@/components/ui/pill-button'
import { useAppTheme } from '@/lib/use-app-theme'
import { createTokensV2 } from '@/lib/theme'

function DangerPillButton({
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
        { backgroundColor: tokens.statusBad },
        disabled ? dangerPillStyles.disabled : null,
        pressed && !disabled ? dangerPillStyles.pressed : null,
      ]}
    >
      <Text style={[dangerPillStyles.label, { color: tokens.fgOnBad }]}>
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

interface DeleteAccountModalProps {
  open: boolean
  onClose: () => void
  profile: Profile | undefined
}

export function DeleteAccountModal({
  open,
  onClose,
  profile,
}: Readonly<DeleteAccountModalProps>) {
  const { t } = useTranslation()
  const { isOnline } = useOffline()
  const { displayDate } = useDateFormat()
  const logout = useAuthStore((s) => s.logout)
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)

  const [deleteStep, setDeleteStep] = useState<'confirm' | 'code' | 'deactivated'>('confirm')
  const [deleteCodeDigits, setDeleteCodeDigits] = useState(['', '', '', '', '', ''])
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [scheduledDeletionDate, setScheduledDeletionDate] = useState<string | null>(null)
  const deleteCodeRefs = useRef<(TextInput | null)[]>([])
  const [prevOpen, setPrevOpen] = useState(open)

  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) {
      setDeleteStep('confirm')
      setDeleteCodeDigits(['', '', '', '', '', ''])
      setDeleteError('')
      setDeleteLoading(false)
      setScheduledDeletionDate(null)
    }
  }

  function backToDeleteConfirmStep() {
    setDeleteStep('confirm')
    setDeleteCodeDigits(['', '', '', '', '', ''])
    setDeleteError('')
  }

  async function handleRequestDeletion() {
    if (!isOnline) {
      setDeleteError(t('errors.offline'))
      return
    }
    setDeleteLoading(true)
    setDeleteError('')
    try {
      await apiClient(API.auth.requestDeletion, { method: 'POST' })
      setDeleteStep('code')
    } catch (err: unknown) {
      const msg = getFriendlyErrorMessage(err, t, 'profile.deleteAccount.errorGeneric', 'generic')
      setDeleteError(msg)
    } finally {
      setDeleteLoading(false)
    }
  }

  async function handleConfirmDeletion() {
    const code = deleteCodeDigits.join('')
    if (code.length !== 6) return
    if (!isOnline) {
      setDeleteError(t('errors.offline'))
      return
    }
    setDeleteLoading(true)
    setDeleteError('')
    try {
      const response = await apiClient<{ scheduledDeletionAt?: string | null }>(
        API.auth.confirmDeletion,
        {
          method: 'POST',
          body: JSON.stringify({ code }),
        },
      )
      setScheduledDeletionDate(response.scheduledDeletionAt ?? null)
      setDeleteStep('deactivated')
    } catch (err: unknown) {
      const msg = getFriendlyErrorMessage(err, t, 'profile.deleteAccount.errorGeneric', 'generic')
      setDeleteError(msg)
    } finally {
      setDeleteLoading(false)
    }
  }

  function focusDeleteCode(index: number) {
    deleteCodeRefs.current[index]?.focus()
  }

  function setDeleteCodeValue(index: number, value: string) {
    const digits = value.replace(/\D/g, '')

    if (digits.length > 1) {
      const next = ['0', '1', '2', '3', '4', '5'].map((_, i) => digits[i] ?? '')
      setDeleteCodeDigits(next)
      const nextIndex = next.findIndex((digit) => digit === '')
      if (nextIndex >= 0) {
        focusDeleteCode(nextIndex)
      } else {
        deleteCodeRefs.current[5]?.blur()
      }
      return
    }

    setDeleteCodeDigits((prev) => {
      const next = [...prev]
      next[index] = digits.slice(-1)
      return next
    })

    if (digits && index < 5) {
      focusDeleteCode(index + 1)
    }
  }

  function handleDeleteCodeKeyPress(index: number, key: string) {
    if (key === 'Backspace' && !deleteCodeDigits[index] && index > 0) {
      focusDeleteCode(index - 1)
    }
  }

  return (
    <BottomSheetModal
      open={open}
      onClose={onClose}
      title={t('profile.deleteAccount.title')}
      snapPoints={['70%']}
    >
      {!isOnline ? (
        <View style={styles.body}>
          <OfflineUnavailableState
            title={t('profile.deleteAccount.offlineTitle')}
            description={t('profile.deleteAccount.offlineDescription')}
            compact
          />
        </View>
      ) : deleteStep === 'confirm' ? (
        <View style={styles.body}>
          <View style={styles.destructiveHero}>
            <View
              style={[
                styles.destructiveHeroCircle,
                { backgroundColor: `${tokens.statusBad}24` },
              ]}
            >
              <TriangleAlert size={34} color={tokens.statusBad} strokeWidth={1.8} />
            </View>
            <View style={styles.destructiveHeroBody}>
              <Text style={[styles.deleteWarningTitle, { color: tokens.fg1 }]}>
                {profile?.hasProAccess && profile.planExpiresAt
                  ? t('profile.deleteAccount.warningPro', {
                      date: displayDate(parseISO(profile.planExpiresAt)),
                    })
                  : t('profile.deleteAccount.warningFree')}
              </Text>
              <Text style={[styles.deleteWarningDetail, { color: tokens.fg2 }]}>
                {t('profile.deleteAccount.warningDetail')}
              </Text>
            </View>
          </View>
          {deleteError ? (
            <Text style={[styles.errorTextSmall, { color: tokens.statusBadText }]}>
              {deleteError}
            </Text>
          ) : null}
          <View style={styles.modalActions}>
            <DangerPillButton
              label={
                deleteLoading
                  ? t('profile.deleteAccount.sending')
                  : t('profile.deleteAccount.sendCode')
              }
              disabled={deleteLoading}
              onPress={() => {
                void handleRequestDeletion()
              }}
            />
            <PillButton
              variant="ghost"
              fullWidth
              disabled={deleteLoading}
              onPress={onClose}
            >
              {t('common.cancel')}
            </PillButton>
          </View>
        </View>
      ) : deleteStep === 'code' ? (
        <View style={styles.body}>
          <Text
            style={[
              styles.modalDescription,
              { color: tokens.fg2, textAlign: 'center' },
            ]}
          >
            {t('profile.deleteAccount.codeInstructions')}
          </Text>
          <CodeInput
            digits={deleteCodeDigits}
            inputRefs={deleteCodeRefs}
            onChange={setDeleteCodeValue}
            onKeyPress={(index, event) =>
              handleDeleteCodeKeyPress(index, event.nativeEvent.key)
            }
            ariaLabelForIndex={(n) => t('auth.codeDigit', { n: n + 1 })}
          />
          {deleteError ? (
            <Text style={[styles.errorTextSmall, { color: tokens.statusBadText }]}>
              {deleteError}
            </Text>
          ) : null}
          <View style={styles.modalActions}>
            <DangerPillButton
              label={
                deleteLoading
                  ? t('profile.deleteAccount.deleting')
                  : t('profile.deleteAccount.confirmDelete')
              }
              disabled={deleteLoading || deleteCodeDigits.join('').length !== 6}
              onPress={() => {
                void handleConfirmDeletion()
              }}
            />
            <PillButton
              variant="ghost"
              fullWidth
              disabled={deleteLoading}
              onPress={backToDeleteConfirmStep}
            >
              {t('common.back')}
            </PillButton>
          </View>
        </View>
      ) : (
        <View style={styles.body}>
          <View
            style={[
              styles.freshStartBox,
              {
                backgroundColor: tokens.bgCard,
                borderColor: tokens.hairline,
                alignItems: 'center',
              },
            ]}
          >
            <Text style={[styles.boxLabel, { color: tokens.statusOverdueText }]}>
              {t('profile.deleteAccount.title')}
            </Text>
            <Text
              style={[
                styles.boxItemText,
                { color: tokens.fg2, textAlign: 'center' },
              ]}
            >
              {t('profile.deleteAccount.deactivated', {
                date: scheduledDeletionDate
                  ? displayDate(parseISO(scheduledDeletionDate))
                  : '',
              })}
            </Text>
          </View>
          <View style={styles.modalActions}>
            <PillButton fullWidth onPress={() => logout()}>
              {t('profile.logout')}
            </PillButton>
          </View>
        </View>
      )}
    </BottomSheetModal>
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
  destructiveHeroBody: {
    alignItems: 'center',
  },
  deleteWarningTitle: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  deleteWarningDetail: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 15,
    lineHeight: 22,
    marginTop: 6,
    textAlign: 'center',
  },

  errorTextSmall: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 12,
    textAlign: 'center',
  },
})
