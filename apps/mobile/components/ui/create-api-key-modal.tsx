import { useEffect, useState, useCallback, useMemo } from 'react'
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import * as Clipboard from 'expo-clipboard'
import { useTranslation } from 'react-i18next'
import type {
  ApiKeyCreateRequest,
  ApiKeyCreateResponse,
} from '@orbit/shared/types/api-key'
import { Chip } from '@/components/ui/chip'
import { MonoToggle } from '@/components/ui/mono-toggle'
import { UnderlinedInput } from '@/components/ui/underlined-input'
import { KeyboardAwareScrollView } from '@/components/ui/keyboard-aware-scroll-view'
import { createTokensV2, type AppTokensV2 } from '@/lib/theme'
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
  onCreateKey: (
    request: ApiKeyCreateRequest,
  ) => Promise<ApiKeyCreateResponse | null>
  apiError?: string | null
  onCreated?: () => void
}

/**
 * v8 API key modal: bottom sheet with two phases -- "New key" (name, scope
 * chips, MonoToggle, expires row) and "One-time reveal" (sunk mono block).
 */
export function CreateApiKeyModal({
  open,
  onOpenChange,
  availableScopes,
  onCreateKey,
  apiError,
  onCreated,
}: Readonly<CreateApiKeyModalProps>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const styles = useMemo(() => createStyles(tokens), [tokens])
  const [keyName, setKeyName] = useState('')
  const [selectedScopes, setSelectedScopes] = useState<string[]>([])
  const [isReadOnly, setIsReadOnly] = useState(false)
  const [expiresAt, setExpiresAt] = useState('')
  const [validationError, setValidationError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [createdKey, setCreatedKey] = useState<ApiKeyCreateResponse | null>(
    null,
  )
  const [copied, setCopied] = useState(false)

  const isRevealState = createdKey !== null

  useEffect(() => {
    if (!open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset modal form when closed
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

  const validate = useCallback((): boolean => {
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
  }, [expiresAt, keyName, t])

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
        expiresAtUtc: expiresAt.trim()
          ? new Date(expiresAt).toISOString()
          : null,
      })
      if (result) {
        setCreatedKey(result)
        onCreated?.()
      }
    } finally {
      setIsSubmitting(false)
    }
  }, [
    expiresAt,
    isReadOnly,
    keyName,
    onCreateKey,
    onCreated,
    selectedScopes,
    validate,
  ])

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
          <Text style={styles.eyebrow}>
            {isRevealState
              ? t('orbitMcp.keyCreated')
              : t('orbitMcp.createKey')}
          </Text>

          {isRevealState ? (
            <View style={styles.content}>
              <Text style={styles.warningText}>
                {t('orbitMcp.keyCreatedWarning')}
              </Text>

              <View style={styles.keyBox}>
                <Pressable style={styles.copyButton} onPress={copyKey}>
                  <Text style={styles.copyButtonText}>
                    {copied ? t('orbitMcp.copied') : t('orbitMcp.copy')}
                  </Text>
                </Pressable>
                <Text style={styles.keyText}>{createdKey?.key}</Text>
              </View>

              <Text style={styles.metaLine}>
                {`${t('orbitMcp.scopesLabel')} ${
                  createdKey?.scopes.length
                    ? createdKey.scopes.length
                    : t('orbitMcp.noScopes')
                } · ${t('orbitMcp.readOnlyLabel')} ${
                  createdKey?.isReadOnly ? t('common.yes') : t('common.no')
                } · ${
                  createdKey?.expiresAtUtc
                    ? createdKey.expiresAtUtc
                    : t('common.never')
                }`}
              </Text>
            </View>
          ) : (
            <View style={styles.content}>
              <UnderlinedInput
                large
                value={keyName}
                onChangeText={setKeyName}
                placeholder={t('orbitMcp.keyNamePlaceholder')}
                maxLength={50}
              />

              <Text style={styles.sectionLabel}>{t('orbitMcp.apiKeys')}</Text>
              <ScrollView
                horizontal={false}
                style={styles.scopeList}
                contentContainerStyle={styles.scopeListContent}
              >
                {availableScopes.map((scope) => {
                  const isSelected = selectedScopes.includes(scope.scope)
                  return (
                    <Chip
                      key={scope.scope}
                      active={isSelected}
                      onPress={() => toggleScope(scope.scope)}
                    >
                      {scope.scope}
                    </Chip>
                  )
                })}
              </ScrollView>

              <View style={styles.scopeActions}>
                <Pressable
                  onPress={() =>
                    setSelectedScopes(
                      availableScopes.map((scope) => scope.scope),
                    )
                  }
                >
                  <Text style={styles.quietLinkStrong}>
                    {t('common.selectAll')}
                  </Text>
                </Pressable>
                <Pressable onPress={() => setSelectedScopes([])}>
                  <Text style={styles.quietLink}>{t('common.clear')}</Text>
                </Pressable>
              </View>

              <View style={styles.row}>
                <Text style={styles.rowLabel}>
                  {t('orbitMcp.readOnlyKeyLabel')}
                </Text>
                <MonoToggle
                  on={isReadOnly}
                  onPress={() => setIsReadOnly((current) => !current)}
                />
              </View>

              <View style={styles.row}>
                <Text style={styles.rowLabel}>
                  {t('orbitMcp.expiresAtLabel')}
                </Text>
                <View style={styles.expiresInputWrap}>
                  <UnderlinedInput
                    mono
                    value={expiresAt}
                    onChangeText={setExpiresAt}
                    placeholder={t('common.never')}
                    autoCapitalize="none"
                  />
                </View>
              </View>

              {validationError ? (
                <Text style={styles.errorText}>{validationError}</Text>
              ) : null}

              {apiError ? (
                <Text style={styles.errorText}>{apiError}</Text>
              ) : null}
            </View>
          )}

          <View style={styles.footer}>
            {isRevealState ? (
              <View style={styles.footerEnd}>
                <Pressable onPress={() => onOpenChange(false)}>
                  <Text style={styles.doneLink}>{t('orbitMcp.done')}</Text>
                </Pressable>
              </View>
            ) : (
              <>
                <Pressable onPress={() => onOpenChange(false)}>
                  <Text style={styles.quietLink}>{t('common.cancel')}</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    styles.primaryButton,
                    {
                      backgroundColor: pressed
                        ? tokens.primaryPressed
                        : tokens.primary,
                    },
                    isSubmitting && styles.disabledButton,
                  ]}
                  onPress={handleSubmit}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <ActivityIndicator size="small" color={tokens.fgOnPrimary} />
                  ) : (
                    <Text
                      style={[
                        styles.primaryButtonText,
                        { color: tokens.fgOnPrimary },
                      ]}
                    >
                      {t('orbitMcp.createKey')}
                    </Text>
                  )}
                </Pressable>
              </>
            )}
          </View>
        </View>
      </KeyboardAwareScrollView>
    </Modal>
  )
}

function createStyles(tokens: AppTokensV2) {
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
      backgroundColor: tokens.bgElev,
      borderTopWidth: 1,
      borderTopColor: tokens.hairlineStrong,
      borderTopLeftRadius: 12,
      borderTopRightRadius: 12,
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 18,
      gap: 12,
    },
    eyebrow: {
      fontFamily: 'Geist',
      fontSize: 12,
      fontWeight: '600',
      color: tokens.fg3,
    },
    content: {
      gap: 14,
    },
    sectionLabel: {
      fontFamily: 'Geist',
      fontSize: 13,
      fontWeight: '600',
      color: tokens.fg3,
      marginTop: 4,
    },
    scopeList: {
      maxHeight: 160,
    },
    scopeListContent: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      paddingBottom: 8,
    },
    scopeActions: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingBottom: 4,
      borderBottomWidth: 1,
      borderBottomColor: tokens.hairline,
    },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: tokens.hairline,
      gap: 12,
    },
    rowLabel: {
      fontFamily: 'Geist',
      fontSize: 14,
      color: tokens.fg1,
    },
    expiresInputWrap: {
      flex: 1,
      maxWidth: 160,
    },
    warningText: {
      fontFamily: 'Geist',
      fontSize: 14,
      fontStyle: 'italic',
      color: tokens.statusOverdue,
    },
    keyBox: {
      position: 'relative',
      backgroundColor: tokens.bgSunk,
      borderWidth: 1,
      borderColor: tokens.hairline,
      borderRadius: 8,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    copyButton: {
      position: 'absolute',
      top: 8,
      right: 10,
    },
    copyButtonText: {
      fontFamily: 'Geist',
      fontSize: 12,
      color: tokens.fg3,
      textDecorationLine: 'underline',
    },
    keyText: {
      fontFamily: 'GeistMono',
      fontSize: 13,
      color: tokens.fg1,
      lineHeight: 20,
    },
    metaLine: {
      fontFamily: 'GeistMono',
      fontSize: 11,
      fontWeight: '500',
      color: tokens.fg3,
    },
    errorText: {
      fontFamily: 'Geist',
      fontSize: 12,
      fontStyle: 'italic',
      color: tokens.statusOverdue,
    },
    footer: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: tokens.hairline,
    },
    footerEnd: {
      flex: 1,
      alignItems: 'flex-end',
    },
    quietLink: {
      fontFamily: 'Geist',
      fontSize: 13,
      color: tokens.fg3,
      paddingVertical: 6,
    },
    quietLinkStrong: {
      fontFamily: 'Geist',
      fontSize: 13,
      color: tokens.fg1,
      paddingVertical: 6,
    },
    doneLink: {
      fontFamily: 'Geist',
      fontSize: 13,
      color: tokens.fg1,
      paddingVertical: 6,
      textDecorationLine: 'underline',
    },
    primaryButton: {
      borderRadius: 10,
      paddingHorizontal: 18,
      paddingVertical: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryButtonText: {
      fontFamily: 'Geist',
      fontSize: 14,
      fontWeight: '600',
    },
    disabledButton: {
      opacity: 0.5,
    },
  })
}
