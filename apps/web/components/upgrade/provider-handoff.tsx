'use client'

import type { useTranslations } from 'next-intl'
import type { SubscriptionScreenState } from '@orbit/shared/utils'
import { Icon } from '@/components/ui/icon'
import { PillButton } from '@/components/ui/pill-button'

export function ProviderHandoff({ provider, state, onManage, t }: Readonly<{
  provider: 'stripe' | 'play'
  state: SubscriptionScreenState
  onManage: () => void
  t: ReturnType<typeof useTranslations>
}>) {
  const opening = state === 'portal-opening'
  const failed = state === 'portal-failed'
  return (
    <section className="flex flex-col gap-3" data-provider={provider} data-state={state}>
      <div className="flex items-start gap-3 rounded-[var(--r-well)] bg-[var(--bg-well)] p-4">
        <span aria-hidden="true" data-motion-purpose="state indication"
          style={{ opacity: opening ? 0.4 : 1 }}
          className="shrink-0 text-[var(--fg-3)] transition-opacity duration-[160ms] ease-[var(--ease-standard)] motion-reduce:transition-none">
          <Icon name={provider === 'play' ? 'brand-google-play' : 'credit-card'} size={20} />
        </span>
        <p className="t-secondary min-w-0 text-pretty">
          {provider === 'play' ? t('upgrade.billing.actions.managePlayHint') : t('upgrade.billing.actions.manageHint')}
        </p>
      </div>
      {failed ? (
        <div className="flex flex-col gap-3 rounded-[var(--r-well)] bg-[var(--bg-well)] p-4" role="alert">
          <p className="t-body">{t('upgrade.billing.portalFailed')}</p>
          <p className="t-secondary">{t('upgrade.billing.portalFix')}</p>
        </div>
      ) : null}
      <div className="flex">
        <PillButton variant="primary" loading={opening} disabled={state === 'offline'} onClick={onManage}>
          {failed ? t('upgrade.billing.retry') : provider === 'play' ? t('upgrade.billing.actions.managePlay') : t('upgrade.billing.actions.manage')}
        </PillButton>
      </div>
      {state === 'offline' ? <p className="t-secondary">{t('upgrade.billing.offline')}</p> : null}
    </section>
  )
}
