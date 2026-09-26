'use client'

import { useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import type { AccountRowsCard as AccountRowsCardData } from '@orbit/shared/types/chat'
import { accountRowLabelKey, formatAccountRowValue } from '@orbit/shared/chat'
import { BlockFrame } from '@/components/ui/block-frame'
import { SettingsGroup } from '@/components/ui/settings-group'
import { ListRow } from '@/components/ui/list-row'
import { Button } from '@/components/ui/pill-button'
import { Check, Copy } from '@/components/ui/icons'

export function AccountRowsCard({ accountRows }: Readonly<{ accountRows: AccountRowsCardData }>) {
  const t = useTranslations()
  const locale = useLocale()
  const router = useRouter()
  const [copied, setCopied] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const rows = accountRows.rows.flatMap((row) => {
    const labelKey = accountRowLabelKey(row.key)
    return labelKey ? [<ListRow key={row.key} title={t(labelKey)} value={formatAccountRowValue(row, locale, t)} readOnly chevron={false} />] : []
  })

  async function copyCode() {
    if (!accountRows.referralCode) return
    try {
      await navigator.clipboard.writeText(accountRows.referralCode)
      setCopied(true)
      setFailure(null)
    } catch {
      setFailure(t('chat.account.copyError'))
    }
  }

  async function shareLink() {
    if (!accountRows.referralLink) return
    try {
      await navigator.share({ title: t('referral.share.title'), url: accountRows.referralLink })
      setFailure(null)
    } catch {
      setFailure(t('chat.account.shareError'))
    }
  }

  const referral = accountRows.kind === 'referral'
  return <div className="mt-2 w-full md:max-w-[65ch]">
    <BlockFrame state={failure ? 'partiallyFailed' : 'resting'} title={t(`chat.account.title.${accountRows.kind}`)} count={null} items={[]}
      body={<div className="flex flex-col gap-3">
        <SettingsGroup>{rows}</SettingsGroup>
        {referral && accountRows.referralCode ? <div className="flex items-center gap-3 px-4"><span className="min-w-0 flex-1 truncate font-mono text-sm text-[var(--fg-1)]">{accountRows.referralCode}</span><button type="button" onClick={() => void copyCode()} className="flex min-h-11 items-center gap-2 rounded-[8px] px-2 text-sm text-[var(--fg-2)]"><span className="relative inline-flex size-5"><Copy aria-hidden="true" size={20} className={`absolute inset-0 transition-opacity motion-reduce:transition-none ${copied ? 'opacity-0' : 'opacity-100'}`} /><Check aria-hidden="true" size={20} className={`absolute inset-0 transition-opacity motion-reduce:transition-none ${copied ? 'opacity-100' : 'opacity-0'}`} /></span>{t(copied ? 'chat.account.copied' : 'chat.account.copy')}</button></div> : null}
        {copied ? <p role="status" className="text-sm text-[var(--fg-2)]">{t('chat.account.copied')}</p> : null}
        {failure ? <p role="status" className="text-sm text-[var(--status-bad-text)]">{failure}</p> : null}
      </div>}
      actions={referral ? (accountRows.referralLink ? <Button variant="ghost" size="sm" onClick={() => void shareLink()}>{t('chat.account.share')}</Button> : undefined) : <Button variant="ghost" size="sm" onClick={() => router.push('/profile')}>{t('chat.account.open')}</Button>} />
  </div>
}
