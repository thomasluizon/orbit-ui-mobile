'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Lock, Smartphone } from 'lucide-react'
import { AppBar } from '@/components/ui/app-bar'
import { SectionLabel } from '@/components/ui/section-label'
import { SettingsRow } from '@/components/ui/settings-row'
import { useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow, parseISO } from 'date-fns'
import { enUS, ptBR } from 'date-fns/locale'
import { useTranslations, useLocale } from 'next-intl'
import { useProfile } from '@/hooks/use-profile'
import { ProBadge } from '@/components/ui/pro-badge'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { CreateApiKeyModal } from '@/components/ui/create-api-key-modal'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'
import { useApiKeyManagement } from '@/hooks/use-api-key-management'
import {
  ApiKeysSection,
  McpConnectionInstructions,
  WidgetInfoOverlay,
} from '@/components/advanced/advanced-sections'

export default function AdvancedPage() {
  const t = useTranslations()
  const goBackOrFallback = useGoBackOrFallback()
  const locale = useLocale()
  const dateFnsLocale = locale === 'pt-BR' ? ptBR : enUS
  const { profile } = useProfile()
  const queryClient = useQueryClient()

  const [showWidgetInfo, setShowWidgetInfo] = useState(false)

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

  function formatKeyDate(dateStr: string): string {
    return formatDistanceToNow(parseISO(dateStr), { addSuffix: true, locale: dateFnsLocale })
  }

  return (
    <div className="md:mx-auto md:max-w-[760px]">
      <div className="flex flex-col min-h-[100dvh]">
        <AppBar
          back
          backLabel={t('common.backToProfile')}
          onBack={() => goBackOrFallback('/profile')}
          title={t('advancedSettings.title')}
        />
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

              <SectionLabel trailing={<ProBadge />}>{t('orbitMcp.title')}</SectionLabel>
              <div style={{ padding: '0 20px 14px' }}>
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
                <ApiKeysSection
                  apiKeysQuery={apiKeysQuery}
                  capabilitiesQuery={capabilitiesQuery}
                  apiKeys={apiKeys}
                  canCreateKey={canCreateKey}
                  canCreateScopedKey={canCreateScopedKey}
                  onCreateKey={() => setCreateKeyModalOpen(true)}
                  onRevoke={setRevokingKeyId}
                  formatKeyDate={formatKeyDate}
                  t={t}
                />
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

        <ConfirmDialog
          open={revokingKeyId !== null}
          onOpenChange={(open) => {
            if (!open) setRevokingKeyId(null)
          }}
          title={t('orbitMcp.revoke')}
          description={t('orbitMcp.revokeConfirm')}
          cancelLabel={t('orbitMcp.cancel')}
          confirmLabel={t('orbitMcp.confirm')}
          variant="danger"
          onConfirm={() => {
            if (revokingKeyId) revokeKeyMutation.mutate(revokingKeyId)
          }}
        />
      </div>
    </div>
  )
}
