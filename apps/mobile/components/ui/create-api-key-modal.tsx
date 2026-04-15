import { useEffect, useState, useCallback, useMemo } from 'react'
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from 'react-native'
import * as Clipboard from 'expo-clipboard'
import { AlertTriangle, Clipboard as ClipboardIcon, Check, X } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import type { ApiKeyCreateRequest, ApiKeyCreateResponse } from '@orbit/shared/types/api-key'
import { AppTextInput } from '@/components/ui/app-text-input'
import { KeyboardAwareScrollView } from '@/components/ui/keyboard-aware-scroll-view'
import { radius } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface ScopeOption {
  scope: string
  label: string
  description: string
}

interface CreateApiKeyModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  availableScopes: ScopeOption[]
  onCreateKey: (request: ApiKeyCreateRequest) => Promise<ApiKeyCreateResponse | null>
  apiError?: string | null
  onCreated?: () => void
}

export function CreateApiKeyModal({
  open,
  onOpenChange,
  availableScopes,
  onCreateKey,
  apiError,
  onCreated,
}: Readonly<CreateApiKeyModalProps>) {
  const { t } = useTranslation()
  const { colors, shadows } = useAppTheme()
  const [keyName, setKeyName] = useState('')
  const [selectedScopes, setSelectedScopes] = useState<string[]>([])
  const [isReadOnly, setIsReadOnly] = useState(false)
  const [expiresAt, setExpiresAt] = useState('')
  const [validationError, setValidationError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [createdKey, setCreatedKey] = useState<ApiKeyCreateResponse | null>(null)
  const [copied, setCopied] = useState(false)
  const styles = useMemo(() => createStyles(colors, shadows), [colors, shadows])

  const isRevealState = createdKey !== null

  useEffect(() => {
    if (!open) {
      setKeyName('')
      setSelectedScopes([])
      setIsReadOnly(false)
      setExpiresAt('')
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
    if (expiresAt.trim()) {
      const parsed = new Date(expiresAt)
      if (Number.isNaN(parsed.getTime())) {
        setValidationError(t('auth.genericError'))
        return false
      }
    }
    return true
  }

  function toggleScope(scope: string) {
    setSelectedScopes((current) =>
      current.includes(scope)
        ? current.filter((value) => value !== scope)
        : [...current, scope],
    )
  }

  const handleSubmit = useCallback(async () => {
    if (!validate()) return

    setIsSubmitting(true)
    try {
      const result = await onCreateKey({
        name: keyName.trim(),
        scopes: selectedScopes.length > 0 ? selectedScopes : undefined,
        isReadOnly,
        expiresAtUtc: expiresAt.trim() ? new Date(expiresAt).toISOString() : null,
      })
      if (result) {
        setCreatedKey(result)
        onCreated?.()
      }
    } finally {
      setIsSubmitting(false)
    }
  }, [expiresAt, isReadOnly, keyName, onCreateKey, onCreated, selectedScopes])

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
      <KeyboardAwareScrollView
        containerStyle={styles.backdrop}
        contentContainerStyle={styles.sheetScrollContent}
        keyboardVerticalOffset={12}
        showsVerticalScrollIndicator={false}
      >
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

              <View style={styles.metaBox}>
                <Text style={styles.metaText}>
                  <Text style={styles.metaTextStrong}>{t('orbitMcp.scopesLabel')} </Text>
                  {createdKey?.scopes.length ? createdKey.scopes.join(', ') : t('orbitMcp.noScopes')}
                </Text>
                <Text style={styles.metaText}>
                  <Text style={styles.metaTextStrong}>{t('orbitMcp.readOnlyLabel')} </Text>
                  {createdKey?.isReadOnly ? t('common.yes') : t('common.no')}
                </Text>
                {createdKey?.expiresAtUtc ? (
                  <Text style={styles.metaText}>
                    <Text style={styles.metaTextStrong}>{t('orbitMcp.expiresLabel')} </Text>
                    {createdKey.expiresAtUtc}
                  </Text>
                ) : null}
              </View>

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
              <AppTextInput
                style={styles.input}
                value={keyName}
                onChangeText={setKeyName}
                placeholder={t('orbitMcp.keyNamePlaceholder')}
                placeholderTextColor={colors.textMuted}
                maxLength={50}
              />

              <View style={styles.scopeHeaderRow}>
                <Text style={styles.label}>{t('orbitMcp.apiKeys')}</Text>
                <View style={styles.scopeActions}>
                  <TouchableOpacity onPress={() => setSelectedScopes(availableScopes.map((scope) => scope.scope))}>
                    <Text style={styles.scopeActionText}>{t('common.selectAll')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setSelectedScopes([])}>
                    <Text style={styles.scopeActionText}>{t('common.clear')}</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <ScrollView style={styles.scopeList} contentContainerStyle={styles.scopeListContent}>
                {availableScopes.map((scope) => {
                  const isSelected = selectedScopes.includes(scope.scope)
                  return (
                    <TouchableOpacity
                      key={scope.scope}
                      style={[styles.scopeChip, isSelected && styles.scopeChipSelected]}
                      onPress={() => toggleScope(scope.scope)}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.scopeChipTitle, isSelected && styles.scopeChipTitleSelected]}>
                        {scope.scope}
                      </Text>
                      <Text style={[styles.scopeChipDescription, isSelected && styles.scopeChipDescriptionSelected]}>
                        {scope.description}
                      </Text>
                    </TouchableOpacity>
                  )
                })}
              </ScrollView>

              <TouchableOpacity
                style={[styles.readOnlyToggle, isReadOnly && styles.readOnlyToggleSelected]}
                onPress={() => setIsReadOnly((current) => !current)}
                activeOpacity={0.8}
              >
                <Text style={[styles.readOnlyToggleText, isReadOnly && styles.readOnlyToggleTextSelected]}>
                  {t('orbitMcp.readOnlyKeyLabel')}
                </Text>
              </TouchableOpacity>

              <Text style={styles.label}>{t('orbitMcp.expiresAtLabel')}</Text>
              <AppTextInput
                style={styles.input}
                value={expiresAt}
                onChangeText={setExpiresAt}
                placeholder="2026-04-20T18:00:00Z"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
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
      </KeyboardAwareScrollView>
    </Modal>
  )
}

function createStyles(
  colors: ReturnType<typeof useAppTheme>['colors'],
  shadows: ReturnType<typeof useAppTheme>['shadows'],
) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.6)',
    },
    sheetScrollContent: {
      flexGrow: 1,
      justifyContent: 'flex-end',
      paddingTop: 24,
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
    metaBox: {
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
      padding: 14,
      gap: 6,
    },
    metaText: {
      fontSize: 12,
      color: colors.textSecondary,
    },
    metaTextStrong: {
      color: colors.textPrimary,
      fontWeight: '700',
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
    scopeHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    scopeActions: {
      flexDirection: 'row',
      gap: 12,
    },
    scopeActionText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    scopeList: {
      maxHeight: 180,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
    },
    scopeListContent: {
      padding: 8,
      gap: 8,
    },
    scopeChip: {
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 12,
      paddingVertical: 10,
      gap: 4,
    },
    scopeChipSelected: {
      borderColor: colors.primary,
      backgroundColor: colors.primary_10,
    },
    scopeChipTitle: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    scopeChipTitleSelected: {
      color: colors.primary,
    },
    scopeChipDescription: {
      fontSize: 11,
      color: colors.textSecondary,
    },
    scopeChipDescriptionSelected: {
      color: colors.textPrimary,
    },
    readOnlyToggle: {
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    readOnlyToggleSelected: {
      borderColor: colors.primary,
      backgroundColor: colors.primary_10,
    },
    readOnlyToggleText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    readOnlyToggleTextSelected: {
      color: colors.primary,
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
}
