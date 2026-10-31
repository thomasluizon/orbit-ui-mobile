import { SMALL_PILL_VISIBLE_MIN } from '@orbit/shared/theme'
import { useTranslation } from 'react-i18next'
import { StyleSheet, Text, View } from 'react-native'
import type { AstraOfferProps } from '@orbit/shared/chat'
import { useAstraOffer } from '@/hooks/use-astra-offer'
import { AstraGlyph } from '@/components/ui/astra-glyph'
import { PillButton } from '@/components/ui/pill-button'
import { ReferralDrawer } from '@/components/referral/referral-drawer'
import { IconButton } from '@/components/ui/icon-button'
import { X } from '@/components/ui/icons'
import { useAppTheme } from '@/lib/use-app-theme'
import { createTokensV2 } from '@/lib/theme'

export function AstraOffer(props: Readonly<AstraOfferProps>) {
  return props.action ? <ActiveAstraOffer {...props} /> : null
}

function ActiveAstraOffer(props: Readonly<AstraOfferProps>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const offer = useAstraOffer(props)
  if (!props.action) return null
  return <>{offer.visible ? <View testID="astra-offer" style={styles.slot}>
    <View style={styles.actions}>
      <PillButton size="sm" variant="ghost" minimumHeight={SMALL_PILL_VISIBLE_MIN} retainLeadingIcon leadingIcon={props.action.kind === 'openSurface' ? undefined : <AstraGlyph size={16} />} loading={offer.pending} accessibleName={props.action.label} disabled={offer.disabled} onClick={() => void offer.act()}>{props.action.label}</PillButton>
      <IconButton label={t('chat.offers.dismiss')} disabled={offer.dismissDisabled} onClick={() => void offer.dismiss()}><X size={20} strokeWidth={1.5} accessible={false} /></IconButton>
    </View>
    <Text accessibilityLiveRegion="polite" style={{ color: tokens.fg2, fontSize: 14 }}>{offer.failed ? t('chat.offers.failed') : offer.reason ? t(offer.reason) : ''}</Text>
  </View> : null}<ReferralDrawer open={offer.referralsOpen} onClose={offer.closeReferrals} /></>
}

const styles = StyleSheet.create({
  slot: { minWidth: 0, gap: 8 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 },
})
