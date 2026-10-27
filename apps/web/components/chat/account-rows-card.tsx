'use client'

import { IconButton } from '@/components/ui/icon-button'

import { useState } from 'react'
import { useReferralInvitation } from '@/hooks/use-referral-invitation'
import { useLocale, useTranslations } from 'next-intl'
import type { AccountRowsCard as AccountRowsCardData } from '@orbit/shared/types/chat'
import { accountRowLabelKey, formatAccountRowValue, presentAccountRows } from '@orbit/shared/chat'
import { BlockFrame } from './read-block-frame'
import { SettingsGroup } from '@/components/ui/settings-group'
import { ListRow } from '@/components/ui/list-row'
import { Check, Copy, Share2 } from '@/components/ui/icons'

function ReferralCodeRow({ code, copied, onCopy }: Readonly<{ code: string; copied: boolean; onCopy: () => void }>) {
  const t = useTranslations()
  const hiddenIcon = 'scale-[0.25] opacity-0'
  const shownIcon = 'scale-100 opacity-100'
  return <div className="flex flex-wrap items-center gap-3 px-4">
    <span translate="no" className="min-w-0 flex-1 break-all font-mono text-sm text-[var(--fg-1)]">{code}</span>
    <IconButton label={t(copied ? 'chat.account.copied' : 'chat.account.copy')} onClick={onCopy}><span className="relative inline-flex size-5">
        <Copy aria-hidden="true" size={20} className={`absolute inset-0 transition-[transform,opacity] duration-200 motion-reduce:scale-100 motion-reduce:transition-[opacity] ${copied ? hiddenIcon : shownIcon}`} />
        <Check aria-hidden="true" size={20} className={`absolute inset-0 transition-[transform,opacity] duration-200 motion-reduce:scale-100 motion-reduce:transition-[opacity] ${copied ? shownIcon : hiddenIcon}`} />
      </span></IconButton>
  </div>
}

function statusMessage(failure: string | null, linkCopied: boolean, copied: boolean, t: ReturnType<typeof useTranslations>): string {
  if (failure) return failure
  if (linkCopied) return t('referral.drawer.linkCopied')
  return copied ? t('chat.account.copied') : ''
}

export function AccountRowsCard({ accountRows }: Readonly<{ accountRows: AccountRowsCardData }>) {
  return accountRows.kind === 'referral'
    ? <ReferralAccountRowsCard accountRows={accountRows} />
    : <AccountRowsContent accountRows={accountRows} />
}

function ReferralAccountRowsCard({ accountRows }: Readonly<{ accountRows: AccountRowsCardData }>) {
  const invitation = useReferralInvitation()
  return <AccountRowsContent accountRows={accountRows} invitation={invitation} />
}

function AccountRowsContent({ accountRows, invitation }: Readonly<{ accountRows: AccountRowsCardData; invitation?: string }>) {
  const t = useTranslations()
  const locale = useLocale()
  const [copied, setCopied] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [canShare] = useState(() => typeof navigator !== 'undefined' && typeof navigator.share === 'function')
  const rows = presentAccountRows(accountRows).flatMap((row) => {
    const labelKey = accountRowLabelKey(row.key)
    return labelKey ? [<ListRow key={row.key} title={t(labelKey)} value={formatAccountRowValue(row, locale, t)} wrapValue valueTextMode={row.key === 'name' || row.key === 'email' ? 'personal' : undefined} readOnly={row.key !== 'name' && row.key !== 'email'} chevron={false} />] : []
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
      await navigator.share({ title: t('referral.share.title'), text: invitation, url: accountRows.referralLink })
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
  return <div className="w-full">
    <BlockFrame state={failure ? 'partiallyFailed' : 'resting'} title={t(`chat.account.title.${accountRows.kind}`)} count={null} items={[]}
      body={<div className="flex flex-col gap-3">
        <SettingsGroup>{rows}</SettingsGroup>
        {referral && accountRows.referralCode ? <ReferralCodeRow code={accountRows.referralCode} copied={copied} onCopy={() => void copyCode()} /> : null}
        <p role="status" className={`text-sm ${failure ? 'text-[var(--status-bad-text)]' : 'text-[var(--fg-2)]'}`}>{statusMessage(failure, linkCopied, copied, t)}</p>
      </div>}
      actions={referral ? (accountRows.referralLink ? <IconButton label={t(canShare ? 'chat.account.share' : 'referral.drawer.copyLink')} onClick={() => void (canShare ? shareLink() : copyLink())}>{canShare ? <Share2 size={20} aria-hidden="true" /> : <Copy size={20} aria-hidden="true" />}</IconButton> : undefined) : undefined} />
  </div>
}
