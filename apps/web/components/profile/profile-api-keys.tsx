'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useQueryClient } from '@tanstack/react-query'
import type { ApiKey, ApiKeyCreateRequest, ApiKeyCreateResponse } from '@orbit/shared/types'
import type { Profile } from '@orbit/shared/types/profile'
import { requestApiKeyCreationChallenge } from '@/app/actions/api-keys'
import { ConfirmSheet } from '@/components/ui/confirm-sheet'
import { Input } from '@/components/ui/input'
import { Key, Lock } from '@/components/ui/icons'
import { ListRow } from '@/components/ui/list-row'
import { PillButton } from '@/components/ui/pill-button'
import { ProBadge } from '@/components/ui/pro-badge'
import { RowList } from '@/components/ui/row-list'
import { Sheet, useSheetHost } from '@/components/ui/sheet'
import { StepUp } from '@/components/ui/step-up'
import { useApiKeyManagement } from '@/hooks/use-api-key-management'
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
  const t = useTranslations()
  if (isLoading) {
    return <p role="status" className="text-sm text-[var(--fg-3)]">{t('common.loading')}</p>
  }
  if (loadError) {
    return (
      <div className="flex flex-col items-start" style={{ gap: 8 }}>
        <p role="alert" className="text-sm text-[var(--status-bad-text)]">{t('orbitMcp.apiKeysError')}</p>
        {/* eslint-disable-next-line local/max-button-words -- #74 owns this existing control copy. */}
        <PillButton size="sm" variant="ghost" onClick={onRetry}>{t('common.retry')}</PillButton>
      </div>
    )
  }
  if (apiKeys.length === 0) {
    return <p className="text-sm text-[var(--fg-3)]">{t('orbitMcp.noKeys')}</p>
  }

  return (
    <RowList>
      {apiKeys.map((apiKey) => (
        <ListRow
          key={apiKey.id}
          icon={<Key size={24} strokeWidth={1.8} color="var(--fg-1)" aria-hidden="true" />}
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
  onCreate: (scope: string) => Promise<ApiKeyCreateResponse | null>
  onCreated: (createdKey: ApiKeyCreateResponse) => void
}

function ScopeSheet({ busy, error, onClose, onCreate, onCreated }: Readonly<ScopeSheetProps>) {
  const t = useTranslations()
  const { sheetRef, closeSheet } = useSheetHost()
  const [scope, setScope] = useState('')
  async function submit() {
    const trimmedScope = scope.trim()
    if (!trimmedScope) return
    const result = await onCreate(trimmedScope)
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
  const t = useTranslations()
  const { sheetRef, closeSheet } = useSheetHost()
  const [copied, setCopied] = useState(false)
  const key = createdKey.key

  async function copyKey() {
    try {
      await navigator.clipboard.writeText(key)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <Sheet
      ref={sheetRef}
      title={t('orbitMcp.revealHeading')}
      onClose={onClose}
      actions={<PillButton onClick={() => closeSheet()}>{t('orbitMcp.done')}</PillButton>}
    >
      <div className="flex flex-col" style={{ gap: 12 }}>
        <p className="text-sm font-medium text-[var(--status-overdue-text)]">
          {t('orbitMcp.keyCreatedWarning')}
        </p>
        <div className="flex items-center rounded-[12px] bg-[var(--bg-field)]" style={{ gap: 8, padding: 16, boxShadow: 'inset 0 0 0 1px var(--border-control)' }}>
          <code className="min-w-0 flex-1 break-all font-mono text-[13px] text-[var(--fg-2)]">{key}</code>
          <PillButton size="sm" variant="ghost" onClick={() => void copyKey()}>
            {copied ? t('orbitMcp.copied') : t('orbitMcp.copy')}
          </PillButton>
        </div>
      </div>
    </Sheet>
  )
}

function ApiKeyGate() {
  const t = useTranslations()
  const router = useRouter()
  const [showStepUp, setShowStepUp] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)

  async function startStepUp() {
    setBusy(true)
    setError(false)
    try {
      await requestApiKeyCreationChallenge()
      beginStepUpChallenge('keys')
      router.push('/step-up?operation=keys')
    } catch {
      setError(true)
      setBusy(false)
    }
  }

  if (!showStepUp) {
    return (
      <RowList>
        {/* eslint-disable-next-line local/max-button-words -- Canvas-owned control copy. */}
        <ListRow
          icon={<Key size={24} strokeWidth={1.8} color="var(--fg-1)" aria-hidden="true" />}
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
        onAction={() => void startStepUp()}
      />
      {error ? <p role="alert" className="text-sm text-[var(--status-bad-text)]">{t('stepUp.requestError')}</p> : null}
    </>
  )
}

export function ProfileApiKeys({ profile, unlocked }: Readonly<ProfileApiKeysProps>) {
  const t = useTranslations()
  const router = useRouter()
  const queryClient = useQueryClient()
  const hasProAccess = profile?.hasProAccess ?? false
  const management = useApiKeyManagement({
    hasProAccess: hasProAccess && unlocked,
    queryClient,
    t,
  })
  const [scopeOpen, setScopeOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createdKey, setCreatedKey] = useState<ApiKeyCreateResponse | null>(null)

  async function createKey(request: ApiKeyCreateRequest) {
    setCreating(true)
    try {
      return await management.handleCreateKey(request)
    } finally {
      setCreating(false)
    }
  }

  async function createSimpleKey() {
    const result = await createKey({ name: t('profile.apiKeys.newKeyName') })
    if (result) setCreatedKey(result)
  }

  function openScopeSheet() {
    management.clearCreateKeyError()
    setScopeOpen(true)
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
        <h3 className="font-sans text-[14px] font-medium text-[var(--fg-2)]">
          {t('profile.settingsRows.apiKeysMcp')}
        </h3>
        <ProBadge alwaysVisible />
      </div>
      <p className="font-sans text-[14px] leading-[1.5] text-[var(--fg-3)] [text-wrap:pretty]">
        {t('profile.apiKeys.description')}
      </p>

      {!hasProAccess ? (
        <RowList>
          { }
          <ListRow
            icon={<Lock size={24} strokeWidth={1.8} color="var(--fg-1)" aria-hidden="true" />}
            title={t('profile.apiKeys.unlock')}
            accessibilityLabel={t('profile.apiKeys.unlock')}
            trailing={<ProBadge alwaysVisible />}
            chevron={false}
            onClick={() => router.push('/upgrade')}
          />
        </RowList>
      ) : !unlocked ? (
        <ApiKeyGate />
      ) : (
        <>
          <ApiKeyList
            apiKeys={management.apiKeys}
            isLoading={management.apiKeysQuery.isLoading}
            loadError={management.apiKeysQuery.error}
            onRevoke={management.setRevokingKeyId}
            onRetry={() => void management.apiKeysQuery.refetch()}
          />
          {!management.canCreateKey ? (
            <p className="text-sm text-[var(--fg-3)]">{t('orbitMcp.maxKeysReached')}</p>
          ) : (
            <div className="flex flex-wrap" style={{ gap: 8 }}>
              <PillButton
                variant="secondary"
                size="sm"
                loading={creating && !scopeOpen}
                onClick={() => void createSimpleKey()}
              >
                {t('profile.apiKeys.create')}
              </PillButton>
              {/* eslint-disable-next-line local/max-button-words -- Canvas-owned control copy. */}
              <PillButton variant="ghost" size="sm" onClick={openScopeSheet}>
                {t('profile.apiKeys.createScoped')}
              </PillButton>
            </div>
          )}
          {management.createKeyError && !scopeOpen ? (
            <p role="alert" className="text-sm text-[var(--status-bad-text)]">{management.createKeyError}</p>
          ) : null}
          <div className="flex flex-col rounded-[12px] bg-[var(--bg-well)]" style={{ gap: 4, padding: 16 }}>
            <p className="font-sans text-[14px] font-medium text-[var(--fg-1)]">{t('profile.apiKeys.mcpTitle')}</p>
            <p className="font-sans text-[14px] leading-[1.5] text-[var(--fg-3)]">{t('profile.apiKeys.mcpLine')}</p>
          </div>
        </>
      )}

      {scopeOpen ? (
        <ScopeSheet
          busy={creating}
          error={management.createKeyError}
          onClose={() => setScopeOpen(false)}
          onCreate={(scope) => createKey({ name: t('profile.apiKeys.newKeyName'), scopes: [scope] })}
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
    </section>
  )
}
