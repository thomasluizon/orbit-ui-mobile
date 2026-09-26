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

function ReferralCodeRow({ code, copied, onCopy }: Readonly<{ code: string; copied: boolean; onCopy: () => void }>) {
  const t = useTranslations()
  const hiddenIcon = 'scale-[0.25] opacity-0'
  const shownIcon = 'scale-100 opacity-100'
  return <div className="flex flex-wrap items-center gap-3 px-4">
    <span className="min-w-0 flex-1 break-all font-mono text-sm text-[var(--fg-1)]">{code}</span>
    <button type="button" onClick={onCopy} className="flex min-h-11 items-center gap-2 rounded-[8px] px-2 text-sm text-[var(--fg-2)] hover:bg-[var(--bg-hover)]">
      <span className="relative inline-flex size-5">
        <Copy aria-hidden="true" size={20} className={`absolute inset-0 transition-[transform,opacity] duration-200 motion-reduce:scale-100 motion-reduce:transition-[opacity] ${copied ? hiddenIcon : shownIcon}`} />
        <Check aria-hidden="true" size={20} className={`absolute inset-0 transition-[transform,opacity] duration-200 motion-reduce:scale-100 motion-reduce:transition-[opacity] ${copied ? shownIcon : hiddenIcon}`} />
      </span>
      {t(copied ? 'chat.account.copied' : 'chat.account.copy')}
    </button>
  </div>
}

function statusMessage(failure: string | null, linkCopied: boolean, copied: boolean, t: ReturnType<typeof useTranslations>): string {
  if (failure) return failure
  if (linkCopied) return t('referral.drawer.linkCopied')
  return copied ? t('chat.account.copied') : ''
}

export function AccountRowsCard({ accountRows }: Readonly<{ accountRows: AccountRowsCardData }>) {
  const t = useTranslations()
  const locale = useLocale()
  const router = useRouter()
  const [copied, setCopied] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [canShare] = useState(() => typeof navigator !== 'undefined' && typeof navigator.share === 'function')
  const rows = accountRows.rows.flatMap((row) => {
    const labelKey = accountRowLabelKey(row.key)
    return labelKey ? [<ListRow key={row.key} title={t(labelKey)} value={formatAccountRowValue(row, locale, t)} wrapValue readOnly chevron={false} />] : []
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

  async function copyLink() {
    if (!accountRows.referralLink) return
    try {
      await navigator.clipboard.writeText(accountRows.referralLink)
      setLinkCopied(true)
      setFailure(null)
    } catch {
      setFailure(t('chat.account.copyError'))
    }
  }

  const referral = accountRows.kind === 'referral'
  return <div className="mt-2 w-full md:max-w-[65ch]">
    <BlockFrame state={failure ? 'partiallyFailed' : 'resting'} title={t(`chat.account.title.${accountRows.kind}`)} count={null} items={[]}
      body={<div className="flex flex-col gap-3">
        <SettingsGroup>{rows}</SettingsGroup>
        {referral && accountRows.referralCode ? <ReferralCodeRow code={accountRows.referralCode} copied={copied} onCopy={() => void copyCode()} /> : null}
        <p role="status" className={`text-sm ${failure ? 'text-[var(--status-bad-text)]' : 'text-[var(--fg-2)]'}`}>{statusMessage(failure, linkCopied, copied, t)}</p>
      </div>}
      actions={referral ? (accountRows.referralLink ? <Button variant="ghost" size="sm" onClick={() => void (canShare ? shareLink() : copyLink())}>{t(canShare ? 'chat.account.share' : 'referral.drawer.copyLink')}</Button> : undefined) : <Button variant="ghost" size="sm" onClick={() => router.push('/profile')}>{t('chat.account.open')}</Button>} />
  </div>
}
