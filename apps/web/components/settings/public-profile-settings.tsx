'use client'

import { useState } from 'react'
import { Copy, Check, Share2, RefreshCw } from 'lucide-react'
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
  const { profile, isLoading } = useProfile()
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
    if (!shareUrl || !('share' in navigator)) return
    try {
      await navigator.share({ title: t('profile.publicProfile.title'), url: shareUrl })
    } catch {
    }
  }

  if (isLoading) {
    return <div aria-busy="true" style={{ minHeight: 320 }} />
  }

  return (
    <>
      <div>
        <div>
          <SettingsRow
            label={t('profile.publicProfile.enable.title')}
            desc={
              enabled
                ? t('profile.publicProfile.disabledHint')
                : t('profile.publicProfile.enable.description')
            }
            accessory="none"
            divider={false}
          >
            <Switch
              on={enabled}
              onToggle={() => submit({ enabled: !enabled })}
              ariaLabel={t('profile.publicProfile.enable.title')}
              disabled={mutation.isPending}
            />
          </SettingsRow>

          <div className={`collapsible${enabled && shareUrl ? ' is-open' : ''}`}>
            <div>
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
                  <button
                    type="button"
                    onClick={() => void copyLink()}
                    title={t('profile.publicProfile.link.copy')}
                    className="min-w-0 flex-1 cursor-pointer overflow-hidden whitespace-nowrap text-ellipsis border-0 bg-transparent text-left"
                    style={{ padding: 0, fontFamily: 'var(--font-mono)', fontSize: 15, color: 'var(--fg-1)' }}
                  >
                    {shareUrl}
                  </button>
                  <button
                    type="button"
                    className="icon-btn touch-target"
                    onClick={() => void copyLink()}
                    aria-label={t('profile.publicProfile.link.copy')}
                  >
                    <span className="relative inline-flex items-center justify-center" style={{ width: 16, height: 16 }}>
                      <Copy
                        size={16}
                        strokeWidth={1.8}
                        aria-hidden="true"
                        className="absolute transition-[opacity,transform] duration-[var(--dur-fast)] ease-[var(--ease-standard)]"
                        style={{ opacity: copied ? 0 : 1, transform: copied ? 'scale(0.6)' : 'scale(1)' }}
                      />
                      <Check
                        size={16}
                        strokeWidth={1.8}
                        color="var(--status-done)"
                        aria-hidden="true"
                        className="absolute transition-[opacity,transform] duration-[var(--dur-fast)] ease-[var(--ease-standard)]"
                        style={{ opacity: copied ? 1 : 0, transform: copied ? 'scale(1)' : 'scale(0.6)' }}
                      />
                    </span>
                  </button>
                  <span aria-live="polite" className="sr-only">
                    {copied ? t('profile.publicProfile.link.copied') : ''}
                  </span>
                </div>
              </div>

              {canShare && (
                <div style={{ padding: '10px 20px 6px' }}>
                  <PillButton
                    className="w-full md:w-auto md:max-w-[360px]"
                    glow={false}
                    leading={<Share2 size={18} strokeWidth={1.8} color="var(--fg-on-primary)" />}
                    onClick={() => void shareLink()}
                  >
                    {t('profile.publicProfile.link.share')}
                  </PillButton>
                </div>
              )}
            </div>
          </div>

          {enabled && (
            <div style={{ padding: '14px 20px 4px' }}>
              <button
                type="button"
                onClick={() => setConfirmRegenerate(true)}
                disabled={mutation.isPending}
                className="inline-flex items-center rounded-full bg-transparent px-2 -ml-2 transition-[background-color,transform] duration-[var(--dur-fast)] ease-[var(--ease-standard)] hover:bg-[var(--bg-elev)] active:scale-[0.96] disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  gap: 8,
                  appearance: 'none',
                  border: 0,
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
        </div>

        <div>
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
        </div>
      </div>

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
    </>
  )
}
