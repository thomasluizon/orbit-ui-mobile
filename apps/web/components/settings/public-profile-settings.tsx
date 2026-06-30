'use client'

import { useState } from 'react'
import { Clipboard, Check, Share2, RefreshCw } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import type { UpdatePublicProfileRequest } from '@orbit/shared/types/public-profile'
import { useProfile } from '@/hooks/use-profile'
import { usePublicProfileSettings } from '@/hooks/use-public-profile-settings'
import { SettingsRow, Switch } from '@/components/ui/settings-row'
import { SectionLabel } from '@/components/ui/section-label'
import { PillButton } from '@/components/ui/pill-button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'

type VisibilityField = 'showStreak' | 'showLevel' | 'showAchievements' | 'showTopHabits'

const VISIBILITY_FIELDS: readonly { field: VisibilityField; i18nKey: string }[] = [
  { field: 'showStreak', i18nKey: 'streak' },
  { field: 'showLevel', i18nKey: 'level' },
  { field: 'showAchievements', i18nKey: 'achievements' },
  { field: 'showTopHabits', i18nKey: 'topHabits' },
]

/** Client manage UI for the public shareable profile: enable toggle, four per-field
 *  visibility switches, copy/share of the backend share URL, and slug regeneration. */
export function PublicProfileSettings() {
  const t = useTranslations()
  const { profile } = useProfile()
  const mutation = usePublicProfileSettings()
  const [copied, setCopied] = useState(false)
  const [confirmRegenerate, setConfirmRegenerate] = useState(false)

  const settings = profile?.publicProfile
  const enabled = settings?.enabled ?? false
  const shareUrl = settings?.shareUrl ?? null
  const canShare = typeof navigator !== 'undefined' && !!navigator.share

  function submit(next: Partial<UpdatePublicProfileRequest>) {
    mutation.mutate(
      {
        enabled,
        showStreak: settings?.showStreak ?? true,
        showLevel: settings?.showLevel ?? true,
        showAchievements: settings?.showAchievements ?? true,
        showTopHabits: settings?.showTopHabits ?? false,
        regenerate: false,
        ...next,
      },
      { onError: () => toast.error(t('profile.publicProfile.error')) },
    )
  }

  async function copyLink() {
    if (!shareUrl) return
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error(t('profile.publicProfile.error'))
    }
  }

  async function shareLink() {
    if (!shareUrl || !navigator.share) return
    try {
      await navigator.share({ title: t('profile.publicProfile.title'), url: shareUrl })
    } catch {
    }
  }

  return (
    <div>
      <SettingsRow
        label={t('profile.publicProfile.enable.title')}
        desc={
          enabled
            ? t('profile.publicProfile.disabledHint')
            : t('profile.publicProfile.enable.description')
        }
        accessory="none"
      >
        <Switch
          on={enabled}
          onToggle={() => submit({ enabled: !enabled })}
          ariaLabel={t('profile.publicProfile.enable.title')}
          disabled={mutation.isPending}
        />
      </SettingsRow>

      {enabled && shareUrl && (
        <>
          <SectionLabel>{t('profile.publicProfile.link.label')}</SectionLabel>
          <div style={{ padding: '0 20px 4px' }}>
            <div
              className="flex items-center rounded-[14px]"
              style={{
                gap: 8,
                padding: '4px 6px 4px 16px',
                background: 'var(--bg-field)',
                boxShadow: 'inset 0 0 0 1px var(--hairline)',
              }}
            >
              <div
                aria-label={t('profile.publicProfile.link.label')}
                className="flex-1 overflow-hidden whitespace-nowrap text-ellipsis"
                style={{ fontFamily: 'var(--font-mono)', fontSize: 15, color: 'var(--fg-1)' }}
              >
                {shareUrl}
              </div>
              <button type="button" className="chip" onClick={copyLink}>
                {copied ? (
                  <Check size={14} strokeWidth={1.8} color="var(--status-done)" aria-hidden="true" />
                ) : (
                  <Clipboard size={14} strokeWidth={1.8} aria-hidden="true" />
                )}
                <span>
                  {copied ? t('profile.publicProfile.link.copied') : t('profile.publicProfile.link.copy')}
                </span>
              </button>
            </div>
          </div>

          {canShare && (
            <div style={{ padding: '10px 20px 6px' }}>
              <PillButton
                fullWidth
                leading={<Share2 size={18} strokeWidth={1.8} color="var(--fg-on-primary)" />}
                onClick={shareLink}
              >
                {t('profile.publicProfile.link.share')}
              </PillButton>
            </div>
          )}
        </>
      )}

      <SectionLabel>{t('profile.publicProfile.visibilityTitle')}</SectionLabel>
      {VISIBILITY_FIELDS.map(({ field, i18nKey }) => (
        <SettingsRow
          key={field}
          label={t(`profile.publicProfile.fields.${i18nKey}.title`)}
          desc={t(`profile.publicProfile.fields.${i18nKey}.description`)}
          accessory="none"
        >
          <Switch
            on={settings?.[field] ?? false}
            onToggle={() => submit({ [field]: !(settings?.[field] ?? false) })}
            ariaLabel={t(`profile.publicProfile.fields.${i18nKey}.title`)}
            disabled={!enabled || mutation.isPending}
          />
        </SettingsRow>
      ))}

      {enabled && (
        <div style={{ padding: '14px 20px 4px' }}>
          <button
            type="button"
            onClick={() => setConfirmRegenerate(true)}
            disabled={mutation.isPending}
            className="inline-flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              gap: 8,
              appearance: 'none',
              border: 0,
              background: 'transparent',
              cursor: 'pointer',
              fontFamily: 'var(--font-sans)',
              fontSize: 14,
              fontWeight: 500,
              color: 'var(--primary-soft)',
              minHeight: 44,
            }}
          >
            <RefreshCw size={16} strokeWidth={1.8} aria-hidden="true" />
            {t('profile.publicProfile.regenerate.button')}
          </button>
          <p
            style={{
              margin: '4px 0 0',
              fontFamily: 'var(--font-sans)',
              fontSize: 12,
              color: 'var(--fg-3)',
              lineHeight: 1.5,
            }}
          >
            {t('profile.publicProfile.regenerate.hint')}
          </p>
        </div>
      )}

      <p
        style={{
          padding: '12px 20px 20px',
          fontFamily: 'var(--font-sans)',
          fontSize: 12,
          color: 'var(--fg-3)',
          lineHeight: 1.5,
        }}
      >
        {t('profile.publicProfile.privacyHint')}
      </p>

      <ConfirmDialog
        open={confirmRegenerate}
        onOpenChange={setConfirmRegenerate}
        title={t('profile.publicProfile.regenerate.confirmTitle')}
        description={t('profile.publicProfile.regenerate.confirmBody')}
        confirmLabel={t('profile.publicProfile.regenerate.confirm')}
        cancelLabel={t('profile.publicProfile.regenerate.cancel')}
        variant="danger"
        onConfirm={() => submit({ enabled: true, regenerate: true })}
      />
    </div>
  )
}
