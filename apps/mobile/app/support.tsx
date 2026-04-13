import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ArrowLeft, Send } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { API } from '@orbit/shared/api'
import { isValidEmail } from '@orbit/shared/utils/email'
import { buildSupportRequestBody, getErrorMessage } from '@orbit/shared/utils'
import { createColors } from '@/lib/theme'
import { useProfile } from '@/hooks/use-profile'
import { apiClient } from '@/lib/api-client'
import { AppTextInput } from '@/components/ui/app-text-input'
import { useAppTheme } from '@/lib/use-app-theme'
import { useOffline } from '@/hooks/use-offline'
import { OfflineUnavailableState } from '@/components/ui/offline-unavailable-state'

type AppColors = ReturnType<typeof createColors>

export default function SupportScreen() {
  const router = useRouter()
  const { t } = useTranslation()
  const { colors } = useAppTheme()
  const { isOnline } = useOffline()
  const styles = useMemo(() => createStyles(colors), [colors])
  const { profile } = useProfile()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nameError, setNameError] = useState<string | null>(null)
  const [emailError, setEmailError] = useState<string | null>(null)

  useEffect(() => {
    if (profile) {
      setName(profile.name ?? '')
      setEmail(profile.email ?? '')
    }
  }, [profile])

  function validateForm(): boolean {
    setNameError(null)
    setEmailError(null)
    let valid = true

    const effectiveName = name.trim() || profile?.name
    if (!effectiveName) {
      setNameError(t('profile.support.nameRequired'))
      valid = false
    }

    const effectiveEmail = email.trim() || profile?.email
    if (!effectiveEmail) {
      setEmailError(t('profile.support.emailRequired'))
      valid = false
    } else if (!isValidEmail(effectiveEmail)) {
      setEmailError(t('profile.support.emailInvalid'))
      valid = false
    }

    return valid
  }

  const handleSend = useCallback(async () => {
    if (!isOnline) {
      setError(t('calendarSync.notConnected'))
      return
    }

    if (!subject.trim() || !message.trim()) return
    if (!validateForm()) return

    setSending(true)
    setError(null)
    setSuccess(false)

    try {
      await apiClient(API.support.send, {
        method: 'POST',
        body: JSON.stringify(
          buildSupportRequestBody(profile, {
            name,
            email,
            subject,
            message,
          }),
        ),
      })

      setSuccess(true)
      setSubject('')
      setMessage('')
    } catch (err: unknown) {
      setError(getErrorMessage(err, t('auth.genericError')))
    } finally {
      setSending(false)
    }
  }, [email, isOnline, message, name, profile, subject, t])

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="always"
      >
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.push('/profile')}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={t('common.goBack')}
          >
            <ArrowLeft size={20} color={colors.textMuted} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('profile.support.title')}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardDescription}>
            {t('profile.support.description')}
          </Text>
          {!isOnline && (
            <OfflineUnavailableState
              title={t('calendarSync.notConnected')}
              description={`${t('profile.support.send')} / ${t('profile.support.description')}`}
              compact
            />
          )}

          {success && (
            <View style={styles.successBanner}>
              <Text style={styles.successBannerText}>{t('profile.support.success')}</Text>
            </View>
          )}

          {error && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorBannerText}>{error}</Text>
            </View>
          )}

          <View style={styles.row}>
            <View style={styles.halfField}>
              <AppTextInput
                style={[styles.input, nameError ? styles.inputError : null]}
                value={name}
                onChangeText={setName}
                placeholder={t('profile.support.namePlaceholder')}
                placeholderTextColor={colors.textMuted}
              />
              {nameError && <Text style={styles.inlineError}>{nameError}</Text>}
            </View>
            <View style={styles.halfField}>
              <AppTextInput
                style={[styles.input, emailError ? styles.inputError : null]}
                value={email}
                onChangeText={setEmail}
                placeholder={t('profile.support.emailPlaceholder')}
                placeholderTextColor={colors.textMuted}
                keyboardType="email-address"
                autoCapitalize="none"
              />
              {emailError && <Text style={styles.inlineError}>{emailError}</Text>}
            </View>
          </View>

          <AppTextInput
            style={styles.input}
            value={subject}
            onChangeText={setSubject}
            placeholder={t('profile.support.subjectPlaceholder')}
            placeholderTextColor={colors.textMuted}
            maxLength={100}
          />

          <AppTextInput
            style={[styles.input, styles.textArea]}
            value={message}
            onChangeText={setMessage}
            placeholder={t('profile.support.messagePlaceholder')}
            placeholderTextColor={colors.textMuted}
            multiline
            numberOfLines={6}
            textAlignVertical="top"
            maxLength={2000}
          />

          <TouchableOpacity
            style={[
              styles.sendButton,
              (!subject.trim() || !message.trim() || sending || !isOnline) &&
                styles.sendButtonDisabled,
            ]}
            onPress={handleSend}
            disabled={!subject.trim() || !message.trim() || sending || !isOnline}
            activeOpacity={0.8}
          >
            {sending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Send size={16} color="#fff" />
                <Text style={styles.sendButtonText}>{t('profile.support.send')}</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: colors.background },
    container: { flex: 1 },
    scrollContent: { paddingHorizontal: 20, paddingBottom: 40 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingTop: 32,
      paddingBottom: 24,
    },
    backButton: { padding: 8, marginLeft: -8 },
    headerTitle: {
      fontSize: 28,
      fontWeight: '700',
      color: colors.textPrimary,
      letterSpacing: -0.5,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.borderMuted,
      padding: 20,
      gap: 12,
    },
    cardDescription: {
      fontSize: 14,
      color: colors.textSecondary,
      lineHeight: 20,
    },
    successBanner: {
      backgroundColor: colors.emerald500_10,
      borderWidth: 1,
      borderColor: colors.emerald500_30,
      borderRadius: 16,
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    successBannerText: {
      fontSize: 14,
      color: colors.emerald400,
    },
    errorBanner: {
      backgroundColor: colors.red500_10,
      borderWidth: 1,
      borderColor: colors.red500_30,
      borderRadius: 16,
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    errorBannerText: {
      fontSize: 14,
      color: colors.red400,
    },
    row: {
      flexDirection: 'row',
      gap: 12,
    },
    halfField: {
      flex: 1,
    },
    input: {
      backgroundColor: colors.background,
      borderRadius: 16,
      paddingHorizontal: 16,
      paddingVertical: 12,
      fontSize: 14,
      color: colors.textPrimary,
      borderWidth: 1,
      borderColor: colors.border,
    },
    inputError: {
      borderColor: colors.red500,
    },
    textArea: {
      minHeight: 120,
      paddingTop: 12,
    },
    inlineError: {
      fontSize: 11,
      color: colors.red400,
      marginTop: 4,
      paddingHorizontal: 4,
    },
    sendButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: colors.primary,
      borderRadius: 20,
      paddingVertical: 14,
    },
    sendButtonDisabled: {
      opacity: 0.5,
    },
    sendButtonText: {
      fontSize: 15,
      fontWeight: '700',
      color: '#fff',
    },
  })
}
