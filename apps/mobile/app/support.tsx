import { useState, useEffect } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native'
import { useRouter } from 'expo-router'
import { ArrowLeft, Send } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { isValidEmail } from '@orbit/shared/utils/email'
import { useProfile } from '@/hooks/use-profile'
import { apiClient } from '@/lib/api-client'

// ---------------------------------------------------------------------------
// Colors
// ---------------------------------------------------------------------------

const colors = {
  primary: '#8b5cf6',
  background: '#07060e',
  surface: '#13111f',
  surfaceElevated: '#1a1829',
  border: 'rgba(255,255,255,0.07)',
  textPrimary: '#f0eef6',
  textSecondary: '#9b95ad',
  textMuted: '#7a7490',
  green: '#22c55e',
}

// ---------------------------------------------------------------------------
// Support Screen
// ---------------------------------------------------------------------------

export default function SupportScreen() {
  const router = useRouter()
  const { t } = useTranslation()
  const { profile } = useProfile()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [nameError, setNameError] = useState<string | null>(null)
  const [emailError, setEmailError] = useState<string | null>(null)

  // Pre-fill from profile
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

  async function handleSend() {
    if (!subject.trim() || !message.trim()) return
    if (!validateForm()) return
    setSending(true)
    try {
      await apiClient('/api/support', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim() || profile?.name,
          email: email.trim() || profile?.email,
          subject: subject.trim(),
          message: message.trim(),
        }),
      })
      Alert.alert(t('profile.support.title'), t('profile.support.success'), [
        { text: 'OK', onPress: () => router.back() },
      ])
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('auth.genericError')
      Alert.alert(t('common.error'), msg)
    } finally {
      setSending(false)
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
            activeOpacity={0.7}
          >
            <ArrowLeft size={20} color={colors.textMuted} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('profile.support.title')}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>{t('profile.support.title')}</Text>
          <Text style={styles.cardDescription}>
            {t('profile.support.description')}
          </Text>

          {/* Name & Email row */}
          <View style={styles.row}>
            <View style={styles.halfField}>
              <Text style={styles.fieldLabel}>{t('profile.support.namePlaceholder')}</Text>
              <TextInput
                style={[styles.input, nameError ? styles.inputError : null]}
                value={name}
                onChangeText={setName}
                placeholder={t('profile.support.namePlaceholder')}
                placeholderTextColor={colors.textMuted}
              />
              {nameError && <Text style={styles.errorText}>{nameError}</Text>}
            </View>
            <View style={styles.halfField}>
              <Text style={styles.fieldLabel}>{t('profile.support.emailPlaceholder')}</Text>
              <TextInput
                style={[styles.input, emailError ? styles.inputError : null]}
                value={email}
                onChangeText={setEmail}
                placeholder={t('profile.support.emailPlaceholder')}
                placeholderTextColor={colors.textMuted}
                keyboardType="email-address"
                autoCapitalize="none"
              />
              {emailError && <Text style={styles.errorText}>{emailError}</Text>}
            </View>
          </View>

          <Text style={styles.fieldLabel}>{t('profile.support.subjectPlaceholder')}</Text>
          <TextInput
            style={styles.input}
            value={subject}
            onChangeText={setSubject}
            placeholder={t('profile.support.subjectPlaceholder')}
            placeholderTextColor={colors.textMuted}
            maxLength={100}
          />

          <Text style={styles.fieldLabel}>{t('profile.support.messagePlaceholder')}</Text>
          <TextInput
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
              (!subject.trim() || !message.trim() || sending) &&
                styles.sendButtonDisabled,
            ]}
            onPress={handleSend}
            disabled={!subject.trim() || !message.trim() || sending}
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

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 40 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: 16,
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
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
    gap: 12,
  },
  cardLabel: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: colors.textMuted,
  },
  cardDescription: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    marginTop: 4,
  },
  input: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  textArea: {
    minHeight: 120,
    paddingTop: 12,
  },
  sendButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    borderRadius: 16,
    paddingVertical: 14,
    marginTop: 4,
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  sendButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  halfField: {
    flex: 1,
  },
  inputError: {
    borderColor: '#ef4444',
  },
  errorText: {
    fontSize: 11,
    color: '#f87171',
    marginTop: 4,
    paddingHorizontal: 4,
  },
})
