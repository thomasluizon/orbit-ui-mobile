'use client'

import * as Menu from '@/components/ui/dropdown-menu'
import { IconButton } from '@/components/ui/icon-button'


import { ActionRow } from '@/components/ui/action-row'

import { useEffect, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useQueryClient } from '@tanstack/react-query'
import type { ApiKeyCreateRequest, ApiKeyCreateResponse } from '@orbit/shared/types'
import { getFriendlyErrorMessage, openApiKeyScopeOrStartStepUp, submitApiKeyCreation } from '@orbit/shared/utils'
import type { Profile } from '@orbit/shared/types/profile'
import { API_KEY_EXPIRY_DEFAULT } from '@orbit/shared/validation'
import { getMcpEndpointUrl } from '@orbit/shared/utils/advanced-settings'
import { McpCodeClient } from '@/components/profile/mcp-code-client'
import { ApiKeyList } from '@/components/profile/api-key-list'
import { ApiKeyCreateFlow } from '@/components/profile/api-key-create-flow'
import { requestApiKeyCreationChallenge } from '@/lib/actions/api-keys'
import { ConfirmSheet } from '@/components/ui/confirm-sheet'
import { Key, Plus } from '@/components/ui/icons'
import { ListRow } from '@/components/ui/list-row'
import { ProBadge } from '@/components/ui/pro-badge'
import { RowList } from '@/components/ui/row-list'
import { StepUp } from '@/components/ui/step-up'
import { Switch } from '@/components/ui/switch'
import { useApiKeyManagement } from '@/hooks/use-api-key-management'
import { useAccountScopedState } from '@/hooks/use-session-reset'
import { getAccountGeneration } from '@/lib/session-epoch'
import { beginStepUpChallenge, clearPendingApiKeyPermission, readPendingApiKeyPermission, rememberApiKeyCreationPermission, readApiKeyExpiryDraft, retainApiKeyExpiryDraft } from '@/lib/step-up-storage'
import { accountEventApiBase } from '@/lib/account-event-api-base'
import { getHeldAccountId, useHeldAccountId } from '@/stores/auth-store'

interface ProfileApiKeysProps {
  profile: Profile | undefined
  unlocked: boolean
}

interface ApiKeyGateProps {
  busy: boolean
  accountReady: boolean
  error: string | null
  activeApiKeyCount: number | null | undefined
  onStartStepUp: () => Promise<void>
}

function ApiKeyGate({ busy, accountReady, error, activeApiKeyCount, onStartStepUp }: Readonly<ApiKeyGateProps>) {
  const t = useTranslations()
  const [showStepUp, setShowStepUp] = useAccountScopedState(false)

  if (!showStepUp) {
    let keyCountLabel: string | undefined
    if (activeApiKeyCount === 0) {
      keyCountLabel = t('profile.apiKeys.noKeys')
    } else if (activeApiKeyCount != null) {
      keyCountLabel = t('profile.apiKeys.activeCount', { count: activeApiKeyCount })
    }

    return (
      <RowList>
        {/* eslint-disable-next-line local/max-button-words -- Canvas-owned control copy. */}
        <ListRow
          compact
          icon={<Key size={24} strokeWidth={2} color="var(--fg-1)" aria-hidden="true" />}
          title={t('profile.apiKeys.open')}
          wrapTitle
          value={keyCountLabel}
          wrapValue
          onClick={() => setShowStepUp(true)}
        />
      </RowList>
    )
  }

  return (
    <>
      <fieldset disabled={!accountReady} className="m-0 min-w-0 border-0 p-0">
        <StepUp
          message={t('profile.apiKeys.stepUpBody')}
          actionLabel={t('profile.apiKeys.stepUpAction')}
          busy={busy}
          onAction={() => void onStartStepUp()}
        />
      </fieldset>
      {error ? <p role="alert" className="text-sm text-[var(--status-bad-text)]">{error}</p> : null}

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
  accountReady,
  children,
  error,
  activeApiKeyCount,
  hasProAccess,
  onStartStepUp,
  onUpgrade,
  unlocked,
}: Readonly<ApiKeyAccessContentProps>) {
  const t = useTranslations()
  if (!hasProAccess) {
    return (
      <RowList>
        {/* eslint-disable-next-line local/max-button-words -- Canvas Orbit Perfil keysUnlock controls this label under D42. */}
        <ListRow
          compact
          title={t('profile.apiKeys.unlock')}
          accessibilityLabel={t('profile.apiKeys.unlock')}
          textMode="label"
          value={<ProBadge alwaysVisible label={t('common.proBadge')} />}
          chevron={false}
          onClick={onUpgrade}
        />
      </RowList>
    )
  }
  if (!unlocked) {
    return <ApiKeyGate busy={busy} accountReady={accountReady} error={error} activeApiKeyCount={activeApiKeyCount} onStartStepUp={onStartStepUp} />
  }
  return children
}

interface ApiKeyCreateControlsProps {
  canCreate: boolean
  creating: boolean
  isReadOnly: boolean
  onReadOnlyChange: (checked: boolean) => void
  onCreate: () => void
  onCreateScoped: () => void
  stepUpBusy: boolean
}

function ApiKeyCreateControls({
  canCreate,
  creating,
  isReadOnly,
  onReadOnlyChange,
  onCreate,
  onCreateScoped,
  stepUpBusy,
}: Readonly<ApiKeyCreateControlsProps>) {
  const t = useTranslations()
  if (!canCreate) {
    return <p className="text-sm text-[var(--fg-3)]">{t('orbitMcp.maxKeysReached')}</p>
  }
  return (
    <div className="flex flex-col" style={{ gap: 8 }}>
      <Switch
        label={t('orbitMcp.readOnlyKeyLabel')}
        checked={isReadOnly}
        disabled={creating || stepUpBusy}
        onChange={onReadOnlyChange}
      />
      <Menu.Root>
        <ActionRow>
          <Menu.Trigger asChild disabled={creating || stepUpBusy}>
            <IconButton label={t('profile.apiKeys.create')} disabled={creating || stepUpBusy} loading={stepUpBusy}><Plus size={20} aria-hidden="true" /></IconButton>
          </Menu.Trigger>
        </ActionRow>
        <Menu.Content title={t('profile.apiKeys.create')} items={[
          { id: 'scoped', label: t('profile.apiKeys.createScoped'), disabled: creating || stepUpBusy },
          { id: 'unscoped', label: t('profile.apiKeys.create'), disabled: creating || stepUpBusy },
        ]} onSelect={(id) => { if (id === 'scoped') onCreateScoped(); else onCreate() }} />
      </Menu.Root>
    </div>
  )
}

function useApiKeyStepUp(isReadOnly: boolean, expiresAt: string) {
  const router = useRouter()
  const t = useTranslations()
  const accountId = useHeldAccountId()
  const [busy, setBusy] = useAccountScopedState(false)
  const [error, setError] = useAccountScopedState<string | null>(null)

  async function start() {
    if (busy || accountId === null) return
    const intendedAccountId = getHeldAccountId()
    const accountGeneration = getAccountGeneration()

    setBusy(true)
    setError(null)
    try {
      await requestApiKeyCreationChallenge(intendedAccountId)
      if (getHeldAccountId() !== intendedAccountId || getAccountGeneration() !== accountGeneration) {
        setError(t('errors.api.accountChanged'))
        setBusy(false)
        return
      }
      beginStepUpChallenge('keys', accountId)
      rememberApiKeyCreationPermission(isReadOnly)
      retainApiKeyExpiryDraft(expiresAt)
      router.push('/step-up?operation=keys')
    } catch (error) {
      setError(getFriendlyErrorMessage(error, t, 'stepUp.requestError'))

      setBusy(false)
    }
  }

  return { busy, error, start, accountReady: accountId !== null }
}

export function ProfileApiKeys({ profile, unlocked }: Readonly<ProfileApiKeysProps>) {
  const t = useTranslations()
  const router = useRouter()
  const queryClient = useQueryClient()
  const hasProAccess = profile?.hasProAccess ?? false
  const [creationMode, setCreationMode] = useAccountScopedState<'simple' | 'scoped' | null>(null)
  const [creating, setCreating] = useAccountScopedState(false)
  const [expiresAt, setExpiresAt] = useAccountScopedState(readApiKeyExpiryDraft)
  const [isReadOnly, setIsReadOnly] = useAccountScopedState(readPendingApiKeyPermission)
  const [createdKey, setCreatedKey] = useAccountScopedState<ApiKeyCreateResponse | null>(null)
  const stepUp = useApiKeyStepUp(isReadOnly, expiresAt)

  useEffect(clearPendingApiKeyPermission, [])

  const management = useApiKeyManagement({
    hasProAccess: hasProAccess && unlocked,
    queryClient,
    t,
  })

  async function createKey(
    request: ApiKeyCreateRequest,
    onCreateGrantRequired: () => Promise<void> = stepUp.start,
  ) {
    if (creating) return null
    return submitApiKeyCreation(request, {
      getAccountGeneration,
      setCreating,
      createKey: (request) => management.handleCreateKey(request, onCreateGrantRequired),
      retainExpiryDraft: retainApiKeyExpiryDraft,
    })
  }

  const revokingKey = management.apiKeys.find((apiKey) => apiKey.id === management.revokingKeyId)

  return (
    <section
      data-testid="profile-api-keys"
      aria-busy={unlocked && management.apiKeysQuery.isLoading}
      className="flex flex-col"
      style={{ gap: 8 }}
    >
      <div className="flex items-center" style={{ gap: 8 }}>
        <h2 className="font-sans text-[14px] font-medium text-[var(--fg-2)]">
          {t('profile.settingsRows.apiKeysMcp')}
        </h2>
        <ProBadge alwaysVisible label={t('common.proBadge')} />
      </div>
      <p className="font-sans text-[14px] leading-[1.5] text-[var(--fg-3)] [text-wrap:pretty]">
        {t('profile.apiKeys.description')}
      </p>

      <ApiKeyAccessContent
        activeApiKeyCount={profile?.activeApiKeyCount}
        accountReady={stepUp.accountReady}
        busy={stepUp.busy}
        error={stepUp.error}
        hasProAccess={hasProAccess}
        onStartStepUp={stepUp.start}
        onUpgrade={() => router.push('/upgrade?from=%2Fprofile%2Fai')}
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
            isReadOnly={isReadOnly}
            onReadOnlyChange={setIsReadOnly}
            onCreate={() => openApiKeyScopeOrStartStepUp(
              management.createGrantAvailable,
              management.clearCreateKeyError,
              () => setCreationMode('simple'),
              stepUp.start,
            )}
            onCreateScoped={() => openApiKeyScopeOrStartStepUp(
              management.createGrantAvailable,
              management.clearCreateKeyError,
              () => setCreationMode('scoped'),
              stepUp.start,
            )}
            stepUpBusy={stepUp.busy}
          />
          {management.createKeyError && !creationMode ? (
            <p role="alert" className="text-sm text-[var(--status-bad-text)]">{management.createKeyError}</p>
          ) : null}
          {management.revokeKeyError ? (
            <p role="alert" className="text-sm text-[var(--status-bad-text)]">{management.revokeKeyError}</p>
          ) : null}
          {stepUp.error ? <p role="alert" className="text-sm text-[var(--status-bad-text)]">{stepUp.error}</p> : null}
          <McpCodeClient endpoint={getMcpEndpointUrl(accountEventApiBase())} />
        </>
      </ApiKeyAccessContent>

      {(creationMode || createdKey) ? (
        <ApiKeyCreateFlow
          scoped={creationMode === 'scoped'}
          busy={creating}
          error={management.createKeyError}
          isReadOnly={isReadOnly}
          onReadOnlyChange={setIsReadOnly}
          expiresAt={expiresAt}
          timeZone={profile?.timeZone}
          onExpiryChange={setExpiresAt}
          createdKey={createdKey}
          onCreate={(request, onCreateGrantRequired) => createKey({ ...request, isReadOnly }, onCreateGrantRequired)}
          onCreateGrantRequired={() => { setCreationMode(null); void stepUp.start() }}
          onCreated={(result) => { setCreationMode(null); setCreatedKey(result) }}
          onClose={() => { setCreationMode(null); setCreatedKey(null); setExpiresAt(API_KEY_EXPIRY_DEFAULT); retainApiKeyExpiryDraft(API_KEY_EXPIRY_DEFAULT) }}
        />
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
            management.clearRevokeKeyError()
            management.revokeKeyMutation.mutate(revokingKey.id)
            management.setRevokingKeyId(null)
          }
        }}
      />
    </section>
  )
}
