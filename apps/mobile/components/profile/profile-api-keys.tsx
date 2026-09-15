import { useMemo, useState, type ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Clipboard from '@react-native-clipboard/clipboard'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import type { ApiKey, ApiKeyCreateRequest, ApiKeyCreateResponse } from '@orbit/shared/types'
import type { Profile } from '@orbit/shared/types/profile'
import { API } from '@orbit/shared/api'
import { stepUpMessageResponseSchema } from '@orbit/shared/types/step-up'
import { useApiKeyManagement } from '@/app/advanced-api-keys'
import { ConfirmSheet } from '@/components/ui/confirm-sheet'
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
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { buildUpgradeHref } from '@/lib/upgrade-route'
import { beginStepUpChallenge } from '@/lib/step-up-storage'

interface ProfileApiKeysProps {
  profile: Profile | undefined
  unlocked: boolean
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
        {/* eslint-disable-next-line local/max-button-words -- #74 owns this existing control copy. */}
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
        <ListRow
          key={apiKey.id}
          icon={<Key size={24} strokeWidth={1.8} color={tokens.fg1} />}
          title={apiKey.name}
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
      ))}
    </RowList>
  )
}

interface ScopeSheetProps {
  busy: boolean
  error: string | null
  onClose: () => void
  onCreate: (
    scope: string,
    onCreateGrantRequired: () => Promise<void>,
  ) => Promise<ApiKeyCreateResponse | null>
  onCreateGrantRequired: () => void
  onCreated: (createdKey: ApiKeyCreateResponse) => void
}

function ScopeSheet({
  busy,
  error,
  onClose,
  onCreate,
  onCreateGrantRequired,
  onCreated,
}: Readonly<ScopeSheetProps>) {
  const { t } = useTranslation()
  const { sheetRef, closeSheet } = useSheetHost()
  const [scope, setScope] = useState('')
  async function submit() {
    const trimmedScope = scope.trim()
    if (!trimmedScope) return
    const result = await onCreate(
      trimmedScope,
      () => Promise.resolve(closeSheet(onCreateGrantRequired)),
    )
    if (result) closeSheet(() => onCreated(result))
  }

  return (
    <Sheet
      ref={sheetRef}
      title={t('profile.apiKeys.scopeTitle')}
      onClose={onClose}
      actions={(
        <>
          <PillButton variant="ghost" onClick={() => closeSheet()}>{t('common.cancel')}</PillButton>
          <PillButton disabled={!scope.trim()} loading={busy} onClick={() => void submit()}>{t('profile.apiKeys.scopeAction')}</PillButton>
        </>
      )}
    >
      <Input
        label={t('profile.apiKeys.scopeLabel')}
        value={scope}
        onChange={setScope}
        error={error ?? undefined}
        autoFocus
        onSubmit={() => void submit()}
      />
    </Sheet>
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
      actions={<PillButton onClick={() => closeSheet()}>{t('orbitMcp.done')}</PillButton>}
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
  onStartStepUp: () => Promise<void>
}

function ApiKeyGate({ busy, error, onStartStepUp }: Readonly<ApiKeyGateProps>) {
  const { t } = useTranslation()
  const tokens = useTokens()
  const [showStepUp, setShowStepUp] = useState(false)

  if (!showStepUp) {
    return (
      <RowList>
        {/* eslint-disable-next-line local/max-button-words -- Canvas-owned control copy. */}
        <ListRow
          icon={<Key size={24} strokeWidth={1.8} color={tokens.fg1} />}
          title={t('profile.apiKeys.open')}
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
        <ListRow
          icon={<Lock size={24} strokeWidth={1.8} color={tokens.fg1} />}
          title={t('profile.apiKeys.unlock')}
          accessibilityLabel={t('profile.apiKeys.unlock')}
          trailing={<ProBadge alwaysVisible />}
          chevron={false}
          onClick={onUpgrade}
        />
      </RowList>
    )
  }
  if (!unlocked) {
    return <ApiKeyGate busy={busy} error={error} onStartStepUp={onStartStepUp} />
  }
  return children
}

interface ApiKeyCreateControlsProps {
  canCreate: boolean
  creating: boolean
  onCreate: () => void
  onCreateScoped: () => void
  scopeOpen: boolean
  stepUpBusy: boolean
}

function ApiKeyCreateControls({
  canCreate,
  creating,
  onCreate,
  onCreateScoped,
  scopeOpen,
  stepUpBusy,
}: Readonly<ApiKeyCreateControlsProps>) {
  const { t } = useTranslation()
  const tokens = useTokens()
  if (!canCreate) {
    return <Text style={[styles.message, { color: tokens.fg3 }]}>{t('orbitMcp.maxKeysReached')}</Text>
  }
  return (
    <View style={styles.actions}>
      <PillButton
        variant="secondary"
        size="sm"
        loading={creating && !scopeOpen}
        onClick={onCreate}
      >
        {t('profile.apiKeys.create')}
      </PillButton>
      {/* eslint-disable-next-line local/max-button-words -- Canvas-owned control copy. */}
      <PillButton variant="ghost" size="sm" loading={stepUpBusy} onClick={onCreateScoped}>
        {t('profile.apiKeys.createScoped')}
      </PillButton>
    </View>
  )
}

function useApiKeyStepUp() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)

  async function start() {
    if (busy) return
    setBusy(true)
    setError(false)
    try {
      await apiClient(
        API.apiKeys.requestCreationChallenge,
        { method: 'POST' },
        stepUpMessageResponseSchema,
      )
      await beginStepUpChallenge('keys')
      router.push('/step-up?operation=keys')
    } catch {
      setError(true)
      setBusy(false)
    }
  }

  return { busy, error, start }
}

function openScopeOrStartStepUp(
  createGrantAvailable: boolean,
  clearCreateKeyError: () => void,
  openScope: () => void,
  startStepUp: () => Promise<void>,
): void {
  clearCreateKeyError()
  if (!createGrantAvailable) {
    void startStepUp()
    return
  }
  openScope()
}

export function ProfileApiKeys({ profile, unlocked }: Readonly<ProfileApiKeysProps>) {
  const { t } = useTranslation()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { isOnline } = useOffline()
  const tokens = useTokens()
  const hasProAccess = profile?.hasProAccess ?? false
  const [scopeOpen, setScopeOpen] = useState(false)
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

  async function createSimpleKey() {
    const result = await createKey({ name: t('profile.apiKeys.newKeyName') })
    if (result) setCreatedKey(result)
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
        <ProBadge alwaysVisible />
      </View>
      <Text style={[styles.description, { color: tokens.fg3 }]}>{t('profile.apiKeys.description')}</Text>

      <ApiKeyAccessContent
        busy={stepUp.busy}
        error={stepUp.error}
        hasProAccess={hasProAccess}
        onStartStepUp={stepUp.start}
        onUpgrade={() => router.push(buildUpgradeHref('/profile'))}
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
            creating={creating}
            onCreate={() => void createSimpleKey()}
            onCreateScoped={() => openScopeOrStartStepUp(
              management.createGrantAvailable,
              management.clearCreateKeyError,
              () => setScopeOpen(true),
              stepUp.start,
            )}
            scopeOpen={scopeOpen}
            stepUpBusy={stepUp.busy}
          />
          {management.createKeyError && !scopeOpen ? (
            <Text accessibilityRole="alert" style={[styles.message, { color: tokens.statusBadText }]}>{management.createKeyError}</Text>
          ) : null}
          {stepUp.error ? <Text accessibilityRole="alert" style={[styles.message, { color: tokens.statusBadText }]}>{t('stepUp.requestError')}</Text> : null}
          <View style={[styles.mcpWell, { backgroundColor: tokens.bgWell }]}>
            <Text style={[styles.mcpTitle, { color: tokens.fg1 }]}>{t('profile.apiKeys.mcpTitle')}</Text>
            <Text style={[styles.description, { color: tokens.fg3 }]}>{t('profile.apiKeys.mcpLine')}</Text>
          </View>
        </>
      </ApiKeyAccessContent>

      {scopeOpen ? (
        <ScopeSheet
          busy={creating}
          error={management.createKeyError}
          onClose={() => setScopeOpen(false)}
          onCreate={(scope, onCreateGrantRequired) => createKey(
            { name: t('profile.apiKeys.newKeyName'), scopes: [scope] },
            onCreateGrantRequired,
          )}
          onCreateGrantRequired={() => {
            setScopeOpen(false)
            void stepUp.start()
          }}
          onCreated={(result) => {
            setScopeOpen(false)
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
  root: { gap: 8 },
  headingRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  heading: { fontFamily: 'Geist_500Medium', fontSize: 14 },
  description: { fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 21 },
  message: { fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 21 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  errorState: { alignItems: 'flex-start', gap: 8 },
  mcpWell: { borderRadius: 12, gap: 4, padding: 16 },
  mcpTitle: { fontFamily: 'Geist_500Medium', fontSize: 14 },
  sheetContent: { gap: 12 },
  warning: { fontFamily: 'Geist_500Medium', fontSize: 14, lineHeight: 21 },
  keyWell: { alignItems: 'center', borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 8, padding: 16 },
  keyValue: { flex: 1, fontFamily: 'GeistMono_400Regular', fontSize: 13, lineHeight: 18.2 },
})
