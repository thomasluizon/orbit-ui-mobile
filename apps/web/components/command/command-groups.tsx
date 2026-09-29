'use client'

import { useTranslations } from 'next-intl'
import { CommandGroup } from 'cmdk'
import { searchCommands, type SearchCommandId } from '@orbit/shared/utils'
import { Check, Plus, SkipForward } from '@/components/ui/icons'
import type { CommandNavigationItem } from './command-palette'
import { CommandRow } from './command-row'
import { OfflineRefusal } from '@/components/ui/offline-refusal'
import { GROUP_CLASS } from './command-menu-chrome'

const ICONS = { create: Plus, log: Check, skip: SkipForward }
const GROUP_KEYS = { create: 'command.groups.create', actions: 'command.groups.actions' } as const

export function CommandGroups({ query, navItems, onSelect, onNavigate, hideCreate = false, createRefusal = false }: Readonly<{
  hideCreate?: boolean; createRefusal?: boolean; query: string; navItems: readonly CommandNavigationItem[]
  onSelect: (id: SearchCommandId) => void; onNavigate: (action: () => void) => void
}>) {
  const t = useTranslations()
  const commands = searchCommands(query, null, t).filter((command) => !hideCreate || command.id !== 'create')
  const destinations = navItems.filter((item) => item.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  return <>
    {(['create', 'actions'] as const).map((group) => {
      const entries = commands.filter((command) => command.group === group)
      if (!entries.length) return null
      return <CommandGroup key={group} heading={t(GROUP_KEYS[group])} className={GROUP_CLASS} data-command-group={group}>
        {entries.map((entry) => {
          if (!(entry.id === 'create' || entry.id === 'log' || entry.id === 'skip')) return null
          const Icon = ICONS[entry.id]
          return <CommandRow key={entry.id} leading={<Icon size={20} aria-hidden />} label={t(entry.label)} value={entry.id} onSelect={() => onSelect(entry.id)} />
        })}
        {group === 'create' ? <div aria-live="polite" aria-atomic="true" className={createRefusal ? 'p-2' : ''}>
          {createRefusal ? <OfflineRefusal icon="create" title={t('offline.create.title')} reason={t('offline.create.reason')} /> : null}
        </div> : null}
      </CommandGroup>
    })}
    {destinations.length > 0 && <CommandGroup heading={t('command.groups.destinations')} className={GROUP_CLASS} data-command-group="destinations">
      {destinations.map((item) => <CommandRow key={item.id} leading={<item.icon size={20} aria-hidden />} label={item.label} value={item.id} onSelect={() => onNavigate(item.onSelect)} />)}
    </CommandGroup>}
  </>
}
