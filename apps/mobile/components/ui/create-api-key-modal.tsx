import { useEffect, useState, useCallback } from 'react'
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
} from 'react-native'
import * as Clipboard from 'expo-clipboard'
import { AlertTriangle, Clipboard as ClipboardIcon, Check, X } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { colors, radius, shadows } from '@/lib/theme'

interface ApiKeyCreateResponse {
  id: string
  key: string
  name: string
}

interface CreateApiKeyModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreateKey: (name: string) => Promise<ApiKeyCreateResponse | null>
  apiError?: string | null
  onCreated?: () => void
}

export function CreateApiKeyModal({
  open,
  onOpenChange,
  onCreateKey,
  apiError,
  onCreated,
}: Readonly<CreateApiKeyModalProps>) {
  const { t } = useTranslation()
  const [keyName, setKeyName] = useState('')
  const [validationError, setValidationError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [createdKey, setCreatedKey] = useState<ApiKeyCreateResponse | null>(null)
  const [copied, setCopied] = useState(false)

  const isRevealState = createdKey !== null

  useEffect(() => {
    if (!open) {
      setKeyName('')
      setValidationError('')
      setIsSubmitting(false)
      setCreatedKey(null)
      setCopied(false)
    }
  }, [open])

  function validate(): boolean {
    setValidationError('')
    const trimmed = keyName.trim()
    if (!trimmed) {
      setValidationError(t('orbitMcp.keyNameRequired'))
      return false
    }
    if (trimmed.length > 50) {
      setValidationError(t('orbitMcp.keyNameMaxLength'))
      return false
    }
    return true
  }

  const handleSubmit = useCallback(async () => {
    if (!validate()) return

    setIsSubmitting(true)
    try {
      const result = await onCreateKey(keyName.trim())
      if (result) {
        setCreatedKey(result)
        onCreated?.()
      }
    } finally {
      setIsSubmitting(false)
    }
  }, [keyName, onCreateKey, onCreated])

  async function copyKey() {
    if (!createdKey) return
    await Clipboard.setStringAsync(createdKey.key)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Modal
      visible={open}
      transparent
      animationType="slide"
      onRequestClose={() => onOpenChange(false)}
    >
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>
              {isRevealState ? t('orbitMcp.keyCreated') : t('orbitMcp.createKey')}
            </Text>
            {!isRevealState && (
              <TouchableOpacity onPress={() => onOpenChange(false)} activeOpacity={0.7}>
                <X size={20} color={colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>

          {isRevealState ? (
            <View style={styles.content}>
              <View style={styles.warningBox}>
                <AlertTriangle size={16} color={colors.amber400} />
                <Text style={styles.warningText}>{t('orbitMcp.keyCreatedWarning')}</Text>
              </View>

              <View style={styles.keyBox}>
                <Text style={styles.keyText}>{createdKey?.key}</Text>
                <TouchableOpacity
                  style={styles.copyButton}
                  onPress={copyKey}
                  activeOpacity={0.8}
                >
                  {copied ? (
                    <Check size={16} color={colors.emerald400} />
                  ) : (
                    <ClipboardIcon size={16} color={colors.textSecondary} />
                  )}
                </TouchableOpacity>
              </View>

              {copied && (
                <Text style={styles.copiedText}>{t('orbitMcp.copied')}</Text>
              )}

              <TouchableOpacity
                style={styles.primaryButton}
                onPress={() => onOpenChange(false)}
                activeOpacity={0.8}
              >
                <Text style={styles.primaryButtonText}>{t('orbitMcp.done')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.content}>
              <Text style={styles.label}>{t('orbitMcp.keyName')}</Text>
              <TextInput
                style={styles.input}
                value={keyName}
                onChangeText={setKeyName}
                placeholder={t('orbitMcp.keyNamePlaceholder')}
                placeholderTextColor={colors.textMuted}
                maxLength={50}
              />

              {validationError ? (
                <Text style={styles.errorText}>{validationError}</Text>
              ) : null}

              {apiError ? (
                <Text style={styles.errorText}>{apiError}</Text>
              ) : null}

              <TouchableOpacity
                style={[styles.primaryButton, isSubmitting && styles.disabledButton]}
                onPress={handleSubmit}
                disabled={isSubmitting}
                activeOpacity={0.8}
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.primaryButtonText}>{t('orbitMcp.createKey')}</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
    ...shadows.lg,
    elevation: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  content: {
    gap: 16,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: colors.textMuted,
  },
  input: {
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    color: colors.textPrimary,
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(251,191,36,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.20)',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  warningText: {
    flex: 1,
    fontSize: 12,
    color: '#fcd34d',
    lineHeight: 18,
    fontWeight: '500',
  },
  keyBox: {
    position: 'relative',
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    paddingRight: 48,
  },
  keyText: {
    fontSize: 13,
    color: colors.textPrimary,
    lineHeight: 20,
    fontFamily: 'monospace',
  },
  copyButton: {
    position: 'absolute',
    right: 10,
    top: 10,
    padding: 8,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceElevated,
  },
  copiedText: {
    fontSize: 12,
    color: colors.emerald400,
    fontWeight: '500',
    textAlign: 'center',
  },
  errorText: {
    fontSize: 12,
    color: colors.red400,
  },
  primaryButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.xl,
    paddingVertical: 14,
    minHeight: 52,
    ...shadows.sm,
    elevation: 4,
  },
  disabledButton: {
    opacity: 0.5,
  },
  primaryButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.white,
  },
})
