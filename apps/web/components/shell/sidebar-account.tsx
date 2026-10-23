'use client'

import { useId, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Menu } from '@/components/ui/menu'
import { PersonalText } from '@/components/ui/personal-text'
import { useAuthStore } from '@/stores/auth-store'

export function SidebarAccount({ account, accountEmail, collapsed }: Readonly<{ account?: string; accountEmail?: string; collapsed: boolean }>) {
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLButtonElement>(null)
  const menuId = useId()
  const t = useTranslations()
  const logout = useAuthStore(state => state.logout)
  const label = [account, accountEmail].filter(Boolean).join(', ')

  if (!account) return (
    <div data-shell-account="" data-loading="true" aria-hidden="true" className="flex min-h-[var(--touch-min)] flex-col px-2 py-2 text-[14px]">
      {collapsed ? null : <>
        <span className="min-h-[1lh]" />
        <span className="min-h-[1lh] text-[12px]" />
      </>}
    </div>
  )

  return <>
    <div className="flex min-w-0 items-center">
      <button
        ref={anchorRef}
        type="button"
        data-shell-account=""
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        title={collapsed ? label : undefined}
        onClick={() => setOpen(current => !current)}
        className={`orbit-hover-text flex flex-1 min-h-[var(--touch-min)] min-w-0 items-center ${collapsed ? 'justify-center' : ''} gap-3 rounded-[12px] px-2 py-2 text-start text-[14px] font-medium text-[var(--fg-1)] transition-[background-color,color,transform] [transition-duration:var(--dur-hover-control),var(--dur-hover-control),150ms] ease-[var(--ease-standard)] hover:bg-[var(--bg-hover)] active:bg-[var(--bg-hover)] active:scale-[0.96]`}
      >
        <span aria-hidden="true" className="grid size-7 shrink-0 place-items-center rounded-[8px] bg-[var(--bg-well)] text-[var(--fg-2)]">
          {Array.from(account)[0]?.toLocaleUpperCase()}
        </span>
        <span className={collapsed ? 'sr-only' : 'flex min-w-0 flex-1 flex-col'}>
          <PersonalText data-shell-account-name="">{account}</PersonalText>
          {accountEmail ? <PersonalText data-shell-account-email="" className="text-[12px] font-normal text-[var(--fg-3)]">{accountEmail}</PersonalText> : null}
        </span>
      </button>
    </div>
    <Menu
      id={menuId}
      open={open}
      presentation="anchored"
      anchorRef={anchorRef}
      align="start"
      title={label}
      header={<div data-shell-account-menu-header="" className="flex min-w-0 flex-col gap-1 px-3 py-2 text-[14px] text-[var(--fg-1)]">
        <PersonalText className="font-medium">{account}</PersonalText>
        {accountEmail ? <PersonalText expanded className="text-[12px] text-[var(--fg-3)]">{accountEmail}</PersonalText> : null}
      </div>}
      items={[{ id: 'signOut', label: t('profile.settingsRows.signOut') }]}
      onClose={() => setOpen(false)}
      onSelect={() => void logout()}
    />
  </>
}
