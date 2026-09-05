'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Lock, Smartphone } from '@/components/ui/icons'
import { AppBar } from '@/components/ui/app-bar'
import { SectionLabel } from '@/components/ui/section-label'
import { SettingsRow } from '@/components/ui/settings-row'
import { useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow, parseISO } from 'date-fns'
import { enUS, ptBR } from 'date-fns/locale'
import { useTranslations, useLocale } from 'next-intl'
import { useProfile } from '@/hooks/use-profile'
import { ProBadge } from '@/components/ui/pro-badge'

import { CreateApiKeyModal } from '@/components/ui/create-api-key-modal'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'
import { useApiKeyManagement } from '@/hooks/use-api-key-management'
import {
  ApiKeysSection,
  McpConnectionInstructions,
  WidgetInfoOverlay,
} from '@/components/advanced/advanced-sections'
import { ConfirmSheet } from '@/components/ui/confirm-sheet'
import { StepUp } from '@/components/ui/step-up'
import { requestApiKeyCreationChallenge } from '@/app/actions/api-keys'
import { beginStepUpChallenge } from '@/lib/step-up-storage'

export default function AdvancedPage() {
  const t = useTranslations()
  const router = useRouter()
  const searchParams = useSearchParams()
  const goBackOrFallback = useGoBackOrFallback()
  const locale = useLocale()
  const dateFnsLocale = locale === 'pt-BR' ? ptBR : enUS
  const { profile } = useProfile()
  const queryClient = useQueryClient()

  const [showWidgetInfo, setShowWidgetInfo] = useState(false)
  const [showApiKeyStepUp, setShowApiKeyStepUp] = useState(false)
  const [apiKeyStepUpBusy, setApiKeyStepUpBusy] = useState(false)
  const [apiKeyStepUpError, setApiKeyStepUpError] = useState(false)

  const {
    apiKeysQuery,
    capabilitiesQuery,
    apiKeys,
    scopeOptions,
    canCreateKey,
    canCreateScopedKey,
    createKeyModalOpen,
    setCreateKeyModalOpen,
    createKeyError,
    revokingKeyId,
    setRevokingKeyId,
    revokeKeyMutation,
    handleCreateKey,
  } = useApiKeyManagement({
    hasProAccess: profile?.hasProAccess ?? false,
    queryClient,
    t,
  })

  useEffect(() => {
    if (searchParams.get('create-key') === '1') {
      setCreateKeyModalOpen(true)
    }
  }, [searchParams, setCreateKeyModalOpen])

  async function startApiKeyStepUp() {
    setApiKeyStepUpBusy(true)
    setApiKeyStepUpError(false)
    try {
      await requestApiKeyCreationChallenge()
      beginStepUpChallenge('keys')
      router.push('/step-up?operation=keys')
    } catch {
      setApiKeyStepUpError(true)
      setApiKeyStepUpBusy(false)
    }
  }

  function formatKeyDate(dateStr: string): string {
    return formatDistanceToNow(parseISO(dateStr), { addSuffix: true, locale: dateFnsLocale })
  }

  return (
    <div className="md:mx-auto md:max-w-[760px]">
      <div className="flex flex-col min-h-[100dvh]">
        <AppBar backLabel={t('common.backToProfile')}
onBack={() => goBackOrFallback('/profile')}
title={t('advancedSettings.title')} />
        <div className="flex-1 min-h-0 overflow-y-auto stagger-enter">
          <div>
            <div>
              <SectionLabel>{t('advancedSettings.widgetSection')}</SectionLabel>
              <SettingsRow
                label={t('profile.widgetTitle')}
                desc={t('profile.widgetHint')}
                icon={Smartphone}
                accessory="chevron"
                onClick={() => setShowWidgetInfo(true)}
                divider={false}
              />

              <><SectionLabel>{t('orbitMcp.title')}</SectionLabel>
{<ProBadge />}</>
              <div style={{ padding: '0 16px 12px' }}>
                {!profile?.hasProAccess && (
                  <div className="flex items-center justify-end" style={{ marginBottom: 8 }}>
                    <Link href="/upgrade" className="chip min-h-[44px]">
                      <Lock size={14} strokeWidth={1.8} aria-hidden="true" />
                      {t('common.proBadge')}
                    </Link>
                  </div>
                )}

                <p className="t-secondary" style={{ color: 'var(--fg-3)' }}>
                  {t('orbitMcp.description')}
                </p>
              </div>
              {profile?.hasProAccess && (
                <>
                  <ApiKeysSection
                    apiKeysQuery={apiKeysQuery}
                    capabilitiesQuery={capabilitiesQuery}
                    apiKeys={apiKeys}
                    canCreateKey={canCreateKey}
                    canCreateScopedKey={canCreateScopedKey}
                    onCreateKey={() => setShowApiKeyStepUp(true)}
                    onRevoke={setRevokingKeyId}
                    formatKeyDate={formatKeyDate}
                    t={t}
                  />
                  {showApiKeyStepUp ? (
                    <div className="px-4 pb-4">
                      <StepUp
                        message={t('stepUp.apiKeyHandoff')}
                        actionLabel={t('stepUp.apiKeyHandoffAction')}
                        onAction={() => void startApiKeyStepUp()}
                        busy={apiKeyStepUpBusy}
                      />
                      {apiKeyStepUpError ? (
                        <p role="alert" className="pt-2 text-sm text-[var(--status-bad-text)]">
                          {t('stepUp.requestError')}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </>
              )}
            </div>

            {profile?.hasProAccess && <McpConnectionInstructions t={t} />}
          </div>
          <div style={{ height: 24 }} />
        </div>

        <WidgetInfoOverlay open={showWidgetInfo} onOpenChange={setShowWidgetInfo} t={t} />

        <CreateApiKeyModal
          open={createKeyModalOpen}
          onOpenChange={setCreateKeyModalOpen}
          onCreateKey={handleCreateKey}
          availableScopes={scopeOptions}
          apiError={createKeyError}
        />

        <ConfirmSheet
          open={revokingKeyId !== null}
          title={t('orbitMcp.revoke')}
          message={t('orbitMcp.revokeConfirm')}
          cancelLabel={t('orbitMcp.cancel')}
          confirmLabel={t('orbitMcp.confirm')}
          destructive
          onCancel={() => setRevokingKeyId(null)}
          onConfirm={() => {
            if (revokingKeyId) revokeKeyMutation.mutate(revokingKeyId)
            setRevokingKeyId(null)
          }}
        />
      </div>
    </div>
  )
}
