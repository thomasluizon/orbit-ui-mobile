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
  const manageLabel = provider === 'play' ? 'upgrade.billing.actions.managePlay' : 'upgrade.billing.actions.manage'
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
      <div role="alert" className={failed ? 'flex flex-col gap-3 rounded-[var(--r-well)] bg-[var(--bg-well)] p-4' : 'sr-only'}>
        {failed ? <>
          <p className="t-body">{t('upgrade.billing.portalFailed')}</p>
          <p className="t-secondary">{t('upgrade.billing.portalFix')}</p>
        </> : null}
      </div>
      <div className="flex">
        <PillButton variant="primary" loading={opening} disabled={state === 'offline'} onClick={onManage}>
          {t(failed ? 'upgrade.billing.retry' : manageLabel)}
        </PillButton>
      </div>
      {state === 'offline' ? <p className="t-secondary">{t('upgrade.billing.offline')}</p> : null}
    </section>
  )
}
