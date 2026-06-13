import { useEffect, useState, useCallback, useMemo } from 'react'
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as Clipboard from 'expo-clipboard'
import { useTranslation } from 'react-i18next'
import type {
  ApiKeyCreateRequest,
  ApiKeyCreateResponse,
} from '@orbit/shared/types/api-key'
import {
  MAX_API_KEY_NAME_LENGTH,
  parseApiKeyExpiryUtc,
} from '@orbit/shared/validation'
import { BottomSheetModal } from '@/components/bottom-sheet-modal'
import { BottomSheetAppTextInput } from '@/components/ui/bottom-sheet-app-text-input'
import { KeyboardAwareBottomSheetScrollView } from '@/components/ui/keyboard-aware-scroll-view'
import { Chip } from '@/components/ui/chip'
import { PillButton } from '@/components/ui/pill-button'
import { Switch } from '@/components/ui/settings-row'
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

type ApiKeyModalStyles = ReturnType<typeof createStyles>

interface ApiKeyRevealPanelProps {
  tokens: AppTokensV2
  styles: ApiKeyModalStyles
  createdKey: ApiKeyCreateResponse
  copied: boolean
  onCopy: () => void
  onClose: () => void
}

function ApiKeyRevealPanel({
  tokens,
  styles,
  createdKey,
  copied,
  onCopy,
  onClose,
}: Readonly<ApiKeyRevealPanelProps>) {
  const { t } = useTranslation()
  return (
    <>
      <Text style={styles.warningText}>
        {t('orbitMcp.keyCreatedWarning')}
      </Text>

      <View style={styles.keyWell}>
        <Pressable
          style={styles.copyButton}
          onPress={onCopy}
          accessibilityRole="button"
          accessibilityLabel={t('orbitMcp.copy')}
          hitSlop={8}
        >
          <Text
            style={[
              styles.copyButtonText,
              { color: copied ? tokens.statusDone : tokens.primary },
            ]}
          >
            {copied ? t('orbitMcp.copied') : t('orbitMcp.copy')}
          </Text>
        </Pressable>
        <Text style={styles.keyText} selectable>
          {createdKey.key}
        </Text>
      </View>

      <Text style={styles.metaLine}>
        {`${t('orbitMcp.scopesLabel')} ${
          createdKey.scopes.length
            ? createdKey.scopes.length
            : t('orbitMcp.noScopes')
        } · ${t('orbitMcp.readOnlyLabel')} ${
          createdKey.isReadOnly ? t('common.yes') : t('common.no')
        } · ${
          createdKey.expiresAtUtc
            ? createdKey.expiresAtUtc
            : t('common.never')
        }`}
      </Text>

      <View style={styles.footerEnd}>
        <PillButton
          onPress={onClose}
          accessibilityLabel={t('orbitMcp.done')}
        >
          {t('orbitMcp.done')}
        </PillButton>
      </View>
    </>
  )
}

interface ApiKeyCreateFormProps {
  tokens: AppTokensV2
  styles: ApiKeyModalStyles
  availableScopes: ScopeOption[]
  keyName: string
  selectedScopes: string[]
  isReadOnly: boolean
  expiresAt: string
  validationError: string
  apiError?: string | null
  isSubmitting: boolean
  onChangeName: (value: string) => void
  onChangeExpiresAt: (value: string) => void
  onToggleScope: (scope: string) => void
  onSelectAllScopes: () => void
  onClearScopes: () => void
  onToggleReadOnly: () => void
  onCancel: () => void
  onSubmit: () => void
}

function ApiKeyCreateForm({
  tokens,
  styles,
  availableScopes,
  keyName,
  selectedScopes,
  isReadOnly,
  expiresAt,
  validationError,
  apiError,
  isSubmitting,
  onChangeName,
  onChangeExpiresAt,
  onToggleScope,
  onSelectAllScopes,
  onClearScopes,
  onToggleReadOnly,
  onCancel,
  onSubmit,
}: Readonly<ApiKeyCreateFormProps>) {
  const { t } = useTranslation()
  return (
    <>
      <View>
        <Text style={styles.fieldLabel}>{t('orbitMcp.keyName')}</Text>
        <BottomSheetAppTextInput
          value={keyName}
          onChangeText={onChangeName}
          placeholder={t('orbitMcp.keyNamePlaceholder')}
          maxLength={MAX_API_KEY_NAME_LENGTH}
          accessibilityLabel={t('orbitMcp.keyName')}
        />
      </View>

      <View>
        <Text style={styles.fieldLabel}>{t('orbitMcp.scopesLabel')}</Text>
        <View style={styles.scopeWrap}>
          {availableScopes.map((scope) => (
            <Chip
              key={scope.scope}
              active={selectedScopes.includes(scope.scope)}
              onPress={() => onToggleScope(scope.scope)}
            >
              {scope.scope}
            </Chip>
          ))}
        </View>
        <View style={styles.scopeActions}>
          <Pressable
            onPress={onSelectAllScopes}
            accessibilityRole="button"
            accessibilityLabel={t('common.selectAll')}
          >
            <Text style={styles.quietLinkStrong}>
              {t('common.selectAll')}
            </Text>
          </Pressable>
          <Pressable
            onPress={onClearScopes}
            accessibilityRole="button"
            accessibilityLabel={t('common.clear')}
          >
            <Text style={styles.quietLink}>{t('common.clear')}</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.switchRow}>
        <Text style={styles.switchRowLabel}>
          {t('orbitMcp.readOnlyKeyLabel')}
        </Text>
        <Switch
          on={isReadOnly}
          onToggle={onToggleReadOnly}
          accessibilityLabel={t('orbitMcp.readOnlyKeyLabel')}
        />
      </View>

      <View>
        <Text style={styles.fieldLabel}>
          {t('orbitMcp.expiresAtLabel')}
        </Text>
        <BottomSheetAppTextInput
          value={expiresAt}
          onChangeText={onChangeExpiresAt}
          placeholder={t('common.never')}
          autoCapitalize="none"
          style={styles.monoInput}
          accessibilityLabel={t('orbitMcp.expiresAtLabel')}
        />
      </View>

      {validationError ? (
        <Text style={styles.errorText} accessibilityRole="alert">
          {validationError}
        </Text>
      ) : null}

      {apiError ? (
        <Text style={styles.errorText} accessibilityRole="alert">
          {apiError}
        </Text>
      ) : null}

      <View style={styles.footer}>
        <PillButton
          variant="ghost"
          style={styles.footerButton}
          onPress={onCancel}
          disabled={isSubmitting}
          accessibilityLabel={t('common.cancel')}
        >
          {t('common.cancel')}
        </PillButton>
        <PillButton
          style={styles.footerButton}
          onPress={onSubmit}
          disabled={isSubmitting}
          accessibilityLabel={t('orbitMcp.createKey')}
        >
          {isSubmitting ? (
            <ActivityIndicator size="small" color={tokens.fgOnPrimary} />
          ) : (
            t('orbitMcp.createKey')
          )}
        </PillButton>
      </View>
    </>
  )
}

/**
 * API key sheet with two phases: "Create" (name well, scope chips, read-only
 * switch row, expires well) and the one-time reveal (bg-field mono well with
 * a copy action). Pill CTAs in the footer.
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
  const insets = useSafeAreaInsets()
  const styles = useMemo(
    () => createStyles(tokens, insets.bottom),
    [tokens, insets.bottom],
  )
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
    if (trimmed.length > MAX_API_KEY_NAME_LENGTH) {
      setValidationError(t('orbitMcp.keyNameMaxLength'))
      return false
    }
    if (expiresAt.trim()) {
      if (!parseApiKeyExpiryUtc(expiresAt)) {
        setValidationError(t('orbitMcp.invalidExpiry'))
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
      const expiresAtUtc = expiresAt.trim()
        ? parseApiKeyExpiryUtc(expiresAt)?.toISOString() ?? null
        : null

      const result = await onCreateKey({
        name: keyName.trim(),
        scopes: selectedScopes.length > 0 ? selectedScopes : undefined,
        isReadOnly,
        expiresAtUtc,
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
    <BottomSheetModal
      open={open}
      onClose={() => onOpenChange(false)}
      title={
        isRevealState ? t('orbitMcp.revealHeading') : t('orbitMcp.createHeading')
      }
      contentKey={isRevealState ? 'reveal' : 'create'}
      snapPoints={['80%', '95%']}
      canDismiss={!isRevealState}
    >
      <KeyboardAwareBottomSheetScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="always"
      >
        {isRevealState && createdKey ? (
          <ApiKeyRevealPanel
            tokens={tokens}
            styles={styles}
            createdKey={createdKey}
            copied={copied}
            onCopy={() => {
              void copyKey()
            }}
            onClose={() => onOpenChange(false)}
          />
        ) : (
          <ApiKeyCreateForm
            tokens={tokens}
            styles={styles}
            availableScopes={availableScopes}
            keyName={keyName}
            selectedScopes={selectedScopes}
            isReadOnly={isReadOnly}
            expiresAt={expiresAt}
            validationError={validationError}
            apiError={apiError}
            isSubmitting={isSubmitting}
            onChangeName={setKeyName}
            onChangeExpiresAt={setExpiresAt}
            onToggleScope={toggleScope}
            onSelectAllScopes={() =>
              setSelectedScopes(availableScopes.map((scope) => scope.scope))
            }
            onClearScopes={() => setSelectedScopes([])}
            onToggleReadOnly={() => setIsReadOnly((current) => !current)}
            onCancel={() => onOpenChange(false)}
            onSubmit={() => {
              void handleSubmit()
            }}
          />
        )}
      </KeyboardAwareBottomSheetScrollView>
    </BottomSheetModal>
  )
}

function createStyles(tokens: AppTokensV2, bottomInset: number) {
  return StyleSheet.create({
    scroll: {
      flex: 1,
    },
    content: {
      paddingTop: 8,
      paddingHorizontal: 20,
      paddingBottom: Math.max(bottomInset, 16) + 24,
      gap: 18,
    },
    fieldLabel: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 14,
      color: tokens.fg2,
      marginBottom: 8,
    },
    scopeWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
    },
    scopeActions: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingTop: 10,
    },
    quietLink: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 13,
      color: tokens.fg3,
      paddingVertical: 8,
    },
    quietLinkStrong: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 13,
      color: tokens.fg1,
      paddingVertical: 8,
    },
    switchRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 12,
      minHeight: 54,
      borderRadius: 14,
      backgroundColor: tokens.bgField,
      borderWidth: 1,
      borderColor: tokens.hairline,
      paddingHorizontal: 16,
      paddingVertical: 8,
    },
    switchRowLabel: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 16,
      color: tokens.fg1,
      flexShrink: 1,
    },
    monoInput: {
      fontFamily: 'Roboto_400Regular',
      fontSize: 15,
      fontVariant: ['tabular-nums'],
    },
    warningText: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 14,
      lineHeight: 20,
      color: tokens.statusOverdueText,
    },
    keyWell: {
      position: 'relative',
      backgroundColor: tokens.bgField,
      borderWidth: 1,
      borderColor: tokens.hairline,
      borderRadius: 14,
      paddingHorizontal: 16,
      paddingVertical: 14,
      paddingRight: 76,
    },
    copyButton: {
      position: 'absolute',
      top: 10,
      right: 12,
      padding: 4,
      zIndex: 1,
    },
    copyButtonText: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 13,
    },
    keyText: {
      fontFamily: 'Roboto_400Regular',
      fontSize: 13,
      color: tokens.fg1,
      lineHeight: 21,
      fontVariant: ['tabular-nums'],
    },
    metaLine: {
      fontFamily: 'Roboto_400Regular',
      fontSize: 11,
      letterSpacing: 0.22,
      color: tokens.fg3,
      fontVariant: ['tabular-nums'],
    },
    errorText: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 13,
      color: tokens.statusBad,
    },
    footer: {
      flexDirection: 'row',
      gap: 10,
      paddingTop: 8,
    },
    footerButton: {
      flex: 1,
    },
    footerEnd: {
      alignItems: 'flex-end',
      paddingTop: 8,
    },
  })
}
