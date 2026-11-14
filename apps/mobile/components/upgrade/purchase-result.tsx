import { useTranslation } from 'react-i18next'
import type { SubscriptionStatus } from '@orbit/shared/types/profile'
import type { BillingDetails } from '@orbit/shared/types/subscription'
import { formatPurchaseResult, resolvePurchaseResult } from '@orbit/shared/utils'
import { ResultDialog } from '@/components/ui/result-dialog'

/**
 * The result of a confirmed purchase: what the person has now and until when. It opens only after the
 * subscription read reports Pro. Its one action returns the person to the place the `from` of the visit
 * names, or opens Hoje when it names none.
 */
export function PurchaseResult({ purchaseConfirmed, status, billing, timeZone, returnsToOrigin, onOpen, onClose }: Readonly<{
  /** True after the store verified the purchase. */
  purchaseConfirmed: boolean
  /** The subscription read. Null while it loads or after it failed. */
  status: SubscriptionStatus | null
  billing: BillingDetails | null
  timeZone: string | null | undefined
  returnsToOrigin: boolean
  onOpen: () => void
  onClose: () => void
}>) {
  const { t, i18n } = useTranslation()
  const result = purchaseConfirmed ? resolvePurchaseResult(status, billing) : null
  if (!result) return null
  return (
    <ResultDialog
      title={t('result.title')}
      sentence={formatPurchaseResult(result, i18n.language, timeZone, t)}
      primaryLabel={t(returnsToOrigin ? 'common.back' : 'result.account.openToday')}
      onPrimary={onOpen}
      onClose={onClose}
    />
  )
}
