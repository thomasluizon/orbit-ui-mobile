'use client'

import { SMALL_PILL_VISIBLE_MIN } from '@orbit/shared/theme'

import { useTranslations } from 'next-intl'
import type { AstraOfferProps } from '@orbit/shared/chat'
import { useAstraOffer } from '@/hooks/use-astra-offer'
import { PillButton } from '@/components/ui/pill-button'
import { ReferralDrawer } from '@/components/referral/referral-drawer'
import { IconButton } from '@/components/ui/icon-button'
import { X } from '@/components/ui/icons'

export function AstraOffer(props: Readonly<AstraOfferProps>) {
  return props.action ? <ActiveAstraOffer {...props} /> : null
}

function ActiveAstraOffer(props: Readonly<AstraOfferProps>) {
  const t = useTranslations()
  const offer = useAstraOffer(props)
  if (!props.action) return null
  return <>{offer.visible ? <div data-astra-offer="" className="flex min-w-0 flex-col gap-2">
    <div className="flex min-w-0 flex-wrap items-center gap-3">
      <PillButton size="sm" variant="ghost" minimumHeight={SMALL_PILL_VISIBLE_MIN} retainLeadingIcon loading={offer.pending} accessibleName={props.action.label} disabled={offer.disabled} onClick={() => void offer.act()}>{props.action.label}</PillButton>
      <IconButton label={t('chat.offers.dismiss')} disabled={offer.disabled} onClick={() => void offer.dismiss()}><X size={20} strokeWidth={1.5} aria-hidden="true" /></IconButton>
    </div>
    <p role="status" className="text-sm text-[var(--fg-2)]">{offer.failed ? t('chat.offers.failed') : offer.reason ? t(offer.reason) : ''}</p>
  </div> : null}<ReferralDrawer open={offer.referralsOpen} onOpenChange={offer.closeReferrals} /></>
}
