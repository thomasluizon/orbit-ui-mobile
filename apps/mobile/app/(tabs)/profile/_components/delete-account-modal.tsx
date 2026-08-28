import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { parseISO } from 'date-fns'
import type { Profile } from '@orbit/shared/types/profile'
import { API } from '@orbit/shared/api'
import { getFriendlyErrorMessage } from '@orbit/shared/utils'
import { apiClient } from '@/lib/api-client'
import { beginStepUpChallenge } from '@/lib/step-up-storage'
import { useDateFormat } from '@/hooks/use-date-format'
import { useAppTheme } from '@/lib/use-app-theme'
import { createTokensV2 } from '@/lib/theme'
import { Sheet } from '@/components/ui/sheet'
import { PillButton } from '@/components/ui/pill-button'
import { TriangleAlert } from '@/components/ui/icons'

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
  const router = useRouter()
  const { displayDate } = useDateFormat()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const warningMessage = (() => {
    if (profile?.hasProAccess && profile.planExpiresAt) {
      return t('profile.deleteAccount.warningPro', {
        date: displayDate(parseISO(profile.planExpiresAt)),
      })
    }
    return t('profile.deleteAccount.warningFree')
  })()

  function handleClose() {
    setLoading(false)
    setError('')
    onClose()
  }

  async function handleRequestDeletion() {
    setLoading(true)
    setError('')
    try {
      await apiClient(API.auth.requestDeletion, { method: 'POST' })
      await beginStepUpChallenge('delete')
      onClose()
      router.push('/step-up?operation=delete')
    } catch (caught: unknown) {
      setError(
        getFriendlyErrorMessage(
          caught,
          t,
          'profile.deleteAccount.errorGeneric',
          'generic',
        ),
      )
      setLoading(false)
    }
  }

  if (!open) return null

  return (
    <Sheet
      open
      onClose={handleClose}
      title={t('profile.deleteAccount.headingAreYouSure')}
    >
      <View style={styles.body}>
        <View style={styles.hero}>
          <View
            style={[
              styles.heroCircle,
              { backgroundColor: `${tokens.statusBad}24` },
            ]}
          >
            <TriangleAlert size={34} color={tokens.statusBad} strokeWidth={1.8} />
          </View>
          <View style={styles.copy}>
            <Text style={[styles.title, { color: tokens.fg1 }]}>{warningMessage}</Text>
            <Text style={[styles.description, { color: tokens.fg2 }]}>
              {t('profile.deleteAccount.warningDetail')}
            </Text>
          </View>
        </View>
        {error ? (
          <Text accessibilityRole="alert" style={[styles.error, { color: tokens.statusBadText }]}>
            {error}
          </Text>
        ) : null}
        <View style={styles.actions}>
          <PillButton
            variant="destructive"
            onClick={() => void handleRequestDeletion()}
            disabled={loading}
            loading={loading}
          >
            {t('profile.deleteAccount.sendCode')}
          </PillButton>
          <PillButton variant="ghost" disabled={loading} onClick={handleClose}>
            {t('common.cancel')}
          </PillButton>
        </View>
      </View>
    </Sheet>
  )
}

const styles = StyleSheet.create({
  body: {
    gap: 16,
  },
  hero: {
    alignItems: 'center',
    gap: 16,
    paddingTop: 4,
  },
  heroCircle: {
    alignItems: 'center',
    borderRadius: 999,
    height: 80,
    justifyContent: 'center',
    width: 80,
  },
  copy: {
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontFamily: 'Geist_500Medium',
    fontSize: 15,
    lineHeight: 23,
    textAlign: 'center',
  },
  description: {
    fontFamily: 'Geist_400Regular',
    fontSize: 15,
    lineHeight: 23,
    textAlign: 'center',
  },
  error: {
    fontFamily: 'Geist_400Regular',
    fontSize: 13,
  },
  actions: {
    gap: 12,
    paddingTop: 8,
  },
})
