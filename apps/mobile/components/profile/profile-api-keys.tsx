
import { ActionRow } from '@/components/ui/action-row'
import { useMemo, useState, type ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Clipboard from '@react-native-clipboard/clipboard'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import type { ApiKey, ApiKeyCreateRequest, ApiKeyCreateResponse } from '@orbit/shared/types'
import type { Profile } from '@orbit/shared/types/profile'
import { getApiKeyNameError } from '@orbit/shared/validation'
import { API } from '@orbit/shared/api'
import { getMcpEndpointUrl } from '@orbit/shared/utils/advanced-settings'
import { stepUpMessageResponseSchema } from '@orbit/shared/types/step-up'
import { useDateFormat } from '@/hooks/use-date-format'
import { useApiKeyManagement } from '@/app/advanced-api-keys'
import { ConfirmSheet } from '@/components/ui/confirm-sheet'
import { DiscardChangesSheet } from '@/components/ui/discard-changes-sheet'
import { useDismissGuard } from '@/hooks/use-dismiss-guard'
import { Input } from '@/components/ui/input'
import { Key, Lock } from '@/components/ui/icons'
import { ListRow } from '@/components/ui/list-row'
import { PillButton } from '@/components/ui/pill-button'
import { ProBadge } from '@/components/ui/pro-badge'
import { RowList } from '@/components/ui/row-list'
import { Sheet, useSheetHost } from '@/components/ui/sheet'
import { StepUp } from '@/components/ui/step-up'
import { useOffline } from '@/hooks/use-offline'
import { apiClient } from '@/lib/api-client'
import { API_BASE } from '@/lib/api-base'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { buildUpgradeHref } from '@/lib/upgrade-route'
import { beginStepUpChallenge } from '@/lib/step-up-storage'
import { useAuthStore } from '@/stores/auth-store'
import { getAccountGeneration } from '@/lib/session-epoch'

interface ProfileApiKeysProps {
  profile: Profile | undefined
  unlocked: boolean
}

function ApiKeyDetails({ apiKey }: Readonly<{ apiKey: ApiKey }>) {
  const { t } = useTranslation()
  const tokens = useTokens()
  const { displayDateMedium } = useDateFormat()
  const textStyle = [styles.keyDetailText, { color: tokens.fg3 }]
  return (
    <View style={styles.keyDetails}>
      <Text selectable style={textStyle}>{apiKey.scopes.length > 0 ? apiKey.scopes.join(', ') : t('orbitMcp.noScopes')}</Text>
      <Text selectable style={textStyle}>{apiKey.isReadOnly ? t('orbitMcp.permReadOnly') : t('orbitMcp.permReadWrite')}</Text>
      <View style={styles.keyDates}>
        <View style={styles.keyDateRow}>
          <Text selectable style={textStyle}>{t('orbitMcp.created')}</Text>
          <Text selectable style={textStyle}>{displayDateMedium(apiKey.createdAtUtc)}</Text>
        </View>
        <View style={styles.keyDateRow}>
          <Text selectable style={textStyle}>{t('orbitMcp.lastUsed')}</Text>
          <Text selectable style={textStyle}>{apiKey.lastUsedAtUtc ? displayDateMedium(apiKey.lastUsedAtUtc) : t('orbitMcp.never')}</Text>
        </View>
      </View>
      {apiKey.expiresAtUtc ? <Text selectable style={textStyle}>{t('orbitMcp.expiresOn', { date: displayDateMedium(apiKey.expiresAtUtc) })}</Text> : null}
    </View>
  )
}

interface ApiKeyListProps {
  apiKeys: ApiKey[]
  isLoading: boolean
  loadError: Error | null
  onRevoke: (id: string) => void
  onRetry: () => void
}

function ApiKeyList({ apiKeys, isLoading, loadError, onRevoke, onRetry }: Readonly<ApiKeyListProps>) {
  const { t } = useTranslation()
  const tokens = useTokens()
  if (isLoading) {
    return <Text accessibilityRole="progressbar" style={[styles.message, { color: tokens.fg3 }]}>{t('common.loading')}</Text>
  }
  if (loadError) {
    return (
      <View style={styles.errorState}>
        <Text accessibilityRole="alert" style={[styles.message, { color: tokens.statusBadText }]}>{t('orbitMcp.apiKeysError')}</Text>
        <PillButton size="sm" variant="ghost" onClick={onRetry}>{t('common.retry')}</PillButton>
      </View>
    )
  }
  if (apiKeys.length === 0) {
    return <Text style={[styles.message, { color: tokens.fg3 }]}>{t('orbitMcp.noKeys')}</Text>
  }

  return (
    <RowList>
      {apiKeys.map((apiKey) => (
        <View key={apiKey.id}>
          <ListRow
            compact
            icon={<Key size={24} strokeWidth={1.8} color={tokens.fg1} />}
            title={apiKey.name}
            textMode="personal"
            wrapTitle
            value={`${apiKey.keyPrefix}…`}
            chevron={false}
            action={{
              icon: 'trash',
              label: t('profile.apiKeys.revokeNamed', { name: apiKey.name }),
              danger: true,
              onPress: () => onRevoke(apiKey.id),
            }}
          />
          <ApiKeyDetails apiKey={apiKey} />
        </View>
      ))}
    </RowList>
  )
}

interface CreateKeySheetProps {
  scoped: boolean
  busy: boolean
  error: string | null
  onClose: () => void
  onCreate: (
    request: ApiKeyCreateRequest,
    onCreateGrantRequired: () => Promise<void>,
  ) => Promise<ApiKeyCreateResponse | null>
  onCreateGrantRequired: () => void
  onCreated: (createdKey: ApiKeyCreateResponse) => void
}

function CreateKeySheet({
  scoped,
  busy,
  error,
  onClose,
  onCreate,
  onCreateGrantRequired,
  onCreated,
}: Readonly<CreateKeySheetProps>) {
  const tokens = useTokens()
  const { t } = useTranslation()
  const { sheetRef, closeSheet } = useSheetHost()
  const [scope, setScope] = useState('')
  const [name, setName] = useState('')
  const [nameFocusRequest, setNameFocusRequest] = useState(0)
  const nameError = nameFocusRequest > 0 ? getApiKeyNameError(name) : null
  const dismissGuard = useDismissGuard({
    isDirty: name !== '' || scope !== '',
    onDismiss: () => closeSheet(onClose),
  })
  async function submit() {
    if (busy) return
    if (getApiKeyNameError(name)) {
      setNameFocusRequest((request) => request + 1)
      return
    }
    const trimmedScope = scope.trim()
    if (scoped && !trimmedScope) return
    const result = await onCreate(
      { name: name.trim(), ...(scoped ? { scopes: [trimmedScope] } : {}) },
      () => Promise.resolve(closeSheet(onCreateGrantRequired)),
    )
    if (result) closeSheet(() => onCreated(result))
  }

  return (
    <>
      <Sheet
        ref={sheetRef}
        title={t(scoped ? 'profile.apiKeys.scopeTitle' : 'profile.apiKeys.create')}
        onClose={!busy && dismissGuard.canDismiss ? onClose : undefined}
        onAttemptDismiss={busy ? undefined : dismissGuard.requestDismiss}
        actions={(
          <ActionRow>
            <PillButton size="sm" variant="ghost" disabled={busy} onClick={dismissGuard.requestDismiss}>{t('common.cancel')}</PillButton>
            <PillButton size="sm" disabled={scoped && !scope.trim()} loading={busy} onClick={() => void submit()}>{t('profile.apiKeys.scopeAction')}</PillButton>
          </ActionRow>
        )}
      >
        <View style={{ gap: 16 }}>
          <Input
            label={t('orbitMcp.keyName')}
            placeholder={t('orbitMcp.keyNamePlaceholder')}
            name="api-key-name"
            autoComplete="off"
            required
            value={name}
            onChange={setName}
            error={nameError ? t(nameError) : undefined}
            disabled={busy}
            autoFocus
            focusRequest={nameFocusRequest}
            onSubmit={() => void submit()}
          />
          {scoped ? (
            <Input
              label={t('profile.apiKeys.scopeLabel')}
              value={scope}
              onChange={setScope}
              disabled={busy}
              onSubmit={() => void submit()}
            />
          ) : null}
          {error ? <Text accessibilityRole="alert" style={[styles.message, { color: tokens.statusBadText }]}>{error}</Text> : null}
        </View>
      </Sheet>
      <DiscardChangesSheet
        open={dismissGuard.showDiscardDialog}
        onKeepEditing={dismissGuard.cancelDismiss}
        onDiscard={dismissGuard.confirmDismiss}
      />
    </>
  )
}

interface RevealSheetProps {
  createdKey: ApiKeyCreateResponse
  onClose: () => void
}

function RevealSheet({ createdKey, onClose }: Readonly<RevealSheetProps>) {
  const { t } = useTranslation()
  const tokens = useTokens()
  const { sheetRef, closeSheet } = useSheetHost()
  const [copied, setCopied] = useState(false)

  return (
    <Sheet
      ref={sheetRef}
      title={t('orbitMcp.revealHeading')}
      onClose={onClose}
      actions={<PillButton size="sm" onClick={() => closeSheet()}>{t('orbitMcp.done')}</PillButton>}
    >
      <View style={styles.sheetContent}>
        <Text style={[styles.warning, { color: tokens.statusOverdueText }]}>{t('orbitMcp.keyCreatedWarning')}</Text>
        <View style={[styles.keyWell, { backgroundColor: tokens.bgField, borderColor: tokens.borderControl }]}>
          <Text selectable style={[styles.keyValue, { color: tokens.fg2 }]}>{createdKey.key}</Text>
          <PillButton
            size="sm"
            variant="ghost"
            onClick={() => {
              Clipboard.setString(createdKey.key)
              setCopied(true)
            }}
          >
            {copied ? t('orbitMcp.copied') : t('orbitMcp.copy')}
          </PillButton>
        </View>
      </View>
    </Sheet>
  )
}

function useTokens() {
  const { currentScheme, currentTheme } = useAppTheme()
  return useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
}

interface ApiKeyGateProps {
  busy: boolean
  error: boolean
  activeApiKeyCount: number | null | undefined
  onStartStepUp: () => Promise<void>
}

function ApiKeyGate({ busy, error, activeApiKeyCount, onStartStepUp }: Readonly<ApiKeyGateProps>) {
  const { t } = useTranslation()
  const tokens = useTokens()
  const [showStepUp, setShowStepUp] = useState(false)

  if (!showStepUp) {
    return (
      <RowList>
        {/* eslint-disable-next-line local/max-button-words -- Canvas-owned control copy. */}
        <ListRow
          compact
          icon={<Key size={24} strokeWidth={1.8} color={tokens.fg1} />}
          title={t('profile.apiKeys.open')}
          wrapTitle
          value={activeApiKeyCount == null ? undefined : activeApiKeyCount === 0
            ? t('profile.apiKeys.noKeys')
            : t('profile.apiKeys.activeCount', { count: activeApiKeyCount })}
          wrapValue
          onClick={() => setShowStepUp(true)}
        />
      </RowList>
    )
  }

  return (
    <>
      <StepUp
        message={t('profile.apiKeys.stepUpBody')}
        actionLabel={t('profile.apiKeys.stepUpAction')}
        busy={busy}
        onAction={() => void onStartStepUp()}
      />
      {error ? <Text accessibilityRole="alert" style={[styles.message, { color: tokens.statusBadText }]}>{t('stepUp.requestError')}</Text> : null}
    </>
  )
}

interface ApiKeyAccessContentProps extends ApiKeyGateProps {
  children: ReactNode
  hasProAccess: boolean
  onUpgrade: () => void
  unlocked: boolean
}

function ApiKeyAccessContent({
  busy,
  children,
  error,
  activeApiKeyCount,
  hasProAccess,
  onStartStepUp,
  onUpgrade,
  unlocked,
}: Readonly<ApiKeyAccessContentProps>) {
  const { t } = useTranslation()
  const tokens = useTokens()
  if (!hasProAccess) {
    return (
      <RowList>
        {/* eslint-disable-next-line local/max-button-words -- Canvas Orbit Perfil line 108 controls this label under D42. */}
        <ListRow
          compact
          icon={<Lock size={24} strokeWidth={1.8} color={tokens.fg1} />}
          title={t('profile.apiKeys.unlock')}
          accessibilityLabel={t('profile.apiKeys.unlock')}
          trailing={<ProBadge alwaysVisible label={t('common.proBadge')} />}
          chevron={false}
          onClick={onUpgrade}
        />
      </RowList>
    )
  }
  if (!unlocked) {
    return <ApiKeyGate busy={busy} error={error} activeApiKeyCount={activeApiKeyCount} onStartStepUp={onStartStepUp} />
  }
  return children
}

interface ApiKeyCreateControlsProps {
  canCreate: boolean
  onCreate: () => void
  onCreateScoped: () => void
  stepUpBusy: boolean
}

function ApiKeyCreateControls({
  canCreate,
  onCreate,
  onCreateScoped,
  stepUpBusy,
}: Readonly<ApiKeyCreateControlsProps>) {
  const { t } = useTranslation()
  const tokens = useTokens()
  if (!canCreate) {
    return <Text style={[styles.message, { color: tokens.fg3 }]}>{t('orbitMcp.maxKeysReached')}</Text>
  }
  return (
    <View style={styles.actions}><ActionRow>
      {/* eslint-disable-next-line local/max-button-words -- Canvas-owned control copy. */}
      <PillButton variant="ghost" size="sm" loading={stepUpBusy} onClick={onCreateScoped}>
        {t('profile.apiKeys.createScoped')}
      </PillButton>
      <PillButton
        variant="secondary"
        size="sm"
        loading={stepUpBusy}
        onClick={onCreate}
      >
        {t('profile.apiKeys.create')}
      </PillButton>
    </ActionRow></View>
  )
}

function useApiKeyStepUp() {
  const router = useRouter()
  const accountId = useAuthStore((state) => state.user?.userId ?? null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)

  async function start() {
    if (busy) return
    const startingAccountGeneration = getAccountGeneration()
    const ownsAccount = () => getAccountGeneration() === startingAccountGeneration
    setBusy(true)
    setError(false)
    try {
      await apiClient(
        API.apiKeys.requestCreationChallenge,
        { method: 'POST' },
        stepUpMessageResponseSchema,
      )
      if (!ownsAccount()) return
      await beginStepUpChallenge('keys', accountId)
      if (!ownsAccount()) return
      router.push('/step-up?operation=keys')
    } catch {
      if (!ownsAccount()) return
      setError(true)
      setBusy(false)
    }
  }

  return { busy, error, start }
}

function openCreationOrStartStepUp(
  createGrantAvailable: boolean,
  clearCreateKeyError: () => void,
  openCreation: () => void,
  startStepUp: () => Promise<void>,
): void {
  clearCreateKeyError()
  if (!createGrantAvailable) {
    void startStepUp()
    return
  }
  openCreation()
}

export function ProfileApiKeys({ profile, unlocked }: Readonly<ProfileApiKeysProps>) {
  const { t } = useTranslation()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { isOnline } = useOffline()
  const tokens = useTokens()
  const hasProAccess = profile?.hasProAccess ?? false
  const [creationMode, setCreationMode] = useState<'simple' | 'scoped' | null>(null)
  const [creating, setCreating] = useState(false)
  const [createdKey, setCreatedKey] = useState<ApiKeyCreateResponse | null>(null)
  const stepUp = useApiKeyStepUp()

  const management = useApiKeyManagement({
    hasProAccess: hasProAccess && unlocked,
    isOnline,
    queryClient,
    t,
  })

  async function createKey(
    request: ApiKeyCreateRequest,
    onCreateGrantRequired: () => Promise<void> = stepUp.start,
  ) {
    setCreating(true)
    try {
      return await management.handleCreateKey(request, onCreateGrantRequired)
    } finally {
      setCreating(false)
    }
  }

  const revokingKey = management.apiKeys.find((apiKey) => apiKey.id === management.revokingKeyId)

  return (
    <View
      testID="profile-api-keys"
      accessibilityState={{ busy: unlocked && management.apiKeysQuery.isLoading }}
      style={styles.root}
    >
      <View style={styles.headingRow}>
        <Text accessibilityRole="header" style={[styles.heading, { color: tokens.fg2 }]}>
          {t('profile.settingsRows.apiKeysMcp')}
        </Text>
        <ProBadge alwaysVisible label={t('common.proBadge')} />
      </View>
      <Text style={[styles.description, { color: tokens.fg3 }]}>{t('profile.apiKeys.description')}</Text>

      <ApiKeyAccessContent
        activeApiKeyCount={profile?.activeApiKeyCount}
        busy={stepUp.busy}
        error={stepUp.error}
        hasProAccess={hasProAccess}
        onStartStepUp={stepUp.start}
        onUpgrade={() => router.push(buildUpgradeHref('/profile/astra'))}
        unlocked={unlocked}
      >
        <>
          <ApiKeyList
            apiKeys={management.apiKeys}
            isLoading={management.apiKeysQuery.isLoading}
            loadError={management.apiKeysQuery.error}
            onRevoke={management.setRevokingKeyId}
            onRetry={() => void management.apiKeysQuery.refetch()}
          />
          <ApiKeyCreateControls
            canCreate={management.canCreateKey}
            onCreate={() => openCreationOrStartStepUp(
              management.createGrantAvailable,
              management.clearCreateKeyError,
              () => setCreationMode('simple'),
              stepUp.start,
            )}
            onCreateScoped={() => openCreationOrStartStepUp(
              management.createGrantAvailable,
              management.clearCreateKeyError,
              () => setCreationMode('scoped'),
              stepUp.start,
            )}
            stepUpBusy={stepUp.busy}
          />
          {management.createKeyError && !creationMode ? (
            <Text accessibilityRole="alert" style={[styles.message, { color: tokens.statusBadText }]}>{management.createKeyError}</Text>
          ) : null}
          {stepUp.error ? <Text accessibilityRole="alert" style={[styles.message, { color: tokens.statusBadText }]}>{t('stepUp.requestError')}</Text> : null}
          <View style={[styles.mcpWell, { backgroundColor: tokens.bgWell }]}>
            <Text style={[styles.mcpTitle, { color: tokens.fg1 }]}>{t('profile.apiKeys.mcpTitle')}</Text>
            <Text style={[styles.description, { color: tokens.fg3 }]}>{t('profile.apiKeys.mcpLine')}</Text>
            <Text selectable style={[styles.mcpEndpoint, { color: tokens.fg2 }]}>{getMcpEndpointUrl(API_BASE)}</Text>
          </View>
        </>
      </ApiKeyAccessContent>

      {creationMode ? (
        <CreateKeySheet
          scoped={creationMode === 'scoped'}
          busy={creating}
          error={management.createKeyError}
          onClose={() => setCreationMode(null)}
          onCreate={createKey}
          onCreateGrantRequired={() => {
            setCreationMode(null)
            void stepUp.start()
          }}
          onCreated={(result) => {
            setCreationMode(null)
            setCreatedKey(result)
          }}
        />
      ) : null}
      {createdKey ? (
        <RevealSheet createdKey={createdKey} onClose={() => setCreatedKey(null)} />
      ) : null}
      <ConfirmSheet
        open={revokingKey != null}
        title={revokingKey ? t('profile.apiKeys.revokeNamedQuestion', { name: revokingKey.name }) : ''}
        titleMode="typed"
        message={t('profile.apiKeys.revokeBody')}
        cancelLabel={t('orbitMcp.cancel')}
        confirmLabel={t('orbitMcp.revoke')}
        destructive
        onCancel={() => management.setRevokingKeyId(null)}
        onConfirm={() => {
          if (revokingKey) {
            management.revokeKeyMutation.mutate(revokingKey.id)
            management.setRevokingKeyId(null)
          }
        }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  keyDetails: { gap: 8, paddingHorizontal: 16, paddingBottom: 16 },
  keyDates: { gap: 4 },
  keyDateRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  keyDetailText: { flexShrink: 1, fontFamily: 'GeistMono_400Regular', fontSize: 12, lineHeight: 16.8, letterSpacing: 0.24, fontVariant: ['tabular-nums'] },
  root: { gap: 8 },
  headingRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  heading: { fontFamily: 'Geist_500Medium', fontSize: 14 },
  description: { fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 21 },
  message: { fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 21 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  errorState: { alignItems: 'flex-start', gap: 8 },
  mcpWell: { borderRadius: 12, gap: 4, padding: 16 },
  mcpTitle: { fontFamily: 'Geist_500Medium', fontSize: 14 },
  mcpEndpoint: { fontFamily: 'GeistMono_400Regular', fontSize: 12, lineHeight: 16.8 },
  sheetContent: { gap: 12 },
  warning: { fontFamily: 'Geist_500Medium', fontSize: 14, lineHeight: 21 },
  keyWell: { alignItems: 'center', borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 8, padding: 16 },
  keyValue: { flex: 1, fontFamily: 'GeistMono_400Regular', fontSize: 12, lineHeight: 16.8 },
})
